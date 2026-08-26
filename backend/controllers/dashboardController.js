const prisma = require('../utils/prisma');

// Whitelisted sorting and grouping values
const ALLOWED_SORT_BY_REGIONAL = ['selectionCount', 'uniqueTravelerCount', 'name'];
const ALLOWED_SORT_BY_TRIPS = ['startDate', 'endDate', 'createdAt', 'name'];
const ALLOWED_SORT_ORDERS = ['asc', 'desc'];
const ALLOWED_GROUP_BY = ['region', 'country'];

/**
 * GET /api/dashboard
 * Initial dashboard load with initial popular cities and user's previous trips
 */
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1. Fetch Top 5 Regional Selections (Global Popularity)
    // We use a raw SQL query to perform the database-level aggregation efficiently
    const topRegionalSelections = await prisma.$queryRaw`
      SELECT 
        c.id, 
        c.name, 
        c.country, 
        c.region, 
        c.image, 
        CAST(COUNT(ts.id) AS INTEGER) AS "selectionCount", 
        CAST(COUNT(DISTINCT t."userId") AS INTEGER) AS "uniqueTravelerCount"
      FROM "City" c
      LEFT JOIN "TripStop" ts ON ts."cityId" = c.id
      LEFT JOIN "Trip" t ON t.id = ts."tripId"
      GROUP BY c.id, c.name, c.country, c.region, c.image
      ORDER BY "selectionCount" DESC, c.name ASC
      LIMIT 5
    `;

    // 2. Fetch User's Previous Trips (Initial Page 1, Limit 6)
    const tripPage = 1;
    const tripLimit = 6;
    const tripWhere = { userId };

    const totalTrips = await prisma.trip.count({ where: tripWhere });
    const totalTripPages = Math.ceil(totalTrips / tripLimit);

    const previousTrips = await prisma.trip.findMany({
      where: tripWhere,
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        coverImage: true,
        createdAt: true,
        _count: {
          select: { tripStops: true }
        }
      },
      orderBy: { startDate: 'desc' },
      take: tripLimit
    });

    // Format the response body
    const formattedTrips = previousTrips.map(trip => ({
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate.toISOString().split('T')[0],
      endDate: trip.endDate.toISOString().split('T')[0],
      coverImage: trip.coverImage,
      destinationCount: trip._count.tripStops
    }));

    return res.json({
      success: true,
      message: 'Dashboard data fetched successfully',
      data: {
        topRegionalSelections,
        previousTrips: formattedTrips,
        pagination: {
          previousTrips: {
            page: tripPage,
            limit: tripLimit,
            total: totalTrips,
            totalPages: totalTripPages,
            hasNextPage: tripPage < totalTripPages,
            hasPreviousPage: tripPage > 1
          }
        }
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({ success: false, message: 'Internal server error fetching dashboard data' });
  }
};

/**
 * GET /api/dashboard/regional-selections
 * Global regional selections with searching, filtering, grouping, sorting and pagination
 */
exports.getRegionalSelections = async (req, res) => {
  try {
    const {
      search,
      country,
      region,
      minSelectionCount,
      groupBy,
      sortBy = 'selectionCount',
      sortOrder = 'desc',
      page = '1',
      limit = '10'
    } = req.query;

    // Validate parameters
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (parsedPage - 1) * parsedLimit;

    if (sortBy && !ALLOWED_SORT_BY_REGIONAL.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        message: `Invalid sortBy parameter. Allowed values: ${ALLOWED_SORT_BY_REGIONAL.join(', ')}`
      });
    }

    if (sortOrder && !ALLOWED_SORT_ORDERS.includes(sortOrder.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid sortOrder parameter. Allowed values: ${ALLOWED_SORT_ORDERS.join(', ')}`
      });
    }

    const orderDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // --- GROUP BY LOGIC ---
    if (groupBy) {
      if (!ALLOWED_GROUP_BY.includes(groupBy.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid groupBy parameter. Allowed values: ${ALLOWED_GROUP_BY.join(', ')}`
        });
      }

      const groupField = groupBy.toLowerCase() === 'region' ? 'region' : 'country';

      // Perform aggregation for groups
      // Dynamic SQL injection is prevented here because groupField is strictly whitelisted
      const groups = await prisma.$queryRawUnsafe(`
        SELECT 
          c."${groupField}" AS "group",
          CAST(COUNT(ts.id) AS INTEGER) AS "selectionCount",
          CAST(COUNT(DISTINCT t."userId") AS INTEGER) AS "uniqueTravelerCount"
        FROM "City" c
        LEFT JOIN "TripStop" ts ON ts."cityId" = c.id
        LEFT JOIN "Trip" t ON t.id = ts."tripId"
        GROUP BY c."${groupField}"
        ORDER BY "selectionCount" DESC
      `);

      // For each group, get top 3 cities in that group
      const data = [];
      for (const group of groups) {
        if (!group.group) continue;

        const topCities = await prisma.$queryRawUnsafe(`
          SELECT 
            c.id, 
            c.name, 
            CAST(COUNT(ts.id) AS INTEGER) AS "selectionCount"
          FROM "City" c
          LEFT JOIN "TripStop" ts ON ts."cityId" = c.id
          WHERE c."${groupField}" = $1
          GROUP BY c.id, c.name
          ORDER BY "selectionCount" DESC, c.name ASC
          LIMIT 3
        `, group.group);

        data.push({
          group: group.group,
          selectionCount: group.selectionCount,
          uniqueTravelerCount: group.uniqueTravelerCount,
          topCities
        });
      }

      return res.json({
        success: true,
        message: `Regional selections grouped by ${groupField} fetched successfully`,
        data
      });
    }

    // --- STANDARD PAGINATED/FILTERED LOGIC ---
    // Prepare parameterized raw SQL components to filter, paginate and sort
    let queryParams = [];
    let filterIndex = 1;
    let whereClauses = [];

    if (search) {
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern);
      whereClauses.push(`(c.name ILIKE $${filterIndex} OR c.country ILIKE $${filterIndex} OR c.region ILIKE $${filterIndex})`);
      filterIndex++;
    }

    if (country) {
      queryParams.push(country);
      whereClauses.push(`c.country = $${filterIndex}`);
      filterIndex++;
    }

    if (region) {
      queryParams.push(region);
      whereClauses.push(`c.region = $${filterIndex}`);
      filterIndex++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const havingSql = minSelectionCount ? `HAVING COUNT(ts.id) >= ${parseInt(minSelectionCount, 10) || 0}` : '';

    // Order mapping
    let orderSql = `ORDER BY "selectionCount" ${orderDirection}`;
    if (sortBy === 'uniqueTravelerCount') {
      orderSql = `ORDER BY "uniqueTravelerCount" ${orderDirection}`;
    } else if (sortBy === 'name') {
      orderSql = `ORDER BY c.name ${orderDirection}`;
    }

    // 1. Fetch Total count for pagination
    // To count total groups after filtering, we wrap the base query in a COUNT query
    const countQuery = `
      SELECT CAST(COUNT(*) AS INTEGER) as total FROM (
        SELECT c.id
        FROM "City" c
        LEFT JOIN "TripStop" ts ON ts."cityId" = c.id
        LEFT JOIN "Trip" t ON t.id = ts."tripId"
        ${whereSql}
        GROUP BY c.id
        ${havingSql}
      ) AS count_table
    `;
    const totalResult = await prisma.$queryRawUnsafe(countQuery, ...queryParams);
    const total = totalResult[0]?.total || 0;
    const totalPages = Math.ceil(total / parsedLimit);

    // 2. Fetch the paginated data
    const dataQuery = `
      SELECT 
        c.id, 
        c.name, 
        c.country, 
        c.region, 
        c.image, 
        CAST(COUNT(ts.id) AS INTEGER) AS "selectionCount", 
        CAST(COUNT(DISTINCT t."userId") AS INTEGER) AS "uniqueTravelerCount"
      FROM "City" c
      LEFT JOIN "TripStop" ts ON ts."cityId" = c.id
      LEFT JOIN "Trip" t ON t.id = ts."tripId"
      ${whereSql}
      GROUP BY c.id, c.name, c.country, c.region, c.image
      ${havingSql}
      ${orderSql}
      LIMIT ${parsedLimit} OFFSET ${offset}
    `;

    const data = await prisma.$queryRawUnsafe(dataQuery, ...queryParams);

    return res.json({
      success: true,
      message: 'Regional selections fetched successfully',
      data,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1
      }
    });

  } catch (error) {
    console.error('Error fetching regional selections:', error);
    return res.status(500).json({ success: false, message: 'Internal server error fetching regional selections' });
  }
};

/**
 * GET /api/dashboard/previous-trips
 * Authenticated user's previous trips with searching, status calculation, sorting, and pagination
 */
exports.getPreviousTrips = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      search,
      status,
      scope = 'mine',
      startDateFrom,
      startDateTo,
      endDateFrom,
      endDateTo,
      sortBy = 'startDate',
      sortOrder = 'desc',
      page = '1',
      limit = '6'
    } = req.query;

    // Validate parameters
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 6));
    const offset = (parsedPage - 1) * parsedLimit;

    if (sortBy && !ALLOWED_SORT_BY_TRIPS.includes(sortBy)) {
      return res.status(400).json({
        success: false,
        message: `Invalid sortBy parameter. Allowed values: ${ALLOWED_SORT_BY_TRIPS.join(', ')}`
      });
    }

    if (sortOrder && !ALLOWED_SORT_ORDERS.includes(sortOrder.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid sortOrder parameter. Allowed values: ${ALLOWED_SORT_ORDERS.join(', ')}`
      });
    }

    if (scope !== 'mine' && scope !== 'all') {
      return res.status(400).json({
        success: false,
        message: 'Invalid scope parameter. Allowed values: mine, all'
      });
    }

    // Default to the authenticated user's trips; all trips require explicit scope=all.
    const where = scope === 'all' ? {} : { userId };

    // Search filter (searches in trip name or description)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Status filter (derived from dates)
    const now = new Date();
    if (status) {
      const statusLower = status.toLowerCase();
      if (statusLower === 'upcoming') {
        where.startDate = { gt: now };
      } else if (statusLower === 'ongoing') {
        where.startDate = { lte: now };
        where.endDate = { gte: now };
      } else if (statusLower === 'completed') {
        where.endDate = { lt: now };
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid status parameter. Allowed values: upcoming, ongoing, completed'
        });
      }
    }

    // Date range filters
    if (startDateFrom || startDateTo) {
      where.startDate = where.startDate || {};
      if (startDateFrom) where.startDate.gte = new Date(startDateFrom);
      if (startDateTo) where.startDate.lte = new Date(startDateTo);
    }

    if (endDateFrom || endDateTo) {
      where.endDate = where.endDate || {};
      if (endDateFrom) where.endDate.gte = new Date(endDateFrom);
      if (endDateTo) where.endDate.lte = new Date(endDateTo);
    }

    // 1. Fetch Total count for pagination
    const total = await prisma.trip.count({ where });
    const totalPages = Math.ceil(total / parsedLimit);

    // 2. Fetch Paginated Trips avoiding N+1 queries by including stop counts directly
    const trips = await prisma.trip.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        coverImage: true,
        createdAt: true,
        _count: {
          select: { tripStops: true }
        }
      },
      orderBy: { [sortBy]: sortOrder.toLowerCase() },
      skip: offset,
      take: parsedLimit
    });

    // Formatting data output
    const data = trips.map(trip => {
      // Derive status
      let derivedStatus = 'ongoing';
      if (trip.startDate > now) {
        derivedStatus = 'upcoming';
      } else if (trip.endDate < now) {
        derivedStatus = 'completed';
      }

      return {
        id: trip.id,
        name: trip.name,
        description: trip.description,
        startDate: trip.startDate.toISOString().split('T')[0],
        endDate: trip.endDate.toISOString().split('T')[0],
        coverImage: trip.coverImage,
        destinationCount: trip._count.tripStops,
        status: derivedStatus,
        createdAt: trip.createdAt
      };
    });

    return res.json({
      success: true,
      message: 'Previous trips fetched successfully',
      data,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1
      }
    });

  } catch (error) {
    console.error('Error fetching previous trips:', error);
    return res.status(500).json({ success: false, message: 'Internal server error fetching previous trips' });
  }
};
