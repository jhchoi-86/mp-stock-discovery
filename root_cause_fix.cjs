const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function run() {
    const hosts = ['127.0.0.1', 'localhost'];
    const ports = [3306, 3307, 3308, 3309];
    let connected = false;
    let prisma = null;

    for (const host of hosts) {
        for (const port of ports) {
            console.log(`[RootCauseFix] Trying DB Connection on ${host}:${port}...`);
            const tempPrisma = new PrismaClient({
                datasources: {
                    db: {
                        url: `mysql://root:MpStock2026@${host}:${port}/mpstock_db`
                    }
                }
            });

            try {
                // connection timeout을 위해 짧게 시도
                await tempPrisma.$connect();
                console.log(`[RootCauseFix] SUCCESS: DB Connected on ${host}:${port}.`);
                prisma = tempPrisma;
                connected = true;
                break;
            } catch (err) {
                console.warn(`[RootCauseFix] Failed on ${host}:${port}: ${err.message}`);
                await tempPrisma.$disconnect().catch(() => {});
            }
        }
        if (connected) break;
    }

    if (!connected) {
        console.error('[RootCauseFix] CRITICAL: All host/port combinations failed. Database might be offline.');
        return;
    }

    try {
        const signalsPath = path.join(__dirname, 'data', 'signals.json');
        if (!fs.existsSync(signalsPath)) {
            throw new Error('signals.json not found!');
        }

        const signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
        const codes = Object.keys(signals).filter(c => !['TEST_ERR', 'TEST_EXM'].includes(c));
        
        console.log(`[RootCauseFix] Preparing to inject ${codes.length} stocks for 2026-04-05...`);

        let count = 0;
        for (const code of codes) {
            const s = signals[code];
            try {
                await prisma.dailyStockSnapshot.upsert({
                    where: { 
                        code_date: { 
                            code: code,
                            date: '2026-04-05' 
                        } 
                    },
                    update: {
                        name: s.name,
                        current_price: parseFloat(s.currentPrice || 0),
                        entry_price: parseFloat(s.entryPrice || 0),
                        target_price: parseFloat(s.targetPrice || 0),
                        stop_loss: parseFloat(s.stopLoss || 0),
                        volume: parseInt(s.volume || 0),
                        score: parseInt(s.score || 0),
                        stars: parseInt(s.stars || 0),
                        status: s.status || 'N/A'
                    },
                    create: {
                        code: code,
                        name: s.name,
                        date: '2026-04-05',
                        current_price: parseFloat(s.currentPrice || 0),
                        entry_price: parseFloat(s.entryPrice || 0),
                        target_price: parseFloat(s.targetPrice || 0),
                        stop_loss: parseFloat(s.stopLoss || 0),
                        volume: parseInt(s.volume || 0),
                        score: parseInt(s.score || 0),
                        stars: parseInt(s.stars || 0),
                        status: s.status || 'N/A',
                        createdAt: new Date('2026-04-05T09:00:00Z')
                    }
                });
                count++;
                if (count % 50 === 0) console.log(`[RootCauseFix] Progress: ${count}/${codes.length}`);
            } catch (err) {
                console.error(`[RootCauseFix] Failed for ${code}:`, err.message);
            }
        }

        console.log(`[RootCauseFix] MISSION COMPLETED: ${count} records injected into DB.`);

    } catch (err) {
        console.error('[RootCauseFix] FATAL ERROR:', err);
    } finally {
        if (prisma) await prisma.$disconnect();
    }
}

run();
