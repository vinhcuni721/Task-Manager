const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database");
const { ACCESS_TOKEN_EXPIRES_IN, JWT_SECRET, requireAuth } = require("../middleware/auth");
const { sendLoginOtpEmail, sendPasswordResetEmail } = require("../services/email");
const { createRefreshToken, hashToken } = require("../services/tokens");
const {
  countRecentFailedAttempts,
  createSecurityEvent,
  maybeTriggerAbnormalLoginAlert,
  recordLoginAttempt,
} = require("../services/security");

const router = express.Router();

const REFRESH_TOKEN_TTL_MS = Math.max(24 * 60 * 60 * 1000, Number(process.env.REFRESH_TOKEN_TTL_MS || 30 * 24 * 60 * 60 * 1000));
const PASSWORD_POLICY_STRICT = String(process.env.PASSWORD_POLICY_STRICT || "true").toLowerCase() === "true";
const PASSWORD_MAX_AGE_DAYS = Math.max(1, Number(process.env.PASSWORD_MAX_AGE_DAYS || 90));
const TWO_FACTOR_REQUIRED_FOR_PRIVILEGED =
  String(process.env.TWO_FACTOR_REQUIRED_FOR_PRIVILEGED || "false").toLowerCase() === "true";
const AUTH_OTP_TTL_MS = Math.max(60 * 1000, Number(process.env.AUTH_OTP_TTL_MS || 5 * 60 * 1000));
const AUTH_OTP_MAX_ATTEMPTS = Math.max(2, Number(process.env.AUTH_OTP_MAX_ATTEMPTS || 5));
const ALLOW_DEV_OTP_FALLBACK = String(process.env.ALLOW_DEV_OTP_FALLBACK || "true").toLowerCase() === "true";

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createAccessToken(user, sessionId = null) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sid: sessionId || null,
      token_type: "access",
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    }
  );
}

function createSession(userId, refreshTokenHash, req) {
  const now = Date.now();
  const expiresAt = now + REFRESH_TOKEN_TTL_MS;
  const result = db
    .prepare(
      `INSERT INTO auth_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at, revoked_at, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(userId, refreshTokenHash, req.get("user-agent") || null, req.ip || null, expiresAt, now, now);

  return {
    id: Number(result.lastInsertRowid),
    expires_at: expiresAt,
  };
}

function issueAuthTokens(user, req) {
  const refresh = createRefreshToken();
  const session = createSession(user.id, refresh.hash, req);
  const accessToken = createAccessToken(user, session.id);
  return {
    token: accessToken,
    access_token: accessToken,
    refresh_token: refresh.raw,
    access_expires_in: ACCESS_TOKEN_EXPIRES_IN,
    refresh_expires_at: new Date(session.expires_at).toISOString(),
    session_id: session.id,
  };
}

function revokeSessionById(sessionId) {
  db.prepare("UPDATE auth_sessions SET revoked_at = ?, last_used_at = ? WHERE id = ?").run(Date.now(), Date.now(), sessionId);
}

function revokeSessionByRefreshToken(refreshToken) {
  const hash = hashToken(refreshToken);
  db.prepare("UPDATE auth_sessions SET revoked_at = ?, last_used_at = ? WHERE refresh_token_hash = ?").run(Date.now(), Date.now(), hash);
}

function mapPublicUser(userRecord) {
  return {
    id: userRecord.id,
    name: userRecord.name,
    email: userRecord.email,
    role: userRecord.role,
    created_at: userRecord.created_at,
  };
}

function extractRefreshToken(req) {
  const bodyToken = String(req.body?.refresh_token || "").trim();
  const headerToken = String(req.headers["x-refresh-token"] || "").trim();
  const authHeader = String(req.headers.authorization || "");
  const match = authHeader.match(/^Refresh\s+(.+)$/i);
  const authToken = match ? String(match[1] || "").trim() : "";
  return bodyToken || headerToken || authToken;
}

function toIsoFromMillisOrDateText(value) {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  if (Number.isFinite(numberValue) && numberValue > 0) {
    const date = new Date(numberValue);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const text = String(value).trim();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function ensurePasswordPolicy(password) {
  if (!PASSWORD_POLICY_STRICT) {
    if (password.length < 6) throw new Error("Password must be at least 6 characters");
    return;
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Password must include a lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must include an uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    throw new Error("Password must include a number");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must include a special character");
  }
}

function isPasswordExpired(userRecord) {
  if (!userRecord?.password_changed_at) return false;
  const changedAt = new Date(userRecord.password_changed_at);
  if (Number.isNaN(changedAt.getTime())) return false;
  const ageMs = Date.now() - changedAt.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return ageDays > PASSWORD_MAX_AGE_DAYS;
}

function shouldRequire2FA(userRecord) {
  if (!userRecord) return false;
  if (Number(userRecord.two_factor_enabled) === 1) return true;
  if (TWO_FACTOR_REQUIRED_FOR_PRIVILEGED && (userRecord.role === "admin" || userRecord.role === "manager")) return true;
  return false;
}

function createOtpChallenge({ userId, email, req }) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const challengeToken = `tf2fa_${crypto.randomBytes(18).toString("hex")}`;
  const now = Date.now();
  const expiresAt = now + AUTH_OTP_TTL_MS;

  db.prepare(
    `INSERT INTO auth_otp_challenges (user_id, challenge_token, otp_hash, expires_at, attempts, consumed_at, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?)`
  ).run(userId, challengeToken, hashText(code), expiresAt, req.ip || null, req.get("user-agent") || null, now);

  return {
    challenge_token: challengeToken,
    otp_code: code,
    expires_at: expiresAt,
    expires_in_seconds: Math.floor(AUTH_OTP_TTL_MS / 1000),
    email,
  };
}

async function issue2FAChallenge({ userRecord, email, req }) {
  const challenge = createOtpChallenge({ userId: userRecord.id, email, req });
  let deliveryMode = "email";
  let emailSent = false;
  try {
    await sendLoginOtpEmail({
      to: userRecord.email,
      name: userRecord.name,
      code: challenge.otp_code,
      expiresMinutes: Math.max(1, Math.round(AUTH_OTP_TTL_MS / 60000)),
    });
    emailSent = true;
  } catch (error) {
    if (!ALLOW_DEV_OTP_FALLBACK) {
      throw error;
    }
    deliveryMode = "dev_fallback";
    createSecurityEvent({
      type: "auth_otp_email_delivery_failed",
      severity: "warning",
      userId: userRecord.id,
      email,
      details: { error: error.message || "Failed to send OTP email" },
    });
  }

  return {
    requires_2fa: true,
    challenge_token: challenge.challenge_token,
    expires_in_seconds: challenge.expires_in_seconds,
    delivery: deliveryMode,
    email_sent: emailSent,
    ...(deliveryMode === "dev_fallback" ? { dev_otp_code: challenge.otp_code } : {}),
  };
}

router.post("/register", (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const name = normalizeText(req.body?.name) || email.split("@")[0] || "User";

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    ensurePasswordPolicy(password);

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const userCount = db.prepare("SELECT COUNT(*) AS value FROM users").get().value;
    const role = userCount === 0 ? "admin" : "member";
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, last_login_at, password_changed_at, two_factor_enabled, two_factor_email_enabled)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 1)`
      )
      .run(name, email, passwordHash, role);

    const user = db.prepare("SELECT id, name, email, role, created_at FROM users WHERE id = ?").get(result.lastInsertRowid);
    const tokens = issueAuthTokens(user, req);
    recordLoginAttempt({ email, ipAddress: req.ip, success: true });

    return res.status(201).json({ data: { ...tokens, user: mapPublicUser(user) } });
  } catch (error) {
    if (String(error.message || "").includes("Password")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to register account" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const failedAttempts = countRecentFailedAttempts(email);
    if (failedAttempts >= 10) {
      maybeTriggerAbnormalLoginAlert({ email, ipAddress: req.ip });
      return res.status(429).json({ error: "Too many failed attempts. Please try again later." });
    }

    const userRecord = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!userRecord) {
      recordLoginAttempt({ email, ipAddress: req.ip, success: false });
      maybeTriggerAbnormalLoginAlert({ email, ipAddress: req.ip });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const validPassword = bcrypt.compareSync(password, userRecord.password_hash);
    if (!validPassword) {
      recordLoginAttempt({ email, ipAddress: req.ip, success: false });
      maybeTriggerAbnormalLoginAlert({ email, ipAddress: req.ip });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (isPasswordExpired(userRecord)) {
      createSecurityEvent({
        type: "password_expired_login_blocked",
        severity: "warning",
        userId: userRecord.id,
        email,
        details: { max_age_days: PASSWORD_MAX_AGE_DAYS },
      });
      return res.status(403).json({
        error: "Password expired. Please reset password.",
        code: "PASSWORD_EXPIRED",
      });
    }

    if (shouldRequire2FA(userRecord)) {
      const challengePayload = await issue2FAChallenge({ userRecord, email, req });
      return res.json({ data: challengePayload });
    }

    const user = mapPublicUser(userRecord);
    const tokens = issueAuthTokens(user, req);
    recordLoginAttempt({ email, ipAddress: req.ip, success: true });
    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    return res.json({ data: { ...tokens, user } });
  } catch (error) {
    return res.status(500).json({ error: "Failed to login" });
  }
});

router.post("/verify-2fa", (req, res) => {
  try {
    const challengeToken = String(req.body?.challenge_token || "").trim();
    const code = String(req.body?.code || "").trim();
    if (!challengeToken || !code) {
      return res.status(400).json({ error: "challenge_token and code are required" });
    }

    const challenge = db
      .prepare(
        `SELECT *
         FROM auth_otp_challenges
         WHERE challenge_token = ?
           AND consumed_at IS NULL
           AND expires_at > ?`
      )
      .get(challengeToken, Date.now());

    if (!challenge) {
      return res.status(400).json({ error: "Invalid or expired challenge token" });
    }

    if (Number(challenge.attempts || 0) >= AUTH_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: "Too many invalid OTP attempts" });
    }

    const inputHash = hashText(code);
    if (inputHash !== challenge.otp_hash) {
      db.prepare("UPDATE auth_otp_challenges SET attempts = attempts + 1 WHERE id = ?").run(challenge.id);
      createSecurityEvent({
        type: "auth_otp_invalid_code",
        severity: "warning",
        userId: challenge.user_id,
        details: {
          challenge_id: challenge.id,
          attempts: Number(challenge.attempts || 0) + 1,
          ip_address: challenge.ip_address || "",
        },
      });
      return res.status(401).json({ error: "Invalid verification code" });
    }

    db.prepare("UPDATE auth_otp_challenges SET consumed_at = ? WHERE id = ?").run(Date.now(), challenge.id);
    const userRecord = db.prepare("SELECT * FROM users WHERE id = ?").get(challenge.user_id);
    if (!userRecord) return res.status(404).json({ error: "User not found" });

    if (isPasswordExpired(userRecord)) {
      return res.status(403).json({
        error: "Password expired. Please reset password.",
        code: "PASSWORD_EXPIRED",
      });
    }

    const user = mapPublicUser(userRecord);
    const tokens = issueAuthTokens(user, req);
    recordLoginAttempt({ email: user.email, ipAddress: req.ip, success: true });
    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    return res.json({ data: { ...tokens, user } });
  } catch (error) {
    return res.status(500).json({ error: "Failed to verify 2FA code" });
  }
});

router.post("/refresh", (req, res) => {
  try {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    const refreshHash = hashToken(refreshToken);
    const session = db
      .prepare(
        `SELECT s.*, u.id AS user_id, u.name, u.email, u.role, u.created_at
         FROM auth_sessions s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.refresh_token_hash = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > ?`
      )
      .get(refreshHash, Date.now());

    if (!session || !session.user_id) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    revokeSessionById(session.id);

    const user = {
      id: session.user_id,
      name: session.name,
      email: session.email,
      role: session.role,
      created_at: session.created_at,
    };
    const tokens = issueAuthTokens(user, req);

    return res.json({ data: { ...tokens, user } });
  } catch (error) {
    return res.status(500).json({ error: "Failed to refresh session" });
  }
});

router.post("/logout", requireAuth, (req, res) => {
  try {
    const refreshToken = extractRefreshToken(req);
    if (refreshToken) {
      revokeSessionByRefreshToken(refreshToken);
    }

    const sessionId = Number(req.jwtPayload?.sid);
    if (Number.isInteger(sessionId) && sessionId > 0) {
      revokeSessionById(sessionId);
    }

    return res.json({ message: "Logged out" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to logout" });
  }
});

router.post("/logout-all", requireAuth, (req, res) => {
  try {
    db.prepare("UPDATE auth_sessions SET revoked_at = ?, last_used_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(
      Date.now(),
      Date.now(),
      req.user.id
    );
    return res.json({ message: "All sessions revoked" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to revoke sessions" });
  }
});

router.get("/sessions", requireAuth, (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, user_agent, ip_address, expires_at, revoked_at, last_used_at, created_at
         FROM auth_sessions
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .all(req.user.id)
      .map((item) => ({
        ...item,
        expires_at: toIsoFromMillisOrDateText(item.expires_at),
        revoked_at: toIsoFromMillisOrDateText(item.revoked_at),
        last_used_at: toIsoFromMillisOrDateText(item.last_used_at),
        created_at: toIsoFromMillisOrDateText(item.created_at),
      }));

    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.delete("/sessions/:id", requireAuth, (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: "Invalid session id" });
    }

    const existing = db.prepare("SELECT id, user_id FROM auth_sessions WHERE id = ?").get(sessionId);
    if (!existing) return res.status(404).json({ error: "Session not found" });

    if (Number(existing.user_id) !== Number(req.user.id) && req.user.role !== "admin") {
      return res.status(403).json({ error: "No permission to revoke this session" });
    }

    revokeSessionById(sessionId);
    return res.json({ message: "Session revoked" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to revoke session" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const user = db
      .prepare("SELECT id, name, email FROM users WHERE email = ?")
      .get(email);

    if (!user) {
      return res.json({
        message: "If this email exists, a reset link has been sent.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    db.prepare("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?").run(tokenHash, expiresAt, user.id);

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetLink,
      expiresMinutes: 60,
    });

    return res.json({
      message: "If this email exists, a reset link has been sent.",
    });
  } catch (error) {
    if (error.message === "SMTP configuration is missing") {
      return res.status(500).json({ error: "Email service is not configured on server" });
    }
    return res.status(500).json({ error: "Failed to process forgot password request" });
  }
});

router.post("/reset-password", (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    ensurePasswordPolicy(password);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = db
      .prepare(
        "SELECT id FROM users WHERE reset_token_hash = ? AND reset_token_expires_at IS NOT NULL AND reset_token_expires_at > ?"
      )
      .get(tokenHash, Date.now());

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare(
      `UPDATE users
       SET password_hash = ?,
           password_changed_at = CURRENT_TIMESTAMP,
           reset_token_hash = NULL,
           reset_token_expires_at = NULL
       WHERE id = ?`
    ).run(passwordHash, user.id);

    db.prepare("UPDATE auth_sessions SET revoked_at = ?, last_used_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(
      Date.now(),
      Date.now(),
      user.id
    );

    return res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    if (String(error.message || "").includes("Password")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

router.get("/security-settings", requireAuth, (req, res) => {
  try {
    const user = db
      .prepare(
        `SELECT id, email, role, two_factor_enabled, two_factor_email_enabled, password_changed_at
         FROM users
         WHERE id = ?`
      )
      .get(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const passwordExpired = isPasswordExpired(user);
    return res.json({
      data: {
        two_factor_enabled: Number(user.two_factor_enabled) === 1,
        two_factor_email_enabled: Number(user.two_factor_email_enabled) === 1,
        password_changed_at: user.password_changed_at || null,
        password_expired: passwordExpired,
        password_max_age_days: PASSWORD_MAX_AGE_DAYS,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch security settings" });
  }
});

router.put("/security-settings", requireAuth, (req, res) => {
  try {
    const twoFactorEnabled = req.body?.two_factor_enabled;
    const twoFactorEmailEnabled = req.body?.two_factor_email_enabled;
    const updates = [];
    const params = { id: req.user.id };

    if (twoFactorEnabled !== undefined) {
      updates.push("two_factor_enabled = @two_factor_enabled");
      params.two_factor_enabled = String(twoFactorEnabled).toLowerCase() === "true" || Number(twoFactorEnabled) === 1 ? 1 : 0;
    }

    if (twoFactorEmailEnabled !== undefined) {
      updates.push("two_factor_email_enabled = @two_factor_email_enabled");
      params.two_factor_email_enabled =
        String(twoFactorEmailEnabled).toLowerCase() === "true" || Number(twoFactorEmailEnabled) === 1 ? 1 : 0;
    }

    if (updates.length === 0) return res.status(400).json({ error: "No valid settings to update" });

    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = @id`).run(params);
    return res.json({ message: "Security settings updated" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update security settings" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  try {
    const user = db
      .prepare(
        `SELECT id, name, email, role, created_at, last_login_at,
                two_factor_enabled, two_factor_email_enabled, password_changed_at
         FROM users WHERE id = ?`
      )
      .get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ data: user });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

module.exports = router;
