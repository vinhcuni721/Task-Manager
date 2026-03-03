const db = require("../database");

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "confirmPassword",
  "token",
  "reset_token",
  "reset_token_hash",
  "smtp_pass",
  "authorization",
]);

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return "[max_depth]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const next = {};
    Object.entries(value).forEach(([key, nested]) => {
      if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
        next[key] = "***";
      } else {
        next[key] = sanitizeValue(nested, depth + 1);
      }
    });
    return next;
  }
  if (typeof value === "string" && value.length > 1500) {
    return `${value.slice(0, 1500)}...[truncated]`;
  }
  return value;
}

function pickEntity(pathname) {
  const normalized = String(pathname || "")
    .split("?")[0]
    .trim();
  const parts = normalized.split("/").filter(Boolean);
  const apiIndex = parts.indexOf("api");
  const routeParts = apiIndex >= 0 ? parts.slice(apiIndex + 1) : parts;
  if (!routeParts.length) return { entityType: "", entityId: "" };

  const entityType = routeParts[0] || "";
  const idCandidate = routeParts.find((part, index) => index > 0 && /^\d+$/.test(part)) || "";
  return {
    entityType,
    entityId: idCandidate || "",
  };
}

function buildAction(method, pathname) {
  const upperMethod = String(method || "GET").toUpperCase();
  const cleanPath = String(pathname || "/")
    .replace(/^\/api\//, "")
    .replace(/\/\d+/g, "/:id")
    .replace(/\/+/g, "/")
    .replace(/^\//, "");
  return `${upperMethod} ${cleanPath || "/"}`;
}

function writeAuditLog(payload) {
  db.prepare(
    `INSERT INTO audit_logs (
      user_id,
      actor_email,
      action,
      entity_type,
      entity_id,
      method,
      path,
      status_code,
      request_json,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    payload.user_id || null,
    payload.actor_email || null,
    payload.action || "UNKNOWN",
    payload.entity_type || null,
    payload.entity_id || null,
    payload.method || "GET",
    payload.path || "/",
    Number(payload.status_code) || 0,
    payload.request_json ? JSON.stringify(payload.request_json) : null,
    payload.metadata_json ? JSON.stringify(payload.metadata_json) : null
  );
}

function createAuditMiddleware() {
  return (req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();
    if (req.path === "/api/notifications/stream") return next();

    const startedAt = Date.now();
    const path = req.originalUrl || req.path || "/";
    const { entityType, entityId } = pickEntity(path);
    const action = buildAction(method, path);
    const requestPayload = sanitizeValue({
      params: req.params || {},
      query: req.query || {},
      body: req.body || {},
    });

    res.on("finish", () => {
      try {
        if (res.statusCode < 200 || res.statusCode >= 600) return;

        writeAuditLog({
          user_id: req.user?.id || null,
          actor_email: req.user?.email || "",
          action,
          entity_type: entityType,
          entity_id: entityId,
          method,
          path,
          status_code: res.statusCode,
          request_json: requestPayload,
          metadata_json: {
            duration_ms: Date.now() - startedAt,
            ip: req.ip || "",
            user_agent: req.get("user-agent") || "",
          },
        });
      } catch (error) {
        // Never block API response when audit logging fails.
      }
    });

    return next();
  };
}

module.exports = {
  createAuditMiddleware,
  writeAuditLog,
  sanitizeValue,
};
