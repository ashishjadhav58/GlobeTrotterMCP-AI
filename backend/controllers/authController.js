const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../utils/prisma');
const { sendPasswordResetEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'globe_trotter_secret_key_987654321_abc';

// Helper to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Helper for basic password strength validation
const validatePasswordStrength = (password) => {
  return password.length >= 6 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
};

exports.signup = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      photoUrl,
      firstName,
      lastName,
      phoneNumber,
      city,
      country,
      additionalInfo
    } = req.body;

    // Validate required fields
    if (!username || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        error: 'Username, email, password, first name, and last name are required.' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Validate password strength
    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long and contain both letters and numbers.' 
      });
    }

    // Validate email uniqueness
    const existingEmail = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }

    // Validate username uniqueness
    const existingUsername = await prisma.user.findUnique({
      where: { username: username.toLowerCase() }
    });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username is already taken.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        passwordHash,
        photoUrl: photoUrl || null,
        firstName,
        lastName,
        phoneNumber: phoneNumber || null,
        city: city || null,
        country: country || null,
        additionalInfo: additionalInfo || null
      }
    });

    // Generate token
    const token = generateToken(user);

    // Return response without passwordHash
    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        photoUrl: user.photoUrl,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        city: user.city,
        country: user.country,
        additionalInfo: user.additionalInfo,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Internal server error during signup.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const identifier = (username || email || '').trim();

    // Validate required fields
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username or email and password are required.' });
    }

    // Find user by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier.toLowerCase() },
          { email: identifier.toLowerCase() }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    if (user.status === 'Disabled') {
      return res.status(403).json({ error: 'Account has been disabled by system administrator.' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    // Generate token
    const token = generateToken(user);

    return res.json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'USER',
        status: user.status || 'Active',
        photoUrl: user.photoUrl,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        city: user.city,
        country: user.country,
        additionalInfo: user.additionalInfo,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        photoUrl: user.photoUrl,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        city: user.city,
        country: user.country,
        additionalInfo: user.additionalInfo,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({ error: 'Internal server error retrieving user profile.' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.json({ 
        message: 'If the email exists, a password reset token has been generated.' 
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour expiration

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires
      }
    });

    // Send the password reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken);
    } catch (mailError) {
      console.error('Failed to send reset email:', mailError);
      // We still return 200/success because the token was saved, but return the token to allow manual validation
    }

    return res.json({
      message: 'If the email exists, a password reset token has been generated.',
      resetToken
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Internal server error processing forgot password request.' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long and contain both letters and numbers.' 
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    return res.json({ message: 'Password reset successful. You can now log in with your new password.' });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Internal server error during password reset.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      email,
      firstName,
      lastName,
      photoUrl,
      phoneNumber,
      city,
      country,
      additionalInfo
    } = req.body;

    const dataToUpdate = {};

    // Get current user to compare
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (email && email.toLowerCase() !== currentUser.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format.' });
      }

      const existingEmail = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email is already taken.' });
      }
      dataToUpdate.email = email.toLowerCase();
    }

    if (firstName !== undefined) {
      if (!firstName.trim()) {
        return res.status(400).json({ error: 'First name cannot be empty.' });
      }
      dataToUpdate.firstName = firstName;
    }

    if (lastName !== undefined) {
      if (!lastName.trim()) {
        return res.status(400).json({ error: 'Last name cannot be empty.' });
      }
      dataToUpdate.lastName = lastName;
    }

    if (photoUrl !== undefined) dataToUpdate.photoUrl = photoUrl;
    if (phoneNumber !== undefined) dataToUpdate.phoneNumber = phoneNumber;
    if (city !== undefined) dataToUpdate.city = city;
    if (country !== undefined) dataToUpdate.country = country;
    if (additionalInfo !== undefined) dataToUpdate.additionalInfo = additionalInfo;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate
    });

    return res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        photoUrl: updatedUser.photoUrl,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phoneNumber: updatedUser.phoneNumber,
        city: updatedUser.city,
        country: updatedUser.country,
        additionalInfo: updatedUser.additionalInfo,
        createdAt: updatedUser.createdAt
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Internal server error updating profile.' });
  }
};

