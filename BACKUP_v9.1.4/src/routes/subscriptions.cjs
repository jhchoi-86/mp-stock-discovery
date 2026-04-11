const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const telegramService = require('../services/telegramService.cjs');
const authMiddleware = require('../middlewares/authMiddleware.cjs');

const router = express.Router();

// POST /api/subscriptions/request (User requests PRO)
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check if user is already PRO or ADMIN
    if (req.user.role === 'PAID' || req.user.role === 'ADMIN') {
      return res.status(400).json({ error: 'Already a PRO or ADMIN user.' });
    }

    // Check if there is already a PENDING request
    const existingRequest = await prisma.subscriptionRequest.findFirst({
      where: {
        userId: userId,
        status: 'PENDING'
      }
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'A subscription request is already pending.' });
    }

    // Determine the user's name/email for the telegram message
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Create the PENDING request
    const newRequest = await prisma.subscriptionRequest.create({
      data: {
        userId: userId,
        status: 'PENDING'
      }
    });

    // Send Telegram Notification to all ADMINs
    const admins = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        telegramId: { not: null, not: '' }
      }
    });

    const adminMessage = `🔔 [PRO 구독 요청]\n${user.name}(${user.email})님이 PRO 등급을 요청했습니다.\n대시보드에서 승인해 주세요.`;
    
    // Non-blocking telegram broadcast
    const pushPromises = admins.map(admin => telegramService.sendMessage(admin.telegramId, adminMessage));
    Promise.allSettled(pushPromises).catch(console.error);

    res.status(201).json({ message: 'Subscription request submitted successfully.', request: newRequest });
  } catch (error) {
    console.error('[Subscription Request Error]', error);
    res.status(500).json({ error: 'Internal server error during subscription request.' });
  }
});

module.exports = router;
