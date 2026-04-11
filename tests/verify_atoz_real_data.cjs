const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const PublishingService = require('../src/services/publishingService.cjs');
const publishingService = new PublishingService();

async function verifyAtoZ() {
    console.log('--- [Red Team] A to Z Verification (File-Based SSOT Path) ---');

    try {
        // 1. Get REAL current data from signals.json
        const signalsPath = path.join(process.cwd(), 'data', 'signals.json');
        const signalsData = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
        
        // Sort by score desc and take top 5 Unique codes
        const uniqueSignals = [];
        const seen = new Set();
        
        // Filter out those without score or duplicate codes
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
        console.log('\n[STEP 1] Current Top 5 candidates from signals.json:');
        top5.forEach((s, i) => {
            console.log(`${i+1}. [${s.code}] ${s.name} (Score: ${s.score})`);
        });

        // 2. Audit REDIS (Before)
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const redis = new Redis(redisUrl);
        await redis.set('mp:top:5', 'STALE_DATA_FOR_VERIFICATION');
        console.log('\n[STEP 2] Redis Cache: Stale data injected.');

        // 3. Trigger SYNC
        console.log('\n[STEP 3] Triggering publishingService.publishToAll()...');
        // This will try DB and then fallback/continue to Files.
        await publishingService.publishToAll(top5);
        console.log('Sync Logic Execution Finished.');

        // 4. Audit FILES (Result)
        const landingPath = path.join(process.cwd(), 'data', 'landing_strategy.json');
        const landingResult = JSON.parse(fs.readFileSync(landingPath, 'utf8'));
        console.log('\n[STEP 4] File Audit (landing_strategy.json):');
        console.log(`- Updated At: ${landingResult.updatedAt}`);
        const fileCodes = (landingResult.stocks || []).map(s => s.code);
        console.log(`- Stocks in file: ${fileCodes.join(', ')}`);
        
        const expectedCodes = top5.map(s => s.code);
        if (JSON.stringify(fileCodes) === JSON.stringify(expectedCodes)) {
            console.log('✅ File Integration: SYNC SUCCESS');
        } else {
            console.error('❌ File Integration: MISMATCH');
        }

        // 5. Audit REDIS (Result)
        const redisResult = await redis.get('mp:top:5');
        if (redisResult === null) {
            console.log('\n[STEP 5] Redis Audit:');
            console.log('✅ Redis Invalidation: SUCCESS (Cache Purged)');
        } else {
            console.error('\n[STEP 5] Redis Audit:');
            console.error('❌ Redis Invalidation: FAILED (Stale data remains)');
        }

        await redis.quit();
        console.log('\n--- A to Z Verification (File/Redis Path): COMPLETE ---');

    } catch (err) {
        console.error('Critical Verification Error:', err.message);
        process.exit(1);
    }
}

verifyAtoZ();
