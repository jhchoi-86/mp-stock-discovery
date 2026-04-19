/**
 * test_strategy_live.cjs
 * AWS 서버에서 실행: node scripts/test_strategy_live.cjs
 * 전략 보고서 API 및 파일 상태 진단
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

const DATA_DIR = path.join(__dirname, '../data');
const STRATEGY_FILE = path.join(DATA_DIR, 'watchlist_strategy.json');

// 1. 파일 상태 확인
console.log('\n=== [1] 파일 상태 확인 ===');
if (fs.existsSync(STRATEGY_FILE)) {
    const stat = fs.statSync(STRATEGY_FILE);
    const data = JSON.parse(fs.readFileSync(STRATEGY_FILE, 'utf8'));
    console.log(`파일 존재: YES`);
    console.log(`파일 크기: ${stat.size} bytes`);
    console.log(`수정 시각: ${stat.mtime}`);
    console.log(`stocks 개수: ${data.stocks ? data.stocks.length : 0}`);
    if (data.stocks && data.stocks.length > 0) {
        const s = data.stocks[0];
        console.log(`첫 종목 필드: ${Object.keys(s).join(', ')}`);
        console.log(`entry_1: ${s.entry_1}, stop_loss: ${s.stop_loss}, current_price: ${s.current_price}`);
        console.log(`entryPrice1: ${s.entryPrice1}, stopLoss: ${s.stopLoss}`);
    }
} else {
    console.log('파일 없음!');
}

// 2. DB 상태 확인
console.log('\n=== [2] DB 활성 종목 수 확인 ===');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.pppWatchlist.count({ where: { is_active: true } })
    .then(count => {
        console.log(`is_active=true 종목 수: ${count}`);
        return prisma.pppWatchlist.count();
    })
    .then(total => {
        console.log(`전체 종목 수: ${total}`);
    })
    .then(() => prisma.pppWatchlist.findMany({
        where: { is_active: true },
        orderBy: { score: 'desc' },
        take: 3,
        select: { code: true, name: true, score: true, is_active: true, expires_at: true, registered_date: true }
    }))
    .then(items => {
        console.log('상위 3개:', JSON.stringify(items, null, 2));
    })
    .catch(e => console.error('DB 오류:', e.message))
    .finally(() => {
        // 3. API 테스트
        console.log('\n=== [3] API 호출 테스트 ===');
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) {
            console.log('JWT_ACCESS_SECRET 없음');
            prisma.$disconnect();
            return;
        }
        const token = jwt.sign({ userId: 'test-admin', role: 'ADMIN' }, secret, { expiresIn: '5m' });
        const options = {
            hostname: 'localhost',
            port: process.env.PORT || 3001,
            path: '/api/strategy/top10',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log(`HTTP 상태: ${res.statusCode}`);
                try {
                    const parsed = JSON.parse(body);
                    console.log(`success: ${parsed.success}`);
                    console.log(`source: ${parsed.source}`);
                    console.log(`data 개수: ${parsed.data ? parsed.data.length : 0}`);
                    if (parsed.data && parsed.data.length > 0) {
                        const d = parsed.data[0];
                        console.log(`첫 항목: ${d.name} (${d.code})`);
                        console.log(`entry_1: ${d.entry_1}, stop_loss: ${d.stop_loss}`);
                    }
                } catch (e) {
                    console.log('파싱 오류:', body.substring(0, 200));
                }
                prisma.$disconnect();
            });
        });
        req.on('error', (e) => {
            console.error('요청 오류:', e.message);
            prisma.$disconnect();
        });
        req.end();
    });
