const { PrismaClient } = require('@prisma/client');
const SOURCE_URL = 'postgresql://postgres.wycrexafyancaygkxdib:dmsry86FA12%23%24@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';

async function checkSupabase() {
    console.log('--- SUPABASE CHECK ---');
    const sourcePrisma = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
    try {
        const users = await sourcePrisma.user.findMany();
        console.log('SUPABASE_USERS:', users.map(u => ({ email: u.email, role: u.role })));
    } catch (err) {
        console.error('SUPABASE CONNECTION FAILED:', err.message);
    } finally {
        await sourcePrisma.$disconnect();
    }
}

checkSupabase();
