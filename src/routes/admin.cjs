const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const authMiddleware = require('../middlewares/authMiddleware.cjs');
const guardMiddleware = require('../middlewares/guardMiddleware.cjs');

const router = express.Router();

const telegramService = require('../services/telegramService.cjs');

// Apply auth verifying and admin guard to all routes in this router
router.use(authMiddleware);
router.use(guardMiddleware('ADMIN', 'ADMIN_API'));

// A. 전체 유저 목록 조회 (GET /api/admin/users)
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('[Admin GET /users Error]', error);
    res.status(500).json({ error: 'Internal server error while fetching users.' });
  }
});

// B. 유저 등급 및 상태 변경 (PUT /api/admin/users/:id/status)
router.put('/users/:id/status', async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { role, status } = req.body;
    const adminId = req.user.userId;

    if (!role && !status) {
      return res.status(400).json({ error: 'Role or status must be provided for update.' });
    }

    // Verify Target User Exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }});
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    // Build update payload
    const dataToUpdate = {};
    if (role) dataToUpdate.role = role;
    if (status) dataToUpdate.status = status;

    // Execute Prisma Transaction safely
    const [updatedUser] = await prisma.$transaction([
      // 1. Update user
      prisma.user.update({
        where: { id: targetUserId },
        data: dataToUpdate,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          createdAt: true
        }
      }),
      // 2. Insert Audit Log
      prisma.auditLog.create({
        data: {
          adminId: adminId,
          targetUserId: targetUserId,
          action: 'UPDATE_USER_STATUS',
          details: dataToUpdate
        }
      })
    ]);

    res.status(200).json({ 
      message: 'User updated successfully', 
      user: updatedUser 
    });

  } catch (error) {
    console.error('[Admin PUT /users/:id/status Error]', error);
    res.status(500).json({ error: 'Internal server error during user update.' });
  }
});

// C. 전체 PUSH 푸시 알림 방송 (POST /api/admin/broadcast)
router.post('/broadcast', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    // Fetch PRO & ADMIN users with active telegram mappings
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
      return res.status(200).json({ message: 'No eligible users to send notifications to.', successCount: 0 });
    }

    let successCount = 0;
    
    // Asynchronously trigger Telegram pushes (Loop)
    // For large scale, use Promise.all. For rate-limit safety, loop with delay or map one by one.
    for (const u of targetUsers) {
      const isSent = await telegramService.sendMessage(u.telegramId, message);
      if (isSent) successCount++;
    }

    res.status(200).json({ 
      message: 'Broadcast completed.', 
      successCount, 
      totalTargeted: targetUsers.length 
    });
  } catch (error) {
    console.error('[Admin POST /broadcast Error]', error);
    res.status(500).json({ error: 'Internal server error during background broadcast.' });
  }
});

// GET /api/admin/subscriptions (Fetch Pending Requests)
router.get('/subscriptions', async (req, res) => {
  try {
    const pendingRequests = await prisma.subscriptionRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, telegramId: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(pendingRequests);
  } catch (error) {
    console.error('[Admin Get Subscriptions Error]', error);
    res.status(500).json({ error: 'Internal server error while fetching subscriptions' });
  }
});

// POST /api/admin/subscriptions/:id/approve (Approve Request & Upgrade Role)
router.post('/subscriptions/:id/approve', async (req, res) => {
  try {
    const requestId = req.params.id;

    // 1. Fetch Request
    const subReq = await prisma.subscriptionRequest.findUnique({
      where: { id: requestId },
      include: { user: true }
    });

    if (!subReq || subReq.status !== 'PENDING') {
      return res.status(404).json({ error: 'Pending subscription request not found.' });
    }

    // 2. Execute Transaction
    await prisma.$transaction([
      prisma.subscriptionRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED' }
      }),
      prisma.user.update({
        where: { id: subReq.userId },
        data: { role: 'PRO_USER' }
      }),
      prisma.auditLog.create({
        data: {
          adminId: req.user.userId,
          targetUserId: subReq.userId,
          action: 'APPROVE_PRO_SUBSCRIPTION',
          details: { requestId: subReq.id }
        }
      })
    ]);

    // 3. Send Telegram Notification
    if (subReq.user.telegramId) {
      const message = `🎉 PRO 등급으로 업그레이드 되었습니다!\n이제 모든 VIP 리포트와 실시간 알림을 받아보실 수 있습니다.`;
      telegramService.sendMessage(subReq.user.telegramId, message).catch(console.error);
    }

    res.json({ message: 'User upgraded to PRO successfully.' });
  } catch (error) {
    console.error('[Admin Approve Subscription Error]', error);
    res.status(500).json({ error: 'Internal server error while approving subscription.' });
  }
});

module.exports = router;
