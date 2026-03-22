const fs = require('fs');
let env = fs.readFileSync('.env', 'utf8');

if (env.includes('GEMINI_API_KEY=')) {
    env = env.replace(/GEMINI_API_KEY=.*\n?/, 'GEMINI_API_KEY=AIzaSyDvWhj4Py4ItNgcZuJGOBVjamokuNIDbqo\n');
} else {
    env += '\nGEMINI_API_KEY=AIzaSyDvWhj4Py4ItNgcZuJGOBVjamokuNIDbqo\n';
}

fs.writeFileSync('.env', env);
console.log('Successfully updated GEMINI_API_KEY in .env');
