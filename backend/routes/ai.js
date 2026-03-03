const crypto = require("crypto");
const express = require("express");
const db = require("../database");
const { publishNotification } = require("../events");
const { canManageProject, isAdmin, isManagerOrAdmin } = require("../services/rbac");
const { generateTaskAssistantReply, isOpenAIConfigured } = require("../services/openai");

const router = express.Router();

const STATUS_LABELS = {
  pending: "pending",
  in_progress: "in progress",
  completed: "completed",
};

const PRIORITY_LABELS = {
  high: "high",
  medium: "medium",
  low: "low",
};

const APPROVAL_LABELS = {
  draft: "draft",
  pending_approval: "pending approval",
  approved: "approved",
  rejected: "rejected",
};

const ACTION_TTL_MS = 10 * 60 * 1000;
const pendingActions = new Map();

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function parsePositiveInt(value, fallback, min = 1, max = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function formatDateText(date) {
  return date.toISOString().slice(0, 10);
}

function buildWeekRange(baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + shift);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: formatDateText(start), end: formatDateText(end), label: "this week" };
}

function buildMonthRange(baseDate = new Date()) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  return { start: formatDateText(start), end: formatDateText(end), label: "this month" };
}

function buildVisibilityContext(user, alias = "t") {
  if (isManagerOrAdmin(user)) {
    return { whereSql: "1 = 1", params: {} };
  }

  return {
    whereSql: `(
      ${alias}.user_id = @viewer_user_id
      OR ${alias}.assignee_id = @viewer_user_id
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = ${alias}.project_id
          AND pm.user_id = @viewer_user_id
      )
    )`,
    params: { viewer_user_id: user.id },
  };
}

function getVisibleProjects(user) {
  if (isManagerOrAdmin(user)) {
    return db.prepare("SELECT id, name FROM projects ORDER BY name ASC").all();
  }

  return db
    .prepare(
      `SELECT DISTINCT p.id, p.name
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.owner_id = @user_id OR pm.user_id = @user_id
       ORDER BY p.name ASC`
    )
    .all({ user_id: user.id });
}

function getVisibleUsers(user) {
  if (isManagerOrAdmin(user)) {
    return db.prepare("SELECT id, name, email FROM users ORDER BY name ASC").all();
  }

  return db
    .prepare(
      `SELECT DISTINCT u.id, u.name, u.email
       FROM users u
       WHERE u.id = @user_id
          OR EXISTS (
            SELECT 1
            FROM project_members me
            JOIN project_members peer ON peer.project_id = me.project_id
            WHERE me.user_id = @user_id
              AND peer.user_id = u.id
          )
       ORDER BY u.name ASC`
    )
    .all({ user_id: user.id });
}

function detectProject(normalizedMessage, projects) {
  if (!projects.length) return null;

  const explicitMatch = normalizedMessage.match(/(?:du an|project)\s+([a-z0-9 _-]{2,60})/);
  if (explicitMatch && explicitMatch[1]) {
    const hint = explicitMatch[1].trim();
    const found = projects.find((project) => normalizeText(project.name).includes(hint) || hint.includes(normalizeText(project.name)));
    if (found) return found;
  }

  const found = projects.find((project) => {
    const normalizedProjectName = normalizeText(project.name);
    return normalizedProjectName.length > 1 && normalizedMessage.includes(normalizedProjectName);
  });

  return found || null;
}

function parseIntent(message, projects) {
  const normalized = normalizeText(message);
  const statuses = new Set();
  const priorities = new Set();
  let timeframe = null;
  let overdueOnly = false;
  let recommendationMode = false;
  let summaryMode = false;
  let unresolvedMode = false;
  let approvalStatus = "";

  if (hasAny(normalized, ["chua hoan thanh", "chua xong", "chua done", "pending", "open", "to do", "todo"])) {
    unresolvedMode = true;
    statuses.add("pending");
    statuses.add("in_progress");
  }
  if (hasAny(normalized, ["dang lam", "in progress", "processing"])) statuses.add("in_progress");
  if (hasAny(normalized, ["hoan thanh", "xong", "completed", "done", "finished"])) statuses.add("completed");
  if (hasAny(normalized, ["qua han", "tre han", "overdue", "late"])) overdueOnly = true;
  if (hasAny(normalized, ["uu tien cao", "khan cap", "high priority", "high"])) priorities.add("high");
  if (hasAny(normalized, ["uu tien trung binh", "medium priority", "medium"])) priorities.add("medium");
  if (hasAny(normalized, ["uu tien thap", "low priority", "low"])) priorities.add("low");

  if (hasAny(normalized, ["cho duyet", "pending approval", "pending_approval"])) approvalStatus = "pending_approval";
  else if (hasAny(normalized, ["da duyet", "approved"])) approvalStatus = "approved";
  else if (hasAny(normalized, ["tu choi", "rejected"])) approvalStatus = "rejected";
  else if (hasAny(normalized, ["draft", "ban nhap"])) approvalStatus = "draft";

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (hasAny(normalized, ["hom nay", "today"])) {
    timeframe = { type: "today", start: formatDateText(today), end: formatDateText(today), label: "today" };
  } else if (hasAny(normalized, ["ngay mai", "tomorrow"])) {
    timeframe = { type: "tomorrow", start: formatDateText(tomorrow), end: formatDateText(tomorrow), label: "tomorrow" };
  } else if (hasAny(normalized, ["tuan nay", "this week"])) {
    timeframe = { type: "week", ...buildWeekRange(now) };
  } else if (hasAny(normalized, ["thang nay", "this month"])) {
    timeframe = { type: "month", ...buildMonthRange(now) };
  } else if (hasAny(normalized, ["7 ngay toi", "7 ngay nua", "next 7 days", "sap toi"])) {
    const end = new Date(today);
    end.setDate(end.getDate() + 6);
    timeframe = { type: "next_7_days", start: formatDateText(today), end: formatDateText(end), label: "next 7 days" };
  }

  if (statuses.size === 3) statuses.clear();

  recommendationMode = hasAny(normalized, ["goi y", "de xuat", "nen lam gi", "lam tiep", "recommend", "suggest", "next", "uu tien task nao"]);
  summaryMode = hasAny(normalized, ["tong quan", "tom tat", "summary", "bao cao", "overview"]);
  const project = detectProject(normalized, projects);

  return {
    message: String(message || "").trim(),
    normalized,
    statuses: Array.from(statuses),
    priorities: Array.from(priorities),
    timeframe,
    overdueOnly,
    unresolvedMode,
    recommendationMode,
    summaryMode,
    project,
    approvalStatus,
  };
}

function applyIntentToWhere(intent, whereParts, params) {
  if (intent.statuses.length === 1) {
    whereParts.push("t.status = @intent_status_0");
    params.intent_status_0 = intent.statuses[0];
  } else if (intent.statuses.length > 1) {
    const names = intent.statuses.map((status, index) => {
      const key = `intent_status_${index}`;
      params[key] = status;
      return `@${key}`;
    });
    whereParts.push(`t.status IN (${names.join(", ")})`);
  }

  if (intent.priorities.length === 1) {
    whereParts.push("t.priority = @intent_priority_0");
    params.intent_priority_0 = intent.priorities[0];
  } else if (intent.priorities.length > 1) {
    const names = intent.priorities.map((priority, index) => {
      const key = `intent_priority_${index}`;
      params[key] = priority;
      return `@${key}`;
    });
    whereParts.push(`t.priority IN (${names.join(", ")})`);
  }

  if (intent.approvalStatus) {
    whereParts.push("t.approval_status = @intent_approval_status");
    params.intent_approval_status = intent.approvalStatus;
  }

  if (intent.project?.id) {
    whereParts.push("t.project_id = @intent_project_id");
    params.intent_project_id = intent.project.id;
  }

  if (intent.overdueOnly) {
    whereParts.push("t.deadline IS NOT NULL");
    whereParts.push("DATE(t.deadline) < DATE('now')");
    whereParts.push("t.status != 'completed'");
  }

  if (intent.timeframe?.start && intent.timeframe?.end) {
    whereParts.push("t.deadline IS NOT NULL");
    whereParts.push("DATE(t.deadline) >= DATE(@intent_date_start)");
    whereParts.push("DATE(t.deadline) <= DATE(@intent_date_end)");
    params.intent_date_start = intent.timeframe.start;
    params.intent_date_end = intent.timeframe.end;
  }
}

function formatTaskLine(task) {
  const due = task.deadline ? `due ${task.deadline}` : "no deadline";
  const project = task.project_name ? ` | ${task.project_name}` : "";
  return `#${task.id} ${task.title} (${task.status}, ${task.priority}, ${due}${project})`;
}

function buildSuggestions(intent, tasks) {
  const suggestions = [
    "Task nao qua han ma toi can xu ly truoc?",
    "Hom nay co bao nhieu task chua hoan thanh?",
    "Task uu tien cao trong tuan nay la gi?",
    "Tong quan tien do cong viec cua toi.",
    "Lap uu tien hom nay cho toi",
  ];

  if (intent.project?.name) suggestions.unshift(`Task cua du an ${intent.project.name} trong tuan nay la gi?`);
  if (intent.overdueOnly) suggestions.unshift("Goi y thu tu xu ly cac task qua han.");
  if (tasks.length > 0) suggestions.push("Task nao co deadline gan nhat?");
  return suggestions.slice(0, 7);
}

function parseSubtasksFromText(text) {
  return String(text || "")
    .split(/[.\n]/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .slice(0, 8)
    .map((item) => item.replace(/^[\-*\d.)\s]+/, "").trim())
    .filter((item) => item.length >= 4);
}

function estimateHoursByComplexity({ title, description }) {
  const text = `${title || ""} ${description || ""}`.toLowerCase();
  const base = 2;
  const keywordWeights = [
    { key: "integration", weight: 2 },
    { key: "deploy", weight: 1 },
    { key: "database", weight: 1.5 },
    { key: "api", weight: 1.5 },
    { key: "security", weight: 2 },
    { key: "refactor", weight: 2.5 },
    { key: "test", weight: 1 },
    { key: "ui", weight: 1.5 },
    { key: "migration", weight: 2.5 },
  ];
  const keywordScore = keywordWeights.reduce((sum, item) => (text.includes(item.key) ? sum + item.weight : sum), 0);
  const lengthFactor = Math.min(4, Math.floor((String(description || "").length || 0) / 140));
  return Math.max(2, Math.min(24, Math.round(base + keywordScore + lengthFactor)));
}

function buildCopilotFallbackBreakdown({ title, description, visibleUsers }) {
  const parsed = parseSubtasksFromText(description);
  const defaults = ["Xac dinh yeu cau va tieu chi hoan thanh", "Thuc hien thay doi chinh", "Tu kiem tra va test", "Cap nhat tai lieu va ban giao"];
  const subtasks = (parsed.length ? parsed : defaults).slice(0, 6);
  const estimateHours = estimateHoursByComplexity({ title, description });

  const workloadRows = db
    .prepare(
      `SELECT assignee_id, COUNT(*) AS in_progress_count
       FROM tasks
       WHERE assignee_id IS NOT NULL
         AND status = 'in_progress'
       GROUP BY assignee_id`
    )
    .all();
  const workloadMap = new Map(workloadRows.map((row) => [Number(row.assignee_id), Number(row.in_progress_count || 0)]));

  const assigneeSuggestions = (visibleUsers || [])
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      current_in_progress: workloadMap.get(Number(user.id)) || 0,
    }))
    .sort((a, b) => a.current_in_progress - b.current_in_progress)
    .slice(0, 3);

  return {
    subtasks,
    estimate_hours: estimateHours,
    suggested_assignees: assigneeSuggestions,
    risk_flags: [
      "Yeu cau co the thay doi trong qua trinh lam",
      "Can bo tri thoi gian test truoc khi chot",
      "Nen co checklist nghiem thu ro rang",
    ],
  };
}

function buildReply(intent, metrics, tasks) {
  const total = metrics.total || 0;
  if (total === 0) {
    const timeframeText = intent.timeframe ? ` trong ${intent.timeframe.label}` : "";
    const projectText = intent.project?.name ? ` cua du an ${intent.project.name}` : "";
    return `Khong tim thay task phu hop${projectText}${timeframeText}. Ban thu bo bot dieu kien de xem du lieu rong hon.`;
  }

  const headerParts = [];
  if (intent.project?.name) headerParts.push(`du an ${intent.project.name}`);
  if (intent.timeframe?.label) headerParts.push(intent.timeframe.label);
  if (intent.overdueOnly) headerParts.push("overdue");
  if (intent.approvalStatus) headerParts.push(APPROVAL_LABELS[intent.approvalStatus] || intent.approvalStatus);

  const scopeText = headerParts.length ? ` (${headerParts.join(" | ")})` : "";
  const baseSummary = `Minh tim thay ${total} task${scopeText}: ${metrics.completed} completed, ${metrics.in_progress} in progress, ${metrics.pending} pending, ${metrics.overdue} overdue.`;

  if (intent.recommendationMode) {
    const actionable = tasks.filter((task) => task.status !== "completed").slice(0, 3);
    if (actionable.length === 0) return `${baseSummary}\nTat ca task trong tap nay da hoan thanh.`;
    const lines = actionable.map((task, index) => `${index + 1}. ${formatTaskLine(task)}`);
    return `${baseSummary}\nGoi y thu tu xu ly tiep theo:\n${lines.join("\n")}`;
  }

  const preview = tasks.slice(0, 3).map((task) => `- ${formatTaskLine(task)}`);
  return `${baseSummary}\nTask tieu bieu:\n${preview.join("\n")}`;
}

function cleanupPendingActions() {
  const now = Date.now();
  Array.from(pendingActions.entries()).forEach(([id, item]) => {
    if (item.expires_at <= now) pendingActions.delete(id);
  });
}

function extractTaskIdFromHistory(history) {
  if (!Array.isArray(history)) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    const ids = Array.isArray(item?.top_task_ids) ? item.top_task_ids : [];
    const first = ids.map((value) => Number(value)).find((value) => Number.isInteger(value) && value > 0);
    if (first) return first;
  }
  return null;
}

function extractTaskId(message, normalizedMessage, history) {
  const explicit = String(message || "").match(/(?:task|viec)?\s*#?\s*(\d{1,9})/i);
  if (explicit) {
    const parsed = Number(explicit[1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  if (hasAny(normalizedMessage, ["task do", "viec do", "no", "cai do"])) {
    return extractTaskIdFromHistory(history);
  }
  return null;
}

function parseRelativeDate(normalizedMessage) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (hasAny(normalizedMessage, ["hom nay", "today"])) return formatDateText(today);
  if (hasAny(normalizedMessage, ["ngay mai", "tomorrow"])) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateText(tomorrow);
  }
  if (hasAny(normalizedMessage, ["tuan sau", "next week"])) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatDateText(nextWeek);
  }

  const iso = normalizedMessage.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const value = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return value;
  }

  const dmy = normalizedMessage.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const yearRaw = Number(dmy[3] || new Date().getFullYear());
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const date = new Date(year, month - 1, day);
    if (!Number.isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month - 1) {
      return formatDateText(date);
    }
  }

  return "";
}

function matchAssignee(normalizedMessage, visibleUsers) {
  const emailMatch = normalizedMessage.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  if (emailMatch) {
    const email = emailMatch[0];
    const byEmail = visibleUsers.find((item) => normalizeText(item.email) === email);
    if (byEmail) return byEmail;
  }

  const byNameHint = normalizedMessage.match(/(?:cho|to)\s+([a-z0-9 ._-]{2,60})$/);
  if (byNameHint && byNameHint[1]) {
    const hint = byNameHint[1].trim();
    const byName = visibleUsers.find((item) => {
      const name = normalizeText(item.name);
      const email = normalizeText(item.email);
      return name.includes(hint) || hint.includes(name) || email.includes(hint);
    });
    if (byName) return byName;
  }

  return null;
}

function detectActionProposal(message, history, visibleUsers) {
  const normalized = normalizeText(message);
  const taskId = extractTaskId(message, normalized, history);

  const completeIntent = hasAny(normalized, [
    "hoan thanh",
    "mark complete",
    "mark done",
    "danh dau xong",
    "danh dau hoan thanh",
    "complete task",
  ]);
  if (completeIntent) {
    if (!taskId) {
      return { blocked: true, reply: "Minh can biet task nao de danh dau hoan thanh. Vi du: hoan thanh task #123." };
    }
    return {
      blocked: false,
      action: { type: "mark_completed", task_id: taskId },
      summary: `Danh dau task #${taskId} la completed`,
    };
  }

  const deadlineIntent = hasAny(normalized, ["doi deadline", "thay deadline", "set deadline", "chuyen deadline", "doi han", "gia han"]);
  if (deadlineIntent) {
    if (!taskId) {
      return { blocked: true, reply: "Minh can task id de doi deadline. Vi du: doi deadline task #123 thanh 2026-02-28." };
    }
    const deadline = parseRelativeDate(normalized);
    if (!deadline) {
      return { blocked: true, reply: "Minh chua nhan duoc ngay deadline moi. Ban dung YYYY-MM-DD, hoac 'hom nay'/'ngay mai'." };
    }
    return {
      blocked: false,
      action: { type: "set_deadline", task_id: taskId, deadline },
      summary: `Doi deadline task #${taskId} thanh ${deadline}`,
    };
  }

  const assignIntent = hasAny(normalized, ["giao task", "phan cong", "assign"]);
  if (assignIntent) {
    if (!taskId) {
      return { blocked: true, reply: "Minh can task id de phan cong. Vi du: giao task #123 cho minh@example.com." };
    }
    const assignee = matchAssignee(normalized, visibleUsers);
    if (!assignee) {
      return { blocked: true, reply: "Minh khong tim thay nguoi duoc giao. Ban thu ghi email hoac ten chinh xac." };
    }
    return {
      blocked: false,
      action: { type: "assign_task", task_id: taskId, assignee_id: assignee.id },
      summary: `Phan cong task #${taskId} cho ${assignee.name} (${assignee.email})`,
    };
  }

  return null;
}

function canManageTask(task, user) {
  if (isManagerOrAdmin(user)) return true;
  if (Number(task.user_id) === Number(user.id)) return true;
  if (task.project_id && canManageProject(task.project_id, user)) return true;
  return false;
}

function getTaskByIdForUser(taskId, user) {
  const visibility = buildVisibilityContext(user, "t");
  return db
    .prepare(
      `SELECT t.*, p.name AS project_name, owner.name AS owner_name, assignee_u.name AS assignee_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users owner ON owner.id = t.user_id
       LEFT JOIN users assignee_u ON assignee_u.id = t.assignee_id
       WHERE t.id = @task_id AND ${visibility.whereSql}`
    )
    .get({ ...visibility.params, task_id: taskId });
}

function logTaskActivity(taskId, userId, action, details) {
  db.prepare("INSERT INTO task_activities (task_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    taskId,
    userId || null,
    action,
    details || null
  );

  const task = db.prepare("SELECT id, title, user_id, assignee_id, project_id FROM tasks WHERE id = ?").get(taskId);
  if (!task) return;

  const projectMembers = task.project_id
    ? db.prepare("SELECT user_id FROM project_members WHERE project_id = ?").all(task.project_id).map((row) => Number(row.user_id))
    : [];

  const userIds = [task.user_id, task.assignee_id, userId]
    .concat(projectMembers)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

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
  const interval = Number(recurrenceInterval) > 0 ? Number(recurrenceInterval) : 1;

  if (recurrenceType === "daily") next.setDate(next.getDate() + interval);
  else if (recurrenceType === "weekly") next.setDate(next.getDate() + interval * 7);
  else if (recurrenceType === "monthly") next.setMonth(next.getMonth() + interval);
  else return null;

  return next.toISOString().slice(0, 10);
}

function maybeCreateNextRecurringTask(task, actorUserId) {
  if (!task || task.recurrence_type === "none") return;
  if (!task.deadline) return;

  const nextDeadline = addRecurrenceDate(task.deadline, task.recurrence_type, task.recurrence_interval);
  if (!nextDeadline) return;

  if (task.recurrence_end_date) {
    const endTime = new Date(task.recurrence_end_date).getTime();
    const nextTime = new Date(nextDeadline).getTime();
    if (Number.isNaN(endTime) || Number.isNaN(nextTime) || nextTime > endTime) {
      return;
    }
  }

  const insertResult = db
    .prepare(
      `INSERT INTO tasks (
         user_id, project_id, assignee_id, title, description, category, priority, status, approval_status, approval_required_level,
         approval_current_level, approval_policy, approved_by, approved_at, sla_level, sla_last_escalated_at, incident_id, estimated_hours,
         deadline, assignee, recurrence_type, recurrence_interval, recurrence_end_date, parent_task_id
       ) VALUES (
         @user_id, @project_id, @assignee_id, @title, @description, @category, @priority, @status, @approval_status, @approval_required_level,
         @approval_current_level, @approval_policy, @approved_by, @approved_at, @sla_level, @sla_last_escalated_at, @incident_id, @estimated_hours,
         @deadline, @assignee, @recurrence_type, @recurrence_interval, @recurrence_end_date, @parent_task_id
       )`
    )
    .run({
      user_id: task.user_id,
      project_id: task.project_id,
      assignee_id: task.assignee_id,
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      status: "pending",
      approval_status: "draft",
      approval_required_level: Number(task.approval_required_level) || 1,
      approval_current_level: 0,
      approval_policy: task.approval_policy || "single",
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
      recurrence_end_date: task.recurrence_end_date || null,
      parent_task_id: task.parent_task_id || task.id,
    });

  const newTaskId = Number(insertResult.lastInsertRowid);
  logTaskActivity(newTaskId, actorUserId, "recurrence_generated", `Generated from task #${task.id} (AI flow)`);
  logTaskActivity(task.id, actorUserId, "recurrence_next_created", `Created next recurring task #${newTaskId} (AI flow)`);
}

function buildHistoryForModel(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({ role: item.role, content: String(item.content || "").trim() }))
    .filter((item) => item.content)
    .slice(-8);
}

function scorePriorityTask(task) {
  let score = 0;
  const reasons = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (task.deadline) {
    const deadlineDate = new Date(`${task.deadline}T00:00:00`);
    if (!Number.isNaN(deadlineDate.getTime())) {
      const diffDays = Math.floor((deadlineDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays < 0) {
        score += 120 + Math.abs(diffDays) * 6;
        reasons.push("overdue");
      } else if (diffDays === 0) {
        score += 40;
        reasons.push("due today");
      } else if (diffDays === 1) {
        score += 26;
        reasons.push("due tomorrow");
      } else if (diffDays <= 3) {
        score += 14;
        reasons.push("due soon");
      } else if (diffDays <= 7) {
        score += 8;
      }
    }
  } else {
    score += 3;
  }

  if (task.priority === "high") {
    score += 34;
    reasons.push("high priority");
  } else if (task.priority === "medium") {
    score += 19;
  } else {
    score += 8;
  }

  if (task.status === "in_progress") {
    score += 10;
    reasons.push("in progress");
  } else if (task.status === "pending") {
    score += 4;
  }

  const updatedAt = task.updated_at ? new Date(task.updated_at) : null;
  if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
    const staleDays = Math.floor((Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    if (staleDays >= 3) {
      score += Math.min(12, staleDays);
      reasons.push("not updated recently");
    }
  }

  return { ...task, priority_score: score, priority_reasons: reasons };
}

function fetchDailyPriorityTasks(user, limit = 6) {
  const visibility = buildVisibilityContext(user, "t");
  const rows = db
    .prepare(
      `SELECT
         t.id, t.title, t.status, t.priority, t.approval_status, t.deadline, t.updated_at,
         p.name AS project_name, assignee_u.name AS assignee_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users assignee_u ON assignee_u.id = t.assignee_id
       WHERE ${visibility.whereSql}
         AND t.status != 'completed'
       ORDER BY t.updated_at DESC
       LIMIT 200`
    )
    .all(visibility.params);

  return rows.map(scorePriorityTask).sort((a, b) => b.priority_score - a.priority_score).slice(0, limit);
}

function buildDailyPriorityReply(tasks) {
  if (!tasks.length) {
    return "Hom nay ban khong co task mo nao. Neu can, minh co the goi y tao task uu tien moi.";
  }
  const lines = tasks.map((task, index) => {
    const dueText = task.deadline ? `due ${task.deadline}` : "no deadline";
    const reasons = task.priority_reasons.length ? ` | ${task.priority_reasons.join(", ")}` : "";
    return `${index + 1}. #${task.id} ${task.title} (${task.status}, ${task.priority}, ${dueText}${reasons})`;
  });
  return `Day la danh sach uu tien hom nay cua ban:\n${lines.join("\n")}`;
}

function buildWeeklyPlan(user) {
  const week = buildWeekRange(new Date());
  const visibility = buildVisibilityContext(user, "t");
  const tasks = db
    .prepare(
      `SELECT
         t.id, t.title, t.status, t.priority, t.deadline, t.updated_at, t.project_id,
         p.name AS project_name, assignee_u.name AS assignee_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users assignee_u ON assignee_u.id = t.assignee_id
       WHERE ${visibility.whereSql}
         AND t.status != 'completed'
         AND t.deadline IS NOT NULL
         AND DATE(t.deadline) BETWEEN DATE(@week_start) AND DATE(@week_end)
       ORDER BY DATE(t.deadline) ASC, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC, t.updated_at DESC
       LIMIT 20`
    )
    .all({
      ...visibility.params,
      week_start: week.start,
      week_end: week.end,
    });

  const scored = tasks.map(scorePriorityTask).sort((a, b) => b.priority_score - a.priority_score);
  return {
    timeframe: week,
    tasks: scored.slice(0, 8),
  };
}

function buildDelayRisk(tasks) {
  return tasks
    .map((task) => {
      let risk = 0;
      const reasons = [];
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (task.deadline) {
        const deadline = new Date(`${task.deadline}T00:00:00`);
        if (!Number.isNaN(deadline.getTime())) {
          const diffDays = Math.floor((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          if (diffDays < 0) {
            risk += 75 + Math.abs(diffDays) * 8;
            reasons.push("overdue");
          } else if (diffDays <= 1) {
            risk += 45;
            reasons.push("deadline critical");
          } else if (diffDays <= 3) {
            risk += 22;
            reasons.push("deadline soon");
          }
        }
      }

      if (task.priority === "high") {
        risk += 28;
        reasons.push("high priority");
      } else if (task.priority === "medium") {
        risk += 14;
      } else {
        risk += 6;
      }

      if (task.status === "pending") {
        risk += 10;
        reasons.push("not started");
      } else if (task.status === "in_progress") {
        risk += 4;
      }

      if (task.updated_at) {
        const updatedAt = new Date(task.updated_at);
        if (!Number.isNaN(updatedAt.getTime())) {
          const staleDays = Math.floor((Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
          if (staleDays >= 3) {
            risk += Math.min(18, staleDays * 2);
            reasons.push("stale update");
          }
        }
      }

      return {
        ...task,
        risk_score: Math.min(100, risk),
        risk_reasons: reasons,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 8);
}

function fetchRiskModelTasks(user, limit = 120) {
  const visibility = buildVisibilityContext(user, "t");
  return db
    .prepare(
      `SELECT
         t.id, t.title, t.status, t.priority, t.approval_status, t.deadline, t.updated_at, t.created_at,
         t.estimated_hours, t.project_id, t.assignee_id,
         p.name AS project_name, assignee_u.name AS assignee_name,
         (SELECT IFNULL(SUM(te.duration_seconds), 0) FROM time_entries te WHERE te.task_id = t.id) AS tracked_seconds,
         (SELECT COUNT(*) FROM task_subtasks st WHERE st.task_id = t.id) AS subtasks_total,
         (SELECT COUNT(*) FROM task_subtasks st WHERE st.task_id = t.id AND st.is_completed = 1) AS subtasks_completed
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN users assignee_u ON assignee_u.id = t.assignee_id
       WHERE ${visibility.whereSql}
         AND t.status != 'completed'
       ORDER BY t.updated_at DESC
       LIMIT @limit`
    )
    .all({
      ...visibility.params,
      limit: parsePositiveInt(limit, 120, 10, 300),
    });
}

function scorePredictiveRisk(task) {
  let score = 0;
  const reasons = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (task.deadline) {
    const deadline = new Date(`${task.deadline}T00:00:00`);
    if (!Number.isNaN(deadline.getTime())) {
      const diffDays = Math.floor((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays < 0) {
        score += 70 + Math.min(20, Math.abs(diffDays) * 4);
        reasons.push("overdue");
      } else if (diffDays <= 1) {
        score += 36;
        reasons.push("deadline critical");
      } else if (diffDays <= 3) {
        score += 18;
        reasons.push("deadline soon");
      }
    }
  } else {
    score += 8;
    reasons.push("missing deadline");
  }

  if (task.priority === "high") {
    score += 18;
    reasons.push("high priority");
  } else if (task.priority === "medium") {
    score += 10;
  } else {
    score += 4;
  }

  if (task.status === "pending") {
    score += 11;
    reasons.push("not started");
  } else if (task.status === "in_progress") {
    score += 5;
  }

  if (task.approval_status === "pending_approval") {
    score += 12;
    reasons.push("waiting approval");
  } else if (task.approval_status === "rejected") {
    score += 16;
    reasons.push("approval rejected");
  }

  if (task.updated_at) {
    const updatedAt = new Date(task.updated_at);
    if (!Number.isNaN(updatedAt.getTime())) {
      const staleDays = Math.floor((Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
      if (staleDays >= 3) {
        score += Math.min(16, staleDays * 2);
        reasons.push("stale update");
      }
    }
  }

  const estimatedHours = Number(task.estimated_hours || 0);
  const trackedHours = Number(task.tracked_seconds || 0) / 3600;
  if (estimatedHours > 0) {
    const burnRatio = trackedHours / estimatedHours;
    if (burnRatio >= 1.2) {
      score += 14;
      reasons.push("effort overrun");
    } else if (burnRatio >= 0.8) {
      score += 8;
      reasons.push("near estimate limit");
    }
  }

  const subtasksTotal = Number(task.subtasks_total || 0);
  const subtasksCompleted = Number(task.subtasks_completed || 0);
  if (subtasksTotal > 0) {
    const progress = subtasksCompleted / subtasksTotal;
    if (progress <= 0.25) {
      score += 10;
      reasons.push("low checklist progress");
    } else if (progress <= 0.5) {
      score += 5;
    }
  }

  const riskScore = Math.min(100, Math.max(0, Math.round(score)));
  const riskBand = riskScore >= 75 ? "critical" : riskScore >= 55 ? "high" : riskScore >= 35 ? "medium" : "low";
  return {
    ...task,
    tracked_hours: Number(trackedHours.toFixed(2)),
    estimated_hours: estimatedHours > 0 ? estimatedHours : null,
    risk_score: riskScore,
    risk_band: riskBand,
    risk_reasons: [...new Set(reasons)],
  };
}

function buildPredictiveRisk(tasks, limit = 10) {
  return tasks.map(scorePredictiveRisk).sort((a, b) => b.risk_score - a.risk_score).slice(0, limit);
}

function buildRiskRecommendations(predictions) {
  if (!predictions.length) return ["Khong co task mo de du doan rui ro."];
  const critical = predictions.filter((item) => item.risk_band === "critical").length;
  const high = predictions.filter((item) => item.risk_band === "high").length;
  const approvalBlocked = predictions.filter((item) => item.risk_reasons.includes("waiting approval")).length;
  const stale = predictions.filter((item) => item.risk_reasons.includes("stale update")).length;

  const recommendations = [];
  if (critical > 0) recommendations.push(`Xu ly ngay ${critical} task muc critical trong 24h toi.`);
  if (high > 0) recommendations.push(`Co ${high} task muc high can gan owner ro rang va check-in hang ngay.`);
  if (approvalBlocked > 0) recommendations.push(`Co ${approvalBlocked} task dang cho duyet, nen rut ngan bottleneck phe duyet.`);
  if (stale > 0) recommendations.push(`Co ${stale} task it cap nhat. Nen cap nhat status/tien do de AI danh gia chinh xac hon.`);
  if (!recommendations.length) recommendations.push("Rui ro hien tai on dinh. Duy tri rhythm cap nhat hang ngay.");
  return recommendations.slice(0, 6);
}

function buildManagerRecommendations(delayRisk, weeklyPlanTasks) {
  const recommendations = [];

  const critical = delayRisk.filter((task) => task.risk_score >= 70);
  if (critical.length) {
    recommendations.push(`Co ${critical.length} task nguy co tre cao. Nen xu ly ngay cac task co risk >= 70.`);
  }

  const highPriorityWeek = weeklyPlanTasks.filter((task) => task.priority === "high").length;
  if (highPriorityWeek > 0) {
    recommendations.push(`Tuan nay co ${highPriorityWeek} task high priority den han. Nen chia slot hoan thanh som trong 48h dau.`);
  }

  if (!critical.length && highPriorityWeek === 0) {
    recommendations.push("Rui ro hien tai on dinh. Ban co the day nhanh backlog medium priority de tang throughput.");
  }

  recommendations.push("Can cap nhat status task it nhat 1 lan/ngay de AI du doan tre han chinh xac hon.");
  return recommendations.slice(0, 5);
}

function registerPendingAction(userId, action, summary) {
  cleanupPendingActions();
  const id = crypto.randomUUID();
  const now = Date.now();
  pendingActions.set(id, {
    id,
    user_id: Number(userId),
    action,
    summary,
    created_at: new Date(now).toISOString(),
    expires_at: now + ACTION_TTL_MS,
  });
  return pendingActions.get(id);
}

function getPendingActionForUser(actionId, userId) {
  cleanupPendingActions();
  const pending = pendingActions.get(actionId);
  if (!pending) return null;
  if (Number(pending.user_id) !== Number(userId)) return null;
  return pending;
}

function executePendingAction(pending, user) {
  const action = pending.action;
  const task = getTaskByIdForUser(action.task_id, user);
  if (!task) throw new Error("Task not found or not accessible");
  if (!canManageTask(task, user)) throw new Error("No permission to update this task");

  if (action.type === "mark_completed") {
    if (task.approval_status !== "approved") throw new Error("Task must be approved before completing");
    db.prepare("UPDATE tasks SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
    logTaskActivity(task.id, user.id, "task_updated", "Changed: status, completed_at (from AI confirm)");
    maybeCreateNextRecurringTask(task, user.id);
    return { message: `Da danh dau task #${task.id} "${task.title}" la completed.`, task_id: task.id };
  }

  if (action.type === "set_deadline") {
    db.prepare("UPDATE tasks SET deadline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(action.deadline, task.id);
    logTaskActivity(task.id, user.id, "task_updated", `Changed: deadline=${action.deadline} (from AI confirm)`);
    return { message: `Da doi deadline task #${task.id} thanh ${action.deadline}.`, task_id: task.id };
  }

  if (action.type === "assign_task") {
    const assignee = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(action.assignee_id);
    if (!assignee) throw new Error("Assignee not found");
    db.prepare("UPDATE tasks SET assignee_id = ?, assignee = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      assignee.id,
      assignee.name,
      task.id
    );
    logTaskActivity(task.id, user.id, "task_updated", `Changed: assignee_id=${assignee.id} (from AI confirm)`);
    return { message: `Da phan cong task #${task.id} cho ${assignee.name} (${assignee.email}).`, task_id: task.id };
  }

  throw new Error("Unsupported action type");
}

router.get("/risk-predictions", async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 10, 3, 25);
    const tasks = fetchRiskModelTasks(req.user, 220);
    const predictions = buildPredictiveRisk(tasks, limit);
    const summary = {
      total_open_tasks: tasks.length,
      critical: predictions.filter((item) => item.risk_band === "critical").length,
      high: predictions.filter((item) => item.risk_band === "high").length,
      medium: predictions.filter((item) => item.risk_band === "medium").length,
      low: predictions.filter((item) => item.risk_band === "low").length,
      average_risk_score: predictions.length
        ? Number((predictions.reduce((sum, item) => sum + Number(item.risk_score || 0), 0) / predictions.length).toFixed(1))
        : 0,
    };
    const recommendations = buildRiskRecommendations(predictions);

    const fallbackReply = [
      `AI du doan rui ro cho ${predictions.length}/${tasks.length} task mo.`,
      `Critical: ${summary.critical}, High: ${summary.high}, Medium: ${summary.medium}, Low: ${summary.low}.`,
      ...recommendations.map((item, index) => `${index + 1}. ${item}`),
    ].join("\n");

    const modelResult = await generateTaskAssistantReply({
      question: "Phan tich rui ro tre han theo muc do critical/high/medium/low va de xuat hanh dong.",
      user: req.user,
      context: {
        risk_summary: summary,
        top_risk_tasks: predictions,
        recommendations,
      },
      history: [],
    });

    return res.json({
      reply: modelResult.ok ? modelResult.reply : fallbackReply,
      data: {
        predictions,
        summary,
        recommendations,
      },
      generated_at: new Date().toISOString(),
      ai_provider: {
        configured: isOpenAIConfigured(),
        mode: modelResult.ok ? "openai" : "rule_based_fallback",
        model: modelResult.model || "",
        fallback_reason: modelResult.ok ? "" : modelResult.reason,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to build risk predictions" });
  }
});

router.get("/insights", async (req, res) => {
  try {
    const visibility = buildVisibilityContext(req.user, "t");
    const openTasks = db
      .prepare(
        `SELECT
           t.id, t.title, t.status, t.priority, t.approval_status, t.deadline, t.updated_at,
           p.name AS project_name, assignee_u.name AS assignee_name
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN users assignee_u ON assignee_u.id = t.assignee_id
         WHERE ${visibility.whereSql}
           AND t.status != 'completed'
         ORDER BY t.updated_at DESC
         LIMIT 250`
      )
      .all(visibility.params);

    const weeklyPlan = buildWeeklyPlan(req.user);
    const delayRisk = buildDelayRisk(openTasks);
    const recommendations = buildManagerRecommendations(delayRisk, weeklyPlan.tasks);

    const fallbackSummary = [
      `Tuan nay co ${weeklyPlan.tasks.length} task den han trong khung ${weeklyPlan.timeframe.start} -> ${weeklyPlan.timeframe.end}.`,
      `AI danh gia ${delayRisk.length} task can theo doi rui ro tre han.`,
      ...recommendations.map((item, index) => `${index + 1}. ${item}`),
    ].join("\n");

    const modelResult = await generateTaskAssistantReply({
      question: "Phan tich rui ro tre han va lap ke hoach tuan toi dua tren du lieu sau.",
      user: req.user,
      context: {
        weekly_plan: weeklyPlan,
        delay_risk: delayRisk,
        recommendations,
      },
      history: [],
    });

    return res.json({
      reply: modelResult.ok ? modelResult.reply : fallbackSummary,
      data: {
        weekly_plan: weeklyPlan,
        delay_risk: delayRisk,
        recommendations,
      },
      generated_at: new Date().toISOString(),
      ai_provider: {
        configured: isOpenAIConfigured(),
        mode: modelResult.ok ? "openai" : "rule_based_fallback",
        model: modelResult.model || "",
        fallback_reason: modelResult.ok ? "" : modelResult.reason,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to generate AI insights" });
  }
});

router.get("/daily-priority", async (req, res) => {
  try {
    const tasks = fetchDailyPriorityTasks(req.user, 6);
    const summary = {
      total_recommended: tasks.length,
      high_priority: tasks.filter((task) => task.priority === "high").length,
      overdue: tasks.filter((task) => task.priority_reasons.includes("overdue")).length,
      in_progress: tasks.filter((task) => task.status === "in_progress").length,
    };

    const fallbackReply = buildDailyPriorityReply(tasks);
    const modelResult = await generateTaskAssistantReply({
      question: "Lap danh sach uu tien hom nay va giai thich ngan gon.",
      user: req.user,
      context: {
        daily_summary: summary,
        top_tasks: tasks,
      },
      history: [],
    });

    return res.json({
      reply: modelResult.ok ? modelResult.reply : fallbackReply,
      data: tasks,
      summary,
      generated_at: new Date().toISOString(),
      ai_provider: {
        configured: isOpenAIConfigured(),
        mode: modelResult.ok ? "openai" : "rule_based_fallback",
        model: modelResult.model || "",
        fallback_reason: modelResult.ok ? "" : modelResult.reason,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to build daily priority plan" });
  }
});

router.get("/copilot/daily-brief", async (req, res) => {
  try {
    const tasks = fetchDailyPriorityTasks(req.user, 8);
    const visibility = buildVisibilityContext(req.user, "t");

    const totals = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
           SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN t.deadline IS NOT NULL AND DATE(t.deadline) < DATE('now') AND t.status != 'completed' THEN 1 ELSE 0 END) AS overdue
         FROM tasks t
         WHERE ${visibility.whereSql}`
      )
      .get(visibility.params);

    const fallbackLines = [
      `Hom nay ban co ${Number(totals.total || 0)} task trong scope hien tai.`,
      `${Number(totals.in_progress || 0)} task dang lam, ${Number(totals.pending || 0)} task pending, ${Number(totals.overdue || 0)} task overdue.`,
      tasks.length ? `Uu tien tiep theo: ${tasks.slice(0, 3).map((item) => `#${item.id}`).join(", ")}.` : "Khong co task uu tien cao can xu ly ngay.",
    ];

    const modelResult = await generateTaskAssistantReply({
      question: "Tao daily brief gon gon, thuc dung cho nguoi dung.",
      user: req.user,
      context: {
        daily_brief: totals,
        top_tasks: tasks,
      },
      history: [],
    });

    return res.json({
      reply: modelResult.ok ? modelResult.reply : fallbackLines.join("\n"),
      data: {
        totals: {
          total: Number(totals.total || 0),
          completed: Number(totals.completed || 0),
          in_progress: Number(totals.in_progress || 0),
          pending: Number(totals.pending || 0),
          overdue: Number(totals.overdue || 0),
        },
        priorities: tasks,
      },
      generated_at: new Date().toISOString(),
      ai_provider: {
        configured: isOpenAIConfigured(),
        mode: modelResult.ok ? "openai" : "rule_based_fallback",
        model: modelResult.model || "",
        fallback_reason: modelResult.ok ? "" : modelResult.reason,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to build copilot daily brief" });
  }
});

router.post("/copilot/task-breakdown", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    if (!title) return res.status(400).json({ error: "Task title is required" });

    const visibleUsers = getVisibleUsers(req.user);
    const fallback = buildCopilotFallbackBreakdown({ title, description, visibleUsers });
    const modelResult = await generateTaskAssistantReply({
      question: `Phan ra subtask va de xuat cach thuc thi cho task: ${title}`,
      user: req.user,
      context: {
        task_input: { title, description },
        copilot_suggestion: fallback,
      },
      history: [],
    });

    return res.json({
      reply: modelResult.ok
        ? modelResult.reply
        : `De xuat tach task "${title}" thanh ${fallback.subtasks.length} buoc va uoc luong ${fallback.estimate_hours} gio.`,
      data: fallback,
      generated_at: new Date().toISOString(),
      ai_provider: {
        configured: isOpenAIConfigured(),
        mode: modelResult.ok ? "openai" : "rule_based_fallback",
        model: modelResult.model || "",
        fallback_reason: modelResult.ok ? "" : modelResult.reason,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to generate task breakdown" });
  }
});

router.post("/actions/:id/confirm", (req, res) => {
  try {
    const actionId = String(req.params.id || "").trim();
    if (!actionId) return res.status(400).json({ error: "Action id is required" });

    const pending = getPendingActionForUser(actionId, req.user.id);
    if (!pending) return res.status(404).json({ error: "Pending action not found or expired" });

    const result = executePendingAction(pending, req.user);
    pendingActions.delete(actionId);

    return res.json({
      message: result.message,
      task_id: result.task_id,
      executed_action_id: actionId,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to execute action" });
  }
});

router.post("/actions/:id/cancel", (req, res) => {
  try {
    const actionId = String(req.params.id || "").trim();
    if (!actionId) return res.status(400).json({ error: "Action id is required" });

    const pending = getPendingActionForUser(actionId, req.user.id);
    if (!pending) return res.status(404).json({ error: "Pending action not found or expired" });

    pendingActions.delete(actionId);
    return res.json({ message: "Pending action canceled", canceled_action_id: actionId });
  } catch (error) {
    return res.status(500).json({ error: "Failed to cancel action" });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "Message is required" });

    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const modelHistory = buildHistoryForModel(history);
    const visibleUsers = getVisibleUsers(req.user);
    const actionProposal = detectActionProposal(message, history, visibleUsers);
    const projects = getVisibleProjects(req.user);
    const intent = parseIntent(message, projects);

    const visibility = buildVisibilityContext(req.user, "t");
    const whereParts = [visibility.whereSql];
    const params = { ...visibility.params };
    applyIntentToWhere(intent, whereParts, params);
    const whereSql = whereParts.length ? whereParts.join(" AND ") : "1 = 1";

    const metrics = db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
          SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN t.deadline IS NOT NULL AND DATE(t.deadline) < DATE('now') AND t.status != 'completed' THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN t.deadline IS NOT NULL AND DATE(t.deadline) = DATE('now') AND t.status != 'completed' THEN 1 ELSE 0 END) AS due_today,
          SUM(CASE WHEN t.deadline IS NOT NULL AND DATE(t.deadline) = DATE('now', '+1 day') AND t.status != 'completed' THEN 1 ELSE 0 END) AS due_tomorrow
         FROM tasks t
         WHERE ${whereSql}`
      )
      .get(params);

    const topTasks = db
      .prepare(
        `SELECT
          t.id, t.title, t.status, t.priority, t.approval_status, t.deadline, t.updated_at,
          p.name AS project_name, assignee_u.name AS assignee_name
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN users assignee_u ON assignee_u.id = t.assignee_id
         WHERE ${whereSql}
         ORDER BY
          CASE WHEN t.deadline IS NOT NULL AND DATE(t.deadline) < DATE('now') AND t.status != 'completed' THEN 0 ELSE 1 END,
          CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
          CASE WHEN t.deadline IS NULL THEN 1 ELSE 0 END,
          DATE(t.deadline) ASC,
          t.updated_at DESC
         LIMIT 8`
      )
      .all(params);

    const byStatusRaw = db.prepare(`SELECT t.status AS key, COUNT(*) AS value FROM tasks t WHERE ${whereSql} GROUP BY t.status`).all(params);
    const byPriorityRaw = db.prepare(`SELECT t.priority AS key, COUNT(*) AS value FROM tasks t WHERE ${whereSql} GROUP BY t.priority`).all(params);

    const byStatus = ["pending", "in_progress", "completed"].map((key) => ({
      key,
      label: STATUS_LABELS[key] || key,
      value: byStatusRaw.find((item) => item.key === key)?.value || 0,
    }));
    const byPriority = ["high", "medium", "low"].map((key) => ({
      key,
      label: PRIORITY_LABELS[key] || key,
      value: byPriorityRaw.find((item) => item.key === key)?.value || 0,
    }));

    const completionRate =
      Number(metrics.total || 0) > 0 ? Number((((metrics.completed || 0) / Number(metrics.total || 1)) * 100).toFixed(2)) : 0;

    const fallbackReply = buildReply(intent, metrics, topTasks);
    const suggestions = buildSuggestions(intent, topTasks);
    const interpreted = {
      timeframe: intent.timeframe?.label || "",
      statuses: intent.statuses,
      priorities: intent.priorities,
      overdue_only: intent.overdueOnly,
      unresolved_mode: intent.unresolvedMode,
      recommendation_mode: intent.recommendationMode,
      summary_mode: intent.summaryMode,
      project: intent.project ? { id: intent.project.id, name: intent.project.name } : null,
      approval_status: intent.approvalStatus || "",
    };
    const outputMetrics = {
      total: Number(metrics.total || 0),
      completed: Number(metrics.completed || 0),
      in_progress: Number(metrics.in_progress || 0),
      pending: Number(metrics.pending || 0),
      overdue: Number(metrics.overdue || 0),
      due_today: Number(metrics.due_today || 0),
      due_tomorrow: Number(metrics.due_tomorrow || 0),
      completion_rate: completionRate,
    };
    const breakdown = { by_status: byStatus, by_priority: byPriority };
    const generatedAt = new Date().toISOString();

    if (actionProposal?.blocked) {
      return res.json({
        reply: actionProposal.reply,
        interpreted,
        metrics: outputMetrics,
        breakdown,
        top_tasks: topTasks,
        matched_tasks_count: Number(metrics.total || 0),
        suggestions,
        generated_at: generatedAt,
        pending_action: null,
        ai_provider: { configured: isOpenAIConfigured(), mode: "rule_based_fallback", model: "", fallback_reason: "action_missing_parameters" },
      });
    }

    if (actionProposal?.action) {
      const pending = registerPendingAction(req.user.id, actionProposal.action, actionProposal.summary);
      return res.json({
        reply: `Minh da hieu yeu cau: ${actionProposal.summary}.\nBan bam Confirm de thuc thi.`,
        interpreted,
        metrics: outputMetrics,
        breakdown,
        top_tasks: topTasks,
        matched_tasks_count: Number(metrics.total || 0),
        suggestions,
        generated_at: generatedAt,
        pending_action: {
          id: pending.id,
          summary: pending.summary,
          expires_at: new Date(pending.expires_at).toISOString(),
          action_type: pending.action.type,
          task_id: pending.action.task_id,
        },
        ai_provider: { configured: isOpenAIConfigured(), mode: "rule_based_fallback", model: "", fallback_reason: "confirmation_required" },
      });
    }

    const openAIResult = await generateTaskAssistantReply({
      question: message,
      user: req.user,
      context: {
        interpreted,
        metrics: outputMetrics,
        breakdown,
        top_tasks: topTasks,
        generated_at: generatedAt,
      },
      history: modelHistory,
    });
    const finalReply = openAIResult.ok ? openAIResult.reply : fallbackReply;

    return res.json({
      reply: finalReply,
      interpreted,
      metrics: outputMetrics,
      breakdown,
      top_tasks: topTasks,
      matched_tasks_count: Number(metrics.total || 0),
      suggestions,
      generated_at: generatedAt,
      pending_action: null,
      ai_provider: {
        configured: isOpenAIConfigured(),
        mode: openAIResult.ok ? "openai" : "rule_based_fallback",
        model: openAIResult.model || "",
        fallback_reason: openAIResult.ok ? "" : openAIResult.reason,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to process AI request" });
  }
});

module.exports = router;
