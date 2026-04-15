const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function main() {
    const SIGNALS_FILE = path.join(__dirname, 'data', 'signals.json');
    const rawSignals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf-8'));
    const signalEntries = Array.isArray(rawSignals) 
        ? rawSignals.reduce((acc, s) => { acc[s.code] = s; return acc; }, {})
        : rawSignals;

    const firstTicker = Object.keys(signalEntries)[0];
    const signalData = signalEntries[firstTicker];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log(`Attempting debug upsert for ${firstTicker} on date ${today.toISOString()}`);

    try {
        const payload = {
            ticker: firstTicker,
            syncDate: today,
            name: signalData.name || 'Unknown',
            currentPrice: Math.round(Number(signalData.current_price || 0)),
            // ... minimal payload for testing
            hybridScore: 80,
            signalVersion: 'v9.3.4-DEBUG'
        };

        const result = await prisma.dailyStockSnapshot.upsert({
            where: {
                ticker_syncDate: { ticker: firstTicker, syncDate: today },
            },
            create: payload,
            update: payload,
        });
        console.log('Success:', result);
    } catch (err) {
        console.error('FAILED with error:');
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
