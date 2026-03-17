const { Client } = require('pg');

const client = new Client({
  connectionString: "postgresql://postgres.nkkftuukcypbivtyuayf:mp910901%21@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"
});

async function run() {
  try {
    console.log('Connecting to PostgreSQL using pure PG client...');
    await client.connect();
    console.log('Connected! Executing schema modification...');
    
    // Add telegram_id column directly bypassing Prisma engine parsing errors
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(255);
    `);
    
    console.log('Success: "telegram_id" column added to the "users" table.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

run();
