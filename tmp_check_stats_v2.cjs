const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redisClient = require('./platform/infra/redis/client.cjs');

async function check() {
    try {
        console.log('--- REDIS CHECK ---');
        try {
            const pong = await redisClient.ping();
            console.log('Redis Ping:', pong);
            
            const keys = [
                'phase1_success',
                'phase1_snapshot_ts',
                'phase2_last_sync_ts',
                'phase2_avg_elapsed'
            ];
            for (const key of keys) {
                const val = await redisClient.get(key);
                console.log(`${key}:`, val);
            }
        } catch (e) {
            console.error('Redis Error:', e.message);
        }

        console.log('--- SYSTEM STATS (TODAY) ---');
        const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const stats = await prisma.systemStat.findUnique({
            where: { date: today }
        });
        console.log(JSON.stringify(stats, null, 2));

    } catch (e) {
        console.error('Top Level Error:', e.message);
    } finally {
        await prisma.$disconnect();
        // redisClient.disconnect() ? No, let it hang or finish
        process.exit(0);
    }
}

check();
