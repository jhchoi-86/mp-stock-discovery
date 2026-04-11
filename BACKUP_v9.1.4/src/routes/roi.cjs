const express = require('express');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();
const authMiddleware = require('../middlewares/authMiddleware.cjs');

const router = express.Router();

// Fetch Real-time ROI Ranking (Accessible by active users)
router.get('/', authMiddleware, async (req, res) => {
  try {
    // 1. Fetch recent SignalHH recommendations
    const recs = await prisma.signalCandidate.findMany({
      where: { signalHH: true },
      orderBy: { createdAt: 'desc' },
      take: 50 // Focus on recent high-value signals
    });

    if (recs.length === 0) {
      return res.status(200).json([]);
    }

    // 2. Fetch latest DailySnapshots to get the SSOT prices (Actionable Entry, Daily HL, etc.)
    const codes = recs.map(r => String(r.instrumentId).padStart(6, '0')); // instrumentId is stored as number? Check.
    // Wait, instrumentId is often the ID in instrument table. Let's find codes.
    // Fetching instruments to map ID to CODE
    const instruments = await prisma.instrument.findMany({
      where: { id: { in: recs.map(r => r.instrumentId) } }
    });
    const idToCode = instruments.reduce((acc, inst) => { acc[inst.id] = inst.code; return acc; }, {});
    const idToName = instruments.reduce((acc, inst) => { acc[inst.id] = inst.name; return acc; }, {});

    const targetCodes = instruments.map(i => i.code);
    const snapshots = await prisma.dailyStockSnapshot.findMany({
      where: { code: { in: targetCodes } }
    });
    const snapMap = snapshots.reduce((acc, s) => { acc[s.code] = s; return acc; }, {});

    // 3. Compute ROI with Real-world conditions
    const roiCalc = [];
    for (const r of recs) {
      const code = idToCode[r.id] || idToCode[r.instrumentId]; // Guard for mapping
      if (!code) continue;

      const snap = snapMap[code];
      if (!snap) continue;

      const entryTarget = snap.entryPrice1 || 0;
      const stopTarget = snap.stopLoss || 0;
      const profitTarget = snap.targetPrice1 || 0;
      const curPrice = snap.currentPrice || 0;
      const dOpen = snap.dailyOpen || 0;
      const dHigh = snap.dailyHigh || 0;
      const dLow = snap.dailyLow || 0;

      if (entryTarget <= 0) continue;

      let status = "진입 대기";
      let roiPercent = 0;
      let effectiveEntry = entryTarget;

      // [Rule 1] Engagement Check
      const hasEntered = dLow > 0 && dLow <= entryTarget;

      if (hasEntered) {
        status = "보유 중";
        
        // [Rule 2] Gap-down correction
        if (dOpen > 0 && dOpen < entryTarget) {
            effectiveEntry = dOpen;
        }

        // [Rule 3] Stop Loss Fix (Permanent)
        const isStopHit = dLow > 0 && dLow <= stopTarget;
        const isTargetHit = dHigh > 0 && dHigh >= profitTarget;

        if (isStopHit) {
            status = "손절 완료";
            roiPercent = ((stopTarget - effectiveEntry) / effectiveEntry) * 100;
        } else if (isTargetHit) {
            status = "목표 도달";
            roiPercent = ((profitTarget - effectiveEntry) / effectiveEntry) * 100;
        } else {
            roiPercent = ((curPrice - effectiveEntry) / effectiveEntry) * 100;
        }
      } else {
        status = "진입 대기";
        roiPercent = 0;
      }

      roiCalc.push({
        id: r.id,
        stockCode: code,
        stockName: idToName[r.instrumentId] || snap.name,
        entryPrice: Math.round(effectiveEntry),
        targetPrice: Math.round(profitTarget),
        stopLoss: Math.round(stopTarget),
        currentPrice: Math.round(curPrice),
        roi: parseFloat(roiPercent.toFixed(2)),
        status: status,
        recommendedAt: r.createdAt
      });
    }

    // 4. Sort by ROI descending (Only showing entered stocks at top if possible, or just raw ROI)
    roiCalc.sort((a, b) => b.roi - a.roi);

    res.status(200).json(roiCalc);
  } catch (error) {
    console.error('[ROI API Error]', error);
    res.status(500).json({ error: 'Internal server error while computing ROI' });
  }
});

module.exports = router;
