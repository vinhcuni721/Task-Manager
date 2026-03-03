const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("../database");
const { sendTaskEmail } = require("../services/email");
const { publishNotification } = require("../events");
const { canCreateTaskInProject, canManageProject, getProjectRole, isAdmin, isManagerOrAdmin } = require("../services/rbac");
const { runAutomationForTaskEvent } = require("../services/automations");

const router = express.Router();

const CATEGORIES = ["work", "personal", "project", "meeting"];
const PRIORITIES = ["low", "medium", "high"];
const STATUSES = ["pending", "in_progress", "completed"];
const APPROVAL_STATUSES = ["draft", "pending_approval", "approved", "rejected"];
const APPROVAL_POLICIES = ["single", "multi"];
const RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly"];
const SORTABLE_FIELDS = {
  updated_at: "t.updated_at",
  created_at: "t.created_at",
  deadline: "COALESCE(t.deadline, '9999-12-31')",
  priority: "CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END",
  status: "CASE t.status WHEN 'in_progress' THEN 1 WHEN 'pending' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END",
  approval_status:
    "CASE t.approval_status WHEN 'pending_approval' THEN 1 WHEN 'rejected' THEN 2 WHEN 'approved' THEN 3 WHEN 'draft' THEN 4 ELSE 5 END",
  title: "t.title",
};
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    cb(null, fileName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const TASK_SELECT_SQL = `
  SELECT
    t.*,
    owner.name AS owner_name,
    owner.email AS owner_email,
    project.name AS project_name,
    approver.name AS approved_by_name,
    assignee_user.name AS assignee_name,
    assignee_user.email AS assignee_email,
    (SELECT COUNT(*) FROM task_subtasks st WHERE st.task_id = t.id) AS subtasks_total,
    (SELECT COUNT(*) FROM task_subtasks st WHERE st.task_id = t.id AND st.is_completed = 1) AS subtasks_completed,
    (SELECT IFNULL(SUM(te.duration_seconds), 0) FROM time_entries te WHERE te.task_id = t.id) AS tracked_seconds,
    (
      SELECT te.id
      FROM time_entries te
      WHERE te.task_id = t.id
        AND te.user_id = @viewer_user_id
        AND te.ended_at IS NULL
      ORDER BY te.started_at DESC
      LIMIT 1
    ) AS my_active_time_entry_id
  FROM tasks t
  LEFT JOIN users owner ON owner.id = t.user_id
  LEFT JOIN projects project ON project.id = t.project_id
  LEFT JOIN users approver ON approver.id = t.approved_by
  LEFT JOIN users assignee_user ON assignee_user.id = t.assignee_id
`;

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function parsePositiveInt(value, fallback, min = 1, max = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function hasOwnerPermission(task, user) {
  if (isManagerOrAdmin(user)) return true;
  if (Number(task.user_id) === Number(user.id)) return true;
  if (task.project_id) return canManageProject(task.project_id, user);
  return false;
}

function canRequestApproval(task, user) {
  if (isManagerOrAdmin(user)) return true;
  if (Number(task.user_id) === Number(user.id)) return true;
  if (Number(task.assignee_id) === Number(user.id)) return true;
  if (task.project_id) {
    const role = getProjectRole(task.project_id, user.id);
    return role === "owner" || role === "manager" || role === "member";
  }
  return false;
}

function buildVisibilityContext(user) {
  if (isManagerOrAdmin(user)) {
    return { whereSql: "1 = 1", params: { viewer_user_id: user.id } };
  }

  return {
    whereSql: `
      (
        t.user_id = @user_id
        OR t.assignee_id = @user_id
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = t.project_id
            AND pm.user_id = @user_id
        )
      )
    `,
    params: { user_id: user.id, viewer_user_id: user.id },
  };
}

function normalizeText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function validateEnum(value, allowed, fieldName) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim();
  if (!allowed.includes(normalized)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return normalized;
}

function parseOptionalId(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return parsed;
}

function parseRecurrenceInterval(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid recurrence_interval");
  }
  return parsed;
}

function parseApprovalRequiredLevel(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error("Invalid approval_required_level");
  }
  return parsed;
}

function parseSlaLevel(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
    throw new Error("Invalid sla_level");
  }
  return parsed;
}

function parseEstimatedHours(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
    throw new Error("Invalid estimated_hours");
  }
  return Number(parsed.toFixed(2));
}

function parseDateIso(value, fieldName) {
  if (value === undefined) return undefined;
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return normalized;
}

function ensureUserExists(userId) {
  if (userId === null || userId === undefined) return;
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error("Invalid assignee_id");
}

function ensureProjectExists(projectId) {
  if (projectId === null || projectId === undefined) return;
  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
  if (!project) throw new Error("Invalid project_id");
}

function sanitizeTaskPayload(payload, isUpdate = false) {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    const title = normalizeText(payload.title);
    if (!title) throw new Error("Title is required");
    data.title = title;
  } else if (!isUpdate) {
    throw new Error("Title is required");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    data.description = normalizeText(payload.description);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "category")) {
    data.category = validateEnum(payload.category, CATEGORIES, "category");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
    data.priority = validateEnum(payload.priority, PRIORITIES, "priority");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    data.status = validateEnum(payload.status, STATUSES, "status");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deadline")) {
    data.deadline = parseDateIso(payload.deadline, "deadline");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assignee")) {
    data.assignee = normalizeText(payload.assignee);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assignee_id")) {
    data.assignee_id = parseOptionalId(payload.assignee_id, "assignee_id");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "project_id")) {
    data.project_id = parseOptionalId(payload.project_id, "project_id");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "approval_status")) {
    data.approval_status = validateEnum(payload.approval_status, APPROVAL_STATUSES, "approval_status");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "approval_policy")) {
    data.approval_policy = validateEnum(payload.approval_policy, APPROVAL_POLICIES, "approval_policy");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "approval_required_level")) {
    data.approval_required_level = parseApprovalRequiredLevel(payload.approval_required_level);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sla_level")) {
    data.sla_level = parseSlaLevel(payload.sla_level);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "estimated_hours")) {
    data.estimated_hours = parseEstimatedHours(payload.estimated_hours);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "recurrence_type")) {
    data.recurrence_type = validateEnum(payload.recurrence_type, RECURRENCE_TYPES, "recurrence_type");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "recurrence_interval")) {
    data.recurrence_interval = parseRecurrenceInterval(payload.recurrence_interval);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "recurrence_end_date")) {
    data.recurrence_end_date = parseDateIso(payload.recurrence_end_date, "recurrence_end_date");
  }

  if (data.recurrence_type && data.recurrence_type !== "none") {
    if (data.recurrence_interval === undefined) {
      data.recurrence_interval = 1;
    }
  }

  return data;
}

function validateRecurrenceConsistency(input, fallbackTask = null) {
  const recurrenceType = input.recurrence_type ?? fallbackTask?.recurrence_type ?? "none";
  const deadline = input.deadline !== undefined ? input.deadline : fallbackTask?.deadline;
  const recurrenceEndDate =
    input.recurrence_end_date !== undefined ? input.recurrence_end_date : fallbackTask?.recurrence_end_date;

  if (recurrenceType !== "none" && !deadline) {
    throw new Error("Recurring task requires a deadline");
  }

  if (recurrenceEndDate && deadline) {
    if (new Date(recurrenceEndDate).getTime() < new Date(deadline).getTime()) {
      throw new Error("recurrence_end_date must be after deadline");
    }
  }
}

function getApprovalPolicy(taskLike = {}) {
  const policy = String(taskLike.approval_policy || "single").trim();
  return APPROVAL_POLICIES.includes(policy) ? policy : "single";
}

function getRequiredApprovalLevel(taskLike = {}) {
  const policy = getApprovalPolicy(taskLike);
  if (policy === "single") return 1;

  const parsed = Number(taskLike.approval_required_level);
  if (!Number.isInteger(parsed) || parsed < 1) return 2;
  return Math.min(parsed, 5);
}

function getCurrentApprovalLevel(taskLike = {}) {
  const parsed = Number(taskLike.approval_current_level);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function hasApprovedBefore(taskId, userId) {
  const row = db
    .prepare(
      `SELECT id
       FROM task_approval_logs
       WHERE task_id = ?
         AND approver_user_id = ?
         AND decision = 'approved'
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(taskId, userId);
  return Boolean(row);
}

function canApproveTask(task, user) {
  if (!task) return false;
  if (isManagerOrAdmin(user)) return true;

  if (task.project_id) {
    const role = getProjectRole(task.project_id, user.id);
    return role === "owner" || role === "manager";
  }

  return Number(task.user_id) === Number(user.id);
}

function insertApprovalLog({ taskId, approverUserId, level, decision, reason = null }) {
  db.prepare(
    `INSERT INTO task_approval_logs (task_id, approver_user_id, level, decision, reason)
     VALUES (?, ?, ?, ?, ?)`
  ).run(taskId, approverUserId || null, level, decision, reason || null);
}

function getTaskApprovalLogs(taskId) {
  return db
    .prepare(
      `SELECT l.*, u.name AS approver_name, u.email AS approver_email
       FROM task_approval_logs l
       LEFT JOIN users u ON u.id = l.approver_user_id
       WHERE l.task_id = ?
       ORDER BY l.created_at DESC, l.id DESC`
    )
    .all(taskId);
}

function getTaskByIdForUser(taskId, user) {
  const { whereSql, params } = buildVisibilityContext(user);
  return db
    .prepare(`${TASK_SELECT_SQL} WHERE t.id = @task_id AND ${whereSql}`)
    .get({ ...params, task_id: taskId });
}

function getTaskPermissions(task, user) {
  const isOwner = Number(task.user_id) === Number(user.id);
  const isAssignee = Number(task.assignee_id) === Number(user.id);
  const elevated = isManagerOrAdmin(user);
  const projectRole = task.project_id ? getProjectRole(task.project_id, user.id) : null;
  const inProject = Boolean(projectRole);
  const canManageTask = elevated || isOwner || (task.project_id ? canManageProject(task.project_id, user) : false);
  const canComment = elevated || isOwner || isAssignee || inProject;
  const canAttach = canComment;
  const canApprove = canApproveTask(task, user);

  return {
    view: true,
    update: canManageTask,
    delete: canManageTask,
    comment: canComment,
    add_subtask: canComment,
    update_subtask: canComment,
    delete_subtask: canComment,
    upload_attachment: canAttach,
    delete_attachment: canManageTask,
    request_approval: canRequestApproval(task, user),
    approve: canApprove && task.approval_status === "pending_approval",
    reject: canApprove && task.approval_status === "pending_approval",
    view_approval_logs: canRequestApproval(task, user),
    send_email: canComment,
    start_timer: canComment,
  };
}

function serializeTask(task, user) {
  return {
    ...task,
    permissions: getTaskPermissions(task, user),
  };
}

function logActivity(taskId, userId, action, details) {
  db.prepare(
    "INSERT INTO task_activities (task_id, user_id, action, details) VALUES (?, ?, ?, ?)"
  ).run(taskId, userId || null, action, details ? String(details) : null);

  const task = db
    .prepare("SELECT id, title, user_id, assignee_id, project_id FROM tasks WHERE id = ?")
    .get(taskId);
  if (!task) return;

  const projectMembers = task.project_id
    ? db.prepare("SELECT user_id FROM project_members WHERE project_id = ?").all(task.project_id).map((item) => item.user_id)
    : [];

  const userIds = [task.user_id, task.assignee_id, userId]
    .concat(projectMembers)
    .filter((value) => Number.isInteger(Number(value)))
    .map((value) => Number(value));

  publishNotification({
    type: "task_activity",
    task_id: task.id,
    title: task.title,
    action,
    details: details || "",
    message: `${task.title}: ${action}`,
    user_ids: [...new Set(userIds)],
  });
}

function addRecurrenceDate(baseDateText, recurrenceType, recurrenceInterval) {
  const date = new Date(baseDateText);
  if (Number.isNaN(date.getTime())) return null;

  const next = new Date(date);
  const interval = recurrenceInterval || 1;

  if (recurrenceType === "daily") {
    next.setDate(next.getDate() + interval);
  } else if (recurrenceType === "weekly") {
    next.setDate(next.getDate() + interval * 7);
  } else if (recurrenceType === "monthly") {
    next.setMonth(next.getMonth() + interval);
  } else {
    return null;
  }

  return next.toISOString().slice(0, 10);
}

function maybeCreateNextRecurringTask(task, actorUserId) {
  if (!task || task.recurrence_type === "none") {
    return;
  }

  const nextDeadline = addRecurrenceDate(task.deadline, task.recurrence_type, task.recurrence_interval);
  if (!nextDeadline) return;

  if (task.recurrence_end_date) {
    const endTime = new Date(task.recurrence_end_date).getTime();
    const nextTime = new Date(nextDeadline).getTime();
    if (Number.isNaN(endTime) || Number.isNaN(nextTime) || nextTime > endTime) {
      return;
    }
  }

  const insertData = {
    user_id: task.user_id,
    project_id: task.project_id,
    assignee_id: task.assignee_id,
    title: task.title,
    description: task.description,
    category: task.category,
    priority: task.priority,
    status: "pending",
    approval_status: "draft",
    approval_required_level: getRequiredApprovalLevel(task),
    approval_current_level: 0,
    approval_policy: getApprovalPolicy(task),
    approved_by: null,
    approved_at: null,
    sla_level: 0,
    sla_last_escalated_at: null,
    incident_id: null,
    estimated_hours: task.estimated_hours ?? null,
    deadline: nextDeadline,
    assignee: task.assignee,
    recurrence_type: task.recurrence_type,
    recurrence_interval: task.recurrence_interval || 1,
    recurrence_end_date: task.recurrence_end_date,
    parent_task_id: task.parent_task_id || task.id,
  };

  const result = db
    .prepare(`
      INSERT INTO tasks (
        user_id, project_id, assignee_id, title, description, category, priority, status, approval_status, approval_required_level,
        approval_current_level, approval_policy, approved_by, approved_at, sla_level, sla_last_escalated_at, incident_id, estimated_hours,
        deadline, assignee, recurrence_type, recurrence_interval, recurrence_end_date, parent_task_id
      )
      VALUES (
        @user_id, @project_id, @assignee_id, @title, @description, @category, @priority, @status, @approval_status, @approval_required_level,
        @approval_current_level, @approval_policy, @approved_by, @approved_at, @sla_level, @sla_last_escalated_at, @incident_id, @estimated_hours,
        @deadline, @assignee, @recurrence_type, @recurrence_interval, @recurrence_end_date, @parent_task_id
      )
    `)
    .run(insertData);

  const newTaskId = result.lastInsertRowid;
  logActivity(newTaskId, actorUserId, "recurrence_generated", `Generated from task #${task.id}`);
  logActivity(task.id, actorUserId, "recurrence_next_created", `Created next recurring task #${newTaskId}`);
}

function serializeAttachment(req, attachment) {
  return {
    ...attachment,
    url: `${req.protocol}://${req.get("host")}/uploads/${attachment.file_name}`,
  };
}

function getTaskComments(taskId) {
  return db
    .prepare(
      `SELECT c.*, u.name AS user_name, u.email AS user_email
       FROM task_comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.task_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(taskId);
}

function getTaskActivities(taskId) {
  return db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.email AS user_email
       FROM task_activities a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.task_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(taskId);
}

function getTaskAttachments(taskId) {
  return db
    .prepare(
      `SELECT at.*, u.name AS user_name, u.email AS user_email
       FROM task_attachments at
       LEFT JOIN users u ON u.id = at.user_id
       WHERE at.task_id = ?
       ORDER BY at.created_at DESC`
    )
    .all(taskId);
}

function getTaskSubtasks(taskId) {
  return db
    .prepare(
      `SELECT st.*, u.name AS user_name, u.email AS user_email
       FROM task_subtasks st
       LEFT JOIN users u ON u.id = st.user_id
       WHERE st.task_id = ?
       ORDER BY st.created_at ASC`
    )
    .all(taskId);
}

function getTaskTimeEntries(taskId) {
  return db
    .prepare(
      `SELECT te.*, u.name AS user_name, u.email AS user_email
       FROM time_entries te
       LEFT JOIN users u ON u.id = te.user_id
       WHERE te.task_id = ?
       ORDER BY te.started_at DESC`
    )
    .all(taskId);
}

function getActiveTimeEntry(taskId, userId) {
  return db
    .prepare(
      `SELECT te.*, u.name AS user_name, u.email AS user_email
       FROM time_entries te
       LEFT JOIN users u ON u.id = te.user_id
       WHERE te.task_id = ?
         AND te.user_id = ?
         AND te.ended_at IS NULL
       ORDER BY te.started_at DESC
       LIMIT 1`
    )
    .get(taskId, userId);
}

router.get("/", (req, res) => {
  try {
    const {
      category,
      priority,
      status,
      assignee,
      search,
      assignee_id,
      project_id,
      approval_status,
      date_from,
      date_to,
      page = 1,
      page_size = 10,
      sort_by,
      sort_order,
    } = req.query;
    const { whereSql, params } = buildVisibilityContext(req.user);
    const filters = [whereSql];
    const queryParams = { ...params };

    if (category && CATEGORIES.includes(category)) {
      filters.push("t.category = @category");
      queryParams.category = category;
    }

    if (priority && PRIORITIES.includes(priority)) {
      filters.push("t.priority = @priority");
      queryParams.priority = priority;
    }

    if (status && STATUSES.includes(status)) {
      filters.push("t.status = @status");
      queryParams.status = status;
    }

    if (assignee) {
      filters.push("(t.assignee LIKE @assignee OR assignee_user.name LIKE @assignee)");
      queryParams.assignee = `%${String(assignee).trim()}%`;
    }

    if (assignee_id) {
      const parsedAssigneeId = Number(assignee_id);
      if (Number.isInteger(parsedAssigneeId)) {
        filters.push("t.assignee_id = @assignee_id");
        queryParams.assignee_id = parsedAssigneeId;
      }
    }

    if (project_id) {
      const parsedProjectId = Number(project_id);
      if (Number.isInteger(parsedProjectId)) {
        filters.push("t.project_id = @project_id");
        queryParams.project_id = parsedProjectId;
      }
    }

    if (approval_status && APPROVAL_STATUSES.includes(String(approval_status).trim())) {
      filters.push("t.approval_status = @approval_status");
      queryParams.approval_status = String(approval_status).trim();
    }

    if (search) {
      filters.push("(t.title LIKE @search OR IFNULL(t.description, '') LIKE @search)");
      queryParams.search = `%${String(search).trim()}%`;
    }

    if (date_from) {
      filters.push("t.deadline IS NOT NULL AND DATE(t.deadline) >= DATE(@date_from)");
      queryParams.date_from = String(date_from).trim();
    }

    if (date_to) {
      filters.push("t.deadline IS NOT NULL AND DATE(t.deadline) <= DATE(@date_to)");
      queryParams.date_to = String(date_to).trim();
    }

    const safePageSize = parsePositiveInt(page_size, 10, 1, 1000);
    const safePage = parsePositiveInt(page, 1, 1, 100000);
    const offset = (safePage - 1) * safePageSize;

    const safeSortBy = SORTABLE_FIELDS[String(sort_by || "").trim()] ? String(sort_by).trim() : "";
    const safeSortOrder = String(sort_order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const orderClause = safeSortBy
      ? `ORDER BY ${SORTABLE_FIELDS[safeSortBy]} ${safeSortOrder}, t.updated_at DESC`
      : `ORDER BY
          CASE t.status
            WHEN 'in_progress' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'completed' THEN 3
            ELSE 4
          END,
          COALESCE(t.deadline, '9999-12-31') ASC,
          t.updated_at DESC`;

    const whereClause = `WHERE ${filters.join(" AND ")}`;
    const countSql = `
      SELECT COUNT(*) AS total
      FROM tasks t
      LEFT JOIN users assignee_user ON assignee_user.id = t.assignee_id
      ${whereClause}
    `;
    const total = db.prepare(countSql).get(queryParams).total;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));

    const sql = `
      ${TASK_SELECT_SQL}
      ${whereClause}
      ${orderClause}
      LIMIT @limit OFFSET @offset
    `;

    const tasks = db
      .prepare(sql)
      .all({ ...queryParams, limit: safePageSize, offset });

    return res.json({
      data: tasks.map((task) => serializeTask(task, req.user)),
      meta: {
        page: safePage,
        page_size: safePageSize,
        total,
        total_pages: totalPages,
        sort_by: safeSortBy || "default",
        sort_order: safeSortOrder.toLowerCase(),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.get("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    return res.json({ data: serializeTask(task, req.user) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch task" });
  }
});

router.get("/:id/permissions", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    return res.json({ data: getTaskPermissions(task, req.user) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch task permissions" });
  }
});

router.get("/:id/details", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const comments = getTaskComments(id);
    const activities = getTaskActivities(id);
    const attachments = getTaskAttachments(id).map((item) => serializeAttachment(req, item));
    const subtasks = getTaskSubtasks(id);
    const timeEntries = getTaskTimeEntries(id);
    const activeTimeEntry = getActiveTimeEntry(id, req.user.id);

    return res.json({
      data: {
        task: serializeTask(task, req.user),
        comments,
        activities,
        attachments,
        subtasks,
        time_entries: timeEntries,
        active_time_entry: activeTimeEntry || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch task details" });
  }
});

router.get("/:id/recurrence-preview", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const count = parsePositiveInt(req.query.count, 5, 1, 12);
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!task.deadline) return badRequest(res, "Task has no deadline");
    if (!task.recurrence_type || task.recurrence_type === "none") {
      return badRequest(res, "Task is not recurring");
    }

    const dates = [];
    let cursor = String(task.deadline);
    const recurrenceEnd = task.recurrence_end_date ? new Date(task.recurrence_end_date).getTime() : null;
    for (let index = 0; index < count; index += 1) {
      const nextDate = addRecurrenceDate(cursor, task.recurrence_type, task.recurrence_interval || 1);
      if (!nextDate) break;
      if (Number.isFinite(recurrenceEnd)) {
        const nextTime = new Date(nextDate).getTime();
        if (Number.isNaN(nextTime) || nextTime > recurrenceEnd) break;
      }
      dates.push(nextDate);
      cursor = nextDate;
    }

    return res.json({
      data: {
        task_id: task.id,
        recurrence_type: task.recurrence_type,
        recurrence_interval: task.recurrence_interval || 1,
        recurrence_end_date: task.recurrence_end_date || null,
        next_dates: dates,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to build recurrence preview" });
  }
});

router.post("/", (req, res) => {
  try {
    const payload = sanitizeTaskPayload(req.body || {});
    payload.project_id = payload.project_id ?? null;
    payload.assignee_id = payload.assignee_id ?? null;
    payload.approval_status = payload.approval_status ?? "draft";
    payload.approval_policy = payload.approval_policy ?? "single";
    payload.approval_required_level = payload.approval_required_level ?? (payload.approval_policy === "single" ? 1 : 2);
    if (payload.approval_policy === "single") {
      payload.approval_required_level = 1;
    }
    payload.recurrence_type = payload.recurrence_type ?? "none";
    payload.recurrence_interval = payload.recurrence_interval ?? 1;
    payload.recurrence_end_date = payload.recurrence_end_date ?? null;
    payload.sla_level = payload.sla_level ?? 0;

    ensureProjectExists(payload.project_id);
    ensureUserExists(payload.assignee_id);

    if (payload.project_id && !canCreateTaskInProject(payload.project_id, req.user)) {
      return res.status(403).json({ error: "No permission to create task in this project" });
    }

    if (payload.sla_level > 0 && !isManagerOrAdmin(req.user)) {
      return res.status(403).json({ error: "Only manager or admin can set SLA level" });
    }

    if (payload.approval_status !== "draft" && payload.approval_status !== "pending_approval") {
      if (!hasOwnerPermission({ user_id: req.user.id, project_id: payload.project_id }, req.user)) {
        return res.status(403).json({ error: "No permission to set approval status" });
      }
    }

    validateRecurrenceConsistency(payload);

    if ((payload.status === "in_progress" || payload.status === "completed") && payload.approval_status !== "approved") {
      return badRequest(res, "Task must be approved before starting/completing");
    }

    const insertData = {
      user_id: req.user.id,
      project_id: payload.project_id,
      assignee_id: payload.assignee_id,
      title: payload.title,
      description: payload.description ?? null,
      category: payload.category ?? "work",
      priority: payload.priority ?? "medium",
      status: payload.status ?? "pending",
      approval_status: payload.approval_status,
      approval_required_level: payload.approval_required_level,
      approval_current_level: payload.approval_status === "approved" ? payload.approval_required_level : 0,
      approval_policy: payload.approval_policy,
      approved_by: payload.approval_status === "approved" ? req.user.id : null,
      approved_at: payload.approval_status === "approved" ? new Date().toISOString() : null,
      sla_level: payload.sla_level,
      sla_last_escalated_at: null,
      incident_id: null,
      estimated_hours: payload.estimated_hours ?? null,
      deadline: payload.deadline ?? null,
      assignee: payload.assignee ?? null,
      recurrence_type: payload.recurrence_type,
      recurrence_interval: payload.recurrence_interval,
      recurrence_end_date: payload.recurrence_end_date,
      parent_task_id: null,
    };

    const result = db
      .prepare(`
        INSERT INTO tasks (
          user_id, project_id, assignee_id, title, description, category, priority, status, approval_status, approval_required_level,
          approval_current_level, approval_policy, approved_by, approved_at, sla_level, sla_last_escalated_at, incident_id, estimated_hours,
          deadline, assignee, recurrence_type, recurrence_interval, recurrence_end_date, parent_task_id
        )
        VALUES (
          @user_id, @project_id, @assignee_id, @title, @description, @category, @priority, @status, @approval_status, @approval_required_level,
          @approval_current_level, @approval_policy, @approved_by, @approved_at, @sla_level, @sla_last_escalated_at, @incident_id, @estimated_hours,
          @deadline, @assignee, @recurrence_type, @recurrence_interval, @recurrence_end_date, @parent_task_id
        )
      `)
      .run(insertData);

    const task = getTaskByIdForUser(result.lastInsertRowid, req.user);
    if (task.approval_status === "pending_approval") {
      insertApprovalLog({
        taskId: task.id,
        approverUserId: req.user.id,
        level: 0,
        decision: "requested",
        reason: "Approval workflow requested at task creation",
      });
    } else if (task.approval_status === "approved") {
      insertApprovalLog({
        taskId: task.id,
        approverUserId: req.user.id,
        level: getRequiredApprovalLevel(task),
        decision: "approved",
        reason: "Task created as approved",
      });
    }

    logActivity(task.id, req.user.id, "task_created", "Task created");
    try {
      runAutomationForTaskEvent({
        trigger: "task.created",
        taskId: task.id,
        actorUserId: req.user.id,
        context: { source: "tasks.create" },
      });
    } catch (automationError) {
      // Automation execution must not block API response.
    }
    return res.status(201).json({ data: serializeTask(task, req.user) });
  } catch (error) {
    if (error.message.startsWith("Invalid") || error.message.includes("required") || error.message.includes("Recurring")) {
      return badRequest(res, error.message);
    }
    return res.status(500).json({ error: "Failed to create task" });
  }
});

router.put("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const existingTask = getTaskByIdForUser(id, req.user);
    if (!existingTask) return res.status(404).json({ error: "Task not found" });
    if (!hasOwnerPermission(existingTask, req.user)) {
      return res.status(403).json({ error: "Only owner or admin can update task" });
    }

    const payload = sanitizeTaskPayload(req.body || {}, true);
    const fields = Object.keys(payload);
    if (fields.length === 0) return badRequest(res, "No valid fields to update");
    const addField = (fieldName) => {
      if (!fields.includes(fieldName)) fields.push(fieldName);
    };

    if (payload.project_id !== undefined) {
      ensureProjectExists(payload.project_id);
      if (payload.project_id && !canCreateTaskInProject(payload.project_id, req.user)) {
        return res.status(403).json({ error: "No permission to move task to this project" });
      }
    }

    if (payload.assignee_id !== undefined) {
      ensureUserExists(payload.assignee_id);
    }

    if (payload.approval_status !== undefined) {
      return badRequest(res, "Use workflow endpoints to change approval_status");
    }

    if (payload.sla_level !== undefined && !isManagerOrAdmin(req.user)) {
      return res.status(403).json({ error: "Only manager or admin can set SLA level" });
    }

    const approvalConfigChanged = payload.approval_policy !== undefined || payload.approval_required_level !== undefined;
    if (approvalConfigChanged && existingTask.approval_status === "pending_approval") {
      return badRequest(res, "Cannot change approval policy while approval is pending");
    }

    const finalPolicy = payload.approval_policy !== undefined ? payload.approval_policy : getApprovalPolicy(existingTask);
    if (finalPolicy === "single") {
      payload.approval_required_level = 1;
      addField("approval_required_level");
    }

    if (approvalConfigChanged && existingTask.approval_status === "approved") {
      payload.approval_status = "draft";
      payload.approval_current_level = 0;
      payload.approved_by = null;
      payload.approved_at = null;
      addField("approval_status");
      addField("approval_current_level");
      addField("approved_by");
      addField("approved_at");
    }

    const finalApprovalStatus = payload.approval_status !== undefined ? payload.approval_status : existingTask.approval_status;
    const finalStatus = payload.status !== undefined ? payload.status : existingTask.status;
    if ((finalStatus === "in_progress" || finalStatus === "completed") && finalApprovalStatus !== "approved") {
      return badRequest(res, "Task must be approved before starting/completing");
    }

    if (existingTask.status !== "completed" && finalStatus === "completed") {
      payload.completed_at = new Date().toISOString();
      addField("completed_at");
    } else if (existingTask.status === "completed" && finalStatus !== "completed") {
      payload.completed_at = null;
      addField("completed_at");
    }

    validateRecurrenceConsistency(payload, existingTask);

    const assignments = fields.map((field) => `${field} = @${field}`);
    const sql = `
      UPDATE tasks
      SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `;

    db.prepare(sql).run({ ...payload, id });
    const updated = getTaskByIdForUser(id, req.user);

    const changedFields = fields.join(", ");
    logActivity(id, req.user.id, "task_updated", `Changed: ${changedFields}`);

    if (existingTask.status !== "completed" && updated.status === "completed") {
      maybeCreateNextRecurringTask(updated, req.user.id);
    }

    try {
      const trigger = existingTask.status !== updated.status ? "task.status_changed" : "task.updated";
      runAutomationForTaskEvent({
        trigger,
        taskId: id,
        actorUserId: req.user.id,
        context: {
          source: "tasks.update",
          changed_fields: fields,
          old_status: existingTask.status,
          new_status: updated.status,
        },
      });
    } catch (automationError) {
      // Automation execution must not block API response.
    }

    return res.json({ data: serializeTask(updated, req.user) });
  } catch (error) {
    if (error.message.startsWith("Invalid") || error.message.includes("required") || error.message.includes("Recurring")) {
      return badRequest(res, error.message);
    }
    return res.status(500).json({ error: "Failed to update task" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!hasOwnerPermission(task, req.user)) {
      return res.status(403).json({ error: "Only owner or admin can delete task" });
    }

    logActivity(id, req.user.id, "task_deleted", `Deleted task "${task.title}"`);
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return res.json({ message: "Task deleted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete task" });
  }
});

router.post("/:id/request-approval", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canRequestApproval(task, req.user)) {
      return res.status(403).json({ error: "No permission to request approval" });
    }

    const requiredLevel = getRequiredApprovalLevel(task);
    db.prepare(
      `UPDATE tasks
       SET approval_status = 'pending_approval',
           approval_current_level = 0,
           approved_by = NULL,
           approved_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(id);

    insertApprovalLog({
      taskId: id,
      approverUserId: req.user.id,
      level: 0,
      decision: "requested",
      reason: `Approval requested (${requiredLevel} level(s) required)`,
    });

    logActivity(id, req.user.id, "approval_requested", `Task moved to pending_approval (${requiredLevel} level(s) required)`);
    const updated = getTaskByIdForUser(id, req.user);
    return res.json({ data: serializeTask(updated, req.user) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to request approval" });
  }
});

router.post("/:id/approve", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canApproveTask(task, req.user)) {
      return res.status(403).json({ error: "No permission to approve task" });
    }
    if (task.approval_status !== "pending_approval") {
      return badRequest(res, "Task is not pending approval");
    }

    const requiredLevel = getRequiredApprovalLevel(task);
    const currentLevel = getCurrentApprovalLevel(task);
    const nextLevel = currentLevel + 1;
    const policy = getApprovalPolicy(task);
    const reason = normalizeText(req.body?.reason) || null;

    if (policy === "multi" && hasApprovedBefore(id, req.user.id)) {
      return badRequest(res, "This user already approved this task in current workflow");
    }

    insertApprovalLog({
      taskId: id,
      approverUserId: req.user.id,
      level: nextLevel,
      decision: "approved",
      reason,
    });

    const isFinal = nextLevel >= requiredLevel;
    if (isFinal) {
      db.prepare(
        `UPDATE tasks
         SET approval_status = 'approved',
             approval_current_level = ?,
             approved_by = ?,
             approved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(nextLevel, req.user.id, id);
      logActivity(id, req.user.id, "approved", `Task approved at level ${nextLevel}/${requiredLevel}`);
    } else {
      db.prepare(
        `UPDATE tasks
         SET approval_status = 'pending_approval',
             approval_current_level = ?,
             approved_by = NULL,
             approved_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(nextLevel, id);
      logActivity(id, req.user.id, "approval_level_approved", `Approved level ${nextLevel}/${requiredLevel}`);
    }

    const updated = getTaskByIdForUser(id, req.user);
    return res.json({
      data: serializeTask(updated, req.user),
      meta: {
        required_level: requiredLevel,
        current_level: getCurrentApprovalLevel(updated),
        policy,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to approve task" });
  }
});

router.post("/:id/reject", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canApproveTask(task, req.user)) {
      return res.status(403).json({ error: "No permission to reject task" });
    }
    if (task.approval_status !== "pending_approval") {
      return badRequest(res, "Task is not pending approval");
    }

    const reason = normalizeText(req.body?.reason) || "No reason provided";
    const currentLevel = getCurrentApprovalLevel(task);

    insertApprovalLog({
      taskId: id,
      approverUserId: req.user.id,
      level: Math.max(1, currentLevel),
      decision: "rejected",
      reason,
    });

    db.prepare(
      `UPDATE tasks
       SET approval_status = 'rejected',
           approved_by = ?,
           approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(req.user.id, id);

    logActivity(id, req.user.id, "rejected", reason);
    const updated = getTaskByIdForUser(id, req.user);
    return res.json({ data: serializeTask(updated, req.user) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to reject task" });
  }
});

router.get("/:id/comments", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    return res.json({ data: getTaskComments(id) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch comments" });
  }
});

router.post("/:id/comments", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const content = normalizeText(req.body?.content);
    if (!content) return badRequest(res, "Comment content is required");

    const result = db
      .prepare("INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)")
      .run(id, req.user.id, content);

    logActivity(id, req.user.id, "comment_added", content.slice(0, 120));

    const comment = db
      .prepare(
        `SELECT c.*, u.name AS user_name, u.email AS user_email
         FROM task_comments c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: comment });
  } catch (error) {
    return res.status(500).json({ error: "Failed to add comment" });
  }
});

router.get("/:id/activities", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    return res.json({ data: getTaskActivities(id) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch activity log" });
  }
});

router.get("/:id/approval-logs", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!canRequestApproval(task, req.user)) {
      return res.status(403).json({ error: "No permission to view approval logs" });
    }

    return res.json({ data: getTaskApprovalLogs(id) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch approval logs" });
  }
});

router.get("/:id/subtasks", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const subtasks = getTaskSubtasks(id);
    return res.json({ data: subtasks });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch subtasks" });
  }
});

router.post("/:id/subtasks", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const title = normalizeText(req.body?.title);
    if (!title) return badRequest(res, "Subtask title is required");

    const result = db
      .prepare("INSERT INTO task_subtasks (task_id, user_id, title) VALUES (?, ?, ?)")
      .run(id, req.user.id, title);

    logActivity(id, req.user.id, "subtask_added", title.slice(0, 120));

    const subtask = db
      .prepare(
        `SELECT st.*, u.name AS user_name, u.email AS user_email
         FROM task_subtasks st
         LEFT JOIN users u ON u.id = st.user_id
         WHERE st.id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: subtask });
  } catch (error) {
    return res.status(500).json({ error: "Failed to add subtask" });
  }
});

router.patch("/:id/subtasks/:subtaskId", (req, res) => {
  try {
    const id = Number(req.params.id);
    const subtaskId = Number(req.params.subtaskId);
    if (!Number.isInteger(id) || !Number.isInteger(subtaskId)) {
      return badRequest(res, "Invalid id");
    }

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const existing = db
      .prepare("SELECT * FROM task_subtasks WHERE id = ? AND task_id = ?")
      .get(subtaskId, id);
    if (!existing) return res.status(404).json({ error: "Subtask not found" });

    const updates = [];
    const params = { id: subtaskId };

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "title")) {
      const title = normalizeText(req.body?.title);
      if (!title) return badRequest(res, "Subtask title is required");
      updates.push("title = @title");
      params.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "is_completed")) {
      const isCompleted = Number(req.body?.is_completed) === 1 || String(req.body?.is_completed).toLowerCase() === "true";
      updates.push("is_completed = @is_completed");
      params.is_completed = isCompleted ? 1 : 0;
      updates.push("completed_at = @completed_at");
      params.completed_at = isCompleted ? new Date().toISOString() : null;
    }

    if (updates.length === 0) return badRequest(res, "No valid fields to update");

    updates.push("updated_at = CURRENT_TIMESTAMP");
    db.prepare(`UPDATE task_subtasks SET ${updates.join(", ")} WHERE id = @id`).run(params);

    const updated = db
      .prepare(
        `SELECT st.*, u.name AS user_name, u.email AS user_email
         FROM task_subtasks st
         LEFT JOIN users u ON u.id = st.user_id
         WHERE st.id = ?`
      )
      .get(subtaskId);

    logActivity(id, req.user.id, "subtask_updated", updated.title.slice(0, 120));
    return res.json({ data: updated });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update subtask" });
  }
});

router.delete("/:id/subtasks/:subtaskId", (req, res) => {
  try {
    const id = Number(req.params.id);
    const subtaskId = Number(req.params.subtaskId);
    if (!Number.isInteger(id) || !Number.isInteger(subtaskId)) {
      return badRequest(res, "Invalid id");
    }

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const existing = db
      .prepare("SELECT * FROM task_subtasks WHERE id = ? AND task_id = ?")
      .get(subtaskId, id);
    if (!existing) return res.status(404).json({ error: "Subtask not found" });

    db.prepare("DELETE FROM task_subtasks WHERE id = ?").run(subtaskId);
    logActivity(id, req.user.id, "subtask_deleted", existing.title.slice(0, 120));
    return res.json({ message: "Subtask deleted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete subtask" });
  }
});

router.get("/:id/time-entries", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const entries = getTaskTimeEntries(id);
    const activeEntry = getActiveTimeEntry(id, req.user.id);
    return res.json({ data: entries, active_entry: activeEntry || null });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch time entries" });
  }
});

router.get("/:id/attachments", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const attachments = getTaskAttachments(id).map((item) => serializeAttachment(req, item));
    return res.json({ data: attachments });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch attachments" });
  }
});

router.post("/:id/attachments", upload.single("file"), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");
    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    if (!req.file) return badRequest(res, "Attachment file is required");

    const result = db
      .prepare(
        `INSERT INTO task_attachments (task_id, user_id, original_name, file_name, mime_type, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, req.user.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size);

    logActivity(id, req.user.id, "attachment_added", req.file.originalname);

    const attachment = db
      .prepare(
        `SELECT at.*, u.name AS user_name, u.email AS user_email
         FROM task_attachments at
         LEFT JOIN users u ON u.id = at.user_id
         WHERE at.id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: serializeAttachment(req, attachment) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to upload attachment" });
  }
});

router.delete("/:id/attachments/:attachmentId", (req, res) => {
  try {
    const id = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(id) || !Number.isInteger(attachmentId)) {
      return badRequest(res, "Invalid id");
    }

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const attachment = db
      .prepare("SELECT * FROM task_attachments WHERE id = ? AND task_id = ?")
      .get(attachmentId, id);
    if (!attachment) return res.status(404).json({ error: "Attachment not found" });

    const isUploader = Number(attachment.user_id) === Number(req.user.id);
    if (!isUploader && !hasOwnerPermission(task, req.user)) {
      return res.status(403).json({ error: "No permission to delete attachment" });
    }

    const filePath = path.join(UPLOAD_DIR, attachment.file_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare("DELETE FROM task_attachments WHERE id = ?").run(attachmentId);
    logActivity(id, req.user.id, "attachment_deleted", attachment.original_name);
    return res.json({ message: "Attachment deleted" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete attachment" });
  }
});

router.post("/:id/send-email", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Invalid task id");

    const task = getTaskByIdForUser(id, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const to = String(req.body?.to || req.user.email || "")
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return badRequest(res, "Valid recipient email is required");
    }

    await sendTaskEmail({
      to,
      task,
      sender: {
        name: req.user.name || "User",
        email: req.user.email,
      },
    });

    logActivity(id, req.user.id, "email_sent", `Task sent to ${to}`);
    return res.json({ message: `Task sent to ${to}` });
  } catch (error) {
    console.error("Send email error:", error);
    if (error.message === "SMTP configuration is missing") {
      return res.status(500).json({ error: "Email service is not configured on server" });
    }
    return res.status(500).json({ error: `Failed to send task email: ${error.message}` });
  }
});

module.exports = router;
