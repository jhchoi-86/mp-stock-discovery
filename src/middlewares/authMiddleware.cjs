const jwt = require('jsonwebtoken');

// 🔴 [Red Team 방어 - V4 패치] JWT_ACCESS_SECRET 백도어 하드코딩 제거 
if (!process.env.JWT_ACCESS_SECRET) {
  console.error('[FATAL] JWT_ACCESS_SECRET is missing. Server cannot start securely.');
  process.exit(1);
}
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the token
    const decodedPayload = jwt.verify(token, ACCESS_SECRET);
    
    // Attach decoded user info to the request object
    req.user = decodedPayload;
    
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired' });
    }
    
    return res.status(401).json({ error: 'Invalid access token' });
  }
};

module.exports = authMiddleware;
