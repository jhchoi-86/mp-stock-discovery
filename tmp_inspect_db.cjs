const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:MpStock2026@mpstock-db.cfgkmy04uoxp.ap-southeast-2.rds.amazonaws.com:5432/postgres?schema=public' });

async function main() {
    try {
        await client.connect();
        console.log('--- COLUMNS ---');
        const colRes = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'daily_stock_snapshots';");
        console.table(colRes.rows);
        
        console.log('--- TRIGGERS ---');
        const trigRes = await client.query("SELECT trigger_name, event_manipulation, action_statement FROM information_schema.triggers WHERE event_object_table = 'daily_stock_snapshots';");
        console.table(trigRes.rows);
        
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

main();
