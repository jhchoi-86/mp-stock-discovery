const fs = require('fs');
const filesToClean = ['data/signals.json', 'data/stock_master.json', 'data/time_slot_signals.json'];
const codesToRemove = ['TEST_ERR', 'TEST_EXM'];

filesToClean.forEach(file => {
    if (fs.existsSync(file)) {
        try {
            let data = JSON.parse(fs.readFileSync(file, 'utf8'));
            let initialLength;
            let finalLength;
            
            if (Array.isArray(data)) {
                initialLength = data.length;
                data = data.filter(item => !codesToRemove.includes(item.code));
                finalLength = data.length;
                console.log(`Cleaned ${file}: Length changed from ${initialLength} to ${finalLength}`);
            } else if (typeof data === 'object') {
                for (let dateKey in data) {
                    if (data[dateKey] && typeof data[dateKey] === 'object') {
                        codesToRemove.forEach(code => {
                            if (data[dateKey][code]) {
                                delete data[dateKey][code];
                                console.log(`Deleted ${code} from ${file} at ${dateKey}`);
                            }
                        });
                    }
                }
            }
            
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error(`Failed to clean ${file}:`, e.message);
        }
    }
});
