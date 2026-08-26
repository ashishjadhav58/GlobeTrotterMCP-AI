require('dotenv').config();
const prisma = require('./utils/prisma');

async function listUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      firstName: true,
      lastName: true
    }
  });
  console.log("USERS IN DB:", JSON.stringify(users, null, 2));
}

listUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
