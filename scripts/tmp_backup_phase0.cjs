/**
 * Phase 0: Emergency Backup Script
 * Extract critical tables to JSON due to pg_dump version mismatch
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting Emergency Backup via Prisma...');
  
  const tables = ['dailyStockSnapshot', 'sniperSignal', 'signalCandidate'];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const table of tables) {
    console.log(`Backing up ${table}...`);
    try {
      if (!prisma[table]) {
        console.error(`Model ${table} not found in Prisma client.`);
        continue;
      }
      const data = await prisma[table].findMany();
      // BigInt serialization fix
      const serializedData = JSON.stringify(data, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2
      );
      fs.writeFileSync(`backup_${table}_${timestamp}.json`, serializedData);
      console.log(`Successfully backed up ${table} (${data.length} rows)`);
    } catch (err) {
      console.error(`Failed to backup ${table}:`, err.message);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
