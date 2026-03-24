const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.report.findMany({orderBy:{sentAt:'desc'}, take: 2})
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
