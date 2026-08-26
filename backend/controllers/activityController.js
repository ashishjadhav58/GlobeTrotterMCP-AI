const prisma = require('../utils/prisma');

/**
 * GET /api/activities
 * Browse & search activities with filters and sorting
 */
exports.getActivities = async (req, res) => {
  try {
    const { search, city, category, costType, duration, sortBy } = req.query;

    const where = {};

    // Search query filter (title or description or city name)
    if (search && search.trim()) {
      const query = search.trim();
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { cityName: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
      ];
    }

    // City filter
    if (city && city.trim() && city !== 'all') {
      where.cityName = { contains: city.trim(), mode: 'insensitive' };
    }

    // Category / Type filter
    if (category && category.trim() && category !== 'all') {
      where.category = { equals: category.trim(), mode: 'insensitive' };
    }

    // Cost filter (Free, $, $$, $$$)
    if (costType && costType.trim() && costType !== 'all') {
      where.costType = { equals: costType.trim() };
    }

    // Duration filter
    if (duration && duration.trim() && duration !== 'all') {
      where.duration = { equals: duration.trim() };
    }

    // Sorting logic
    let orderBy = [{ popularity: 'desc' }, { rating: 'desc' }];

    if (sortBy === 'rating') {
      orderBy = [{ rating: 'desc' }, { popularity: 'desc' }];
    } else if (sortBy === 'price_asc') {
      orderBy = [{ costAmount: 'asc' }];
    } else if (sortBy === 'price_desc') {
      orderBy = [{ costAmount: 'desc' }];
    } else if (sortBy === 'duration') {
      orderBy = [{ duration: 'asc' }];
    }

    const activities = await prisma.activity.findMany({
      where,
      orderBy,
    });

    return res.json({ activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    return res.status(500).json({ error: 'Failed to fetch activities.' });
  }
};

/**
 * POST /api/activities/trip
 * Add an activity to a trip
 */
exports.addActivityToTrip = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tripId, activityId, cityId } = req.body;

    if (!tripId || !activityId) {
      return res.status(400).json({ error: 'Trip ID and Activity ID are required.' });
    }

    // Verify trip ownership
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized.' });
    }

    // Check if activity already added
    const existing = await prisma.tripActivity.findFirst({
      where: { tripId, activityId },
    });

    if (existing) {
      return res.json({ message: 'Activity already added to trip', tripActivity: existing });
    }

    const tripActivity = await prisma.tripActivity.create({
      data: {
        tripId,
        activityId,
        cityId: cityId || null,
      },
      include: {
        activity: true,
      },
    });

    return res.status(201).json({
      message: 'Activity added to trip successfully',
      tripActivity,
    });
  } catch (error) {
    console.error('Error adding activity to trip:', error);
    return res.status(500).json({ error: 'Failed to add activity to trip.' });
  }
};

/**
 * DELETE /api/activities/trip/:tripActivityId
 * Remove an activity from a trip
 */
exports.removeActivityFromTrip = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tripActivityId } = req.params;

    const tripActivity = await prisma.tripActivity.findUnique({
      where: { id: tripActivityId },
      include: { trip: true },
    });

    if (!tripActivity || tripActivity.trip.userId !== userId) {
      return res.status(404).json({ error: 'Trip activity not found or unauthorized.' });
    }

    await prisma.tripActivity.delete({
      where: { id: tripActivityId },
    });

    return res.json({ message: 'Activity removed from trip successfully.' });
  } catch (error) {
    console.error('Error removing activity from trip:', error);
    return res.status(500).json({ error: 'Failed to remove activity from trip.' });
  }
};

/**
 * GET /api/activities/trip/:tripId
 * Get all activities linked to a trip
 */
exports.getTripActivities = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.userId;

    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized.' });
    }

    const tripActivities = await prisma.tripActivity.findMany({
      where: { tripId },
      include: {
        activity: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ tripActivities });
  } catch (error) {
    console.error('Error fetching trip activities:', error);
    return res.status(500).json({ error: 'Failed to fetch trip activities.' });
  }
};
