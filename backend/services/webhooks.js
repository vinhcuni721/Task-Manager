const db = require("../database");

function parseEventTypes(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function matchesEventType(eventType, configuredTypes) {
  if (!configuredTypes || configuredTypes.length === 0) return true;
  if (configuredTypes.includes("*")) return true;
  return configuredTypes.includes(eventType);
}

function makeSignature(secret, payload) {
  if (!secret) return "";
  const crypto = require("crypto");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function deliverWebhook(endpoint, eventType, payload) {
  const body = JSON.stringify({
    event: eventType,
    sent_at: new Date().toISOString(),
    data: payload,
  });

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "TaskFlow-Webhook/1.0",
  };
  if (endpoint.secret) {
    headers["X-TaskFlow-Signature"] = makeSignature(endpoint.secret, body);
  }

  let statusCode = 0;
  let responseBody = "";
  let errorMessage = "";

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body,
    });
    statusCode = Number(response.status) || 0;
    responseBody = String(await response.text().catch(() => "") || "").slice(0, 1000);
    if (!response.ok) {
      errorMessage = `HTTP ${response.status}`;
    }
  } catch (error) {
    errorMessage = error?.message || "Request failed";
  }

  db.prepare(
    `INSERT INTO webhook_deliveries (
      webhook_id, event_type, payload_json, status_code, response_body, error_message
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(endpoint.id, eventType, body, statusCode || null, responseBody || null, errorMessage || null);

  db.prepare(
    `UPDATE webhook_endpoints
     SET last_status_code = ?, last_error = ?, last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(statusCode || null, errorMessage || null, endpoint.id);

  return {
    status_code: statusCode || null,
    error_message: errorMessage || null,
    response_body: responseBody || null,
  };
}

async function emitWebhookEvent(eventType, payload) {
  const endpoints = db
    .prepare(
      `SELECT id, name, url, secret, event_types_json
       FROM webhook_endpoints
       WHERE is_active = 1`
    )
    .all();

  const jobs = endpoints
    .filter((item) => matchesEventType(eventType, parseEventTypes(item.event_types_json)))
    .map((endpoint) => deliverWebhook(endpoint, eventType, payload));

  if (jobs.length === 0) return;
  await Promise.allSettled(jobs);
}

async function dispatchWebhookById(
  webhookId,
  eventType,
  payload,
  { ignoreEventFilter = false, includeInactive = false } = {}
) {
  const parsedId = Number(webhookId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return { delivered: false, reason: "invalid_id" };
  }

  const endpoint = db
    .prepare(
      `SELECT id, name, url, secret, event_types_json, is_active
       FROM webhook_endpoints
       WHERE id = ?`
    )
    .get(parsedId);
  if (!endpoint) return { delivered: false, reason: "not_found" };
  if (!includeInactive && Number(endpoint.is_active) !== 1) {
    return { delivered: false, reason: "inactive" };
  }

  const matches = matchesEventType(eventType, parseEventTypes(endpoint.event_types_json));
  if (!ignoreEventFilter && !matches) {
    return { delivered: false, reason: "event_not_subscribed" };
  }

  const result = await deliverWebhook(endpoint, eventType, payload);
  return { delivered: true, reason: "sent", ...result };
}

module.exports = {
  emitWebhookEvent,
  dispatchWebhookById,
};
