const jwt = require('jsonwebtoken');
const redis = require('../../../infra/redis/client.cjs');

async function verifyJWT(req, res, next) {
  try {
    const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // [1] Blacklist check
    if (await redis.get(`blacklist:${payload.jti}`)) {
      return res.status(401).json({ error: 'Token revoked' });
    }

    // [2] PAID concurrent login block
    if (payload.role === 'PAID') {
      const activeJti = await redis.get(`active_session:${payload.userId}`);
      if (activeJti && activeJti !== payload.jti) {
        return res.status(401).json({ error: '다른 기기에서 접속되었습니다.' });
      }
    }

    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = verifyJWT;
