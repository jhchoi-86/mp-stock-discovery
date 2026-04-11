/**
 * [Production Repair] Sync Integrity Restorer v1.0
 * Run this script to reconcile Database, JSON, and Redis with ground truth (signals.json).
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const PublishingService = require('../src/services/publishingService.cjs');
const publishingService = new PublishingService();
const redis = require('../platform/infra/redis/client.cjs');

async function repairProduction() {
    console.log('--- [Production Repair] Starting Integrity Restoration ---');

    try {
        // 1. Identify Ground Truth from signals.json
        const signalsPath = path.join(process.cwd(), 'data', 'signals.json');
        if (!fs.existsSync(signalsPath)) {
            throw new Error(`signals.json not found at ${signalsPath}`);
        }

        const signalsData = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
        const uniqueSignals = [];
        const seen = new Set();
        
        signalsData
            .filter(s => s.score !== undefined && s.score !== null)
            .sort((a, b) => b.score - a.score)
            .forEach(s => {
                if (!seen.has(s.code)) {
                    seen.add(s.code);
                    uniqueSignals.push(s);
                }
            });

        const top5 = uniqueSignals.slice(0, 5);
        console.log('\n[STEP 1] Ground Truth identified (Top 5):');
        top5.forEach((s, i) => console.log(`${i+1}. [${s.code}] ${s.name} (Score: ${s.score})`));

        // [CRITICAL] Prevent GS건설 ghosting if it's not in Top 5
        const containsGS = top5.some(s => s.code === '006360');
        if (!containsGS) {
            console.log('NOTE: GS건설 (006360) is NOT in the current Top 5 ground truth. It will be removed from SSOT.');
        }

        // 2. Clear Database Stale State (Today)
        const kstOffset = 9 * 60 * 60 * 1000;
        const todayStr = new Date(Date.now() + kstOffset).toISOString().split('T')[0];
        
        console.log(`\n[STEP 2] Cleaning up DB for ${todayStr}...`);
        await prisma.dailyTop5.deleteMany({ where: { date: todayStr } });
        // Optional: Remove snapshots for today to allow fresh ones
        // await prisma.dailyStockSnapshot.deleteMany({ where: { date: todayStr } }); 
        console.log('DB cleanup complete.');

        // 3. Trigger publishingService with Soft Failover fix
        console.log('\n[STEP 3] Triggering Core Synchronization...');
        const result = await publishingService.publishToAll(top5);
        
        if (result.success) {
            console.log('✅ ALL CHANNELS SYNCED: File, DB, and Redis are now in sync.');
        } else {
            console.warn('⚠️ SYNC PARTIALLY SUCCESSFUL: Check logs for DB errors.');
        }

        // 4. Manual Redis Flush for Top N
        console.log('\n[STEP 4] Purging API Cache...');
        await redis.del('mp:top:5');
        await redis.del('mp:top:10');
        console.log('Redis Cache Purged.');

        console.log('\n--- Restoration COMPLETE ---');
        console.log('Please refresh the landing page and performance page.');

    } catch (err) {
        console.error('\n❌ REPAIR FAILED:', err.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

repairProduction();
