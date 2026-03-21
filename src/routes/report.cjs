const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const telegramService = require('../services/telegramService.cjs');
const authMiddleware = require('../middlewares/authMiddleware.cjs');
const guardMiddleware = require('../middlewares/guardMiddleware.cjs');
const axios = require('axios');

const router = express.Router();

// A proxy route for fetching LLM AI comments used in manual Telegram transmissions
router.post('/preview-ai', authMiddleware, async (req, res) => {
  try {
    const { reportStocks } = req.body;
    if (!reportStocks || !Array.isArray(reportStocks) || reportStocks.length === 0) {
      return res.json({ success: true, aiCommentsMap: {} });
    }

    const aiPayload = reportStocks.map(s => ({
      symbol: s.code,
      name: s.name,
      category: s.latestSignal?.category || '',
      price: s.latestSignal?.current_price || s.latestSignal?.entry_price || 0,
      indicators: {
        adx: s.latestSignal?.adx || 0,
        score: s.total_score || 0,
        trend: s.timeframeStatus?.['1D']?.cond_up7 ? "상승" : "관망"
      }
    }));
    console.log('[AI Proxy] payload:', JSON.stringify(aiPayload));

    const aiCommentsMap = {};
    const aiRes = await axios.post('http://127.0.0.1:8000/api/v1/generate-comment', 
      { stocks: aiPayload }, 
      { timeout: 15000 }
    );
    console.log('[AI Proxy] Raw API response:', JSON.stringify(aiRes.data));

    let commentsArray = [];
    if (aiRes.data && Array.isArray(aiRes.data)) {
      commentsArray = aiRes.data;
    } else if (aiRes.data && Array.isArray(aiRes.data.data)) {
      commentsArray = aiRes.data.data;
    }

    commentsArray.forEach(item => {
      if (item.symbol) aiCommentsMap[item.symbol] = item.ai_comment;
    });

    return res.json({ success: true, aiCommentsMap });
  } catch (error) {
    console.error('[AI Service LLM Proxy Fallback] Failed to fetch LLM comments:', error.message);
    return res.json({ success: true, aiCommentsMap: {} }); // Silent fallback, return empty map
  }
});

router.post('/', authMiddleware, guardMiddleware('PAID', 'SEND_REPORT'), async (req, res) => {
  try {
    const { reportText, recommendations } = req.body;
    if (!reportText) {
      return res.status(400).json({ success: false, error: 'reportText is required' });
    }

    // Log the manual broadcast to AuditLog using the new schema
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'MANUAL_TELEGRAM_BROADCAST',
        details: { textLength: reportText.length, recCount: recommendations?.length || 0 }
      }
    });

    // Query targets based on User Role
    let targetUsers = [];
    if (req.user.role === 'ADMIN') {
      // ADMIN: Broadcast to ALL active PRO and ADMIN users
      targetUsers = await prisma.user.findMany({
        where: {
          role: { in: ['PAID', 'ADMIN'] },
          telegramId: { not: null, not: '' }
        },
        select: { id: true, email: true, telegramId: true }
      });
    } else {
      // PAID: Send to their personal registered Telegram ID
      const selfUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, email: true, telegramId: true }
      });
      if (selfUser && selfUser.telegramId) {
        targetUsers = [selfUser];
      }
    }

    // ALWAYS broadcast to the Official Shared Group (Mp-members) if configured
    const groupId = (process.env.TELEGRAM_GROUP_ID || '').trim();
    if (groupId && !targetUsers.find(u => u.telegramId === groupId)) {
      targetUsers.push({ id: 'GLOBAL_GROUP', email: 'MP 공유방 전체전송', telegramId: groupId });
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
          userId: req.user.userId,
          action: 'BROADCAST_REPORT_SUCCESS',
          details: { sentCount: successCount, totalTargeted: targetUsers.length }
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
