require('dotenv').config();
const prisma = require('./utils/prisma');

async function cleanDummyData() {
  console.log("Cleaning dummy trips and dummy test users from PostgreSQL database...");
  
  // Delete trips created by dummy test users (alex@example.com, bob@example.com, clara@example.com)
  const dummyUsers = await prisma.user.findMany({
    where: {
      email: { in: ['alex@example.com', 'bob@example.com', 'clara@example.com'] }
    }
  });

  const dummyUserIds = dummyUsers.map(u => u.id);

  if (dummyUserIds.length > 0) {
    const deletedStops = await prisma.tripStop.deleteMany({
      where: { trip: { userId: { in: dummyUserIds } } }
    });
    console.log(`Deleted ${deletedStops.count} dummy trip stops.`);

    const deletedTrips = await prisma.trip.deleteMany({
      where: { userId: { in: dummyUserIds } }
    });
    console.log(`Deleted ${deletedTrips.count} dummy trips.`);

    const deletedUsers = await prisma.user.deleteMany({
      where: { id: { in: dummyUserIds } }
    });
    console.log(`Deleted ${deletedUsers.count} dummy test users.`);
  }

  console.log("Clean complete!");
}

cleanDummyData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
