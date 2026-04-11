const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.cjs');
let content = fs.readFileSync(serverPath, 'utf8');

const targetComment = '// [Public/Paid] 성과 통계 날짜 목록';
const startIndex = content.indexOf(targetComment);

if (startIndex === -1) {
    console.error('Target comment not found');
    process.exit(1);
}

// Find the start of the next endpoint or a safe boundary
const nextBoundaryIndex = content.indexOf('app.get(\'/api/public/time-slot-signals\'', startIndex);

if (nextBoundaryIndex === -1) {
     console.error('Next boundary not found');
     process.exit(1);
}

const reportBlock = `// [Public/Paid] 성과 통계 날짜 목록
app.get('/api/public/daily-snapshot-dates', async (req, res) => {
    try {
        const snapshotDates = await prisma.dailyStockSnapshot.findMany({
            select: { createdAt: true },
            distinct: ['createdAt'],
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        const top5Dates = await prisma.dailyTop5.findMany({
            select: { date: true },
            distinct: ['date'],
            orderBy: { date: 'desc' },
            take: 100
        });
        const combined = [
            ...snapshotDates.map(d => new Date(d.createdAt).toISOString().split('T')[0]),
            ...top5Dates.map(d => d.date)
        ];
        const formatted = [...new Set(combined)].sort((a, b) => b.localeCompare(a));
        res.json(formatted);
    } catch (err) {
        console.error('Failed to get snapshot dates:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

`;

const newContent = content.substring(0, startIndex) + reportBlock + content.substring(nextBoundaryIndex);

fs.writeFileSync(serverPath, newContent);
console.log('server.cjs repaired successfully');
