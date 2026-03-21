const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
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
        role: true,
        telegramId: true,
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

    if (!role) {
      return res.status(400).json({ error: 'Role must be provided for update.' });
    }

    // Verify Target User Exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }});
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    // Build update payload
    const dataToUpdate = { role };

    // Execute Prisma Transaction safely
    const [updatedUser] = await prisma.$transaction([
      // 1. Update user
      prisma.user.update({
        where: { id: targetUserId },
        data: dataToUpdate,
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true
        }
      }),
      // 2. Insert Audit Log
      prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'UPDATE_USER_ROLE',
          details: { targetUserId, updatedRole: role }
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

// B-2. 관리자 유저 패스워드 강제 초기화 (PUT /api/admin/users/:id/reset-password)
router.put('/users/:id/reset-password', async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const adminId = req.user.userId;

    // Verify Target User Exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }});
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    // Set default password '0000'
    const defaultPassword = '0000';
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(defaultPassword, saltRounds);

    // Execute Prisma Transaction safely
    await prisma.$transaction([
      // 1. Update user password
      prisma.user.update({
        where: { id: targetUserId },
        data: { passwordHash: newPasswordHash }
      }),
      // 2. Insert Audit Log
      prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'FORCE_PASSWORD_RESET',
          details: { targetUserId, message: `Admin forcefully reset password to default (${defaultPassword})` }
        }
      })
    ]);

    res.status(200).json({ message: '비밀번호가 0000으로 성공적으로 초기화되었습니다.' });

  } catch (error) {
    console.error('[Admin PUT /users/:id/reset-password Error]', error);
    res.status(500).json({ error: '비밀번호 초기화 중 오류가 발생했습니다.' });
  }
});

// D. 유저 삭제 (DELETE /api/admin/users/:id)
router.delete('/users/:id', async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const adminId = req.user.userId;

    // Verify Target User Exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }});
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    // Prevent self-deletion
    if (targetUserId === adminId) {
      return res.status(400).json({ error: 'Cannot delete own admin account.' });
    }

    // Execute Prisma Transaction safely
    await prisma.$transaction([
      // 1. Delete user
      prisma.user.delete({
        where: { id: targetUserId }
      }),
      // 2. Insert Audit Log
      prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'DELETE_USER',
          details: { deletedUserId: targetUserId, email: targetUser.email }
        }
      })
    ]);

    res.status(200).json({ message: 'User deleted successfully.' });

  } catch (error) {
    console.error('[Admin DELETE /users/:id Error]', error);
    res.status(500).json({ error: 'Internal server error during user deletion.' });
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

// GET /api/admin/subscriptions (Fetch Pending Requests - DEPRECATED)
router.get('/subscriptions', async (req, res) => {
  try {
    // Model deleted in Phase 5 schema, returning empty array
    res.json([]);
  } catch (error) {
    console.error('[Admin Get Subscriptions Error]', error);
    res.status(500).json({ error: 'Internal server error while fetching subscriptions' });
  }
});

// POST /api/admin/subscriptions/:id/approve (Approve Request - DEPRECATED)
router.post('/subscriptions/:id/approve', async (req, res) => {
  try {
    return res.status(404).json({ error: 'Subscription logic deprecated in Phase 5.' });

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
