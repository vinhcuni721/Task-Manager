const express = require("express");
const db = require("../database");
const { createBackup, listBackups, restoreBackupAndRestart } = require("../services/backup");
const { isManagerOrAdmin } = require("../services/rbac");
const { createApiToken } = require("../services/tokens");
const { dispatchWebhookById } = require("../services/webhooks");
const { listSecurityEvents, createSecurityEvent, cleanupSecurityData } = require("../services/security");
const { runSlaEscalations } = require("../services/sla");
const { VALID_TRIGGERS, listAutomationRules, runAutomationForTaskEvent, runAutomationBatch } = require("../services/automations");

const router = express.Router();

const API_TOKEN_SCOPE_ALLOWLIST = [
  "*",
  "tasks:read",
  "tasks:write",
  "projects:read",
  "projects:write",
  "incidents:read",
  "incidents:write",
  "users:read",
  "users:write",
  "system:read",
  "system:write",
];

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function parseId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim().toLowerCase();
  if (text === "1" || text === "true" || text === "yes") return true;
  if (text === "0" || text === "false" || text === "no") return false;
  return fallback;
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseJson(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return fallback;
  }
}

function toSafeScopes(input) {
  const scopes = parseArray(input)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (scopes.length === 0) return [];
  const deduped = [...new Set(scopes)];
  return deduped.filter((scope) => API_TOKEN_SCOPE_ALLOWLIST.includes(scope));
}

function parseFutureDate(days) {
  if (days === undefined || days === null || days === "") return null;
  const parsed = Number(days);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 3650) return null;
  const date = new Date(Date.now() + parsed * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function parseWebhookEventTypes(value) {
  const eventTypes = parseArray(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 100);
  return [...new Set(eventTypes)];
}

function parseAutomationTrigger(value, fallback = "task.updated") {
  const trigger = String(value || "").trim();
  if (!trigger) return fallback;
  return VALID_TRIGGERS.includes(trigger) ? trigger : fallback;
}

function parseAutomationJsonField(value, fieldName) {
  const parsed = parseJson(value, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return parsed;
}

function parseWebhookUrl(urlText) {
  const text = normalizeText(urlText);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

function ensureAdmin(req, res) {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin permission required" });
    return false;
  }
  return true;
}

function ensureManager(req, res) {
  if (!isManagerOrAdmin(req.user)) {
    res.status(403).json({ error: "Manager or admin permission required" });
    return false;
  }
  return true;
}

function hasSystemScope(req, requiredScope) {
  if (req.authType !== "api_token") return true;
  const scopes = Array.isArray(req.apiToken?.scopes) ? req.apiToken.scopes : [];
  return scopes.includes("*") || scopes.includes(requiredScope);
}

function ensureSystemScope(req, res, requiredScope) {
  if (hasSystemScope(req, requiredScope)) return true;
  res.status(403).json({ error: `API token scope '${requiredScope}' is required` });
  return false;
}

function parseStoredJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

router.get("/backups", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:read")) return;
    if (!ensureAdmin(req, res)) return;
    const backups = listBackups();
    return res.json({ data: backups });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list backups" });
  }
});

router.post("/backups", async (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureAdmin(req, res)) return;
    const backup = await createBackup({
      label: "manual",
      triggeredByUserId: req.user.id,
    });
    return res.status(201).json({ data: backup });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create backup" });
  }
});

router.post("/backups/:fileName/restore", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureAdmin(req, res)) return;
    const result = restoreBackupAndRestart(req.params.fileName);
    return res.json({
      data: result,
      message: "Backup restored. Server will restart now.",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to restore backup" });
  }
});

router.get("/api-tokens", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:read")) return;
    const showAll = parseBoolean(req.query.all, false) && req.user.role === "admin";
    const sql = showAll
      ? `SELECT t.*, u.name AS owner_name, u.email AS owner_email
         FROM api_tokens t
         LEFT JOIN users u ON u.id = t.created_by_user_id
         ORDER BY datetime(t.created_at) DESC, t.id DESC`
      : `SELECT t.*, u.name AS owner_name, u.email AS owner_email
         FROM api_tokens t
         LEFT JOIN users u ON u.id = t.created_by_user_id
         WHERE t.created_by_user_id = ?
         ORDER BY datetime(t.created_at) DESC, t.id DESC`;
    const rows = showAll ? db.prepare(sql).all() : db.prepare(sql).all(req.user.id);
    return res.json({
      data: rows.map((item) => ({
        id: item.id,
        name: item.name,
        prefix: item.prefix,
        scopes: parseStoredJsonArray(item.scopes_json),
        owner_user_id: item.created_by_user_id,
        owner_name: item.owner_name,
        owner_email: item.owner_email,
        last_used_at: item.last_used_at,
        expires_at: item.expires_at,
        revoked_at: item.revoked_at,
        created_at: item.created_at,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to list API tokens" });
  }
});

router.post("/api-tokens", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    const name = normalizeText(req.body?.name);
    if (!name) return res.status(400).json({ error: "Token name is required" });

    const requestedOwnerId = parseId(req.body?.owner_user_id);
    const ownerUserId = req.user.role === "admin" && requestedOwnerId ? requestedOwnerId : req.user.id;
    if (req.user.role !== "admin" && requestedOwnerId && requestedOwnerId !== req.user.id) {
      return res.status(403).json({ error: "Only admin can create token for another user" });
    }

    const owner = db.prepare("SELECT id FROM users WHERE id = ?").get(ownerUserId);
    if (!owner) return res.status(404).json({ error: "Owner user not found" });

    const scopes = toSafeScopes(req.body?.scopes);
    const expiresAt = parseFutureDate(req.body?.expires_in_days);
    const token = createApiToken();

    const result = db
      .prepare(
        `INSERT INTO api_tokens (name, token_hash, prefix, scopes_json, created_by_user_id, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(name, token.hash, token.prefix, JSON.stringify(scopes), ownerUserId, expiresAt);

    return res.status(201).json({
      data: {
        id: Number(result.lastInsertRowid),
        name,
        token: token.raw,
        prefix: token.prefix,
        scopes,
        owner_user_id: ownerUserId,
        expires_at: expiresAt,
      },
      message: "Copy and store this API token now. It will not be shown again.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create API token" });
  }
});

router.delete("/api-tokens/:id", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid token id" });

    const existing = db.prepare("SELECT id, created_by_user_id FROM api_tokens WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "API token not found" });
    if (req.user.role !== "admin" && Number(existing.created_by_user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "No permission to revoke this token" });
    }

    db.prepare("UPDATE api_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return res.json({ message: "API token revoked" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to revoke API token" });
  }
});

router.get("/webhooks", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:read")) return;
    if (!ensureManager(req, res)) return;
    const rows = db
      .prepare(
        `SELECT w.*, u.name AS created_by_name, u.email AS created_by_email
         FROM webhook_endpoints w
         LEFT JOIN users u ON u.id = w.created_by_user_id
         ORDER BY datetime(w.updated_at) DESC, w.id DESC`
      )
      .all();

    return res.json({
      data: rows.map((item) => ({
        ...item,
        event_types: parseStoredJsonArray(item.event_types_json),
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch webhooks" });
  }
});

router.post("/webhooks", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;

    const name = normalizeText(req.body?.name);
    const url = parseWebhookUrl(req.body?.url);
    if (!name) return res.status(400).json({ error: "Webhook name is required" });
    if (!url) return res.status(400).json({ error: "Valid webhook url is required" });

    const secret = normalizeText(req.body?.secret);
    const eventTypes = parseWebhookEventTypes(req.body?.event_types);
    const isActive = parseBoolean(req.body?.is_active, true) ? 1 : 0;

    const result = db
      .prepare(
        `INSERT INTO webhook_endpoints (name, url, secret, event_types_json, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(name, url, secret, JSON.stringify(eventTypes), isActive, req.user.id);

    const created = db
      .prepare("SELECT * FROM webhook_endpoints WHERE id = ?")
      .get(result.lastInsertRowid);

    return res.status(201).json({
      data: {
        ...created,
        event_types: parseStoredJsonArray(created.event_types_json),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create webhook endpoint" });
  }
});

router.patch("/webhooks/:id", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid webhook id" });

    const existing = db.prepare("SELECT * FROM webhook_endpoints WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Webhook endpoint not found" });

    const updates = [];
    const params = { id };

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
      const name = normalizeText(req.body?.name);
      if (!name) return res.status(400).json({ error: "Name cannot be empty" });
      updates.push("name = @name");
      params.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "url")) {
      const url = parseWebhookUrl(req.body?.url);
      if (!url) return res.status(400).json({ error: "Valid webhook url is required" });
      updates.push("url = @url");
      params.url = url;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "secret")) {
      updates.push("secret = @secret");
      params.secret = normalizeText(req.body?.secret);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "event_types")) {
      const eventTypes = parseWebhookEventTypes(req.body?.event_types);
      updates.push("event_types_json = @event_types_json");
      params.event_types_json = JSON.stringify(eventTypes);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "is_active")) {
      updates.push("is_active = @is_active");
      params.is_active = parseBoolean(req.body?.is_active, true) ? 1 : 0;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid field to update" });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    db.prepare(`UPDATE webhook_endpoints SET ${updates.join(", ")} WHERE id = @id`).run(params);

    const updated = db.prepare("SELECT * FROM webhook_endpoints WHERE id = ?").get(id);
    return res.json({
      data: {
        ...updated,
        event_types: parseStoredJsonArray(updated.event_types_json),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update webhook endpoint" });
  }
});

router.delete("/webhooks/:id", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid webhook id" });

    const existing = db.prepare("SELECT id FROM webhook_endpoints WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Webhook endpoint not found" });

    db.prepare("DELETE FROM webhook_endpoints WHERE id = ?").run(id);
    return res.json({ message: "Webhook endpoint deleted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete webhook endpoint" });
  }
});

router.get("/webhooks/:id/deliveries", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:read")) return;
    if (!ensureManager(req, res)) return;

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid webhook id" });
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

    const existing = db.prepare("SELECT id FROM webhook_endpoints WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Webhook endpoint not found" });

    const rows = db
      .prepare(
        `SELECT id, event_type, status_code, error_message, response_body, payload_json, created_at
         FROM webhook_deliveries
         WHERE webhook_id = ?
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?`
      )
      .all(id, limit);

    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch webhook deliveries" });
  }
});

router.post("/webhooks/:id/test", async (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid webhook id" });

    const eventType = normalizeText(req.body?.event_type) || "system.webhook.test";
    const payload = parseJson(req.body?.payload, {}) || {};
    const dispatched = await dispatchWebhookById(
      id,
      eventType,
      {
        source: "manual-test",
        triggered_by: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
        },
        at: new Date().toISOString(),
        ...payload,
      },
      { ignoreEventFilter: true, includeInactive: true }
    );

    if (!dispatched.delivered) {
      if (dispatched.reason === "not_found") return res.status(404).json({ error: "Webhook endpoint not found" });
      if (dispatched.reason === "invalid_id") return res.status(400).json({ error: "Invalid webhook id" });
      return res.status(400).json({ error: `Webhook test skipped: ${dispatched.reason}` });
    }

    return res.json({ data: dispatched });
  } catch (error) {
    return res.status(500).json({ error: "Failed to send test webhook event" });
  }
});

router.get("/security/events", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:read")) return;
    if (!ensureAdmin(req, res)) return;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const rows = listSecurityEvents({ limit });
    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch security events" });
  }
});

router.post("/security/events", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureAdmin(req, res)) return;
    const type = normalizeText(req.body?.type);
    if (!type) return res.status(400).json({ error: "Event type is required" });
    const severity = normalizeText(req.body?.severity) || "warning";

    createSecurityEvent({
      type,
      severity,
      userId: parseId(req.body?.user_id) || null,
      email: normalizeText(req.body?.email) || "",
      details: parseJson(req.body?.details, {}) || {},
    });

    return res.status(201).json({ message: "Security event created" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create security event" });
  }
});

router.post("/security/maintenance/run", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureAdmin(req, res)) return;
    const result = cleanupSecurityData({
      loginAttemptsRetentionDays: Number(req.body?.login_attempts_retention_days) || undefined,
      revokedSessionsRetentionDays: Number(req.body?.revoked_sessions_retention_days) || undefined,
      securityEventsRetentionDays: Number(req.body?.security_events_retention_days) || undefined,
    });
    return res.json({ data: result });
  } catch (error) {
    return res.status(500).json({ error: "Failed to run security maintenance" });
  }
});

router.post("/sla/run", async (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;
    const result = await runSlaEscalations({ triggeredByUserId: req.user.id });
    return res.json({ data: result });
  } catch (error) {
    return res.status(500).json({ error: "Failed to run SLA escalation" });
  }
});

router.get("/sla/preview", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:read")) return;
    if (!ensureManager(req, res)) return;

    const rows = db
      .prepare(
        `SELECT
          SUM(CASE WHEN DATE(deadline) <= DATE('now', '+1 day') THEN 1 ELSE 0 END) AS due_soon,
          SUM(CASE WHEN DATE(deadline) < DATE('now') THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN DATE(deadline) < DATE('now', '-2 day') THEN 1 ELSE 0 END) AS critical_overdue
         FROM tasks
         WHERE approval_status = 'approved'
           AND status != 'completed'
           AND deadline IS NOT NULL`
      )
      .get();

    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch SLA preview" });
  }
});

router.get("/automations/rules", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:read")) return;
    if (!ensureManager(req, res)) return;
    return res.json({ data: listAutomationRules() });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch automation rules" });
  }
});

router.post("/automations/rules", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;

    const name = normalizeText(req.body?.name);
    if (!name) return res.status(400).json({ error: "Rule name is required" });
    const description = normalizeText(req.body?.description);
    const trigger = parseAutomationTrigger(req.body?.trigger, "task.updated");
    const conditions = parseAutomationJsonField(req.body?.conditions, "conditions");
    const actions = parseAutomationJsonField(req.body?.actions, "actions");
    const isActive = parseBoolean(req.body?.is_active, true) ? 1 : 0;

    const result = db
      .prepare(
        `INSERT INTO automation_rules (name, description, trigger, conditions_json, actions_json, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, description, trigger, JSON.stringify(conditions), JSON.stringify(actions), isActive, req.user.id);

    const created = db.prepare("SELECT * FROM automation_rules WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({
      data: {
        ...created,
        conditions,
        actions,
      },
    });
  } catch (error) {
    if (String(error.message || "").startsWith("Invalid")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to create automation rule" });
  }
});

router.patch("/automations/rules/:id", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid rule id" });

    const existing = db.prepare("SELECT * FROM automation_rules WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Automation rule not found" });

    const updates = [];
    const params = { id };

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
      const name = normalizeText(req.body?.name);
      if (!name) return res.status(400).json({ error: "Name cannot be empty" });
      updates.push("name = @name");
      params.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "description")) {
      updates.push("description = @description");
      params.description = normalizeText(req.body?.description);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "trigger")) {
      updates.push("trigger = @trigger");
      params.trigger = parseAutomationTrigger(req.body?.trigger, existing.trigger);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "conditions")) {
      updates.push("conditions_json = @conditions_json");
      params.conditions_json = JSON.stringify(parseAutomationJsonField(req.body?.conditions, "conditions"));
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "actions")) {
      updates.push("actions_json = @actions_json");
      params.actions_json = JSON.stringify(parseAutomationJsonField(req.body?.actions, "actions"));
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "is_active")) {
      updates.push("is_active = @is_active");
      params.is_active = parseBoolean(req.body?.is_active, true) ? 1 : 0;
    }

    if (updates.length === 0) return res.status(400).json({ error: "No valid field to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    db.prepare(`UPDATE automation_rules SET ${updates.join(", ")} WHERE id = @id`).run(params);

    const updated = db.prepare("SELECT * FROM automation_rules WHERE id = ?").get(id);
    return res.json({
      data: {
        ...updated,
        conditions: parseJson(updated.conditions_json, {}) || {},
        actions: parseJson(updated.actions_json, {}) || {},
      },
    });
  } catch (error) {
    if (String(error.message || "").startsWith("Invalid")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update automation rule" });
  }
});

router.delete("/automations/rules/:id", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid rule id" });

    const existing = db.prepare("SELECT id FROM automation_rules WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Automation rule not found" });

    db.prepare("DELETE FROM automation_rules WHERE id = ?").run(id);
    return res.json({ message: "Automation rule deleted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete automation rule" });
  }
});

router.post("/automations/run", (req, res) => {
  try {
    if (!ensureSystemScope(req, res, "system:write")) return;
    if (!ensureManager(req, res)) return;

    const taskId = parseId(req.body?.task_id);
    if (taskId) {
      const trigger = parseAutomationTrigger(req.body?.trigger, "manual");
      const result = runAutomationForTaskEvent({
        trigger,
        taskId,
        actorUserId: req.user.id,
        context: { source: "manual", changed_fields: parseArray(req.body?.changed_fields) },
      });
      return res.json({ data: result });
    }

    const trigger = parseAutomationTrigger(req.body?.trigger, "manual");
    const limit = Math.max(1, Math.min(500, Number(req.body?.limit) || 120));
    const result = runAutomationBatch({ trigger, actorUserId: req.user.id, limit });
    return res.json({ data: result });
  } catch (error) {
    return res.status(500).json({ error: "Failed to run automation rules" });
  }
});

module.exports = router;
