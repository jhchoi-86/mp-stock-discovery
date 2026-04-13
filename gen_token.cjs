const jwt = require('jsonwebtoken');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const secret = process.env.JWT_ACCESS_SECRET || 'mpstock_local_access_secret_2026';
const token = jwt.sign({
    id: 'admin_test',
    role: 'ADMIN',
    tier: 'PREMIUM',
    exp: Math.floor(Date.now() / 1000) + (60 * 60)
}, secret);

console.log(token);
