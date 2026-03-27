const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- DB Verifier v2 ---');
    
    // 1. Check all dates in snapshots table
    try {
        const dates = await prisma.$queryRaw`SELECT DISTINCT DATE(created_at) as date FROM daily_stock_snapshots ORDER BY date DESC LIMIT 10`;
        console.log('Available Dates in DB:', dates);
        
        // 2. Count total rows
        const total = await prisma.$queryRaw`SELECT COUNT(*) FROM daily_stock_snapshots`;
        console.log('Total Snapshots Count:', total);
        
        // 3. Check recent rows
        const recent = await prisma.$queryRaw`SELECT id, code, name, created_at FROM daily_stock_snapshots ORDER BY created_at DESC LIMIT 5`;
        console.log('Recent Snapshots:', recent);
        
    } catch (e) {
        console.error('Raw Query Failed:', e);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
