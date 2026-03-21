const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$executeRawUnsafe(`
      INSERT INTO system_audit."User" (email, "passwordHash", role, "telegramId", "createdAt", "updatedAt")
      SELECT email, password_hash,
             CASE role::text
               WHEN 'FREE_USER' THEN 'FREE'::system_audit."Role"
               WHEN 'PRO_USER'  THEN 'PAID'::system_audit."Role"
               WHEN 'ADMIN'     THEN 'ADMIN'::system_audit."Role"
               ELSE 'FREE'::system_audit."Role"
             END,
             telegram_id, created_at, created_at
      FROM public.users
      ON CONFLICT (email) DO NOTHING;
    `);
    
    // Also update the sequence for id so that new users get IDs higher than the migrated users
    await prisma.$executeRawUnsafe(`
      SELECT setval((SELECT pg_get_serial_sequence('system_audit."User"', 'id')), (SELECT MAX(id) FROM system_audit."User"));
    `);

    console.log('Restored old users to the new system_audit.User table successfully. Inserted row count:', result);
  } catch(e) {
    console.error('Migration error:', e);
  }
}
main().finally(() => prisma.$disconnect());
