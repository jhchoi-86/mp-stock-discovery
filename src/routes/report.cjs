const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const telegramService = require('../services/telegramService.cjs');
const authMiddleware = require('../middlewares/authMiddleware.cjs');
const guardMiddleware = require('../middlewares/guardMiddleware.cjs');

const router = express.Router();

router.post('/', authMiddleware, guardMiddleware('ADMIN', 'BROADCAST_REPORT'), async (req, res) => {
  try {
    const { reportText, recommendations } = req.body;
    if (!reportText) {
      return res.status(400).json({ success: false, error: 'reportText is required' });
    }

    // Wrap DB operations natively in a Transaction
    const [savedReport] = await prisma.$transaction([
      // 1. Save Report text
      prisma.report.create({
        data: {
          content: reportText,
          authorId: req.user.userId
        }
      }),
      // 2. Insert Recommendations
      ...(recommendations && recommendations.length > 0 ? [
        prisma.recommendation.createMany({
          data: recommendations.map(r => ({
            stockCode: r.stockCode,
            stockName: r.stockName,
            entryPrice: r.entryPrice,
            targetPrice: r.targetPrice
          }))
        })
      ] : [])
    ]);

    // Query active PRO_USER and ADMIN that have telegramId
    const targetUsers = await prisma.user.findMany({
      where: {
        role: { in: ['PRO_USER', 'ADMIN'] },
        status: 'ACTIVE',
        telegramId: { not: null, not: '' }
      },
      select: {
        id: true,
        email: true,
        telegramId: true
      }
    });

    if (targetUsers.length === 0) {
      return res.status(200).json({ success: true, message: 'DB저장 성공. 단, 텔레그램 발송 대상이 없습니다.', sentCount: 0 });
    }

    // Concurrent Dispatch using Promise.allSettled
    const pushPromises = targetUsers.map(u => telegramService.sendMessage(u.telegramId, reportText));
    const results = await Promise.allSettled(pushPromises);
    
    // Count successful requests based on the telegramService return (true/false boolean)
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

    // Log the Admin Broadcast Action
    await prisma.auditLog.create({
      data: {
        adminId: req.user.userId,
        action: 'BROADCAST_REPORT',
        details: { sentCount: successCount, totalTargeted: targetUsers.length, reportId: savedReport.id }
      }
    });

    res.status(200).json({ 
      success: true, 
      message: '성공적으로 DB 아카이빙 및 텔레그램 전송되었습니다.', 
      sentCount: successCount 
    });

  } catch (error) {
    console.error('[Send Report API Error]', error);
    res.status(500).json({ success: false, error: 'Internal server error while sending report' });
  }
});

module.exports = router;
