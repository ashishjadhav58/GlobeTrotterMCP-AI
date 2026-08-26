const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const authMiddleware = require('../middleware/auth');

// Public route (no auth required) — must be registered BEFORE authMiddleware
router.get('/:id/public', tripController.getPublicTripById);

// All other trip routes require authentication
router.use(authMiddleware);

// Specific path routes FIRST
router.get('/cities', tripController.getCities);

// Root path routes
router.post('/', tripController.createTrip);

// Parameterized path routes LAST
router.get('/:id', tripController.getTripById);
router.put('/:id', tripController.updateTrip);
router.delete('/:id', tripController.deleteTrip);

// Trip stop sub-routes
router.post('/:id/stops', tripController.addTripStop);
router.delete('/:id/stops/:stopId', tripController.deleteTripStop);

// Itinerary regeneration route
router.post('/:id/regenerate-itinerary', tripController.regenerateItinerary);

module.exports = router;
