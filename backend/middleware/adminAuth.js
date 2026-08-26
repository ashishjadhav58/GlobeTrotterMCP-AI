const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'globe_trotter_secret_key_987654321_abc';

/**
 * Middleware: Verify Admin Access
 * Rejects normal users with HTTP 403 Forbidden
 */
module.exports = async function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. Authorization token required.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user from DB to verify role
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, status: true, firstName: true, email: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid user session.' });
    }

    if (user.status === 'Disabled') {
      return res.status(403).json({ error: 'Account has been disabled by system administrator.' });
    }

    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    req.user = decoded;
    req.adminUser = user;
    next();
  } catch (error) {
    console.error('Admin Auth Error:', error.message);
    return res.status(403).json({ error: 'Forbidden: Invalid or expired admin token.' });
  }
};
