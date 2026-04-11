const PublishingService = require('../src/services/publishingService.cjs');
const path = require('path');
const fs = require('fs');

async function verifyRefactor() {
    console.log('--- [P09] PublishingService Refactor Verification ---');

    try {
        console.log('1. Checking export type...');
        if (typeof PublishingService === 'function') {
            console.log('✅ PASS: PublishingService is a class (constructor function).');
        } else {
            console.error('❌ FAIL: PublishingService is not a class. Type:', typeof PublishingService);
            process.exit(1);
        }

        console.log('2. Attempting instantiation...');
        const service = new PublishingService();
        console.log('✅ PASS: Successfully instantiated PublishingService.');

        console.log('3. Checking method availability...');
        const methods = ['publishToAll', 'writeJsonAtomic', 'readJsonSafe'];
        for (const method of methods) {
            if (typeof service[method] === 'function') {
                console.log(`✅ PASS: Method "${method}" is available.`);
            } else {
                console.error(`❌ FAIL: Method "${method}" is missing.`);
                process.exit(1);
            }
        }

        console.log('\n--- Verification SUCCESS ---');
    } catch (err) {
        console.error('❌ Critical Verification Error:', err.message);
        process.exit(1);
    }
}

verifyRefactor();
