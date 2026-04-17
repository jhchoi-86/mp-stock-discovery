const jwt = require('jsonwebtoken');
const secret = 'mpstock_local_access_secret_2026';
const payload = {
  userId: 'test-admin-id',
  role: 'ADMIN',
  email: 'admin@test.com'
};

const token = jwt.sign(payload, secret, { expiresIn: '1h' });
console.log(token);
