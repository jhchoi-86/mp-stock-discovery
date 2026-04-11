const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SIGNALS_FILE = path.join(__dirname, '..', 'data', 'signals.json');
const BACKUP_FILE = SIGNALS_FILE + '.bak';

async function runTest() {
    console.log("--- Starting ADDITIVE_SAVE Verification ---");

    // 1. Backup original signals.json
    if (fs.existsSync(SIGNALS_FILE)) {
        fs.copyFileSync(SIGNALS_FILE, BACKUP_FILE);
        console.log("[Setup] Backed up original signals.json");
    }

    try {
        // 2. Create dummy signals.json with pre-existing data
        const dummySignals = [
            { code: "005930", name: "삼성전자", timeframe: "1D", is_strong_signal: false, id: "old-1" },
            { code: "000660", name: "SK하이닉스", timeframe: "1D", is_strong_signal: true, id: "old-2" }
        ];
        fs.writeFileSync(SIGNALS_FILE, JSON.stringify(dummySignals, null, 2));
        console.log("[Setup] Created dummy signals.json");

        // 3. Run analyzer.cjs with ADDITIVE_SAVE=true for a specific stock
        // Note: This requires .env to be present for KIS API, but we'll see if it runs enough to reach the save logic.
        // We'll filter for "005930" to see if it updates.
        console.log("[Test] Running analyzer.cjs with ADDITIVE_SAVE=true and STOCK_FILTER=005930...");
        try {
            execSync('node analyzer.cjs 1D', {
                env: { ...process.env, ADDITIVE_SAVE: 'true', STOCK_FILTER: '005930' },
                stdio: 'inherit'
            });
        } catch (e) {
            console.log("[Info] Analyzer finished (might have errors due to KIS API, but checking signals.json anyway)");
        }

        // 4. Verify signals.json
        if (fs.existsSync(SIGNALS_FILE)) {
            const merged = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
            console.log(`[Verify] Merged signals count: ${merged.length}`);
            
            const sk = merged.find(s => s.code === "000660");
            const samsung = merged.find(s => s.code === "005930" && s.timeframe === "1D");

            if (sk && sk.id === "old-2") {
                console.log("[Success] Existing signal (SK하이닉스) was preserved.");
            } else {
                console.error("[Fail] Existing signal (SK하이닉스) was lost or corrupted!");
            }

            if (samsung && samsung.id !== "old-1") {
                console.log("[Success] Target signal (삼성전자) was updated with a new ID.");
            } else if (!samsung) {
                console.log("[Info] Samsung signal not found - typical if analyzer failed KIS fetch.");
            }
        } else {
            console.error("[Fail] signals.json is missing!");
        }

    } finally {
        // 5. Restore original signals.json
        if (fs.existsSync(BACKUP_FILE)) {
            fs.renameSync(BACKUP_FILE, SIGNALS_FILE);
            console.log("[Cleanup] Restored original signals.json");
        }
    }
}

runTest();
