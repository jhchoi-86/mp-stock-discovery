const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();
const authMiddleware = require('../middlewares/authMiddleware.cjs');
const guardMiddleware = require('../middlewares/guardMiddleware.cjs');

const router = express.Router();

const telegramService = require('../services/telegramService.cjs');
const systemStatsService = require('../services/systemStatsService.cjs');
const os = require('os');

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
        phone: true,
        role: true,
        referralCode: true,
        referralCount: true,
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
          adminId: adminId,
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
          adminId: adminId,
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
          adminId: adminId,
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
        role: { in: ['PAID', 'ADMIN'] },
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

// E. 시스템 통계 조회 (GET /api/admin/system/stats)
router.get('/system/stats', async (req, res) => {
  try {
    const stats = await prisma.systemStat.findMany({
      orderBy: { date: 'desc' },
      take: 30
    });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

// F. 실시간 시스템 리소스 조회 (GET /api/admin/system/resources)
router.get('/system/resources', async (req, res) => {
  try {
    const resources = await systemStatsService.getSystemResources();
    res.json(resources);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// G. 장애 로그 조회 (GET /api/admin/system/incidents)
router.get('/system/incidents', async (req, res) => {
  try {
    const incidents = await prisma.incidentLog.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 50
    });
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// H. 장애 로그 등록 (POST /api/admin/system/incidents)
router.post('/system/incidents', async (req, res) => {
  try {
    const { title, description, severity } = req.body;
    const incident = await prisma.incidentLog.create({
      data: {
        title,
        description,
        severity: severity || 'ERROR',
        status: 'OPEN'
      }
    });
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log incident' });
  }
});

// I. 동기화 및 퍼블리싱 스냅샷 저장 (POST /api/admin/save-sync-history)
router.post('/save-sync-history', async (req, res) => {
    console.log('[Admin] Saving current Top 5 snapshot...');
    try {
        // [v9.3.3] Frontend에서 전달한 stocks 데이터를 우선 사용 (WYSIWYS)
        const { stocks } = req.body;
        let top5 = [];

        if (stocks && Array.isArray(stocks)) {
            top5 = stocks.slice(0, 5);
        } else {
            // Fallback: DB의 최신 스냅샷에서 상위 5개 추출 (중목 제거)
            const latestSnaps = await prisma.dailyStockSnapshot.findMany({
                orderBy: { hybridScore: 'desc' },
                take: 20 // Fetch more to allow for deduplication
            });
            
            const uniqueSnaps = [];
            const seenFallback = new Set();
            for (const s of latestSnaps) {
                if (!seenFallback.has(s.ticker)) {
                    seenFallback.add(s.ticker);
                    uniqueSnaps.push(s);
                }
                if (uniqueSnaps.length >= 5) break;
            }
            
            top5 = uniqueSnaps.map(s => ({
                code: s.ticker,
                name: s.name,
                category: s.category || '추천종목',
                score: s.hybridScore || 0,
                currentPrice: s.currentPrice || 0,
                entryPrice1: s.entry1Price || 0,
                entryPrice2: s.entry2Price || 0,
                stopLoss: s.stopLossPrice || 0,
                targetPrice1: s.targetPrice || 0,
                yield: s.yield || 0
            }));
        }

        if (top5.length === 0) {
            return res.status(400).json({ error: '저장할 종목 데이터가 없습니다.' });
        }

        // 2. 태그 이름 생성 (KST 기준)
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstNow = new Date(now.getTime() + kstOffset);
        
        const pad = (n) => n.toString().padStart(2, '0');
        const tagName = `${kstNow.getUTCFullYear()}-${pad(kstNow.getUTCMonth() + 1)}-${pad(kstNow.getUTCDate())} ${pad(kstNow.getUTCHours())}:${pad(kstNow.getUTCMinutes())}`;
        const today = `${kstNow.getUTCFullYear()}-${pad(kstNow.getUTCMonth() + 1)}-${pad(kstNow.getUTCDate())}`;


        // 3. SyncSaveLog 저장 (Landing Page SSOT)
        // Safe serialization: catch 0 prices from frontend and try to fetch from latest snapshot
        const safeTop5 = [];
        for (const s of top5) {
            let curPrice = Number(s.currentPrice) || 0;
            let tPrice = Number(s.targetPrice1) || 0;
            
            // [v9.3.6] Improved Price Recovery: Prioritize Live Cache, then Fresh Snapshot (<24h)
            if (curPrice === 0 || tPrice === 0) {
                const { getFullPriceCache } = require('../utils/fullUniversePoller.cjs');
                const liveCache = getFullPriceCache();
                const live = liveCache[s.code || s.ticker] || {};
                
                if (curPrice === 0 && live.price) {
                    curPrice = live.price;
                }

                if (curPrice === 0 || tPrice === 0) {
                    const lastSnap = await prisma.dailyStockSnapshot.findFirst({
                        where: { ticker: s.code || s.ticker },
                        orderBy: { createdAt: 'desc' }
                    });
                    
                    if (lastSnap) {
                        const isFresh = (Date.now() - new Date(lastSnap.createdAt).getTime() < 24 * 60 * 60 * 1000);
                        if (curPrice === 0 && isFresh) curPrice = Number(lastSnap.currentPrice) || 0;
                        if (tPrice === 0 && (isFresh || tPrice === 0)) tPrice = Number(lastSnap.targetPrice) || 0;
                    }
                }
            }

            safeTop5.push({
                code: s.code || s.ticker || '',
                name: s.name || '',
                category: s.category || s.trendType || '기타',
                score: Number(s.score) || 0,
                currentPrice: curPrice,
                entryPrice1: Number(s.entryPrice1) || 0,
                entryPrice2: Number(s.entryPrice2) || 0,
                stopLoss: Number(s.stopLoss) || 0,
                targetPrice1: tPrice,
                yield: Number(s.yield) || 0,
                tradeAmount: Number(s.tradeAmount) || 0,
                foreignBuy: parseInt((s.foreignBuy || 0).toString().replace(/,/g, '')) || 0,
                instBuy: parseInt((s.instBuy || 0).toString().replace(/,/g, '')) || 0,
                styleTag: s.styleTag || '',
                aiComment: s.aiComment || ''
            });
        }


        // [v9.4.7] Safe Mode: Check connection before proceeding
        let dbSyncEnabled = true;
        try {
            await Promise.race([
                prisma.$connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connect Timeout')), 2000))
            ]);
        } catch (connErr) {
            console.warn(`[Admin-SaveHistory] DB unreachable (${connErr.message}). Entering Safe Mode.`);
            dbSyncEnabled = false;
        }

        if (dbSyncEnabled) {
            const saved = await prisma.syncSaveLog.create({
                data: {
                    tagName,
                    snapshot: safeTop5
                }
            });

            // 4. [SSOT] DailyTop5 및 DailyStockSnapshot 테이블 업데이트
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);

            for (const s of safeTop5) {
                // 4-A. DailyTop5 테이블 (기존 서비스 호환성)
                await prisma.dailyTop5.upsert({
                    where: {
                        date_code: {
                            date: today,
                            code: s.code
                        }
                    },
                    update: {
                        name: s.name,
                        score: s.score,
                        currentPrice: s.currentPrice,
                        entryPrice1: s.entryPrice1,
                        entryPrice2: s.entryPrice2,
                        stopLoss: s.stopLoss,
                        targetPrice1: s.targetPrice1,
                        tradeAmount: BigInt(Math.round(s.tradeAmount || 0)),
                        foreignBuy: Math.round(s.foreignBuy || 0),
                        instBuy: Math.round(s.instBuy || 0),
                        yield: s.yield || 0,
                        category: s.category,
                        styleTag: s.styleTag || null,
                        aiComment: s.aiComment || null
                    },
                    create: {
                        date: today,
                        code: s.code,
                        name: s.name,
                        score: s.score,
                        currentPrice: s.currentPrice,
                        entryPrice1: s.entryPrice1,
                        entryPrice2: s.entryPrice2,
                        stopLoss: s.stopLoss,
                        targetPrice1: s.targetPrice1,
                        tradeAmount: BigInt(Math.round(s.tradeAmount || 0)),
                        foreignBuy: Math.round(s.foreignBuy || 0),
                        instBuy: Math.round(s.instBuy || 0),
                        yield: s.yield || 0,
                        category: s.category,
                        styleTag: s.styleTag || null,
                        aiComment: s.aiComment || null
                    }
                });

                // 4-B. [CRITICAL] DailyStockSnapshot 테이블 업데이트 (통합 SSOT)
                // 이를 통해 가격 수정 후에도 점수가 누락되지 않도록 보장합니다.
                const originalData = top5.find(t => (t.code || t.ticker) === s.code) || {};
                const snapshotPayload = buildSnapshotPayload(s.code, { ...originalData, ...s }, null, todayDate);
                
                await prisma.dailyStockSnapshot.upsert({
                    where: { ticker_syncDate: { ticker: s.code, syncDate: todayDate } },
                    update: {
                        hybridScore: snapshotPayload.hybridScore,
                        starRating:  snapshotPayload.starRating,
                        currentPrice: snapshotPayload.currentPrice,
                        entry1Price:  snapshotPayload.entry1Price,
                        entry2Price:  snapshotPayload.entry2Price,
                        targetPrice:  snapshotPayload.targetPrice,
                        stopLossPrice: snapshotPayload.stopLossPrice,
                        category:     snapshotPayload.category,
                        yield:        snapshotPayload.yield,
                        tradeAmount:  snapshotPayload.tradeAmount,
                        foreignNet:   snapshotPayload.foreignNet,
                        institutionNet: snapshotPayload.institutionNet,
                        updatedAt:    new Date()
                    },
                    create: snapshotPayload
                });
            }
            console.log(`[Admin] DB Snapshot saved: ${tagName}`);
        }

        // 5. Trigger Multi-Channel Publishing (Files/Redis) - Hardened in PublishingService
        if (global.publishingService) {
            console.log('[Admin] Triggering multi-channel publishing...');
            await global.publishingService.publishToAll(safeTop5);
        }

        res.json({ 
            success: true, 
            tagName, 
            dbStatus: dbSyncEnabled ? 'synced' : 'skipped (Safe Mode)',
            message: dbSyncEnabled ? '데이터베이스 및 파일 동기화 완료' : '데이터베이스가 오프라인입니다. 로컬 파일만 동기화되었습니다.'
        });
    } catch (err) {
        console.error('[Admin-SaveHistory] Failed:', err);
        res.status(500).json({ error: '서버 오류로 인해 저장에 실패했습니다.' });
    }
});

module.exports = router;

// ─── [Unified Mapping Helpers] ──────────────────────────────────────────────

/**
 * signals.json 또는 프론트엔드 데이터를 DailyStockSnapshot 페이로드로 변환
 */
function buildSnapshotPayload(ticker, data, rank, syncDate) {
  const score = Math.round(Number(data.hybridScore ?? data.total_score ?? data.score ?? 0));
  
  return {
    ticker,
    syncDate,
    name:           data.name || 'Unknown',
    currentPrice:   Math.round(Number(data.currentPrice ?? data.current_price ?? 0)),
    entry1Price:    Math.round(Number(data.entryPrice1 ?? data.entry1  ?? data.result_2 ?? 0)),
    entry2Price:    Math.round(Number(data.entryPrice2 ?? data.entry2  ?? data.result_3 ?? 0)),
    targetPrice:    Math.round(Number(data.targetPrice || (data.targetPrice1 ?? data.target  ?? data.result_1 ?? 0))),
    stopLossPrice:  Math.round(Number(data.stopLossPrice || (data.stopLoss ?? data.stop_loss ?? 0))),
    hybridScore:    score,
    starRating:     computeStarRating(score),
    maArrangement:  data.maArrangement || data.maArray?.arrangement || null,
    ma5:            Math.round(Number(data.sma5 || data.maArray?.ma5   || data.ma5 || 0)),
    ma10:           Math.round(Number(data.sma10 || data.maArray?.ma10  || data.ma10 || 0)),
    ma20:           Math.round(Number(data.sma20 || data.maArray?.ma20  || data.ma20 || 0)),
    ma60:           Math.round(Number(data.sma60 || data.maArray?.ma60  || data.ma60 || 0)),
    ma120:          Math.round(Number(data.maArray?.ma120 || data.ma120 || 0)),
    yield:          Number(data.changeRate || data.yield || 0),
    tradeAmount:    (() => {
        const val = String(data.tradeAmount || data.trade_amount || 0).replace(/[^0-9]/g, '');
        return val ? BigInt(val) : 0n;
    })(),
    foreignNet:     formatSupply(data.foreignNet     ?? data.foreign_net ?? data.foreignBuy),
    institutionNet: formatSupply(data.institutionNet ?? data.inst_net ?? data.instBuy),
    category:       data.category || data.trendType || null,
    signalVersion:  data.version || 'v10.0.0-SSOT',
    isTop5:         rank !== null || true, // save-sync-history calls are usually for top5
    rank:           rank,
  };
}

function formatSupply(value) {
  if (value === null || value === undefined || value === '-') return null;
  const num = Number(String(value).replace(/,/g, ''));
  if (isNaN(num)) return String(value);
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toLocaleString('ko-KR')}`;
}

function computeStarRating(score) {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 45) return 3;
  if (score >= 30) return 2;
  if (score >= 15) return 1;
  return 0;
}

