const { PrismaClient } = require('@prisma/client');

// Prisma Client Singleton
const prisma = new PrismaClient({
    log: ['error', 'warn'],
});

module.exports = prisma;
