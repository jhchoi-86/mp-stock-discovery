const fs = require('fs');

async function testImport() {
    const csvContent = fs.readFileSync('test_import.csv', 'utf8');
    
    try {
        const response = await fetch('http://localhost:3001/api/import-csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ csv: csvContent }),
        });
        
        const result = await response.json();
        console.log('Result:', result);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testImport();
