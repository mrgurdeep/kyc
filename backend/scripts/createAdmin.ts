/**
 * Script to create an admin user
 * 
 * Usage: npx tsx scripts/createAdmin.ts <email> <password> <firstName> <lastName>
 * Example: npx tsx scripts/createAdmin.ts admin@example.com SecurePass123! Admin User
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log('Usage: npx tsx scripts/createAdmin.ts <email> <password> <firstName> <lastName>');
    console.log('Example: npx tsx scripts/createAdmin.ts admin@example.com SecurePass123! Admin User');
    process.exit(1);
  }

  const [email, password, firstName, lastName] = args;

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Update existing user to admin
      const updated = await prisma.user.update({
        where: { email },
        data: { role: 'admin' },
      });
      console.log(`✅ User ${email} promoted to admin`);
      console.log(`   ID: ${updated.id}`);
      console.log(`   Role: ${updated.role}`);
    } else {
      // Create new admin user
      const passwordHash = await bcrypt.hash(password, 12);
      
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: 'admin',
        },
      });

      console.log(`✅ Admin user created successfully`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Role: ${user.role}`);
    }
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
