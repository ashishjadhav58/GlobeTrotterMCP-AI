const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

// Protected with adminAuth middleware (Rejects non-ADMIN users with HTTP 403)
router.use(adminAuth);

router.get('/analytics', adminController.getAnalytics);
router.get('/users', adminController.getUsers);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.delete('/users/:id', adminController.deleteUser);

module.exports = router;
