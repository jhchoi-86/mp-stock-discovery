const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const authMiddleware = require('../middlewares/authMiddleware.cjs');

const router = express.Router();
const prisma = new PrismaClient();

// Limit Constants (MATCHING Guard Middleware)
const LIMITS = {
  FREE_USER: 5,
  PRO_USER: 50,
  ADMIN: 99999
};

// GET /api/users/me
// Fetch profile details including Telegram ID and Today's computed usage quota
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;

    // 1. Fetch user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telegramId: true,
        createdAt: true,
        subscriptionRequests: {
          where: { status: 'PENDING' },
          select: { id: true, status: true },
          take: 1
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found.' });

    // 2. Compute Today's KST Date 
    // Uses identical logic as guardMiddleware to stay accurately synchronized
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const todayKst = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));

    // 3. Find Today's API usage log 
    // Action Type 'ANALYZE_STOCK' is the primary gated function.
    const usageLog = await prisma.usageLog.findUnique({
      where: {
        userId_actionType_logDate: {
          userId: userId,
          actionType: 'ANALYZE_STOCK',
          logDate: todayKst
        }
      }
    });

    const currentUsage = usageLog ? usageLog.usageCount : 0;
    const maxUsage = LIMITS[role] || LIMITS.FREE_USER;

    const hasPendingSubscription = user.subscriptionRequests && user.subscriptionRequests.length > 0;

    res.json({
      user: {
        ...user,
        hasPendingSubscription
      },
      usage: {
        current: currentUsage,
        max: maxUsage
      }
    });
  } catch (error) {
    console.error('[User API] Fetching profile failed:', error);
    res.status(500).json({ error: 'Failed to retrieve profile data.' });
  }
});

// PUT /api/users/me
// Update Name and/or Telegram ID
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, telegramId } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (telegramId !== undefined) updateData.telegramId = telegramId;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields provided for update.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telegramId: true
      }
    });

    res.json({ user: updatedUser, message: '프로필이 성공적으로 업데이트되었습니다.' });
  } catch (error) {
    console.error('[User API] Modifying profile failed:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// PUT /api/users/me/password
// Option 1: Self Password Change
router.put('/me/password', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' });
    }

    // 1. Fetch user to get existing password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // 2. Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
    }

    // 3. Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // 4. Update the DB
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash }
    });

    // 5. Audit Log (Self Change)
    await prisma.auditLog.create({
      data: {
        userId: userId, // Current schema uses userId
        action: 'SELF_PASSWORD_CHANGE',
        details: { message: 'User changed their own password.' }
      }
    });

    res.json({ message: '비밀번호가 성공적으로 변경되었습니다.' });

  } catch (error) {
    console.error('[User API] Password update failed:', error);
    res.status(500).json({ error: '비밀번호 변경 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
