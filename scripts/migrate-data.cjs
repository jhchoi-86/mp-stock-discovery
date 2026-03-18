const { PrismaClient } = require('@prisma/client');

// Source: Supabase DB (Previously considered local/dev environment)
const SOURCE_URL = 'postgresql://postgres.wycrexafyancaygkxdib:dmsry86FA12%23%24@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';

const sourcePrisma = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
const targetPrisma = new PrismaClient(); // Implicitly connects to process.env.DATABASE_URL (AWS RDS)

async function migrate() {
    console.log('🚀 Phase 1.5: Starting Data Migration from Local/Supabase to AWS RDS');
    try {
        console.log('Connecting to databases...');
        await targetPrisma.$connect();
        
        // 1. Users (Base Entity)
        console.log('Migrating Users...');
        const users = await sourcePrisma.user.findMany();
        if (users.length > 0) await targetPrisma.user.createMany({ data: users, skipDuplicates: true });
        console.log(`✅ Users migrated: ${users.length}`);

        // 2. RefreshTokens (Depends on User)
        console.log('Migrating RefreshTokens...');
        const tokens = await sourcePrisma.refreshToken.findMany();
        if (tokens.length > 0) await targetPrisma.refreshToken.createMany({ data: tokens, skipDuplicates: true });
        console.log(`✅ RefreshTokens migrated: ${tokens.length}`);

        // 3. UsageLogs (Depends on User)
        console.log('Migrating UsageLogs...');
        const logs = await sourcePrisma.usageLog.findMany();
        if (logs.length > 0) await targetPrisma.usageLog.createMany({ data: logs, skipDuplicates: true });
        console.log(`✅ UsageLogs migrated: ${logs.length}`);

        // 4. Reports (Depends on User)
        console.log('Migrating Reports...');
        const reports = await sourcePrisma.report.findMany();
        if (reports.length > 0) await targetPrisma.report.createMany({ data: reports, skipDuplicates: true });
        console.log(`✅ Reports migrated: ${reports.length}`);

        // 5. Recommendations (No Strong FKs)
        console.log('Migrating Recommendations...');
        const recs = await sourcePrisma.recommendation.findMany();
        if (recs.length > 0) await targetPrisma.recommendation.createMany({ data: recs, skipDuplicates: true });
        console.log(`✅ Recommendations migrated: ${recs.length}`);

        // 6. SubscriptionRequests (Depends on User)
        console.log('Migrating SubscriptionRequests...');
        const subs = await sourcePrisma.subscriptionRequest.findMany();
        if (subs.length > 0) await targetPrisma.subscriptionRequest.createMany({ data: subs, skipDuplicates: true });
        console.log(`✅ SubscriptionRequests migrated: ${subs.length}`);

        // 7. AuditLogs (Depends on User)
        console.log('Migrating AuditLogs...');
        const audits = await sourcePrisma.auditLog.findMany();
        if (audits.length > 0) await targetPrisma.auditLog.createMany({ data: audits, skipDuplicates: true });
        console.log(`✅ AuditLogs migrated: ${audits.length}`);

        console.log('🎉 Migration Completed Successfully!');
    } catch (err) {
        console.error('❌ Migration Error:', err);
        process.exit(1);
    } finally {
        await sourcePrisma.$disconnect();
        await targetPrisma.$disconnect();
    }
}

migrate();
