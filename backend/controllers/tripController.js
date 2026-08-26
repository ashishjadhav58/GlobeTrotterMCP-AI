const prisma = require('../utils/prisma');

const GEMINI_ENDPOINTS = [
  { version: 'v1beta', model: 'gemini-3.1-pro-preview' },
  { version: 'v1beta', model: 'gemini-3.1-flash-lite' },
];

function formatIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value || '');
  return date.toISOString().slice(0, 10);
}

function inclusiveTripDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function extractJsonArray(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty Gemini response');
  }

  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBracket = cleaned.search(/[\[{]/);
  const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.itinerary)) return parsed.itinerary;
  if (Array.isArray(parsed.sections)) return parsed.sections;
  if (Array.isArray(parsed.expenses)) return parsed.expenses;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.days)) return parsed.days;
  throw new Error('Gemini response was not a JSON array');
}

async function callGeminiJson(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  let lastError = 'Gemini request failed';

  for (const { version, model } of GEMINI_ENDPOINTS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      const json = await response.json();
      if (!response.ok || json.error) {
        lastError = json.error?.message || `Gemini HTTP ${response.status}`;
        console.error(`Gemini ${version}/${model} failed:`, lastError);
        continue;
      }

      const parts = json.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts.map((part) => part.text || '').join('\n')
        : '';

      if (!text.trim()) {
        lastError = 'Gemini returned an empty itinerary';
        continue;
      }

      return extractJsonArray(text);
    } catch (err) {
      lastError = err.message || String(err);
      console.error(`Gemini ${version}/${model} parse error:`, lastError);
    }
  }

  throw new Error(lastError);
}

function normalizeItinerary(sections, startDate, dayCount, maxBudget) {
  const start = new Date(startDate);
  const perDay = dayCount > 0 ? Math.round((Number(maxBudget) || 0) / dayCount) : 0;

  return sections.slice(0, dayCount).map((section, index) => {
    const dayDate = new Date(start);
    dayDate.setDate(start.getDate() + index);
    const iso = formatIsoDate(dayDate);
    const budgetValue = section.budget ?? section.dailyBudget ?? perDay;
    const budget =
      typeof budgetValue === 'number'
        ? `$${budgetValue}`
        : String(budgetValue || `$${perDay}`);

    return {
      id: section.id || `sec-${index + 1}`,
      title: String(section.title || `Day ${index + 1}`),
      description: String(section.description || section.details || ''),
      startDate: String(section.startDate || section.date || iso),
      endDate: String(section.endDate || section.startDate || section.date || iso),
      budget,
    };
  });
}

function normalizeExpenses(items, dayCount) {
  const allowed = new Set(['Transport', 'Stay', 'Activities', 'Meals']);
  return items.map((item, index) => {
    const category = allowed.has(item.category) ? item.category : 'Activities';
    const day = Number(item.day) || ((index % dayCount) + 1);
    return {
      id: String(item.id || `e${index + 1}`),
      day: Math.min(Math.max(day, 1), dayCount),
      activityTitle: String(item.activityTitle || item.title || item.name || 'Activity'),
      category,
      cost: Number(item.cost) || 0,
    };
  });
}

async function generateGeminiItinerary(name, location, startDate, endDate, description, maxBudget) {
  const dayCount = inclusiveTripDays(startDate, endDate);
  const start = formatIsoDate(startDate);
  const end = formatIsoDate(endDate);

  const prompt = `You are a professional travel planner. Create a REAL, destination-specific daily itinerary.

Trip name: ${name}
Destination(s): ${location}
Dates: ${start} to ${end} (exactly ${dayCount} day(s), inclusive)
Traveler notes: ${description || 'None'}
Total trip budget: $${maxBudget} USD

Hard rules:
- Plan ONLY for "${location}". Do not invent a different city or country.
- Do not use placeholder, generic, or example destinations (no fake "Global" sightseeing).
- Every activity, hotel, restaurant, transit option, and landmark must be a real named place that exists in that destination.
- Create exactly ${dayCount} objects, one for each calendar day from ${start} through ${end}.
- Daily section budgets must be realistic for that day's activities and MUST sum to approximately $${maxBudget} (do not exceed it).
- Scale lodging, food, and attractions to this budget (budget vs mid-range vs premium).
- Vary each day. Cover arrival/departure logistics on first and last days.

Return a JSON array only. Each object must have:
- title (string, e.g. "Day 1: Neighborhood and landmark names")
- description (string, detailed paragraph with specific place names, meals, and transport)
- startDate (YYYY-MM-DD for that day)
- endDate (YYYY-MM-DD for that day, same as startDate)
- budget (string like "$180")`;

  const sections = await callGeminiJson(prompt);
  const normalized = normalizeItinerary(sections, startDate, dayCount, maxBudget);
  if (!normalized.length) {
    throw new Error('Gemini returned no itinerary days');
  }
  return JSON.stringify(normalized);
}

async function generateGeminiExpenses(name, location, startDate, endDate, description, maxBudget) {
  const dayCount = inclusiveTripDays(startDate, endDate);
  const start = formatIsoDate(startDate);
  const end = formatIsoDate(endDate);

  const prompt = `You are a travel budget analyst. Create a REAL itemized expense list for this trip.

Trip name: ${name}
Destination(s): ${location}
Dates: ${start} to ${end} (exactly ${dayCount} day(s))
Traveler notes: ${description || 'None'}
Total trip budget: $${maxBudget} USD

Hard rules:
- Expenses must match "${location}" only. Use real local hotels, transit, restaurants, and attractions by name.
- No generic placeholders and no unrelated cities.
- Cover every day from 1 to ${dayCount}.
- Each day should typically include Stay, Transport, Meals, and Activities when realistic.
- All costs are USD numbers. The SUM of every cost must be <= $${maxBudget} and close to that total.
- Scale prices to the given budget and local cost of living.

Return a JSON array only. Each object must have:
- id (string, e.g. "e1")
- day (number from 1 to ${dayCount})
- activityTitle (string with a specific real venue or service name)
- category (exactly one of: "Transport", "Stay", "Activities", "Meals")
- cost (number)`;

  const items = await callGeminiJson(prompt);
  const normalized = normalizeExpenses(items, dayCount);
  if (!normalized.length) {
    throw new Error('Gemini returned no expenses');
  }
  return JSON.stringify(normalized);
}

function tripLocationFromStops(trip, fallbackLocation) {
  const names = (trip.tripStops || [])
    .map((stop) => {
      const city = stop.city;
      if (!city) return null;
      return city.country ? `${city.name}, ${city.country}` : city.name;
    })
    .filter(Boolean);
  if (names.length) return [...new Set(names)].join(' → ');
  return fallbackLocation || '';
}


/**
 * POST /api/trips
 * Create a new trip for authenticated user
 */
exports.createTrip = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, startDate, endDate, description, coverImage, location, cityId, maxBudget } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Trip name is required.' });
    }

    const destination = typeof location === 'string' ? location.trim() : '';
    if (!destination && !cityId) {
      return res.status(400).json({ error: 'A destination city and country are required to generate an itinerary.' });
    }

    const parsedBudget = maxBudget !== undefined && maxBudget !== null && maxBudget !== ''
      ? parseFloat(maxBudget)
      : NaN;
    if (isNaN(parsedBudget) || parsedBudget <= 0) {
      return res.status(400).json({ error: 'A valid maximum trip budget is required.' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required.' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid start date or end date format.' });
    }

    if (start > end) {
      return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
    }

    // Resolve cover image from City or Location name
    let resolvedCoverImage = coverImage || null;
    let matchingCity = null;

    if (cityId) {
      matchingCity = await prisma.city.findUnique({ where: { id: cityId } });
    } else if (destination) {
      matchingCity = await prisma.city.findFirst({
        where: { name: { equals: destination, mode: 'insensitive' } }
      });
      if (!matchingCity) {
        const cleanLoc = destination.split(',')[0].trim();
        matchingCity = await prisma.city.findFirst({
          where: { name: { equals: cleanLoc, mode: 'insensitive' } }
        });
      }
    }

    if (matchingCity && matchingCity.image && !resolvedCoverImage) {
      resolvedCoverImage = matchingCity.image;
    } else if (destination && !resolvedCoverImage) {
      const kw = destination.toLowerCase();
      if (kw.includes("delhi")) resolvedCoverImage = "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=500";
      else if (kw.includes("jaipur")) resolvedCoverImage = "https://images.unsplash.com/photo-1477584322902-471a5db55b36?w=500";
      else if (kw.includes("agra")) resolvedCoverImage = "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500";
      else if (kw.includes("kerala")) resolvedCoverImage = "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500";
      else if (kw.includes("goa")) resolvedCoverImage = "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500";
      else if (kw.includes("mumbai")) resolvedCoverImage = "https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=500";
      else if (kw.includes("paris")) resolvedCoverImage = "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=500";
      else if (kw.includes("london")) resolvedCoverImage = "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=500";
      else if (kw.includes("dubai")) resolvedCoverImage = "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=500";
      else if (kw.includes("tokyo")) resolvedCoverImage = "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=500";
      else if (kw.includes("sydney")) resolvedCoverImage = "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=500";
      else if (kw.includes("new york")) resolvedCoverImage = "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=500";
    }

    const resolvedLocation = matchingCity
      ? `${matchingCity.name}${matchingCity.country ? `, ${matchingCity.country}` : ''}`
      : destination;

    let itinerary;
    let expenses;
    try {
      itinerary = await generateGeminiItinerary(
        name.trim(),
        resolvedLocation,
        startDate,
        endDate,
        description,
        parsedBudget
      );
      expenses = await generateGeminiExpenses(
        name.trim(),
        resolvedLocation,
        startDate,
        endDate,
        description,
        parsedBudget
      );
    } catch (e) {
      console.error("Gemini generation failed:", e);
      return res.status(500).json({
        error: e.message || 'Failed to generate itinerary with AI. Please try again.',
      });
    }

    // Create trip in database
    const trip = await prisma.trip.create({
      data: {
        userId,
        name: name.trim(),
        description: description ? description.trim() : null,
        startDate: start,
        endDate: end,
        coverImage: resolvedCoverImage,
        itinerary,
        expenses,
        maxBudget: parsedBudget,
      },
    });

    // If cityId or location text provided, add initial trip stop
    if (cityId) {
      const cityExists = await prisma.city.findUnique({ where: { id: cityId } });
      if (cityExists) {
        await prisma.tripStop.create({
          data: {
            tripId: trip.id,
            cityId: cityExists.id,
          },
        });
      }
    } else if (destination) {
      if (!matchingCity) {
        const parts = destination.split(',').map((part) => part.trim()).filter(Boolean);
        matchingCity = await prisma.city.create({
          data: {
            name: parts[0],
            country: parts[1] || 'Unknown',
            region: parts[1] || 'Unknown',
          },
        });
      }
      await prisma.tripStop.create({
        data: {
          tripId: trip.id,
          cityId: matchingCity.id,
        },
      });
    }

    return res.status(201).json({
      message: 'Trip created successfully',
      trip,
    });
  } catch (error) {
    console.error('Error creating trip:', error);
    return res.status(500).json({ error: 'Failed to create trip.' });
  }
};

/**
 * GET /api/trips/cities
 * Fetch list of destination cities
 */
exports.getCities = async (req, res) => {
  try {
    const cities = await prisma.city.findMany({
      orderBy: { name: 'asc' },
    });
    return res.json({ cities });
  } catch (error) {
    console.error('Error fetching cities:', error);
    return res.status(500).json({ error: 'Failed to fetch cities.' });
  }
};

/**
 * GET /api/trips/:id
 * Get trip details by ID
 */
exports.getTripById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const trip = await prisma.trip.findFirst({
      where: { id, userId },
      include: {
        tripStops: {
          include: {
            city: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    return res.json({ trip });
  } catch (error) {
    console.error('Error fetching trip:', error);
    return res.status(500).json({ error: 'Failed to fetch trip details.' });
  }
};

/**
 * PUT /api/trips/:id
 * Update an existing trip
 */
exports.updateTrip = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name, description, startDate, endDate, coverImage, maxBudget, itinerary, expenses } = req.body;

    const trip = await prisma.trip.findFirst({
      where: { id, userId },
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized.' });
    }

    const dataToUpdate = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (description !== undefined) dataToUpdate.description = description;
    if (coverImage !== undefined) dataToUpdate.coverImage = coverImage;
    if (maxBudget !== undefined && !isNaN(parseFloat(maxBudget))) dataToUpdate.maxBudget = parseFloat(maxBudget);
    if (itinerary !== undefined) dataToUpdate.itinerary = itinerary;
    if (expenses !== undefined) dataToUpdate.expenses = expenses;

    if (startDate) {
      const s = new Date(startDate);
      if (!isNaN(s.getTime())) dataToUpdate.startDate = s;
    }
    if (endDate) {
      const e = new Date(endDate);
      if (!isNaN(e.getTime())) dataToUpdate.endDate = e;
    }

    const updated = await prisma.trip.update({
      where: { id },
      data: dataToUpdate,
    });

    return res.json({
      message: 'Trip updated successfully',
      trip: updated,
    });
  } catch (error) {
    console.error('Update trip error:', error);
    return res.status(500).json({ error: 'Internal server error updating trip.' });
  }
};

/**
 * DELETE /api/trips/:id
 * Delete a trip
 */
exports.deleteTrip = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const trip = await prisma.trip.findFirst({
      where: { id, userId }
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized.' });
    }

    await prisma.trip.delete({
      where: { id }
    });

    return res.json({ message: 'Trip deleted successfully' });

  } catch (error) {
    console.error('Delete trip error:', error);
    return res.status(500).json({ error: 'Internal server error deleting trip.' });
  }
};

/**
 * GET /api/trips/:id
 * Get trip details by ID
 */
exports.getTripById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const trip = await prisma.trip.findFirst({
      where: { id, userId },
      include: {
        tripStops: {
          include: {
            city: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    return res.json({ trip });
  } catch (error) {
    console.error('Error fetching trip:', error);
    return res.status(500).json({ error: 'Failed to fetch trip details.' });
  }
};

/**
 * GET /api/trips/:id/public
 * Get trip details by ID without authentication (for sharing)
 */
exports.getPublicTripById = async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        tripStops: {
          include: { city: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    return res.json({ trip });
  } catch (error) {
    console.error('Error fetching public trip:', error);
    return res.status(500).json({ error: 'Failed to fetch trip details.' });
  }
};


/**
 * POST /api/trips/:id/stops
 * Add a stop/city to a trip itinerary
 */
exports.addTripStop = async (req, res) => {
  try {
    const { id: tripId } = req.params;
    const userId = req.user.userId;
    const { cityId, cityName } = req.body;

    const trip = await prisma.trip.findFirst({ where: { id: tripId, userId } });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized.' });
    }

    let targetCityId = cityId;

    if (!targetCityId && cityName) {
      let city = await prisma.city.findFirst({
        where: { name: { equals: cityName.trim(), mode: 'insensitive' } },
      });

      if (!city) {
        city = await prisma.city.create({
          data: {
            name: cityName.trim(),
            country: 'Global',
            region: 'Global',
          },
        });
      }
      targetCityId = city.id;
    }

    if (!targetCityId) {
      return res.status(400).json({ error: 'City ID or City Name is required.' });
    }

    const tripStop = await prisma.tripStop.create({
      data: {
        tripId,
        cityId: targetCityId,
      },
      include: {
        city: true,
      },
    });

    return res.status(201).json({ message: 'Stop added to itinerary', tripStop });
  } catch (error) {
    console.error('Error adding trip stop:', error);
    return res.status(500).json({ error: 'Failed to add stop to itinerary.' });
  }
};

/**
 * DELETE /api/trips/:id/stops/:stopId
 * Remove a stop from a trip itinerary
 */
exports.deleteTripStop = async (req, res) => {
  try {
    const { id: tripId, stopId } = req.params;
    const userId = req.user.userId;

    const trip = await prisma.trip.findFirst({ where: { id: tripId, userId } });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized.' });
    }

    await prisma.tripStop.delete({
      where: { id: stopId }
    });

    return res.json({ message: 'Stop removed from itinerary.' });
  } catch (error) {
    console.error('Error deleting trip stop:', error);
    return res.status(500).json({ error: 'Failed to remove stop.' });
  }
};

/**
 * POST /api/trips/:id/regenerate-itinerary
 * Regenerate trip itinerary using Gemini AI
 */
exports.regenerateItinerary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const trip = await prisma.trip.findFirst({
      where: { id, userId },
      include: {
        tripStops: {
          include: {
            city: true,
          },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found or unauthorized.' });
    }

    const primaryLocation = trip.tripStops?.[0]?.city?.name || 'Global';

    // Generate custom itinerary using Gemini AI
    let itinerary = null;
    try {
      itinerary = await generateGeminiItinerary(trip.name, primaryLocation, trip.startDate, trip.endDate, trip.description);
    } catch (e) {
      console.error("Gemini regeneration failed:", e);
    }

    if (!itinerary) {
      return res.status(500).json({ error: 'Failed to generate itinerary with AI. Please try again.' });
    }

    // Update trip with new itinerary
    const updated = await prisma.trip.update({
      where: { id },
      data: { itinerary },
    });

    return res.json({
      message: 'Itinerary regenerated successfully',
      trip: updated,
    });
  } catch (error) {
    console.error('Error regenerating itinerary:', error);
    return res.status(500).json({ error: 'Failed to regenerate itinerary.' });
  }
};
