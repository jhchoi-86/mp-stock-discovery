const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const toKSTMidnight = (dateStr, endOfDay = false) => {
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    if (endOfDay) d.setTime(d.getTime() + 86399999);
    return d;
};

async function runTest() {
    console.log("--- Starting Snapshot Update (Upsert Pattern) Verification ---");

    const testCode = "TEST-09";
    const todayStr = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const todayStart = toKSTMidnight(todayStr);
    const todayEnd = toKSTMidnight(todayStr, true);

    console.log(`[Setup] Target Date: ${todayStr} (${todayStart.toISOString()} ~ ${todayEnd.toISOString()})`);

    try {
        // 1. Clean up existing test data
        await prisma.dailyStockSnapshot.deleteMany({ where: { code: testCode } });
        console.log("[Setup] Cleaned up previous test data.");

        // 2. Insert initial snapshot
        await prisma.dailyStockSnapshot.create({
            data: {
                code: testCode,
                name: "Test Stock",
                score: 50,
                currentPrice: 1000,
                createdAt: new Date() // Current time (today)
            }
        });
        console.log("[Setup] Inserted initial snapshot (Score: 50).");

        // 3. Run Update Logic (Transaction)
        const newSnapshotData = [{
            code: testCode,
            name: "Test Stock Updated",
            score: 95,
            currentPrice: 1100,
            // createdAt will default to now in createMany if not specified, 
            // but for testing we'll let it use default
        }];

        console.log("[Test] Executing deleteMany + createMany transaction...");
        await prisma.$transaction([
            prisma.dailyStockSnapshot.deleteMany({
                where: {
                    createdAt: { gte: todayStart, lte: todayEnd },
                    code: { in: newSnapshotData.map(s => s.code) }
                }
            }),
            prisma.dailyStockSnapshot.createMany({ data: newSnapshotData })
        ]);

        // 4. Verify
        const result = await prisma.dailyStockSnapshot.findMany({
            where: { code: testCode }
        });

        console.log(`[Verify] Result count: ${result.length}`);
        if (result.length === 1 && result[0].score === 95) {
            console.log("[Success] Snapshot was successfully updated (replaced) with latest data.");
        } else {
            console.error("[Fail] Update failed! Expected 1 record with score 95.");
            if (result.length > 1) console.error("Found multiple duplicates!");
        }

    } catch (e) {
        console.error("Verification Error:", e.message);
    } finally {
        await prisma.dailyStockSnapshot.deleteMany({ where: { code: testCode } });
        await prisma.$disconnect();
    }
}

runTest();
