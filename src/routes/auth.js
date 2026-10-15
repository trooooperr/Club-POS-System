const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const { generateToken, generateRefreshToken, hashRefreshToken, requireAuth } = require('../middleware/auth');
const { getDeviceDetails, resolveLocation } = require('../lib/deviceInfo');
const nodemailer = require('nodemailer');
const ROLE_HIERARCHY = {
  admin: { level: 3 },
  manager: { level: 2 },
  staff: { level: 1 }
};

const REFRESH_COOKIE_NAME = 'humtum_refresh_token';

function setRefreshCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
}

function clearRefreshCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/'
  });
}

// ── Login ───────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const loginIdentity = username.toLowerCase().trim();
    const user = await User.findOne({
      $or: [
        { username: loginIdentity },
        { email: loginIdentity },
      ]
    });

    // Use a single generic message for both "user not found" and "wrong password"
    // to prevent username enumeration attacks.
    const GENERIC_AUTH_ERROR = 'Invalid credentials. Please check your username and password.';

    if (!user) {
      return res.status(401).json({ error: GENERIC_AUTH_ERROR });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account disabled. Please contact administrator.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: GENERIC_AUTH_ERROR });
    }

    // Device & Location info
    const device = getDeviceDetails(req);
    const location = await resolveLocation(device.ip);
    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    const accessToken  = generateToken(user, sessionId);
    const { raw: refreshTokenRaw, hash: refreshTokenHash, expiresAt: refreshTokenExp } = generateRefreshToken();

    // Maintain unique device sessions array (prune expired & keep unique devices)
    const now = new Date();
    let activeSessions = (user.sessions || []).filter(s => s.expiresAt > now);

    let cleanDeviceName = device.deviceName || 'Web Browser';
    if (cleanDeviceName.includes('Apple Macintosh') || cleanDeviceName.includes('(macOS 10)')) {
      cleanDeviceName = cleanDeviceName.replace(/on Apple Macintosh.*$/, 'on Mac').trim();
    }

    // Check if an active session already exists for this unique device (same deviceName & deviceType)
    const existingIndex = activeSessions.findIndex(s => {
      const sName = (s.deviceName || '').trim().toLowerCase();
      const dName = cleanDeviceName.trim().toLowerCase();
      return (sName === dName && (s.deviceType || 'desktop') === (device.deviceType || 'desktop')) ||
             (s.userAgent && device.userAgent && s.userAgent === device.userAgent);
    });

    if (existingIndex !== -1) {
      // Existing device: update session token, IP, location, and latest activity time,
      // while PRESERVING the original createdAt (time of first use / login)!
      const existing = activeSessions[existingIndex];
      existing.sessionId = sessionId;
      existing.refreshTokenHash = refreshTokenHash;
      existing.prevRefreshTokenHash = '';
      existing.expiresAt = refreshTokenExp;
      existing.ip = device.ip;
      existing.location = location;
      existing.userAgent = device.userAgent;
      existing.deviceName = cleanDeviceName;
      existing.deviceType = device.deviceType;
      existing.lastActive = now;
      // Note: existing.createdAt is kept as the original first login timestamp!
    } else {
      if (activeSessions.length >= 25) {
        activeSessions.shift(); // Evict oldest
      }
      activeSessions.push({
        sessionId,
        refreshTokenHash,
        prevRefreshTokenHash: '',
        expiresAt: refreshTokenExp,
        ip: device.ip,
        location,
        userAgent: device.userAgent,
        deviceName: cleanDeviceName,
        deviceType: device.deviceType,
        lastActive: now,
        createdAt: now
      });
    }
    user.sessions = activeSessions;

    // Legacy fields for backward compatibility
    user.refreshTokenHash = refreshTokenHash;
    user.refreshTokenExp  = refreshTokenExp;
    await user.save();

    setRefreshCookie(res, refreshTokenRaw);

    res.json({
      success: true,
      token:        accessToken,
      refreshToken: refreshTokenRaw,
      sessionId,
      user: { ...user.toSafeJSON(), mustChangePassword: !!user.mustChangePassword },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ── Refresh Token ────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const incomingHash = hashRefreshToken(refreshToken);

    // Look for user by active session or previous token
    const user = await User.findOne({
      $or: [
        { 'sessions.refreshTokenHash': incomingHash },
        { 'sessions.prevRefreshTokenHash': incomingHash },
        { refreshTokenHash: incomingHash } // legacy
      ],
      isActive: true,
    });

    if (!user) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
    }

    // 🚨 TOKEN REUSE DETECTION
    const reusedSession = (user.sessions || []).find(s => s.prevRefreshTokenHash === incomingHash);
    if (reusedSession) {
      console.warn(`🚨 TOKEN REUSE DETECTED for user ${user.username} on device ${reusedSession.deviceName}! Revoking session.`);
      user.sessions = user.sessions.filter(s => s.sessionId !== reusedSession.sessionId);
      await user.save();
      clearRefreshCookie(res);
      return res.status(401).json({
        error: 'Security alert: Token reuse detected. Device session was invalidated.',
        code: 'TOKEN_REUSE'
      });
    }

    // Find current active session
    let targetSession = (user.sessions || []).find(s => s.refreshTokenHash === incomingHash);
    const now = new Date();

    if (!targetSession) {
      // Legacy fallback conversion
      if (user.refreshTokenHash === incomingHash && user.refreshTokenExp > now) {
        const device = getDeviceDetails(req);
        const location = await resolveLocation(device.ip);
        targetSession = {
          sessionId: crypto.randomBytes(16).toString('hex'),
          refreshTokenHash: incomingHash,
          prevRefreshTokenHash: '',
          expiresAt: user.refreshTokenExp,
          ip: device.ip,
          location,
          userAgent: device.userAgent,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          lastActive: now,
          createdAt: now
        };
        user.sessions = user.sessions || [];
        user.sessions.push(targetSession);
      } else {
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Session not found or expired. Please login again.' });
      }
    }

    if (targetSession.expiresAt < now) {
      user.sessions = (user.sessions || []).filter(s => s.sessionId !== targetSession.sessionId);
      await user.save();
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }

    // Token rotation
    const { raw: newRefreshRaw, hash: newRefreshHash, expiresAt: newRefreshExp } = generateRefreshToken();

    targetSession.prevRefreshTokenHash = incomingHash; // remember for reuse detection
    targetSession.refreshTokenHash = newRefreshHash;
    targetSession.expiresAt = newRefreshExp;
    targetSession.lastActive = now;

    // Refresh client IP & location if device IP changed
    const device = getDeviceDetails(req);
    if (device.ip && device.ip !== targetSession.ip) {
      targetSession.ip = device.ip;
      targetSession.location = await resolveLocation(device.ip);
    }

    user.refreshTokenHash = newRefreshHash;
    user.refreshTokenExp  = newRefreshExp;
    await user.save();

    const newAccessToken = generateToken(user, targetSession.sessionId);
    setRefreshCookie(res, newRefreshRaw);

    res.json({
      success:      true,
      token:        newAccessToken,
      refreshToken: newRefreshRaw,
      sessionId:    targetSession.sessionId
    });
  } catch (err) {
    console.error('Token refresh error:', err.message);
    res.status(500).json({ error: 'Server error during token refresh' });
  }
});

// ── Logout — invalidate current device session ───────────────────
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    const sessionId = req.body?.sessionId;

    if (refreshToken) {
      const hash = hashRefreshToken(refreshToken);
      await User.updateOne(
        { 'sessions.refreshTokenHash': hash },
        { $pull: { sessions: { refreshTokenHash: hash } } }
      );
    } else if (sessionId) {
      await User.updateOne(
        { 'sessions.sessionId': sessionId },
        { $pull: { sessions: { sessionId: sessionId } } }
      );
    }

    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err.message);
    clearRefreshCookie(res);
    res.json({ success: true });
  }
});

// ── Active Sessions Management ──────────────────────────────────
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const currentSessionId = req.headers['x-session-id'] || req.user.sessionId;
    const currentDevice = getDeviceDetails(req);
    const cleanCurrentDeviceName = currentDevice.deviceName ? currentDevice.deviceName.replace(/on Apple Macintosh.*$/, 'on Mac').trim() : '';
    const list = [];

    // Admins see all active sessions across all accounts; others see their own
    const users = req.user.role === 'admin'
      ? await User.find({ 'sessions.0': { $exists: true } })
      : [await User.findById(req.user.id)].filter(Boolean);

    let hasFoundCurrent = false;

    for (const u of users) {
      let rawSessions = (u.sessions || []).filter(s => s.expiresAt > now);

      for (const s of rawSessions) {
        if (currentSessionId && s.sessionId === currentSessionId && currentDevice.ip && currentDevice.ip !== s.ip) {
          s.ip = currentDevice.ip;
          s.location = await resolveLocation(currentDevice.ip);
        }
        if (s.deviceName && (s.deviceName.includes('Apple Macintosh') || s.deviceName.includes('(macOS 10)'))) {
          s.deviceName = s.deviceName.replace(/on Apple Macintosh.*$/, 'on Mac').trim();
        }
        const badCities = ['Gorakhpur', 'Shimla', 'Dadri', 'Kanpur'];
        const hasBadCity = badCities.some(c => s.location?.includes(c));
        if (!s.location || s.location.includes('(Approximate)') || hasBadCity) {
          s.location = await resolveLocation(s.ip);
        }
      }

      // Group by UNIQUE device for this user (keyed by deviceName + deviceType)
      const deviceMap = new Map();
      for (const s of rawSessions) {
        const key = `${(s.deviceName || 'Web Browser').trim().toLowerCase()}___${(s.deviceType || 'desktop').trim().toLowerCase()}`;
        if (!deviceMap.has(key)) {
          deviceMap.set(key, s);
        } else {
          const existing = deviceMap.get(key);
          const isThisCurrent = Boolean(currentSessionId && s.sessionId === currentSessionId);
          const isExistingCurrent = Boolean(currentSessionId && existing.sessionId === currentSessionId);

          const earliestCreated = new Date(Math.min(new Date(existing.createdAt || now).getTime(), new Date(s.createdAt || now).getTime()));
          const latestActive = new Date(Math.max(new Date(existing.lastActive || now).getTime(), new Date(s.lastActive || now).getTime()));

          if (isThisCurrent && !isExistingCurrent) {
            s.createdAt = earliestCreated;
            s.lastActive = latestActive;
            deviceMap.set(key, s);
          } else {
            existing.createdAt = earliestCreated;
            existing.lastActive = latestActive;
            if (new Date(s.lastActive || 0) > new Date(existing.lastActive || 0)) {
              existing.ip = s.ip || existing.ip;
              existing.location = s.location || existing.location;
            }
          }
        }
      }

      const uniqueSessions = Array.from(deviceMap.values());

      for (const s of uniqueSessions) {
        let isCurrent = Boolean(currentSessionId && s.sessionId === currentSessionId);
        if (!isCurrent && !hasFoundCurrent && u._id.toString() === req.user.id.toString()) {
          const sName = (s.deviceName || '').trim().toLowerCase();
          const cName = cleanCurrentDeviceName.trim().toLowerCase();
          if (sName === cName) {
            isCurrent = true;
          }
        }
        if (isCurrent) hasFoundCurrent = true;

        list.push({
          sessionId:  s.sessionId,
          deviceName: s.deviceName || 'Web Browser',
          deviceType: s.deviceType || 'desktop',
          location:   s.location || 'India',
          ip:         s.ip || '',
          createdAt:  s.createdAt,
          lastActive: s.lastActive || s.createdAt,
          isCurrent,
          username:   u.username,
          role:       u.role,
        });
      }

      // Automatically prune duplicate sessions in the database
      if (uniqueSessions.length !== (u.sessions || []).length) {
        u.sessions = uniqueSessions;
        await u.save().catch(() => {});
      }
    }

    // Sort by current session first, then last active descending
    list.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return new Date(b.lastActive) - new Date(a.lastActive);
    });

    res.json({ success: true, sessions: list });
  } catch (err) {
    console.error('Failed to get sessions:', err.message);
    res.status(500).json({ error: 'Failed to retrieve active sessions' });
  }
});

router.delete('/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (req.user.role === 'admin') {
      await User.updateOne(
        { 'sessions.sessionId': sessionId },
        { $pull: { sessions: { sessionId } } }
      );
    } else {
      const user = await User.findById(req.user.id);
      if (user) {
        user.sessions = (user.sessions || []).filter(s => s.sessionId !== sessionId);
        await user.save();
      }
    }

    if (req.user.sessionId === sessionId) {
      clearRefreshCookie(res);
    }

    res.json({ success: true, message: 'Device session logged out successfully' });
  } catch (err) {
    console.error('Failed to revoke session:', err.message);
    res.status(500).json({ error: 'Failed to logout device session' });
  }
});

router.delete('/sessions', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const currentSessionId = req.user.sessionId;
    user.sessions = (user.sessions || []).filter(s => s.sessionId === currentSessionId);
    await user.save();

    res.json({ success: true, message: 'Logged out of all other devices' });
  } catch (err) {
    console.error('Failed to revoke other sessions:', err.message);
    res.status(500).json({ error: 'Failed to revoke other devices' });
  }
});

// ── Get current user ────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update Profile (Username/Email) ─────────────────────────────
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (username) {
      const normalized = username.toLowerCase().trim();
      if (normalized !== user.username) {
        const existing = await User.findOne({ username: normalized });
        if (existing) return res.status(400).json({ error: 'Username already taken' });
        user.username = normalized;
      }
    }
    
    if (password) {
      user.passwordHash = password;
      user.mustChangePassword = false; 
    }

    await user.save();
    res.json({ success: true, user: user.toSafeJSON() });
  } catch (err) {
    console.error('Profile update error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Forgot Password — send OTP via Gmail ────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    // Resolve email config from settings or env
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne() || await Settings.create({});
    
    const { email } = req.body;
    let targetUser = null;
    let recipientEmail = 'shubhampriy11@gmail.com'; // Force all to admin

    if (email && email.includes('@')) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    } else if (email === 'admin_account') {
      targetUser = await User.findOne({ role: 'admin' });
    } else if (email === 'manager_team') {
      targetUser = await User.findOne({ role: 'manager' });
    } else if (email === 'staff_team') {
      targetUser = await User.findOne({ role: 'staff' });
    }

    if (!targetUser) {
      return res.json({ success: true, message: 'Verification code sent to Administrator.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    if (email === 'staff_team') {
       // Store OTP on ALL staff to be safe, or just one
       await User.updateMany({ role: 'staff' }, { resetOtp: otp, resetOtpExp: new Date(Date.now() + 10 * 60 * 1000) });
    } else {
       targetUser.resetOtp = otp;
       targetUser.resetOtpExp = new Date(Date.now() + 10 * 60 * 1000); 
       await targetUser.save();
    }

    const senderEmail = settings.senderEmail || process.env.GMAIL_SENDER;
    const senderPassword = settings.senderPassword || process.env.GMAIL_APP_PASSWORD;

    if (!senderEmail || !senderPassword || !recipientEmail) {
      console.error('Forgot Password error: Email config missing');
      return res.status(500).json({ error: 'Security service unavailable. Please contact Owner.' });
    }

    const transporter = require('nodemailer').createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: senderEmail, pass: senderPassword },
    });

    await transporter.sendMail({
      from: `"HumTum Security" <${senderEmail}>`,
      to: recipientEmail,
      subject: `🔐 Reset Code: ${email === 'admin_account' ? 'Admin' : email === 'staff_team' ? 'Staff' : 'Manager'}`,
      html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#F4F7FA;color:#1A1C21;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#FFFFFF;border:1px solid #E1E4E8;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.05);">
                <tr>
                  <td style="padding:40px 40px 20px 40px;text-align:center;">
                    <h1 style="margin:0;font-size:24px;font-weight:900;color:#1A1C21;letter-spacing:-0.01em;">HUMTUM</h1>
                    <p style="margin:12px 0 0 0;font-size:14px;color:#6A737D;line-height:1.5;">Security Verification</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 40px;text-align:center;">
                    <div style="background-color:#F8FAFC;border-radius:12px;padding:30px;border:1px solid #E2E8F0;">
                      <p style="margin:0 0 16px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748B;font-weight:700;">One-Time Password</p>
                      <div style="font-size:38px;font-weight:800;letter-spacing:8px;color:#0F172A;margin-bottom:10px;font-family:monospace;">${otp}</div>
                      <p style="margin:0;font-size:11px;color:#94A3B8;">Code expires in 10 minutes</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 40px 40px 40px;text-align:center;">
                    <p style="margin:0 0 24px 0;font-size:13px;color:#4A5568;line-height:1.6;">Hello, a request was made to reset the <b>${email === 'admin_account' ? 'Admin' : email === 'staff_team' ? 'Staff' : 'Manager'}</b> password. If this wasn't you, please secure your account.</p>
                    <div style="border-top:1px solid #F1F5F9;padding-top:24px;">
                      <p style="margin:0;font-size:11px;color:#94A3B8;">HumTum POS · Trusted Security System</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
      `
    });

    res.json({ success: true, message: 'If the email exists, an OTP has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// ── Reset Password — verify OTP ─────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!otp || !newPassword) {
      return res.status(400).json({ error: 'Verification code and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    let user = null;
    if (email === 'staff_team') {
       user = await User.findOne({ role: 'staff', resetOtp: otp });
    } else if (email === 'manager_team') {
       user = await User.findOne({ role: 'manager', resetOtp: otp });
    } else {
       user = await User.findOne({ email: email.toLowerCase().trim(), resetOtp: otp });
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    if (!user.resetOtpExp || user.resetOtpExp < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired' });
    }

    if (email === 'staff_team') {
       // UPDATE ALL STAFF
       const salt = await require('bcryptjs').genSalt(12);
       const hashed = await require('bcryptjs').hash(newPassword, salt);
       await User.updateMany({ role: 'staff' }, { 
         passwordHash: hashed,
         resetOtp: '',
         resetOtpExp: undefined
       });
    } else {
       user.passwordHash = newPassword; 
       user.resetOtp = '';
       user.resetOtpExp = undefined;
       await user.save();
    }

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.patch('/reset-worker-password/:id', requireAuth, async (req, res) => {
  try {
    const { newPassword, forceReset, newEmail } = req.body;
    const caller = await User.findById(req.user.id);
    if (!caller) return res.status(401).json({ error: 'Caller account not found' });
    const callerRole = caller.role?.toLowerCase();

    if (req.params.id === 'staff_team') {
       if (callerRole !== 'admin' && callerRole !== 'manager') {
         return res.status(403).json({ error: 'Unauthorized: Only admin or manager can reset staff team password' });
       }
       if (!newPassword || newPassword.length < 6) {
         return res.status(400).json({ error: 'Password must be at least 6 characters' });
       }
       const salt = await require('bcryptjs').genSalt(12);
       const hashed = await require('bcryptjs').hash(newPassword, salt);
       await User.updateMany({ role: 'staff' }, { 
         passwordHash: hashed,
         mustChangePassword: !!forceReset
       });
       return res.json({ success: true, message: 'Team password for all staff updated!' });
    }

    if (req.params.id === 'manager_team') {
       if (callerRole !== 'admin') {
         return res.status(403).json({ error: 'Unauthorized: Only admin can reset manager team password' });
       }
       if (!newPassword || newPassword.length < 6) {
         return res.status(400).json({ error: 'Password must be at least 6 characters' });
       }
       const salt = await require('bcryptjs').genSalt(12);
       const hashed = await require('bcryptjs').hash(newPassword, salt);
       await User.updateMany({ role: 'manager' }, { 
         passwordHash: hashed,
         mustChangePassword: !!forceReset
       });
       return res.json({ success: true, message: 'Manager account updated!' });
    }

    const currentAdmin = caller;
    const targetUser  = await User.findById(req.params.id);

    if (!currentAdmin) return res.status(401).json({ error: 'Administrator account not found' });
    if (!targetUser) return res.status(404).json({ error: 'Target account not found' });

    // Hierarchy check: admin > manager > staff
    const adminLevel = ROLE_HIERARCHY[currentAdmin.role?.toLowerCase()]?.level || 0;
    const userLevel  = ROLE_HIERARCHY[targetUser.role?.toLowerCase()]?.level || 0;

    if (adminLevel <= userLevel && currentAdmin.id !== targetUser.id) {
      return res.status(403).json({ error: 'Unauthorized: You can only manage lower-level roles' });
    }

    // Update Password if provided
    if (newPassword) {
      if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be min 6 chars' });
      targetUser.passwordHash = newPassword;
      targetUser.mustChangePassword = !!forceReset;
    }

    await targetUser.save();
    res.json({ success: true, message: `Account updated successfully` });
  } catch (err) {
    console.error('❌ Reset worker account error:', err);
    res.status(500).json({ 
      error: 'Failed to update account credentials', 
      details: err.message 
    });
  }
});

// ── Toggle Account Status ────────────────────────────────────
router.patch('/status/:id', requireAuth, async (req, res) => {
  try {
    const { isActive } = req.body;
    const currentAdmin = await User.findById(req.user.id);
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Hierarchy check
    const adminLevel = ROLE_HIERARCHY[currentAdmin.role?.toLowerCase()]?.level || 0;
    const userLevel = ROLE_HIERARCHY[targetUser.role?.toLowerCase()]?.level || 0;

    if (adminLevel <= userLevel && currentAdmin.id !== targetUser.id) {
      return res.status(403).json({ error: 'Unauthorized: Only higher roles can disable users' });
    }

    targetUser.isActive = isActive;
    await targetUser.save();

    res.json({ success: true, isActive: targetUser.isActive });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle status' });
  }
});


// ── Seed default users (called on server startup) ───────────────
async function seedDefaultUsers() {
  try {
    console.log('📦 Synchronizing default users...');
    const defaults = [
      { name: 'Owner', username: 'admin', passwordHash: 'admin123', role: 'admin', email: process.env.ADMIN_EMAIL || 'shubhampriy11@gmail.com' },
      { name: 'Manager', username: 'manager', passwordHash: 'manager123', role: 'manager', email: process.env.MANAGER_EMAIL || 'manager@example.com' },
      { name: 'Staff', username: 'staff', passwordHash: 'staff123', role: 'staff', email: process.env.STAFF_EMAIL || 'staff@example.com' },
    ];

    for (const u of defaults) {
      let user = await User.findOne({ username: u.username });
      if (!user) {
        // Before creating, ensure email isn't already taken
        if (u.email) {
          const other = await User.findOne({ email: u.email });
          if (other) {
            console.warn(`⚠️ Email ${u.email} already taken, creating ${u.username} without email.`);
            delete u.email;
          }
        }
        await User.create(u);
        console.log(`👤 Created default user: ${u.username}`);
      } else {
        // FORCIBLY UPDATE ADMIN ROLE AND EMAIL
        if (u.username === 'admin') {
          user.role = 'admin';
          // Check if the target email is already taken by someone ELSE
          if (u.email && user.email !== u.email) {
            const other = await User.findOne({ email: u.email });
            if (other) {
              console.warn(`⚠️ Cannot sync admin email ${u.email}: already taken by ${other.username}`);
            } else {
              user.email = u.email;
            }
          } else if (u.email) {
            user.email = u.email;
          }
          await user.save();
          console.log(`🔄 Synced admin role/email for: ${u.username}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ User seeding failed:', err.message);
  }
}

module.exports = router;
module.exports.seedDefaultUsers = seedDefaultUsers;
