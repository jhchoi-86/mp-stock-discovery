require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        console.log('[Test] DATABASE_URL:', process.env.DATABASE_URL);
        const count = await prisma.user.count();
        console.log('[Test] User Count:', count);
    } catch (e) {
        console.error('[Test] Error:', e.message);
        console.error('[Test] Full Stack:', e);
    } finally {
        await prisma.$disconnect();
    }
}

test();
