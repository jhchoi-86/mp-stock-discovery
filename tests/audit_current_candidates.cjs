const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function getDashboardTop5() {
    console.log('--- [Audit] Extracting Current Dashboard Candidates ---');
    try {
        // Dashboard gets data from /api/signals-summary or /api/public/daily-snapshots
        // Let's look at the DailyStockSnapshot as it's the most recent state after auto-sync
        const snapshots = await prisma.dailyStockSnapshot.findMany({
            orderBy: { score: 'desc' },
            take: 5
        });

        if (snapshots.length === 0) {
            console.log('No snapshots found. Checking CACHED_SIGNALS fallback...');
            // Fallback logic check if necessary
            return [];
        }

        console.log('Current Top 5 Candidates in DB (Snapshot):');
        snapshots.forEach((s, i) => {
            console.log(`${i+1}. [${s.code}] ${s.name} - Score: ${s.score}, Price: ${s.currentPrice}`);
        });

        return snapshots;
    } catch (err) {
        console.error('Audit failed:', err.message);
        return [];
    } finally {
        await prisma.$disconnect();
    }
}

getDashboardTop5();
