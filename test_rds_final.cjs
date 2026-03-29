const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        console.log('--- Database Connectivity Test (RDS VIA TUNNEL) ---');
        await prisma.$connect();
        console.log('✅ Successfully connected to RDS.');

        const userCount = await prisma.user.count();
        console.log(`📊 Current User Count: ${userCount}`);
        
        if (userCount > 0) {
            const users = await prisma.user.findMany({ take: 5 });
            console.log('👥 Sample Users:', users.map(u => u.username || u.email).join(', '));
        }

    } catch (err) {
        console.error('❌ Connection Failed:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

test();
