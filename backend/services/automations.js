const db = require("../database");
const { publishNotification } = require("../events");

const VALID_TRIGGERS = ["task.created", "task.updated", "task.status_changed", "schedule.hourly", "manual", "*"];
const VALID_STATUSES = ["pending", "in_progress", "completed"];
const VALID_PRIORITIES = ["low", "medium", "high"];
const VALID_APPROVAL_STATUSES = ["draft", "pending_approval", "approved", "rejected"];

function parseJsonSafe(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function toInt(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

function isTruthy(value) {
  if (value === true || value === 1) return true;
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

function normalizeRuleRow(row) {
  return {
    ...row,
    trigger: VALID_TRIGGERS.includes(String(row.trigger || "").trim()) ? String(row.trigger).trim() : "task.updated",
    conditions: parseJsonSafe(row.conditions_json, {}) || {},
    actions: parseJsonSafe(row.actions_json, {}) || {},
  };
}

function findTaskById(taskId) {
  const parsedId = toInt(taskId);
  if (!parsedId || parsedId <= 0) return null;
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(parsedId);
}

function isTaskOverdue(task) {
  if (!task?.deadline || task.status === "completed") return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadline = new Date(`${task.deadline}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() < now.getTime();
}

function isWithinDeadline(task, withinDays) {
  if (!task?.deadline) return false;
  const parsedDays = toInt(withinDays);
  if (!Number.isInteger(parsedDays)) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadline = new Date(`${task.deadline}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return false;
  const diffDays = Math.floor((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays <= parsedDays;
}

function matchSetCondition(taskValue, configuredValues) {
  const expected = asArray(configuredValues)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (expected.length === 0) return true;
  return expected.includes(String(taskValue || "").trim());
}

function matchRuleConditions(task, conditions = {}, context = {}) {
  if (!task) return false;

  if (!matchSetCondition(task.status, conditions.status_is)) return false;
  if (!matchSetCondition(task.priority, conditions.priority_is)) return false;
  if (!matchSetCondition(task.approval_status, conditions.approval_status_is)) return false;

  const projectId = toInt(conditions.project_id);
  if (projectId && Number(task.project_id) !== projectId) return false;

  const assigneeId = toInt(conditions.assignee_id);
  if (assigneeId && Number(task.assignee_id) !== assigneeId) return false;

  if (isTruthy(conditions.overdue_only) && !isTaskOverdue(task)) return false;

  if (conditions.deadline_within_days !== undefined && !isWithinDeadline(task, conditions.deadline_within_days)) {
    return false;
  }

  const titleContains = String(conditions.title_contains || "").trim().toLowerCase();
  if (titleContains) {
    const title = String(task.title || "").toLowerCase();
    if (!title.includes(titleContains)) return false;
  }

  if (Array.isArray(conditions.changed_fields) && conditions.changed_fields.length > 0) {
    const changedFields = Array.isArray(context.changed_fields) ? context.changed_fields : [];
    const intersects = conditions.changed_fields.some((field) => changedFields.includes(field));
    if (!intersects) return false;
  }

  return true;
}

function buildRuleTaskUpdates(task, actions = {}) {
  const updates = {};
  const setPriority = String(actions.set_priority || "").trim();
  if (VALID_PRIORITIES.includes(setPriority) && setPriority !== task.priority) {
    updates.priority = setPriority;
  }

  const setStatus = String(actions.set_status || "").trim();
  if (VALID_STATUSES.includes(setStatus) && setStatus !== task.status) {
    updates.status = setStatus;
    if (setStatus === "completed") updates.completed_at = new Date().toISOString();
    if (task.status === "completed" && setStatus !== "completed") updates.completed_at = null;
  }

  const setApprovalStatus = String(actions.set_approval_status || "").trim();
  if (VALID_APPROVAL_STATUSES.includes(setApprovalStatus) && setApprovalStatus !== task.approval_status) {
    updates.approval_status = setApprovalStatus;
    if (setApprovalStatus !== "approved") {
      updates.approved_by = null;
      updates.approved_at = null;
      updates.approval_current_level = 0;
    }
  }

  const setAssigneeId = toInt(actions.set_assignee_id);
  if (setAssigneeId && setAssigneeId !== Number(task.assignee_id)) {
    updates.assignee_id = setAssigneeId;
  }

  const deadlineOffset = toInt(actions.set_deadline_offset_days);
  if (Number.isInteger(deadlineOffset)) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + deadlineOffset);
    updates.deadline = date.toISOString().slice(0, 10);
  }

  if (isTruthy(actions.request_approval)) {
    updates.approval_status = "pending_approval";
    updates.approved_by = null;
    updates.approved_at = null;
    updates.approval_current_level = 0;
  }

  return updates;
}

function applyTaskUpdates(taskId, updates) {
  const fields = Object.keys(updates);
  if (fields.length === 0) return false;
  const setSql = fields.map((field) => `${field} = @${field}`).join(", ");
  db.prepare(`UPDATE tasks SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...updates, id: taskId });
  return true;
}

function recordTaskActivity(taskId, userId, action, details) {
  db.prepare("INSERT INTO task_activities (task_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    taskId,
    userId || null,
    action,
    details || null
  );
}

function applyRuleActions(rule, task, actorUserId, context = {}) {
  const updates = buildRuleTaskUpdates(task, rule.actions);
  const updated = applyTaskUpdates(task.id, updates);

  const commentText = String(rule.actions?.add_comment || "").trim();
  if (commentText) {
    db.prepare("INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)").run(task.id, actorUserId || null, commentText);
  }

  const activityText = String(rule.actions?.add_activity_note || "").trim();
  const changedFields = Object.keys(updates);
  const detailsText = activityText || `Rule "${rule.name}" applied${changedFields.length ? `; updated: ${changedFields.join(", ")}` : ""}`;
  recordTaskActivity(task.id, actorUserId || null, "automation_rule_applied", detailsText);

  const notifyMessage = String(rule.actions?.notify_message || "").trim();
  if (notifyMessage) {
    publishNotification({
      type: "automation_rule",
      task_id: task.id,
      title: task.title,
      message: notifyMessage,
      details: `Rule: ${rule.name}`,
      user_ids: [task.user_id, task.assignee_id].filter((value) => Number.isInteger(Number(value))).map((value) => Number(value)),
    });
  }

  db.prepare("UPDATE automation_rules SET last_run_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, last_result_json = ? WHERE id = ?").run(
    JSON.stringify({
      ok: true,
      updated_task_fields: changedFields,
      actor_user_id: actorUserId || null,
      context,
    }),
    rule.id
  );

  return {
    rule_id: rule.id,
    updated,
    changed_fields: changedFields,
    added_comment: Boolean(commentText),
  };
}

function listActiveRules(trigger) {
  const normalizedTrigger = String(trigger || "").trim() || "task.updated";
  return db
    .prepare(
      `SELECT *
       FROM automation_rules
       WHERE is_active = 1
         AND (trigger = @trigger OR trigger = '*')
       ORDER BY id ASC`
    )
    .all({ trigger: normalizedTrigger })
    .map(normalizeRuleRow);
}

function runAutomationForTaskEvent({ trigger = "task.updated", taskId, actorUserId = null, context = {} } = {}) {
  const task = findTaskById(taskId);
  if (!task) {
    return { trigger, task_id: Number(taskId) || null, matched: 0, executed: 0, results: [] };
  }

  const rules = listActiveRules(trigger);
  let matched = 0;
  let executed = 0;
  const results = [];
  for (const rule of rules) {
    if (!matchRuleConditions(task, rule.conditions, context)) continue;
    matched += 1;
    const result = applyRuleActions(rule, task, actorUserId, context);
    results.push(result);
    if (result.updated || result.added_comment) executed += 1;
  }

  return {
    trigger,
    task_id: task.id,
    matched,
    executed,
    results,
  };
}

function listAutomationRules() {
  return db
    .prepare(
      `SELECT r.*, u.name AS created_by_name, u.email AS created_by_email
       FROM automation_rules r
       LEFT JOIN users u ON u.id = r.created_by_user_id
       ORDER BY datetime(r.updated_at) DESC, r.id DESC`
    )
    .all()
    .map((row) => {
      const normalized = normalizeRuleRow(row);
      return {
        ...row,
        trigger: normalized.trigger,
        conditions: normalized.conditions,
        actions: normalized.actions,
      };
    });
}

function runAutomationBatch({ trigger = "schedule.hourly", actorUserId = null, limit = 120 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, toInt(limit, 120) || 120));
  const candidates = db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE status != 'completed'
       ORDER BY datetime(updated_at) DESC
       LIMIT ?`
    )
    .all(safeLimit);

  let executed = 0;
  let matched = 0;
  for (const candidate of candidates) {
    const result = runAutomationForTaskEvent({
      trigger,
      taskId: candidate.id,
      actorUserId,
      context: { source: "batch" },
    });
    executed += result.executed;
    matched += result.matched;
  }

  return {
    trigger,
    scanned: candidates.length,
    matched,
    executed,
  };
}

module.exports = {
  VALID_TRIGGERS,
  listAutomationRules,
  runAutomationForTaskEvent,
  runAutomationBatch,
};
