require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./utils/prisma');

async function seedAdmin() {
  console.log("Seeding dedicated Admin user...");
  const adminEmail = "admin@globetrotter.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  const passwordHash = await bcrypt.hash("adminpassword123", 10);

  if (!existingAdmin) {
    const admin = await prisma.user.create({
      data: {
        username: "admin",
        email: adminEmail,
        passwordHash,
        firstName: "GlobeTrotter",
        lastName: "Admin",
        role: "ADMIN",
        status: "Active",
      },
    });
    console.log("Admin account created:", admin.email);
  } else {
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: "ADMIN", status: "Active" },
    });
    console.log("Admin account role updated to ADMIN for:", existingAdmin.email);
  }
}

seedAdmin()
  .catch((err) => console.error("Admin seed error:", err))
  .finally(() => prisma.$disconnect());
