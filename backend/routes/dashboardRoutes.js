const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth');

// All dashboard endpoints require authentication
router.get('/', authMiddleware, dashboardController.getDashboard);
router.get('/regional-selections', authMiddleware, dashboardController.getRegionalSelections);
router.get('/previous-trips', authMiddleware, dashboardController.getPreviousTrips);

module.exports = router;
