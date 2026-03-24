const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function run() {
    try {
        const latest = await prisma.report.findFirst({
            orderBy: { sentAt: 'desc' },
        });
        const content = latest.content;
        
        const blocks = content.split('🔹 ');
        const recommendations = [];
        
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const nameMatch = block.match(/^(.*?)\s*\(([0-9]{6})\)/);
            if (!nameMatch) continue;
            const name = nameMatch[1].trim();
            const code = nameMatch[2];
            
            const p1Match = block.match(/1차 매수타점:\s*([0-9,]+)원/);
            const bpMatch = block.match(/돌파 매수타점:\s*([0-9,]+)원/);
            
            let rec_price = 0;
            if (p1Match) {
                rec_price = parseInt(p1Match[1].replace(/,/g, ''));
            } else if (bpMatch) {
                rec_price = parseInt(bpMatch[1].replace(/,/g, ''));
            }
            
            if (rec_price > 0) {
                recommendations.push({
                    code,
                    name,
                    rec_price,
                    date: new Date().toISOString().split('T')[0],
                    category: "VIP 수동 발송 종목"
                });
            }
        }
        
        const filePath = path.join(__dirname, 'data', 'past_recommendations.json');
        fs.writeFileSync(filePath, JSON.stringify(recommendations, null, 2));
        console.log(`Successfully extracted ${recommendations.length} stocks and updated past_recommendations.json`);
        console.log(recommendations.map(r => `${r.name}(${r.code}): ${r.rec_price}원`).join('\n'));
        
    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
