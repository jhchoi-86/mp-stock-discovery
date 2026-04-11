const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware.cjs');

// 🟢 [Get Current Target Symbols]
router.get('/symbols', authMiddleware, async (req, res) => {
    try {
        const strategyPath = path.join(__dirname, '../../data/landing_strategy.json');
        let top5 = [
            { code: '006360', name: 'GS건설' },
            { code: '375500', name: 'DL이앤씨' },
            { code: '047040', name: '대우건설' },
            { code: '009150', name: '삼성전기' },
            { code: '011170', name: '롯데케미칼' }
        ];

        if (fs.existsSync(strategyPath)) {
            const strategy = JSON.parse(fs.readFileSync(strategyPath, 'utf8'));
            if (strategy.stocks && strategy.stocks.length > 0) {
                top5 = strategy.stocks.slice(0, 5).map(s => ({ code: s.code, name: s.name }));
            }
        }
        res.json({ success: true, symbols: top5 });
    } catch (err) {
        res.status(500).json({ error: '종목 정보를 가져오는데 실패했습니다.' });
    }
});

// 🔴 [Backtest Bridge] Executes Python Backtest Engine and returns JSON metrics
router.post('/run', authMiddleware, async (req, res) => {
    console.log(`[Backtest Request] User: ${req.user?.email}`);
    
    if (req.user?.role === 'PENDING') {
        return res.status(403).json({ error: '회원 승인 후 이용 가능합니다.' });
    }

    let pythonCmd = 'python';
    const isWin = process.platform === 'win32';
    const venvPath = isWin 
        ? path.join(__dirname, '../../sniper_engine/venv/Scripts/python.exe')
        : path.join(__dirname, '../../sniper_engine/venv/bin/python3');

    if (fs.existsSync(venvPath)) pythonCmd = venvPath;
    else pythonCmd = isWin ? 'python' : 'python3';

    let top5Codes = [];
    try {
        const strategyPath = path.join(__dirname, '../../data/landing_strategy.json');
        if (fs.existsSync(strategyPath)) {
            const strategy = JSON.parse(fs.readFileSync(strategyPath, 'utf8'));
            if (strategy.stocks && strategy.stocks.length > 0) {
                top5Codes = strategy.stocks.slice(0, 5).map(s => s.code);
            }
        }
    } catch (err) {}

    // 1. Run Mock Generator first to sync data
    const generatorPath = path.join(__dirname, '../../sniper_engine/backtester/mock_generator.py');
    const generatorProcess = spawn(pythonCmd, [generatorPath], {
        cwd: path.join(__dirname, '../../sniper_engine/backtester/'),
        env: { ...process.env, PYTHONPATH: path.join(__dirname, '../../') }
    });

    generatorProcess.on('close', (gCode) => {
        console.log(`[Backtest] Mock Generator finished (${gCode}). Running simulator...`);
        
        // 2. Run Main Backtester
        const pythonProcess = spawn(pythonCmd, [
            '-m', 'sniper_engine.backtester.run_backtest',
            '--json',
            ...(top5Codes.length > 0 ? top5Codes : ["006360", "375500", "047040", "009150", "011170"])
        ], {
            cwd: path.join(__dirname, '../../'),
            env: { ...process.env, PYTHONPATH: path.join(__dirname, '../../') }
        });

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => { stdoutData += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { stderrData += data.toString(); });

        pythonProcess.on('close', (code) => {
            console.log(`[Backtest] Main process exited with code ${code}`);
            
            if (code !== 0) {
                return res.status(500).json({ error: '백테스트 엔진 오류', details: stderrData });
            }

            try {
                const lines = stdoutData.trim().split('\n');
                const results = JSON.parse(lines[lines.length - 1]);
                res.json({ success: true, metrics: results });
            } catch (e) {
                res.status(500).json({ error: '데이터 파싱 실패', raw: stdoutData });
            }
        });

        // Safety timeout
        setTimeout(() => {
            if (!pythonProcess.killed && pythonProcess.exitCode === null) pythonProcess.kill();
        }, 120000);
    });
});

module.exports = router;
