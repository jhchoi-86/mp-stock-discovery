const fs = require('fs');
const path = require('path');

const MASTER_FILE = path.join(__dirname, 'data', 'stock_master.json');

if (fs.existsSync(MASTER_FILE)) {
    const master = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
    const tess = master.find(s => s.code === '095610');
    console.log(JSON.stringify(tess, null, 2));
} else {
    console.log('Master file not found');
}
