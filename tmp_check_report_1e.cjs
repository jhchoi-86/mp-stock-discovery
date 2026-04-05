const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    try {
        const r = await prisma.report.findUnique({
            where: { id: '1e39e2bf-320c-4861-807d-606553257545' } // Estimated ID from prefix
        });
        // Since I only have prefix, let's search by prefix
        const reports = await prisma.report.findMany({
            where: { id: { startsWith: '1e39e2bf' } }
        });
        if (reports.length > 0) {
            console.log('--- REPORT CONTENT START (ID: ' + reports[0].id + ') ---');
            console.log(reports[0].content);
            console.log('--- REPORT CONTENT END ---');
        } else {
            console.log('No report found with prefix 1e39e2bf');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
main();
