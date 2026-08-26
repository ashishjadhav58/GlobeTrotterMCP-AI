require('dotenv').config();
const prisma = require('./utils/prisma');

async function checkAdmin() {
  const admin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'admin@globetrotter.com' },
        { username: 'admin' }
      ]
    }
  });
  console.log("Admin user in DB:", admin);
}

checkAdmin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
