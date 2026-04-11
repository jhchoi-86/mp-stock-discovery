const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function run() {
    console.log('[ForceRestore] Starting manual restoration via RAW SQL...');
    
    // DB 연결 설정 (KIS_APP_KEY 등을 통해 시스템에서 확인된 계정 정보)
    const config = {
        host: '127.0.0.1',
        user: 'root',
        password: 'MpStock2026',
        database: 'mpstock_db'
    };

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('[ForceRestore] DB Connected.');

        const dataPath = path.join(__dirname, 'data', 'signals.json');
        if (!fs.existsSync(dataPath)) {
            throw new Error('signals.json not found');
        }

        const signals = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const codes = Object.keys(signals);
        console.log(`[ForceRestore] Found ${codes.length} signals in cache.`);

        // 4월 5일자 데이터 삭제 후 재삽입 (Clean-slate)
        await connection.execute("DELETE FROM daily_stock_snapshots WHERE created_at >= '2026-04-05 00:00:00' AND created_at <= '2026-04-05 23:59:59'");
        console.log('[ForceRestore] Previous 4/5 records cleared.');

        for (const code of codes) {
            const s = signals[code];
            const query = `
                INSERT INTO daily_stock_snapshots 
                (code, name, current_price, entry_price1, target_price1, stop_loss, yield, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, '2026-04-05 12:00:00')
            `;
            await connection.execute(query, [
                code, 
                s.name || code, 
                s.current_price, 
                s.entry_price_1 || s.current_price, 
                s.target_price_1 || s.current_price, 
                s.stop_loss || 0,
                s.change_rate || 0
            ]);
        }

        const [rows] = await connection.execute("SELECT COUNT(*) as count FROM daily_stock_snapshots WHERE created_at >= '2026-04-05 00:00:00' AND created_at <= '2026-04-06 00:00:00'");
        console.log(`[ForceRestore] SUCCESS! Final 4/5 Count: ${rows[0].count}`);
        
        fs.writeFileSync('restore_result.txt', `COUNT: ${rows[0].count}\nDATE: ${new Date().toISOString()}`);

    } catch (err) {
        console.error('[ForceRestore] FATAL ERROR:', err);
    } finally {
        if (connection) await connection.end();
    }
}

run();
