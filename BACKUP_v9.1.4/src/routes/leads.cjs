const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const router = express.Router();

// POST /api/v1/leads/subscribe
router.post('/subscribe', async (req, res) => {
    try {
        const { email, source, honeypot } = req.body;

        // 1. Honeypot check (Silent discard for bots)
        if (honeypot) {
            console.log(`[LeadBot] Honeypot triggered for email: ${email}`);
            return res.status(200).json({ success: true, message: 'Subscription successful' });
        }

        // 2. Validation
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, error: '유효한 이메일 주소를 입력해주세요.' });
        }

        // 3. Persistence (Using Prisma)
        try {
            await prisma.lead.create({
                data: {
                    email,
                    source: source || 'main_landing'
                }
            });
            console.log(`[LeadCaptured] New lead stored in DB: ${email}`);
        } catch (dbError) {
            console.error('[Lead DB Error] Fallback to file logging:', dbError.message);
            // Fallback: Write to local log file
            const fs = require('fs');
            const path = require('path');
            const logDir = path.join(__dirname, '../../data');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            
            const logPath = path.join(logDir, 'leads_backup.log');
            const logEntry = `${new Date().toISOString()} | ${email} | ${source || 'direct'}\n`;
            fs.appendFileSync(logPath, logEntry);
        }

        res.status(200).json({ success: true, message: '성공적으로 구독되었습니다!' });

    } catch (error) {
        console.error('[Lead API Error]', error);
        res.status(500).json({ success: false, error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
    }
});

module.exports = router;
