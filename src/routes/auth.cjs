const express = require('express');
const bcrypt = require('bcrypt');
const jsonwebtoken = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const systemStatsService = require('../services/systemStatsService.cjs');

const router = express.Router();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Helper to generate unique 5-char referral code
async function generateUniqueReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let isUnique = false;
  let code = '';
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) isUnique = true;
  }
  return code;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone, referralCode } = req.body;

    if (!email || !password || !name || !phone || !referralCode) {
      return res.status(400).json({ error: '모든 필수 항목(이메일, 비밀번호, 이름, 휴대폰 번호, 추천코드)을 입력해주세요.' });
    }

    // [v7.8.18] Red Team: Validate Phone Format (Auto-strip dashes for better UX)
    const cleanPhone = phone.replace(/\D/g, ''); 
    if (!/^\d{10,11}$/.test(cleanPhone)) {
        return res.status(400).json({ error: '휴대폰 번호 형식이 올바르지 않습니다. (숫자 10~11자리 필수)' });
    }

    // [v7.8.13] Validate Referral Code (Case Insensitive in request, stored consistently)
    const upperReferralCode = referralCode.toUpperCase();
    const referrer = await prisma.user.findUnique({
        where: { referralCode: upperReferralCode }
    });
    if (!referrer) {
        return res.status(400).json({ error: '유효하지 않은 추천인 코드입니다.' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email.' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate new unique referral code for this user
    const newUserReferralCode = await generateUniqueReferralCode();

    // Create user
    console.log('[Auth Registration] Attempting to create user in DB...', { email, role: 'PENDING', referralCode });
    let newUser;
    try {
      // Transaction to ensure atomicity
      newUser = await prisma.$transaction(async (tx) => {
          // 1. Increment referrer's count
          await tx.user.update({
              where: { id: referrer.id },
              data: { referralCount: { increment: 1 } }
          });

          // 2. Create new user
          return await tx.user.create({
            data: {
              email,
              passwordHash,
              name,
              phone: cleanPhone,
              role: 'PENDING',
              referralCode: newUserReferralCode,
              referralCount: 0
            }
          });
      });

      console.log('[Auth Registration] Prisma user created and referrer updated successfully:', newUser.id);
      
      // Record Signup Stat
      await systemStatsService.recordSignup();
    } catch (dbError) {
      console.error('[Auth Registration] Prisma Error during registration transaction:', dbError);
      return res.status(500).json({ error: 'Database transaction failed', details: dbError.message });
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
    console.log(`[AUTH-DEBUG] Login Attempt: ${email} at ${new Date().toISOString()}`);

    if (!email || !password) {
      console.log('[AUTH-DEBUG] Missing credentials');
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find User
    let user;
    try {
        console.log('[AUTH-DEBUG] Attempting DB Lookup...');
        // [v9.9.58] 5s hard timeout for login lookup to prevent 502/504
        user = await Promise.race([
            prisma.user.findUnique({ where: { email } }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('DB_TIMEOUT')), 5000))
        ]);
        console.log('[AUTH-DEBUG] DB Lookup Complete. User found:', !!user);
    } catch (dbErr) {
        console.error('[AUTH-DEBUG] DB Error:', dbErr.message);
        return res.status(503).json({ 
            success: false, 
            error: 'Database connection failed. Please check RDS status.',
            code: 'DB_UNREACHABLE'
        });
    }

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
      secure: process.env.NODE_ENV === 'production', 
      sameSite: 'lax', 
      path: '/api/auth', 
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Set HttpOnly Cookie for Access Token (Enables SSE and native fetch APIs)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    res.json({
      message: 'Login successful',
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });

    // Record Login Stat (Async)
    systemStatsService.recordLogin().catch(err => console.error('[Auth Login Stat Error]', err));
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth'
    });
    
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const baseURL = process.env.VITE_API_BASE_URL || (isDevelopment ? 'http://localhost:3001' : req.protocol + '://' + req.get('host'));
    if (!user) {
      return res.status(401).json({ error: 'User deleted' });
    }
    
    // Issue NEW Tokens (Stateless)
    const newAccessToken = jsonwebtoken.sign({ userId: user.id, role: user.role }, ACCESS_SECRET, { expiresIn: '1h' });
    const newRefreshToken = jsonwebtoken.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    
    // Set NEW HttpOnly Cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Issuing Access Token via Cookie alongside the JSON response
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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

// POST /api/auth/reset-password
// Securely reset password by verifying identity (Email + Name + Phone) in a single step
router.post('/reset-password', async (req, res) => {
  try {
    const { email, name, phone, newPassword, checkOnly } = req.body;

    if (!email || !name || !phone) {
      return res.status(400).json({ error: '이메일, 이름, 휴대폰 번호를 모두 입력해주세요.' });
    }

    // 1. Verify Identity
    const user = await prisma.user.findFirst({
      where: {
        email,
        name,
        phone
      }
    });

    if (!user) {
      return res.status(404).json({ error: '일치하는 회원 정보를 찾을 수 없습니다. 정보를 정확히 입력했는지 확인해 주세요.' });
    }

    // If it's just a check (step 1 in UI), return early
    if (checkOnly) {
      return res.json({ message: '회원 인증에 성공했습니다.' });
    }

    if (!newPassword) {
      return res.status(400).json({ error: '새 비밀번호를 입력해주세요.' });
    }

    // 2. Hash and Update Password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    // 3. Audit Log
    await prisma.auditLog.create({
      data: {
        targetUserId: user.id,
        action: 'PASSWORD_RESET_VIA_FORGOT_SECURE',
        details: { message: 'User reset password after successful identity verification.' }
      }
    });

    res.json({ message: '비밀번호가 성공적으로 초기화되었습니다. 새로운 비밀번호로 로그인해 주세요.' });
  } catch (error) {
    console.error('[Auth Reset Password Error]', error);
    res.status(500).json({ error: '비밀번호 초기화 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
