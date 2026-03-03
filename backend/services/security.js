const db = require("../database");
const { publishNotification } = require("../events");

function recordLoginAttempt({ email, ipAddress, success }) {
  db.prepare(
    `INSERT INTO auth_login_attempts (email, ip_address, success, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(String(email || "").trim().toLowerCase(), ipAddress || null, success ? 1 : 0, Date.now());
}

function countRecentFailedAttempts(email, windowMs = 15 * 60 * 1000) {
  const since = Date.now() - windowMs;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS value
       FROM auth_login_attempts
       WHERE email = ?
         AND success = 0
         AND created_at >= ?`
    )
    .get(String(email || "").trim().toLowerCase(), since);
  return Number(row?.value || 0);
}

function createSecurityEvent({ type, severity = "warning", userId = null, email = "", details = {} }) {
  db.prepare(
    `INSERT INTO security_events (type, severity, user_id, email, details_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(type, severity, userId || null, String(email || "").trim().toLowerCase() || null, JSON.stringify(details || {}));
}

function notifyAdminsSecurityEvent(message, details = {}) {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  const userIds = admins.map((item) => Number(item.id)).filter((value) => Number.isInteger(value) && value > 0);
  if (userIds.length === 0) return;

  publishNotification({
    type: "security_alert",
    title: "Security alert",
    message,
    details: JSON.stringify(details),
    user_ids: userIds,
  });
}

function maybeTriggerAbnormalLoginAlert({ email, ipAddress }) {
  const failedAttempts = countRecentFailedAttempts(email);
  if (failedAttempts < 5) return;

  createSecurityEvent({
    type: "abnormal_login_attempts",
    severity: "high",
    email,
    details: {
      failed_attempts_15m: failedAttempts,
      ip_address: ipAddress || "",
    },
  });

  notifyAdminsSecurityEvent(`Abnormal failed logins for ${email}`, {
    failed_attempts_15m: failedAttempts,
    ip_address: ipAddress || "",
  });
}

function listSecurityEvents({ limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT *
       FROM security_events
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(200, Number(limit) || 50)))
    .map((item) => ({
      ...item,
      details_json: item.details_json ? JSON.parse(item.details_json) : null,
    }));
}

function cleanupSecurityData({
  loginAttemptsRetentionDays = 30,
  revokedSessionsRetentionDays = 30,
  securityEventsRetentionDays = 180,
} = {}) {
  const now = Date.now();
  const loginCutoff = now - Math.max(1, Number(loginAttemptsRetentionDays) || 30) * 24 * 60 * 60 * 1000;
  const sessionCutoff = now - Math.max(1, Number(revokedSessionsRetentionDays) || 30) * 24 * 60 * 60 * 1000;
  const securityCutoffIso = new Date(
    now - Math.max(1, Number(securityEventsRetentionDays) || 180) * 24 * 60 * 60 * 1000
  ).toISOString();

  const deleteAttempts = db.prepare("DELETE FROM auth_login_attempts WHERE created_at < ?");
  const deleteSessions = db.prepare(
    `DELETE FROM auth_sessions
     WHERE (revoked_at IS NOT NULL AND revoked_at < @session_cutoff)
        OR (expires_at < @now)`
  );
  const deleteEvents = db.prepare("DELETE FROM security_events WHERE datetime(created_at) < datetime(?)");
  const deleteOtpChallenges = db.prepare(
    `DELETE FROM auth_otp_challenges
     WHERE consumed_at IS NOT NULL
        OR expires_at < ?`
  );

  const tx = db.transaction(() => {
    const attemptsResult = deleteAttempts.run(loginCutoff);
    const sessionsResult = deleteSessions.run({ session_cutoff: sessionCutoff, now });
    const eventsResult = deleteEvents.run(securityCutoffIso);
    const otpResult = deleteOtpChallenges.run(now);
    return {
      deleted_login_attempts: Number(attemptsResult.changes || 0),
      deleted_sessions: Number(sessionsResult.changes || 0),
      deleted_security_events: Number(eventsResult.changes || 0),
      deleted_otp_challenges: Number(otpResult.changes || 0),
    };
  });

  return tx();
}

module.exports = {
  recordLoginAttempt,
  countRecentFailedAttempts,
  createSecurityEvent,
  maybeTriggerAbnormalLoginAlert,
  listSecurityEvents,
  cleanupSecurityData,
};
