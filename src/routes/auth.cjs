const express = require('express');
const bcrypt = require('bcrypt');
const jsonwebtoken = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const router = express.Router();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email.' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    console.log('[Auth Registration] Attempting to create user in DB...', { email, role: 'PENDING' });
    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: 'PENDING'
        }
      });
      console.log('[Auth Registration] Prisma user created successfully:', newUser.id);
    } catch (dbError) {
      console.error('[Auth Registration] Prisma DB Error during create:', dbError);
      return res.status(500).json({ error: 'Database insertion failed', details: dbError.message });
    }

    res.status(201).json({ 
      message: 'User registered successfully', 
      user: { id: newUser.id, email: newUser.email, role: newUser.role } 
    });
  } catch (error) {
    console.error('[Auth Register Error]', error);
    res.status(500).json({ error: 'Internal server error during registration.', details: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find User
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Check Manual Approval Status (PENDING -> 403 Forbidden)
    if (user.role === 'PENDING') {
      return res.status(403).json({ error: '관리자의 가입 승인을 대기 중입니다. 승인 후 로그인해 주세요.' });
    }

    // Generate Tokens
    const accessToken = jsonwebtoken.sign({ userId: user.id, role: user.role }, ACCESS_SECRET, { expiresIn: '1h' });
    const refreshToken = jsonwebtoken.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });

    // DB constraints removed: Removed lastLoginAt and RefreshToken saves since they are defunct
    // JWT alone manages the active session locally via HttpOnly cookies.

    // Set HttpOnly Cookie for Refresh Token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // Switched to true for HTTPS deployment
      sameSite: 'lax', // Must be lax (not none) for non-Secure HTTP contexts
      path: '/api/auth', // Broaden path slightly so logout and refresh can both read it
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Set HttpOnly Cookie for Access Token (Enables SSE and native fetch APIs)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    res.json({
      message: 'Login successful',
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    console.error('[Auth Login Error]', error);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    
    // Stateless Logout: We just clear the cookie.
    // Future Note: Implement Redis blacklisting if stricter revocation is needed.
    
    // Clear Cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/auth'
    });
    
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/'
    });
    
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('[Auth Logout Error]', error);
    res.status(500).json({ error: 'Internal server error during logout.' });
  }
});

// POST /api/auth/refresh (Refresh Token Rotation - RTR)
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token missing' });
    }
    
    // Verify JWT Signature
    let payload;
    try {
      payload = jsonwebtoken.verify(refreshToken, REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    
    const { userId } = payload;
    
    // 3. Skip DB Token existence check since we are completely Stateless
    
    // Ensure the token corresponds to an active user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: 'User deleted' });
    }
    
    // Issue NEW Tokens (Stateless)
    const newAccessToken = jsonwebtoken.sign({ userId: user.id, role: user.role }, ACCESS_SECRET, { expiresIn: '1h' });
    const newRefreshToken = jsonwebtoken.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    
    // Set NEW HttpOnly Cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Issuing Access Token via Cookie alongside the JSON response
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000
    });
    
    // Respond with access token
    res.json({ accessToken: newAccessToken });
    
  } catch (error) {
    console.error('[Auth Refresh Error]', error);
    res.status(500).json({ error: 'Internal server error during refresh.' });
  }
});

module.exports = router;
