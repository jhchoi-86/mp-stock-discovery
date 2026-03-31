const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = 'c:\\Users\\danbe\\Documents\\Antigravity\\주식종목발굴';
const masterPath = path.join(PROJECT_ROOT, 'data', 'stock_master.json');
const stocks = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

// Create a temporary master file with only 5 stocks
const testMasterPath = path.join(PROJECT_ROOT, 'data', 'test_stock_master.json');
fs.writeFileSync(testMasterPath, JSON.stringify(stocks.slice(0, 5), null, 2));

console.log('--- Starting Diagnostic Sync for 5 stocks ---');

let analyzerContent = fs.readFileSync(path.join(PROJECT_ROOT, 'analyzer.cjs'), 'utf8');
// Fix the path in the cloned analyzer
analyzerContent = analyzerContent.replace(
    "const masterPath = path.join(__dirname, 'data', 'stock_master.json');",
    `const masterPath = "c:\\\\Users\\\\danbe\\\\Documents\\\\Antigravity\\\\주식종목발굴\\\\data\\\\test_stock_master.json";`
);
const testAnalyzerPath = path.join(PROJECT_ROOT, 'tmp', 'test_analyzer_run.cjs');
fs.writeFileSync(testAnalyzerPath, analyzerContent);

const child = spawn('node', [testAnalyzerPath, '1D'], {
    env: { ...process.env, SYNC_MODE: 'integrated' },
    cwd: PROJECT_ROOT
});

child.stdout.on('data', (data) => {
    process.stdout.write(`[ANALYZER STDOUT] ${data}`);
});

child.stderr.on('data', (data) => {
    process.stderr.write(`[ANALYZER STDERR] ${data}`);
});

child.on('close', (code) => {
    console.log(`Diagnostic process exited with code ${code}`);
});
