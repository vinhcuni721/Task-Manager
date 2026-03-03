const express = require("express");
const db = require("../database");
const { canCreateTaskInProject } = require("../services/rbac");

const router = express.Router();

const CATEGORIES = ["work", "personal", "project", "meeting"];
const PRIORITIES = ["low", "medium", "high"];
const STATUSES = ["pending", "in_progress", "completed"];
const APPROVAL_STATUSES = ["draft", "pending_approval", "approved", "rejected"];
const RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly"];

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function parseOptionalId(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseEstimatedHours(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) return null;
  return Number(parsed.toFixed(2));
}

function addRecurrenceDate(baseDateText, recurrenceType, recurrenceInterval) {
  const date = new Date(baseDateText);
  if (Number.isNaN(date.getTime())) return null;

  const next = new Date(date);
  const interval = Number(recurrenceInterval) > 0 ? Number(recurrenceInterval) : 1;
  if (recurrenceType === "daily") next.setDate(next.getDate() + interval);
  else if (recurrenceType === "weekly") next.setDate(next.getDate() + interval * 7);
  else if (recurrenceType === "monthly") next.setMonth(next.getMonth() + interval);
  else return null;

  return next.toISOString().slice(0, 10);
}

function parsePayload(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const category = CATEGORIES.includes(String(data.category || "").trim()) ? String(data.category).trim() : "work";
  const priority = PRIORITIES.includes(String(data.priority || "").trim()) ? String(data.priority).trim() : "medium";
  const status = STATUSES.includes(String(data.status || "").trim()) ? String(data.status).trim() : "pending";
  const approvalStatus = APPROVAL_STATUSES.includes(String(data.approval_status || "").trim())
    ? String(data.approval_status).trim()
    : "draft";
  const recurrenceType = RECURRENCE_TYPES.includes(String(data.recurrence_type || "").trim())
    ? String(data.recurrence_type).trim()
    : "none";
  const recurrenceInterval = Number.isInteger(Number(data.recurrence_interval)) && Number(data.recurrence_interval) > 0
    ? Number(data.recurrence_interval)
    : 1;

  return {
    title: normalizeText(data.title) || "",
    description: normalizeText(data.description),
    estimated_hours: parseEstimatedHours(data.estimated_hours),
    category,
    priority,
    status,
    approval_status: approvalStatus,
    deadline: normalizeText(data.deadline),
    assignee: normalizeText(data.assignee),
    assignee_id: parseOptionalId(data.assignee_id),
    project_id: parseOptionalId(data.project_id),
    recurrence_type: recurrenceType,
    recurrence_interval: recurrenceInterval,
    recurrence_end_date: normalizeText(data.recurrence_end_date),
  };
}

function getTemplateForUser(templateId, user) {
  if (user.role === "admin") {
    return db.prepare("SELECT * FROM task_templates WHERE id = ?").get(templateId);
  }
  return db
    .prepare("SELECT * FROM task_templates WHERE id = ? AND (user_id = ? OR user_id IS NULL)")
    .get(templateId, user.id);
}

router.get("/", (req, res) => {
  try {
    const rows =
      req.user.role === "admin"
        ? db
            .prepare(
              `SELECT tt.*, u.name AS owner_name, u.email AS owner_email
               FROM task_templates tt
               LEFT JOIN users u ON u.id = tt.user_id
               ORDER BY tt.updated_at DESC`
            )
            .all()
        : db
            .prepare(
              `SELECT tt.*, u.name AS owner_name, u.email AS owner_email
               FROM task_templates tt
               LEFT JOIN users u ON u.id = tt.user_id
               WHERE tt.user_id = ? OR tt.user_id IS NULL
               ORDER BY tt.updated_at DESC`
            )
            .all(req.user.id);

    const data = rows.map((row) => {
      let payload = {};
      try {
        payload = JSON.parse(row.payload_json || "{}");
      } catch (error) {
        payload = {};
      }
      return {
        ...row,
        payload,
      };
    });

    return res.json({ data });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/", (req, res) => {
  try {
    const name = normalizeText(req.body?.name);
    const description = normalizeText(req.body?.description);
    const isPublic = req.user.role === "admin" && Number(req.body?.is_public) === 1;
    const payload = parsePayload(req.body?.payload);

    if (!name) return res.status(400).json({ error: "Template name is required" });
    if (!payload.title) return res.status(400).json({ error: "Template payload title is required" });

    const result = db
      .prepare(
        `INSERT INTO task_templates (user_id, name, description, payload_json)
         VALUES (?, ?, ?, ?)`
      )
      .run(isPublic ? null : req.user.id, name, description, JSON.stringify(payload));

    const template = db.prepare("SELECT * FROM task_templates WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({ data: { ...template, payload } });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/:id", (req, res) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId)) return res.status(400).json({ error: "Invalid template id" });

    const existing = getTemplateForUser(templateId, req.user);
    if (!existing) return res.status(404).json({ error: "Template not found" });

    const updates = [];
    const params = { id: templateId };

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
      const name = normalizeText(req.body?.name);
      if (!name) return res.status(400).json({ error: "Template name is required" });
      updates.push("name = @name");
      params.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "description")) {
      updates.push("description = @description");
      params.description = normalizeText(req.body?.description);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "payload")) {
      const payload = parsePayload(req.body?.payload);
      if (!payload.title) return res.status(400).json({ error: "Template payload title is required" });
      updates.push("payload_json = @payload_json");
      params.payload_json = JSON.stringify(payload);
    }

    if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    db.prepare(`UPDATE task_templates SET ${updates.join(", ")} WHERE id = @id`).run(params);

    const updated = db.prepare("SELECT * FROM task_templates WHERE id = ?").get(templateId);
    let payload = {};
    try {
      payload = JSON.parse(updated.payload_json || "{}");
    } catch (error) {
      payload = {};
    }

    return res.json({ data: { ...updated, payload } });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId)) return res.status(400).json({ error: "Invalid template id" });

    const existing = getTemplateForUser(templateId, req.user);
    if (!existing) return res.status(404).json({ error: "Template not found" });
    if (existing.user_id === null && req.user.role !== "admin") {
      return res.status(403).json({ error: "Cannot delete public template" });
    }

    db.prepare("DELETE FROM task_templates WHERE id = ?").run(templateId);
    return res.json({ message: "Template deleted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete template" });
  }
});

router.post("/:id/create-task", (req, res) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId)) return res.status(400).json({ error: "Invalid template id" });

    const template = getTemplateForUser(templateId, req.user);
    if (!template) return res.status(404).json({ error: "Template not found" });

    let templatePayload = {};
    try {
      templatePayload = JSON.parse(template.payload_json || "{}");
    } catch (error) {
      templatePayload = {};
    }

    const payload = parsePayload({
      ...templatePayload,
      ...(req.body?.overrides || {}),
    });

    if (!payload.title) return res.status(400).json({ error: "Task title is required" });

    if (payload.project_id) {
      const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(payload.project_id);
      if (!project) return res.status(400).json({ error: "Invalid project_id" });
      if (!canCreateTaskInProject(payload.project_id, req.user)) {
        return res.status(403).json({ error: "No permission to create task in this project" });
      }
    }

    if (payload.assignee_id) {
      const assignee = db.prepare("SELECT id FROM users WHERE id = ?").get(payload.assignee_id);
      if (!assignee) return res.status(400).json({ error: "Invalid assignee_id" });
    }

    if ((payload.status === "in_progress" || payload.status === "completed") && payload.approval_status !== "approved") {
      payload.status = "pending";
    }

    const countRaw = Number(req.body?.count);
    const count = Number.isInteger(countRaw) ? Math.min(30, Math.max(1, countRaw)) : 1;
    const createSeries = Number(req.body?.create_series) === 1 || String(req.body?.create_series).toLowerCase() === "true";
    const insertStmt = db.prepare(
      `INSERT INTO tasks (
         user_id, project_id, assignee_id, title, description, category, priority, status, approval_status,
         approved_by, approved_at, estimated_hours, deadline, assignee, recurrence_type, recurrence_interval, recurrence_end_date, parent_task_id
       ) VALUES (
         @user_id, @project_id, @assignee_id, @title, @description, @category, @priority, @status, @approval_status,
         @approved_by, @approved_at, @estimated_hours, @deadline, @assignee, @recurrence_type, @recurrence_interval, @recurrence_end_date, @parent_task_id
       )`
    );
    const getTaskStmt = db.prepare(
      `SELECT t.*, owner.name AS owner_name, assignee_user.name AS assignee_name
       FROM tasks t
       LEFT JOIN users owner ON owner.id = t.user_id
       LEFT JOIN users assignee_user ON assignee_user.id = t.assignee_id
       WHERE t.id = ?`
    );

    const createdTasks = [];
    let nextDeadline = payload.deadline;
    let rootTaskId = null;
    const totalToCreate = createSeries && payload.recurrence_type !== "none" && payload.deadline ? count : 1;
    for (let index = 0; index < totalToCreate; index += 1) {
      const result = insertStmt.run({
        user_id: req.user.id,
        project_id: payload.project_id,
        assignee_id: payload.assignee_id,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        priority: payload.priority,
        status: payload.status,
        approval_status: payload.approval_status,
        approved_by: payload.approval_status === "approved" ? req.user.id : null,
        approved_at: payload.approval_status === "approved" ? new Date().toISOString() : null,
        estimated_hours: payload.estimated_hours,
        deadline: nextDeadline,
        assignee: payload.assignee,
        recurrence_type: payload.recurrence_type,
        recurrence_interval: payload.recurrence_interval,
        recurrence_end_date: payload.recurrence_end_date,
        parent_task_id: rootTaskId,
      });
      const createdId = Number(result.lastInsertRowid);
      if (!rootTaskId) rootTaskId = createdId;
      if (createdId !== rootTaskId) {
        db.prepare("UPDATE tasks SET parent_task_id = ? WHERE id = ?").run(rootTaskId, createdId);
      }
      const task = getTaskStmt.get(createdId);
      createdTasks.push(task);

      if (totalToCreate > 1 && nextDeadline) {
        const upcoming = addRecurrenceDate(nextDeadline, payload.recurrence_type, payload.recurrence_interval);
        if (!upcoming) break;
        if (payload.recurrence_end_date) {
          const endTime = new Date(payload.recurrence_end_date).getTime();
          const nextTime = new Date(upcoming).getTime();
          if (Number.isNaN(endTime) || Number.isNaN(nextTime) || nextTime > endTime) break;
        }
        nextDeadline = upcoming;
      }
    }

    return res.status(201).json({
      data: createdTasks[0] || null,
      items: createdTasks,
      meta: {
        requested_count: count,
        created_count: createdTasks.length,
        create_series: totalToCreate > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create task from template" });
  }
});

module.exports = router;
