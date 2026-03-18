const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const telegramService = require('../services/telegramService.cjs');
const authMiddleware = require('../middlewares/authMiddleware.cjs');
const guardMiddleware = require('../middlewares/guardMiddleware.cjs');

const router = express.Router();

router.post('/', authMiddleware, guardMiddleware('PRO_USER', 'SEND_REPORT'), async (req, res) => {
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

    // Query targets based on User Role
    let targetUsers = [];
    if (req.user.role === 'ADMIN') {
      // ADMIN: Broadcast to ALL active PRO and ADMIN users
      targetUsers = await prisma.user.findMany({
        where: {
          role: { in: ['PRO_USER', 'ADMIN'] },
          status: 'ACTIVE',
          telegramId: { not: null, not: '' }
        },
        select: { id: true, email: true, telegramId: true }
      });
      
      // Also broadcast to the Official Shared Group (e.g. Mp-members)
      const groupId = (process.env.TELEGRAM_GROUP_ID || '').trim();
      if (groupId && !targetUsers.find(u => u.telegramId === groupId)) {
        targetUsers.push({ id: 'GLOBAL_GROUP', email: 'MP 공유방 전체전송', telegramId: groupId });
      }
    } else {
      // PRO_USER: Send only to their personal registered Telegram ID
      const selfUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, email: true, telegramId: true }
      });
      if (selfUser && selfUser.telegramId) {
        targetUsers = [selfUser];
      }
    }

    if (targetUsers.length === 0) {
      return res.status(200).json({ success: true, message: 'DB저장 성공. 단, 연동된 텔레그램 ID가 없습니다.', sentCount: 0 });
    }

    // Concurrent Dispatch using Promise.allSettled
    const pushPromises = targetUsers.map(u => telegramService.sendMessage(u.telegramId, reportText));
    const results = await Promise.allSettled(pushPromises);
    
    // Count successful requests based on the telegramService return (true/false boolean)
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

    // Log the Admin Broadcast Action (Only for admins to prevent cluttering AuditLog with personal sends, or log differently)
    if (req.user.role === 'ADMIN') {
      await prisma.auditLog.create({
        data: {
          adminId: req.user.userId,
          action: 'BROADCAST_REPORT',
          details: { sentCount: successCount, totalTargeted: targetUsers.length, reportId: savedReport.id }
        }
      });
    }

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
