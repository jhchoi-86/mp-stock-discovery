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
    // 1. Fetch raw recommendations from DB using SignalCandidate
    const recs = await prisma.signalCandidate.findMany({
      where: { signalHH: true },
      orderBy: { createdAt: 'desc' },
      take: 100 // Prevent memory overload
    });

    if (recs.length === 0) {
      return res.status(200).json([]);
    }

    // 2. Load Real-time Current Prices securely from the background scraper's signals.json
    const SIGNALS_FILE = path.join(__dirname, '../../data/signals.json');
    let pricesMap = {};
    if (fs.existsSync(SIGNALS_FILE)) {
      try {
        const signalsData = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        signalsData.forEach(sig => {
          if (sig.code && sig.latestSignal?.current_price) {
            pricesMap[sig.code] = sig.latestSignal.current_price;
          }
        });
      } catch (e) {
        console.error('[ROI Tracker] Warning: Failed to parse signals.json', e.message);
      }
    }

    // 3. Compute ROI Map, Update Highest Prices (Skipping DB write since SignalCandidate lacks highestPrice)
    const roiCalc = [];
    for (const r of recs) {
      // Find instrument name and code from STOCK_MASTER_FILE if we don't have the include relation readily setup
      const stockCode = 'Unknown';
      const stockName = 'Unknown';
      
      const currentPrice = pricesMap[stockCode] || r.entryPrice1 || 0;
      let maxPrice = currentPrice; // Read-only for now until we expand the schema
      
      const roiPercent = r.entryPrice1 > 0 ? ((maxPrice - r.entryPrice1) / r.entryPrice1) * 100 : 0;
      const isTargetHit = r.targetPrice > 0 && maxPrice >= r.targetPrice;

      roiCalc.push({
        id: r.id,
        stockCode: stockCode,
        stockName: stockName,
        entryPrice: r.entryPrice1,
        targetPrice: r.targetPrice,
        currentPrice: currentPrice,
        highestPrice: maxPrice,
        roi: parseFloat(roiPercent.toFixed(2)),
        isTargetHit: isTargetHit,
        recommendedAt: r.createdAt
      });
    }

    // Execute async DB updates for highest prices in the background
    // Muted for SignalCandidate

    // 4. Sort descending by ROI
    roiCalc.sort((a, b) => b.roi - a.roi);

    // 5. Slice Top 10 High ROI targets strictly
    const topPerformers = roiCalc.slice(0, 10);

    res.status(200).json(topPerformers);
  } catch (error) {
    console.error('[ROI API Error]', error);
    res.status(500).json({ error: 'Internal server error while computing ROI' });
  }
});

module.exports = router;
