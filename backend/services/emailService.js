const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // true for 465, false for other ports (587 uses STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS?.replace(/"/g, ''), // Strip any quotes added by env parsing
  },
});

/**
 * Sends a password reset email to the specified user.
 * @param {string} toEmail - The recipient's email address
 * @param {string} resetToken - The generated security token
 */
const sendPasswordResetEmail = async (toEmail, resetToken) => {
  // Define reset link (placeholder/config based on frontend URL, e.g., http://localhost:3000/reset-password?token=...)
  const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: `"GlobeTrotter Support" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'GlobeTrotter - Password Reset Request',
    text: `You are receiving this email because you (or someone else) requested a password reset for your GlobeTrotter account.\n\n` +
          `Please click on the following link, or paste it into your browser to complete the process:\n\n` +
          `${resetLink}\n\n` +
          `If you did not request this, please ignore this email and your password will remain unchanged.\n`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333333; text-align: center;">GlobeTrotter Password Reset</h2>
        <p>Hello,</p>
        <p>We received a request to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all;"><a href="${resetLink}">${resetLink}</a></p>
        <hr style="border: none; border-top: 1px solid #eeeeee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #777777;">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendPasswordResetEmail,
};
