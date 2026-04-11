const { PrismaClient } = require('@prisma/client');
const ScoringService = require('../src/services/ScoringService.cjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function runAudit() {
  console.log('--- [RED TEAM] Production Scoring Audit v1.0 ---');
  
  try {
    // 1. Get Latest Top 5 from DB
    const latestTopEntry = await prisma.dailyTop5.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    
    if (!latestTopEntry) {
      console.log('[RED] No entries found in DailyTop5.');
      return;
    }

    const latestDate = latestTopEntry.date;
    console.log(`[RED] Auditing entries for date: ${latestDate}`);

    const top5Entries = await prisma.dailyTop5.findMany({
      where: { date: latestDate },
      orderBy: { score: 'desc' },
      take: 10 // Checking up to Top 10
    });

    console.log(`[RED] Found ${top5Entries.length} entries to verify.\n`);

    for (const entry of top5Entries) {
      // 2. Fetch technical snapshot (Source of Truth for signals)
      const snapshot = await prisma.dailyStockSnapshot.findFirst({
        where: { code: entry.code },
        orderBy: { createdAt: 'desc' }
      });

      if (!snapshot) {
        console.log(`[FAIL] ${entry.name} (${entry.code}): No technical snapshot found.`);
        continue;
      }

      // Reconstruct tfSigs for Scorer (The snapshot stores the flattened indicators)
      // Note: ScoringService.calculateTotalScore expects tfSigs object.
      // However, if we don't have the original MTF data saved in DB (it only stores the final indicators),
      // we check if the stored 'score' in Snapshot matches the logic rules.
      
      const storedScore = snapshot.score;
      const top5Score = entry.score;

      // Manual logic check for core rules (Price vs EMAs stored in snapshot)
      let calculatedBase = 0;
      // Note: SignalReportService maps score directly from analyzer. 
      // This audit focuses on whether Top5 and Snapshot scores are consistent and within bounds.
      
      console.log(`[AUDIT] ${entry.name} (${entry.code}):`);
      console.log(`   - Stored in Snapshot: ${storedScore}`);
      console.log(`   - Stored in Top 5:   ${top5Score}`);
      
      if (storedScore !== top5Score) {
        console.log(`   [!] MISMATCH: Snapshot and Top5 scores differ!`);
      }

      if (storedScore > 100 || storedScore < 0) {
        console.log(`   [!] ERROR: Score ${storedScore} is out of 0-100 range.`);
      }

      // Check supply data coherence
      console.log(`   - Foreign Buy: ${snapshot.foreignBuy} | Inst Buy: ${snapshot.instBuy}`);
    }

  } catch (err) {
    console.error('[RED] Audit failed with error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();
