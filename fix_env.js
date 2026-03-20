const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
let data = fs.readFileSync(envPath, 'utf8');

// The faulty string ending is `"TELEGRAM_GROUP_ID=-1003821536889` appended directly to the end of DIRECT_URL
if (data.includes('?schema=public"TELEGRAM_GROUP_ID=')) {
    data = data.replace('?schema=public"TELEGRAM_GROUP_ID=', '?schema=public"\nTELEGRAM_GROUP_ID=');
    fs.writeFileSync(envPath, data);
    console.log('Fixed .env file by putting TELEGRAM_GROUP_ID on a new line.');
} else {
    console.log('No fix needed or already fixed.');
}
