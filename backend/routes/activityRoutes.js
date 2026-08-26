const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const authMiddleware = require('../middleware/auth');

// All activity routes require authentication
router.use(authMiddleware);

router.get('/', activityController.getActivities);
router.post('/trip', activityController.addActivityToTrip);
router.delete('/trip/:tripActivityId', activityController.removeActivityFromTrip);
router.get('/trip/:tripId', activityController.getTripActivities);

module.exports = router;
