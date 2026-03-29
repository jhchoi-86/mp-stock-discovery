const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware.cjs');

// 🔴 [Backtest Bridge] Executes Python Backtest Engine and returns JSON metrics
router.post('/run', authMiddleware, async (req, res) => {
    console.log(`[Backtest Request] User: ${req.user?.email}, Role: ${req.user?.role}`);
    
    // Check if user is ADMIN or the whitelisted management user (Extra Security)
    const isManagementUser = req.user?.role === 'ADMIN';

    if (!isManagementUser) {
        console.warn(`[Backtest Forbidden] Access denied for ${req.user?.email}`);
        return res.status(403).json({ error: '관리자 전용 기능입니다.' });
    }

    console.log('[Backtest] Starting simulation via child process...');
    
    // 🟠 [Environment-Aware Python Path]
    // Use venv if it exists, otherwise fallback to system python3/python
    let pythonCmd = 'python';
    const isWin = process.platform === 'win32';
    const venvPath = isWin 
        ? path.join(__dirname, '../../sniper_engine/venv/Scripts/python.exe')
        : path.join(__dirname, '../../sniper_engine/venv/bin/python3');

    if (fs.existsSync(venvPath)) {
        pythonCmd = venvPath;
        console.log(`[Backtest] Using venv python: ${pythonCmd}`);
    } else {
        pythonCmd = isWin ? 'python' : 'python3';
        console.log(`[Backtest] Venv not found. Falling back to system: ${pythonCmd}`);
    }

    // Use python -m for relative import compatibility in sniper_engine
    const pythonProcess = spawn(pythonCmd, [
        '-m', 'sniper_engine.backtester.run_backtest',
        '--json'
    ], {
        cwd: path.join(__dirname, '../../'),
        env: { ...process.env, PYTHONPATH: path.join(__dirname, '../../') }
    });

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
        console.log(`[Backtest] Process exited with code ${code}`);
        
        if (code !== 0) {
            console.error(`[Backtest Error] Stderr: ${stderrData}`);
            return res.status(500).json({ 
                error: '백테스트 실행 중 오류가 발생했습니다.', 
                details: stderrData 
            });
        }

        try {
            // Find the last line of stdout which should be the JSON
            const lines = stdoutData.trim().split('\n');
            const jsonStr = lines[lines.length - 1];
            const results = JSON.parse(jsonStr);
            
            res.json({
                success: true,
                metrics: results,
                timestamp: new Date().toISOString()
            });
        } catch (e) {
            console.error('[Backtest] JSON Parse Error:', e.message, stdoutData);
            res.status(500).json({ 
                error: '결과 데이터를 분석하는 데 실패했습니다.', 
                raw: stdoutData 
            });
        }
    });

    // Timeout safety: Force kill after 5 minutes if still running
    setTimeout(() => {
        if (!pythonProcess.killed && pythonProcess.exitCode === null) {
            console.warn('[Backtest] Process timed out. Killing...');
            pythonProcess.kill();
        }
    }, 300000);
});

module.exports = router;
