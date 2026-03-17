const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jwt-simple'); // The repo has 'jsonwebtoken' installed usually, but looking at older projects, let's use jsonwebtoken
// Wait, I installed jsonwebtoken.
const jsonwebtoken = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const router = express.Router();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required.' });
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
    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'FREE_USER',
        status: 'ACTIVE'
      }
    });

    res.status(201).json({ 
      message: 'User registered successfully', 
      user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role } 
    });
  } catch (error) {
    console.error('[Auth Register Error]', error);
    res.status(500).json({ error: 'Internal server error during registration.' });
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
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Invalid credentials or inactive account.' });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Generate Tokens
    const accessToken = jsonwebtoken.sign({ userId: user.id, role: user.role }, ACCESS_SECRET, { expiresIn: '1h' });
    const refreshToken = jsonwebtoken.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });

    // Save Refresh Token to DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt
      }
    });

    // Update Last Login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Set HttpOnly Cookie for Refresh Token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Secure in production for Cross-Origin
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Allow cross-origin cross-site in production
      path: '/api/auth', // Broaden path slightly so logout and refresh can both read it
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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
    
    // Even if no token, just clear the cookie and return 200
    if (refreshToken) {
      // Find the token in DB and mark it as revoked
      const dbToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken }
      });
      
      if (dbToken && !dbToken.isRevoked) {
        await prisma.refreshToken.update({
          where: { id: dbToken.id },
          data: { isRevoked: true }
        });
      }
    }
    
    // Clear Cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/api/auth'
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
    
    // Check Database existence and revocation status
    const dbToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken }
    });
    
    if (!dbToken || dbToken.isRevoked) {
      return res.status(401).json({ error: 'Refresh token revoked or invalid' });
    }
    
    // Ensure the token corresponds to an active user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'User is inactive or deleted' });
    }
    
    // RTR: Revoke the old token
    await prisma.refreshToken.update({
      where: { id: dbToken.id },
      data: { isRevoked: true }
    });
    
    // Issue NEW Tokens
    const newAccessToken = jsonwebtoken.sign({ userId: user.id, role: user.role }, ACCESS_SECRET, { expiresIn: '1h' });
    const newRefreshToken = jsonwebtoken.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    
    // Save NEW Refresh Token to DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshToken,
        expiresAt
      }
    });
    
    // Set NEW HttpOnly Cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Respond with access token
    res.json({ accessToken: newAccessToken });
    
  } catch (error) {
    console.error('[Auth Refresh Error]', error);
    res.status(500).json({ error: 'Internal server error during refresh.' });
  }
});

module.exports = router;
