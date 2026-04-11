const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROLE_HIERARCHY = {
  FREE_TRIAL: 1,
  FREE_USER: 1,
  FREE: 1,
  PRO_USER: 2,
  PAID: 2,
  ADMIN: 3
};

const USAGE_LIMITS = {
  FREE_TRIAL: 5,
  FREE_USER: 5,
  PRO_USER: 50,
  PAID: 50
};

/**
 * Factory for creating RBAC and Rate Limit middleware
 * @param {string} requiredRole - Minimum role required ('FREE_TRIAL', 'PAID', 'ADMIN')
 * @param {string} actionType - The type of action being performed (e.g., 'ANALYZE_STOCK')
 */
const guardMiddleware = (requiredRole = 'FREE_TRIAL', actionType = 'GENERAL_API_CALL') => {
  return async (req, res, next) => {
    try {
      const user = req.user; // Expected to be populated by authMiddleware

      if (!user || !user.userId) {
        return res.status(401).json({ error: 'Unauthorized. User information missing.' });
      }

      // 1. Role Verification
      const userRoleRank = ROLE_HIERARCHY[user.role] || 0;
      const requiredRoleRank = ROLE_HIERARCHY[requiredRole] || 0;

      if (userRoleRank < requiredRoleRank) {
        return res.status(403).json({ error: 'Forbidden. Insufficient role permissions.' });
      }

      // 2. Admin Bypass
      if (user.role === 'ADMIN') {
        return next();
      }

      // 3. Usage Rate Limiting
      // Get today's date in KST (UTC+9)
      const now = new Date();
      const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      const todayStr = kstTime.toISOString().split('T')[0]; // YYYY-MM-DD
      const logDate = new Date(todayStr + "T00:00:00.000Z");

      // 2. Enforce Daily Global usage limit
      const limit = USAGE_LIMITS[user.role] || USAGE_LIMITS.FREE_TRIAL;

      // Find or create usage log via Prisma Upsert to handle concurrent insertions gracefully
      const usageRecord = await prisma.usageLog.upsert({
        where: {
          userId_actionType_logDate: {
            userId: user.userId,
            actionType,
            logDate
          }
        },
        update: {},
        create: {
          userId: user.userId,
          actionType,
          logDate,
          usageCount: 0
        }
      });

      // Check current tally
      if (usageRecord.usageCount >= limit) {
        return res.status(429).json({ 
          error: 'Too Many Requests. Daily limit reached.',
          limit
        });
      }

      // Increment Usage Count
      await prisma.usageLog.update({
        where: { id: usageRecord.id },
        data: { usageCount: { increment: 1 } }
      });

      next();
    } catch (error) {
      console.error('[Guard Middleware Error]', error);
      res.status(500).json({ error: 'Internal Server Error during guard validation.' });
    }
  };
};

module.exports = guardMiddleware;
