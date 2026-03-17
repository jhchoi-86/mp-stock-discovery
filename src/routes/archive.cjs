const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const authMiddleware = require('../middlewares/authMiddleware.cjs');
const guardMiddleware = require('../middlewares/guardMiddleware.cjs');

const router = express.Router();

router.use(authMiddleware);
router.use(guardMiddleware('PRO_USER', 'VIEW_ARCHIVE')); // VIP Only

router.get('/', async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      orderBy: {
        sentAt: 'desc'
      },
      select: {
        id: true,
        content: true,
        sentAt: true,
        author: {
          select: {
            name: true
          }
        }
      },
      take: 50 // Limit to latest 50 for performance
    });

    res.status(200).json(reports);
  } catch (error) {
    console.error('[Archive GET Error]', error);
    res.status(500).json({ error: 'Internal server error while fetching reports' });
  }
});

module.exports = router;
