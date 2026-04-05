const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, '../data');
const MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const FULL_PRICE_FILE = path.join(DATA_DIR, 'live_prices_full.json');

async function createSnapshot() {
    console.log('--- Creating 2026-04-02 Snapshot in DB ---');
    
    try {
        const master = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
        const prices = JSON.parse(fs.readFileSync(FULL_PRICE_FILE, 'utf8'));
        
        const snapshotDate = new Date('2026-04-02T15:30:00+09:00');
        
        const entries = master.map(s => {
            const live = prices[s.code] || {};
            return {
                code: s.code,
                name: s.name,
                currentPrice: live.price || 0,
                yield: live.change_rate || 0,
                score: 0,
                category: 'Market Watch',
                createdAt: snapshotDate
            };
        });

        // Delete any existing 4/2 data to be safe
        await prisma.dailyStockSnapshot.deleteMany({
            where: {
                createdAt: {
                    gte: new Date('2026-04-02T00:00:00+09:00'),
                    lte: new Date('2026-04-02T23:59:59+09:00')
                }
            }
        });

        const result = await prisma.dailyStockSnapshot.createMany({
            data: entries
        });

        console.log(`Successfully created ${result.count} snapshot entries for 2026-04-02.`);
    } catch (e) {
        console.error('Snapshot Creation Failed:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

createSnapshot();
