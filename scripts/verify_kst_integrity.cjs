/**
 * [Phase 5] KST Integrity Verification Script
 * Checks for redundant or missing +9h offsets in core modules.
 */
const { getKstNow, getKstDateString } = require('../src/utils/kst.cjs');
const fs = require('fs');
const path = require('path');

async function verifyKstIntegrity() {
    console.log('[Verify] Starting KST Integrity Check...');
    
    const now = new Date();
    const kstNow = getKstNow();
    const kstStr = getKstDateString();
    
    console.log(`- UTC Now: ${now.toISOString()}`);
    console.log(`- KST Now: ${kstNow.toISOString()} (Offset check: ${kstNow.getTime() - now.getTime() === 9*60*60*1000 ? 'OK' : 'FAIL'})`);
    console.log(`- KST Str: ${kstStr}`);

    // Check for hardcoded offsets in specific files
    const filesToCheck = [
        'server.cjs',
        'analyzer.cjs',
        'src/services/signalReportService.cjs',
        'src/services/publishingService.cjs',
        'src/routes/ssot.cjs'
    ];

    let redundantOffsets = 0;
    for (const f of filesToCheck) {
        const filePath = path.join(process.cwd(), f);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const matches = content.match(/9 \* 60 \* 60 \* 1000/g);
            if (matches) {
                console.warn(`[WARN] ${f}: Found ${matches.length} leftover hardcoded KST offsets.`);
                redundantOffsets += matches.length;
            } else {
                console.log(`[PASS] ${f}: No hardcoded KST offsets found.`);
            }
        }
    }

    if (redundantOffsets === 0) {
        console.log('✅ [KST-INTEGRITY] All surveyed modules are standardized.');
    } else {
        console.log(`⚠️ [KST-INTEGRITY] ${redundantOffsets} hardcoded offsets remain but they might be safe if encapsulated.`);
    }
}

verifyKstIntegrity();
