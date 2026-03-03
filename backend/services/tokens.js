const crypto = require("crypto");

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createApiToken() {
  const raw = `tfpat_${randomToken(24)}`;
  const prefix = raw.slice(0, 12);
  const hash = hashToken(raw);
  return { raw, prefix, hash };
}

function createRefreshToken() {
  const raw = `tfrt_${randomToken(32)}`;
  const hash = hashToken(raw);
  return { raw, hash };
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  randomToken,
  hashToken,
  createApiToken,
  createRefreshToken,
  timingSafeEqualText,
};
