const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';

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
