const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSchema() {
  try {
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ppp_watchlist'
      ORDER BY ordinal_position;
    `;
    console.log('--- PPP_WATCHLIST COLUMNS ---');
    columns.forEach(c => {
      console.log(`${c.column_name}: ${c.data_type}`);
    });
    
    const targets = ['g_sell', 'matched_tfs', 'tf_values', 'current_price', 'price_updated_at'];
    const existing = columns.map(c => c.column_name);
    const missing = targets.filter(t => !existing.includes(t));
    
    if (missing.length === 0) {
      console.log('\nSUCCESS: All new columns detected.');
    } else {
      console.log('\nMISSING COLUMNS:', missing.join(', '));
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
