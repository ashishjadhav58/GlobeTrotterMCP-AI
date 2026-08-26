require('dotenv').config();
const prisma = require('./utils/prisma');
const bcrypt = require('bcryptjs');


const seed = async () => {
  try {
    console.log('Clearing database tables...');
    await prisma.tripStop.deleteMany();
    await prisma.trip.deleteMany();
    await prisma.city.deleteMany();
    await prisma.user.deleteMany();

    console.log('Seeding Users...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Password123', salt);

    const user1 = await prisma.user.create({
      data: {
        username: 'traveler_alex',
        email: 'alex@example.com',
        passwordHash,
        firstName: 'Alex',
        lastName: 'Vasco',
        city: 'Rome',
        country: 'Italy'
      }
    });

    const user2 = await prisma.user.create({
      data: {
        username: 'traveler_bob',
        email: 'bob@example.com',
        passwordHash,
        firstName: 'Bob',
        lastName: 'Smith',
        city: 'London',
        country: 'UK'
      }
    });

    const user3 = await prisma.user.create({
      data: {
        username: 'traveler_clara',
        email: 'clara@example.com',
        passwordHash,
        firstName: 'Clara',
        lastName: 'Mendez',
        city: 'Madrid',
        country: 'Spain'
      }
    });

    console.log('Seeding Cities...');
    const goa = await prisma.city.create({
      data: { name: 'Goa', country: 'India', region: 'West India', image: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500' }
    });

    const mumbai = await prisma.city.create({
      data: { name: 'Mumbai', country: 'India', region: 'West India', image: 'https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=500' }
    });

    const delhi = await prisma.city.create({
      data: { name: 'Delhi', country: 'India', region: 'North India', image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=500' }
    });

    const jaipur = await prisma.city.create({
      data: { name: 'Jaipur', country: 'India', region: 'North India', image: 'https://images.unsplash.com/photo-1477584322902-471a5db55b36?w=500' }
    });

    const agra = await prisma.city.create({
      data: { name: 'Agra', country: 'India', region: 'North India', image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500' }
    });

    const kerala = await prisma.city.create({
      data: { name: 'Kerala', country: 'India', region: 'South India', image: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500' }
    });

    const paris = await prisma.city.create({
      data: { name: 'Paris', country: 'France', region: 'Western Europe', image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=500' }
    });

    const dubai = await prisma.city.create({
      data: { name: 'Dubai', country: 'UAE', region: 'Middle East', image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=500' }
    });

    const london = await prisma.city.create({
      data: { name: 'London', country: 'UK', region: 'Northern Europe', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=500' }
    });

    console.log('Seeding Trips and Stops...');
    const now = new Date();

    // 1. Alex's Trips
    // Trip A: Completed (Alex)
    const tripA = await prisma.trip.create({
      data: {
        userId: user1.id,
        name: 'Goa Holiday',
        description: 'Chilling on beaches',
        startDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
        endDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        coverImage: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=500'
      }
    });
    await prisma.tripStop.create({ data: { tripId: tripA.id, cityId: goa.id } });

    // Trip B: Ongoing (Alex)
    const tripB = await prisma.trip.create({
      data: {
        userId: user1.id,
        name: 'Europe Tour',
        description: 'Visiting Paris and London',
        startDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        endDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),  // 5 days from now
        coverImage: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=500'
      }
    });
    await prisma.tripStop.create({ data: { tripId: tripB.id, cityId: paris.id } });
    await prisma.tripStop.create({ data: { tripId: tripB.id, cityId: london.id } });

    // Trip C: Upcoming (Alex)
    const tripC = await prisma.trip.create({
      data: {
        userId: user1.id,
        name: 'Middle East Adventure',
        description: 'Exploring Dubai deserts',
        startDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        endDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        coverImage: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=500'
      }
    });
    await prisma.tripStop.create({ data: { tripId: tripC.id, cityId: dubai.id } });

    // Trip D: Upcoming (Alex) - Jaipur Palace Route
    const tripD = await prisma.trip.create({
      data: {
        userId: user1.id,
        name: 'Jaipur Palace Expedition',
        description: 'Jaipur, India',
        startDate: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000), // 25 days from now
        endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        coverImage: 'https://images.unsplash.com/photo-1477584322902-471a5db55b36?w=500'
      }
    });
    await prisma.tripStop.create({ data: { tripId: tripD.id, cityId: jaipur.id } });

    // Trip E: Completed (Alex) - Kerala Houseboat Backwaters
    const tripE = await prisma.trip.create({
      data: {
        userId: user1.id,
        name: 'Kerala Backwaters Cruise',
        description: 'Kerala, India',
        startDate: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        endDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
        coverImage: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500'
      }
    });
    await prisma.tripStop.create({ data: { tripId: tripE.id, cityId: kerala.id } });

    // More upcoming trips for Alex to test pagination (need 6+ total)
    for (let i = 1; i <= 5; i++) {
      const extraTrip = await prisma.trip.create({
        data: {
          userId: user1.id,
          name: `Extra Trip ${i}`,
          description: `Test trip number ${i}`,
          startDate: new Date(now.getTime() + (30 + i * 10) * 24 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + (35 + i * 10) * 24 * 60 * 60 * 1000)
        }
      });
      await prisma.tripStop.create({ data: { tripId: extraTrip.id, cityId: goa.id } });
    }

    // 2. Bob's Trips
    const tripBob = await prisma.trip.create({
      data: {
        userId: user2.id,
        name: 'Indian Cultural Voyage',
        description: 'Vibrant cities',
        startDate: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      }
    });
    await prisma.tripStop.create({ data: { tripId: tripBob.id, cityId: goa.id } });
    await prisma.tripStop.create({ data: { tripId: tripBob.id, cityId: mumbai.id } });
    await prisma.tripStop.create({ data: { tripId: tripBob.id, cityId: paris.id } });

    // 3. Clara's Trips
    const tripClara = await prisma.trip.create({
      data: {
        userId: user3.id,
        name: 'Quick Paris Trip',
        startDate: new Date(),
        endDate: new Date()
      }
    });
    await prisma.tripStop.create({ data: { tripId: tripClara.id, cityId: paris.id } });
    await prisma.tripStop.create({ data: { tripId: tripClara.id, cityId: goa.id } });
    await prisma.tripStop.create({ data: { tripId: tripClara.id, cityId: dubai.id } });

    console.log('SUCCESS: Mock data seeded successfully!');

  } catch (error) {
    console.error('FAILURE: Error seeding database:', error);
  } finally {
    await prisma.$disconnect();
  }
};

seed();
