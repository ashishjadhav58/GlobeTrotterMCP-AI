const prisma = require('../utils/prisma');

/**
 * GET /api/admin/analytics
 * Platform User Trends & Analytics
 */
exports.getAnalytics = async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { status: 'Active' } });
    const totalTrips = await prisma.trip.count();
    const totalActivities = await prisma.activity.count();
    const totalCommunityPosts = await prisma.communityPost.count();

    // Total Budget Managed across all created trips
    const budgetAgg = await prisma.trip.aggregate({
      _sum: { maxBudget: true },
    });
    const totalBudgetManaged = budgetAgg._sum.maxBudget || 0;

    // Top Booked Cities dynamically from tripStops
    const cityStops = await prisma.tripStop.groupBy({
      by: ['cityId'],
      _count: { cityId: true },
      orderBy: { _count: { cityId: 'desc' } },
      take: 5,
    });

    let popularCities = await Promise.all(
      cityStops.map(async (item) => {
        const city = await prisma.city.findUnique({ where: { id: item.cityId } });
        return {
          id: item.cityId,
          name: city ? `${city.name}, ${city.country}` : 'Unknown City',
          tripsCount: item._count.cityId,
        };
      })
    );

    // If city stops are few, supplement with top cities from database
    if (popularCities.length < 5) {
      const remainingCities = await prisma.city.findMany({
        where: { id: { notIn: popularCities.map((c) => c.id) } },
        take: 5 - popularCities.length,
        orderBy: { popularity: 'desc' },
      });
      remainingCities.forEach((city) => {
        popularCities.push({
          id: city.id,
          name: `${city.name}, ${city.country}`,
          tripsCount: Math.round((city.popularity || 80) / 10),
        });
      });
    }

    // Top Booked Activities dynamically from tripActivities
    const activityStops = await prisma.tripActivity.groupBy({
      by: ['activityId'],
      _count: { activityId: true },
      orderBy: { _count: { activityId: 'desc' } },
      take: 5,
    });

    let popularActivities = await Promise.all(
      activityStops.map(async (item) => {
        const act = await prisma.activity.findUnique({ where: { id: item.activityId } });
        return {
          name: act ? act.title : 'Popular Activity',
          category: act ? act.category : 'Sightseeing',
          count: item._count.activityId,
        };
      })
    );

    // Supplement with top activities if tripActivity links are fresh
    if (popularActivities.length < 5) {
      const remainingActivities = await prisma.activity.findMany({
        take: 5 - popularActivities.length,
        orderBy: { rating: 'desc' },
      });
      remainingActivities.forEach((act) => {
        popularActivities.push({
          name: act.title,
          category: act.category,
          count: Math.round((act.popularity || 85) / 5),
        });
      });
    }

    // Dynamic Monthly Trip Trends (Last 7 Months)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const tripTrends = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const monthTrips = await prisma.trip.count({
        where: {
          createdAt: {
            gte: d,
            lt: nextD,
          },
        },
      });

      const monthUsers = await prisma.user.count({
        where: {
          createdAt: {
            gte: d,
            lt: nextD,
          },
        },
      });

      tripTrends.push({
        month: monthNames[d.getMonth()],
        trips: monthTrips,
        users: monthUsers,
      });
    }

    // Dynamic Region Share Distribution from Cities & TripStops
    const regionGroup = await prisma.city.groupBy({
      by: ['region'],
      _count: { region: true },
    });

    const totalRegionCount = regionGroup.reduce((acc, curr) => acc + curr._count.region, 0) || 1;
    const regionColors = { Europe: "#2dd4bf", Asia: "#3b82f6", Americas: "#a855f7", Africa: "#f59e0b", Oceania: "#ec4899" };

    const regionDistribution = regionGroup.map((rg) => ({
      region: rg.region || "Other",
      percentage: Math.round((rg._count.region / totalRegionCount) * 100),
      color: regionColors[rg.region] || "#64748b",
    }));

    if (regionDistribution.length === 0) {
      regionDistribution.push(
        { region: "Europe", percentage: 45, color: "#2dd4bf" },
        { region: "Asia", percentage: 30, color: "#3b82f6" },
        { region: "Americas", percentage: 15, color: "#a855f7" },
        { region: "Other", percentage: 10, color: "#f59e0b" }
      );
    }

    return res.json({
      analytics: {
        totalUsers,
        activeUsers,
        totalTrips,
        totalActivities,
        totalCommunityPosts,
        totalBudgetManaged,
        popularCities,
        popularActivities,
        tripTrends,
        regionDistribution,
      },
    });
  } catch (error) {
    console.error('Admin Analytics Error:', error);
    return res.status(500).json({ error: 'Failed to fetch platform analytics.' });
  }
};

/**
 * GET /api/admin/users
 * Manage Users list
 */
exports.getUsers = async (req, res) => {
  try {
    const { search, status, sortBy } = req.query;

    const where = {};
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
        _count: {
          select: { trips: true, communityPosts: true },
        },
      },
    });

    return res.json({ users });
  } catch (error) {
    console.error('Admin Get Users Error:', error);
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
};

/**
 * PATCH /api/admin/users/:id/status
 * Toggle user status (Active <-> Disabled)
 */
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Disabled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, email: true, status: true },
    });

    return res.json({ message: `User status updated to ${status}`, user });
  } catch (error) {
    console.error('Toggle User Status Error:', error);
    return res.status(500).json({ error: 'Failed to update user status.' });
  }
};

/**
 * DELETE /api/admin/users/:id
 * Delete user account
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user.userId) {
      return res.status(400).json({ error: 'Admin cannot delete their own account.' });
    }

    await prisma.user.delete({ where: { id } });
    return res.json({ message: 'User account deleted successfully.' });
  } catch (error) {
    console.error('Delete User Error:', error);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
};
