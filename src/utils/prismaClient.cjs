const { PrismaClient } = require('@prisma/client');

let prisma;

const prismaInstance = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'minimal',
});

// [v9.9.58] Global Request Timeout Middleware (10s)
// Prevents 502/504 hangs when DB is unreachable but TCP handshake partially succeeds
prismaInstance.$use(async (params, next) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Prisma Query Timeout (${params.model}.${params.action})`)), 10000)
    );
    return Promise.race([next(params), timeout]);
});

if (process.env.NODE_ENV === 'production') {
  prisma = prismaInstance;
} else {
  if (!global.prisma) {
    global.prisma = prismaInstance;
  }
  prisma = global.prisma;
}

module.exports = prisma;
