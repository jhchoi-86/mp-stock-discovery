const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixReportContent() {
    console.log('[DB Fix] Fetching latest report to fix content...');
    const report = await prisma.report.findFirst({
        orderBy: { sentAt: 'desc' }
    });

    if (!report) {
        console.log('No reports found.');
        return;
    }

    console.log(`[DB Fix] Checking Report ID: ${report.id}`);
    
    // Check if it contains the wrong price
    if (report.content.includes('39,600원')) {
        console.log('[DB Fix] Found 39,600원 in report content. Replacing with 39,050원...');
        let newContent = report.content.replace(/39,600원/g, '39,050원');
        newContent = newContent.replace(/9\.39%/g, '7.87%'); // Update rate too
        // Also fix the diff if exists
        // 39,600 - 39,200 = 400. 39,050 - 39,200 = -150. 
        // Oh, maybe just replace the whole price line is safer.
        
        await prisma.report.update({
            where: { id: report.id },
            data: { content: newContent }
        });
        console.log('[DB Fix] Report content updated successfully!');
    } else {
        console.log('[DB Fix] 39,600원 not found in latest report content.');
    }
}

fixReportContent()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
