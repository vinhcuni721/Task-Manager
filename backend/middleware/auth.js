const jwt = require("jsonwebtoken");
const db = require("../database");
const { hashToken } = require("../services/tokens");

const JWT_SECRET = process.env.JWT_SECRET || "taskflow-dev-secret-change-me";
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "30m";

function parseScopes(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  const apiTokenHeader = String(req.headers["x-api-token"] || "").trim();
  const presentedApiToken = apiTokenHeader || (scheme === "Bearer" && token && token.startsWith("tfpat_") ? token : "");

  if (presentedApiToken) {
    try {
      const tokenHash = hashToken(presentedApiToken);
      const nowIso = new Date().toISOString();
      const apiToken = db
        .prepare(
          `SELECT *
           FROM api_tokens
           WHERE token_hash = ?
             AND revoked_at IS NULL
             AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`
        )
        .get(tokenHash);

      if (!apiToken) {
        return res.status(401).json({ error: "Invalid API token" });
      }

      const user = db
        .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
        .get(apiToken.created_by_user_id);
      if (!user) {
        return res.status(401).json({ error: "API token owner not found" });
      }

      db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(nowIso, apiToken.id);
      req.user = user;
      req.authType = "api_token";
      req.apiToken = {
        id: apiToken.id,
        name: apiToken.name,
        scopes: parseScopes(apiToken.scopes_json),
      };
      return next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid API token" });
    }
  }

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.token_type && payload.token_type !== "access") {
      return res.status(401).json({ error: "Invalid token type" });
    }
    const user = db
      .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
      .get(payload.id);
    if (!user) {
      return res.status(401).json({ error: "User account not found" });
    }
    req.user = user;
    req.authType = "access_token";
    req.jwtPayload = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = {
  requireAuth,
  JWT_SECRET,
  ACCESS_TOKEN_EXPIRES_IN,
};
