const express = require("express");
const db = require("../database");
const { isManagerOrAdmin } = require("../services/rbac");
const { emitWebhookEvent } = require("../services/webhooks");

const router = express.Router();

const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"];
const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function parseId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildIncidentVisibility(user, alias = "i") {
  if (isManagerOrAdmin(user)) return { whereSql: "1 = 1", params: { viewer_user_id: user.id } };

  return {
    whereSql: `(
      ${alias}.owner_user_id = @viewer_user_id
      OR EXISTS (
        SELECT 1
        FROM tasks t
        WHERE t.id = ${alias}.task_id
          AND (
            t.user_id = @viewer_user_id
            OR t.assignee_id = @viewer_user_id
            OR EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = t.project_id
                AND pm.user_id = @viewer_user_id
            )
          )
      )
    )`,
    params: { viewer_user_id: user.id },
  };
}

function getIncidentByIdForUser(incidentId, user) {
  const visibility = buildIncidentVisibility(user, "i");
  return db
    .prepare(
      `SELECT i.*, u.name AS owner_name, u.email AS owner_email, t.title AS task_title
       FROM incidents i
       LEFT JOIN users u ON u.id = i.owner_user_id
       LEFT JOIN tasks t ON t.id = i.task_id
       WHERE i.id = @incident_id
         AND ${visibility.whereSql}`
    )
    .get({ ...visibility.params, incident_id: incidentId });
}

function canManageIncident(incident, user) {
  if (!incident) return false;
  if (isManagerOrAdmin(user)) return true;
  return Number(incident.owner_user_id) === Number(user.id);
}

function getIncidentEvents(incidentId) {
  return db
    .prepare(
      `SELECT e.*, u.name AS user_name, u.email AS user_email
       FROM incident_events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.incident_id = ?
       ORDER BY e.created_at DESC, e.id DESC`
    )
    .all(incidentId);
}

function getPostmortemItems(incidentId) {
  return db
    .prepare(
      `SELECT p.*, u.name AS owner_name, u.email AS owner_email
       FROM incident_postmortem_items p
       LEFT JOIN users u ON u.id = p.owner_user_id
       WHERE p.incident_id = ?
       ORDER BY p.created_at ASC, p.id ASC`
    )
    .all(incidentId);
}

router.get("/", (req, res) => {
  try {
    const visibility = buildIncidentVisibility(req.user, "i");
    const filters = [visibility.whereSql];
    const params = { ...visibility.params };

    const status = String(req.query.status || "").trim();
    if (STATUSES.includes(status)) {
      filters.push("i.status = @status");
      params.status = status;
    }

    const severity = String(req.query.severity || "").trim();
    if (SEVERITIES.includes(severity)) {
      filters.push("i.severity = @severity");
      params.severity = severity;
    }

    const whereSql = filters.join(" AND ");

    const rows = db
      .prepare(
        `SELECT i.*, u.name AS owner_name, u.email AS owner_email, t.title AS task_title
         FROM incidents i
         LEFT JOIN users u ON u.id = i.owner_user_id
         LEFT JOIN tasks t ON t.id = i.task_id
         WHERE ${whereSql}
         ORDER BY
           CASE i.severity WHEN 'sev1' THEN 1 WHEN 'sev2' THEN 2 WHEN 'sev3' THEN 3 ELSE 4 END,
           CASE i.status WHEN 'open' THEN 1 WHEN 'investigating' THEN 2 WHEN 'mitigated' THEN 3 WHEN 'resolved' THEN 4 ELSE 5 END,
           datetime(i.updated_at) DESC`
      )
      .all(params);

    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch incidents" });
  }
});

router.get("/:id", (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid incident id" });

    const incident = getIncidentByIdForUser(id, req.user);
    if (!incident) return res.status(404).json({ error: "Incident not found" });

    return res.json({
      data: {
        incident,
        events: getIncidentEvents(id),
        postmortem_items: getPostmortemItems(id),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch incident details" });
  }
});

router.post("/", async (req, res) => {
  try {
    const title = normalizeText(req.body?.title);
    if (!title) return res.status(400).json({ error: "Incident title is required" });

    const description = normalizeText(req.body?.description);
    const severity = SEVERITIES.includes(String(req.body?.severity || "").trim()) ? String(req.body.severity).trim() : "sev3";
    const status = STATUSES.includes(String(req.body?.status || "").trim()) ? String(req.body.status).trim() : "open";
    const taskId = parseId(req.body?.task_id);

    const result = db
      .prepare(
        `INSERT INTO incidents (title, description, severity, status, owner_user_id, task_id, started_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(title, description, severity, status, req.user.id, taskId || null);

    const incidentId = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO incident_events (incident_id, user_id, event_type, message) VALUES (?, ?, 'created', ?)").run(
      incidentId,
      req.user.id,
      "Incident created"
    );

    if (taskId) {
      db.prepare("UPDATE tasks SET incident_id = ? WHERE id = ?").run(incidentId, taskId);
    }

    const incident = getIncidentByIdForUser(incidentId, req.user);
    emitWebhookEvent("incident.created", { incident }).catch(() => {});

    return res.status(201).json({ data: incident });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create incident" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid incident id" });

    const incident = getIncidentByIdForUser(id, req.user);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    if (!canManageIncident(incident, req.user)) {
      return res.status(403).json({ error: "No permission to update incident" });
    }

    const updates = [];
    const params = { id };
    const changed = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "title")) {
      const value = normalizeText(req.body.title);
      if (!value) return res.status(400).json({ error: "Title cannot be empty" });
      updates.push("title = @title");
      params.title = value;
      changed.push("title");
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "description")) {
      updates.push("description = @description");
      params.description = normalizeText(req.body.description);
      changed.push("description");
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "severity")) {
      const severity = String(req.body.severity || "").trim();
      if (!SEVERITIES.includes(severity)) return res.status(400).json({ error: "Invalid severity" });
      updates.push("severity = @severity");
      params.severity = severity;
      changed.push("severity");
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "status")) {
      const status = String(req.body.status || "").trim();
      if (!STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });
      updates.push("status = @status");
      params.status = status;
      changed.push("status");

      if (status === "resolved") {
        updates.push("resolved_at = CURRENT_TIMESTAMP");
      }
      if (status === "closed") {
        updates.push("closed_at = CURRENT_TIMESTAMP");
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "task_id")) {
      const taskId = parseId(req.body.task_id);
      updates.push("task_id = @task_id");
      params.task_id = taskId || null;
      changed.push("task_id");
      if (taskId) {
        db.prepare("UPDATE tasks SET incident_id = ? WHERE id = ?").run(id, taskId);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid field to update" });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    db.prepare(`UPDATE incidents SET ${updates.join(", ")} WHERE id = @id`).run(params);

    const updated = getIncidentByIdForUser(id, req.user);
    db.prepare("INSERT INTO incident_events (incident_id, user_id, event_type, message) VALUES (?, ?, 'updated', ?)").run(
      id,
      req.user.id,
      `Updated fields: ${changed.join(", ")}`
    );

    emitWebhookEvent("incident.updated", { incident: updated, changed_fields: changed }).catch(() => {});
    return res.json({ data: updated });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update incident" });
  }
});

router.post("/:id/events", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid incident id" });

    const incident = getIncidentByIdForUser(id, req.user);
    if (!incident) return res.status(404).json({ error: "Incident not found" });

    const message = normalizeText(req.body?.message);
    if (!message) return res.status(400).json({ error: "Event message is required" });
    const eventType = normalizeText(req.body?.event_type) || "note";

    const result = db
      .prepare("INSERT INTO incident_events (incident_id, user_id, event_type, message) VALUES (?, ?, ?, ?)")
      .run(id, req.user.id, eventType, message);

    const event = db
      .prepare(
        `SELECT e.*, u.name AS user_name, u.email AS user_email
         FROM incident_events e
         LEFT JOIN users u ON u.id = e.user_id
         WHERE e.id = ?`
      )
      .get(result.lastInsertRowid);

    emitWebhookEvent("incident.event.created", { incident_id: id, event }).catch(() => {});
    return res.status(201).json({ data: event });
  } catch (error) {
    return res.status(500).json({ error: "Failed to add incident event" });
  }
});

router.post("/:id/postmortem", (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid incident id" });

    const incident = getIncidentByIdForUser(id, req.user);
    if (!incident) return res.status(404).json({ error: "Incident not found" });

    const title = normalizeText(req.body?.title);
    if (!title) return res.status(400).json({ error: "Postmortem item title is required" });
    const ownerUserId = parseId(req.body?.owner_user_id);
    const dueDate = parseDate(req.body?.due_date);

    const result = db
      .prepare(
        `INSERT INTO incident_postmortem_items (incident_id, title, owner_user_id, due_date)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, title, ownerUserId || null, dueDate || null);

    const item = db
      .prepare(
        `SELECT p.*, u.name AS owner_name, u.email AS owner_email
         FROM incident_postmortem_items p
         LEFT JOIN users u ON u.id = p.owner_user_id
         WHERE p.id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: item });
  } catch (error) {
    return res.status(500).json({ error: "Failed to add postmortem item" });
  }
});

router.patch("/:id/postmortem/:itemId", (req, res) => {
  try {
    const id = parseId(req.params.id);
    const itemId = parseId(req.params.itemId);
    if (!id || !itemId) return res.status(400).json({ error: "Invalid id" });

    const incident = getIncidentByIdForUser(id, req.user);
    if (!incident) return res.status(404).json({ error: "Incident not found" });

    const existing = db
      .prepare("SELECT * FROM incident_postmortem_items WHERE id = ? AND incident_id = ?")
      .get(itemId, id);
    if (!existing) return res.status(404).json({ error: "Postmortem item not found" });

    const updates = [];
    const params = { id: itemId };

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "title")) {
      const title = normalizeText(req.body.title);
      if (!title) return res.status(400).json({ error: "Title cannot be empty" });
      updates.push("title = @title");
      params.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "is_completed")) {
      const isCompleted = Number(req.body.is_completed) === 1 || String(req.body.is_completed).toLowerCase() === "true";
      updates.push("is_completed = @is_completed");
      params.is_completed = isCompleted ? 1 : 0;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "owner_user_id")) {
      params.owner_user_id = parseId(req.body.owner_user_id) || null;
      updates.push("owner_user_id = @owner_user_id");
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "due_date")) {
      params.due_date = parseDate(req.body.due_date);
      updates.push("due_date = @due_date");
    }

    if (updates.length === 0) return res.status(400).json({ error: "No valid field to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    db.prepare(`UPDATE incident_postmortem_items SET ${updates.join(", ")} WHERE id = @id`).run(params);

    const updated = db
      .prepare(
        `SELECT p.*, u.name AS owner_name, u.email AS owner_email
         FROM incident_postmortem_items p
         LEFT JOIN users u ON u.id = p.owner_user_id
         WHERE p.id = ?`
      )
      .get(itemId);

    return res.json({ data: updated });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update postmortem item" });
  }
});

router.delete("/:id/postmortem/:itemId", (req, res) => {
  try {
    const id = parseId(req.params.id);
    const itemId = parseId(req.params.itemId);
    if (!id || !itemId) return res.status(400).json({ error: "Invalid id" });

    const incident = getIncidentByIdForUser(id, req.user);
    if (!incident) return res.status(404).json({ error: "Incident not found" });

    const existing = db
      .prepare("SELECT id FROM incident_postmortem_items WHERE id = ? AND incident_id = ?")
      .get(itemId, id);
    if (!existing) return res.status(404).json({ error: "Postmortem item not found" });

    db.prepare("DELETE FROM incident_postmortem_items WHERE id = ?").run(itemId);
    return res.json({ message: "Postmortem item deleted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete postmortem item" });
  }
});

module.exports = router;
