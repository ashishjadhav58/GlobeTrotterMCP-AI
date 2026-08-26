require('dotenv').config();
const prisma = require('./utils/prisma');
const bcrypt = require('bcryptjs');

async function seedUser() {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('userpassword123', salt);

  const demoUser = await prisma.user.upsert({
    where: { email: 'user@globetrotter.com' },
    update: {
      passwordHash,
      role: 'USER',
      status: 'Active'
    },
    create: {
      username: 'demouser',
      email: 'user@globetrotter.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Traveler',
      role: 'USER',
      status: 'Active',
      city: 'Paris',
      country: 'France'
    }
  });

  console.log("Demo user account seeded:", demoUser.email);
}

seedUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
