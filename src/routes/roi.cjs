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
    // 1. Fetch raw recommendations from DB
    const recs = await prisma.recommendation.findMany({
      orderBy: {
        recommendedAt: 'desc'
      }
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

    // 3. Compute ROI Map, Update Highest Prices
    const updatePromises = [];
    const roiCalc = recs.map(r => {
      const currentPrice = pricesMap[r.stockCode] || r.entryPrice;
      
      // Calculate Highest Price achieved since recommendation
      let maxPrice = r.highestPrice || r.entryPrice;
      if (currentPrice > maxPrice) {
        maxPrice = currentPrice;
        // Schedule DB Update (Background)
        updatePromises.push(
          prisma.recommendation.update({
            where: { id: r.id },
            data: { highestPrice: maxPrice }
          })
        );
      }

      const roiPercent = r.entryPrice > 0 
        ? ((maxPrice - r.entryPrice) / r.entryPrice) * 100 
        : 0;
        
      const isTargetHit = r.targetPrice > 0 && maxPrice >= r.targetPrice;

      return {
        id: r.id,
        stockCode: r.stockCode,
        stockName: r.stockName,
        entryPrice: r.entryPrice,
        targetPrice: r.targetPrice,
        currentPrice: currentPrice,
        highestPrice: maxPrice,
        roi: parseFloat(roiPercent.toFixed(2)),
        isTargetHit: isTargetHit,
        recommendedAt: r.recommendedAt
      };
    });

    // Execute async DB updates for highest prices in the background
    if (updatePromises.length > 0) {
      Promise.allSettled(updatePromises).catch(e => console.error("[ROI Tracker] Highest Price Auto-Update Error:", e));
    }

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
