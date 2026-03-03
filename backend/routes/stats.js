const express = require("express");
const db = require("../database");
const { isManagerOrAdmin } = require("../services/rbac");

const router = express.Router();

const STATUSES = ["pending", "in_progress", "completed"];
const PRIORITIES = ["low", "medium", "high"];
const CATEGORIES = ["work", "personal", "project", "meeting"];
const APPROVAL_STATUSES = ["draft", "pending_approval", "approved", "rejected"];
const WINDOW_DAY_OPTIONS = [7, 30, 90];

function mapGroupCounts(rows, keys) {
  const lookup = new Map(rows.map((row) => [row.key, row.value]));
  return keys.map((key) => ({
    key,
    value: lookup.get(key) || 0,
  }));
}

function parsePositiveInt(value, fallback, min = 1, max = 365) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseOptionalId(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDateText(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toIsoDateText(date) {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(dateFromText, dateToText, windowDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let fromDate = dateFromText ? new Date(`${dateFromText}T00:00:00`) : null;
  let toDate = dateToText ? new Date(`${dateToText}T00:00:00`) : null;

  if (!fromDate && !toDate) {
    toDate = new Date(today);
    fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - (windowDays - 1));
  } else if (!fromDate && toDate) {
    fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - (windowDays - 1));
  } else if (fromDate && !toDate) {
    toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + (windowDays - 1));
  }

  if (fromDate.getTime() > toDate.getTime()) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  return {
    date_from: toIsoDateText(fromDate),
    date_to: toIsoDateText(toDate),
  };
}

function listDates(fromDateText, toDateText) {
  const start = new Date(`${fromDateText}T00:00:00`);
  const end = new Date(`${toDateText}T00:00:00`);
  const result = [];

  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    result.push(toIsoDateText(cursor));
  }

  return result;
}

function buildWhereContext(user, filters, alias = "tasks") {
  const conditions = [];
  const params = {};

  if (!isManagerOrAdmin(user)) {
    conditions.push(`
      (
        ${alias}.user_id = @viewer_user_id
        OR ${alias}.assignee_id = @viewer_user_id
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = ${alias}.project_id
            AND pm.user_id = @viewer_user_id
        )
      )
    `);
    params.viewer_user_id = user.id;
  }

  if (filters.project_id) {
    conditions.push(`${alias}.project_id = @project_id`);
    params.project_id = filters.project_id;
  }

  if (filters.assignee_id) {
    conditions.push(`${alias}.assignee_id = @assignee_id`);
    params.assignee_id = filters.assignee_id;
  }

  if (filters.approval_status) {
    conditions.push(`${alias}.approval_status = @approval_status`);
    params.approval_status = filters.approval_status;
  }

  if (filters.date_from) {
    conditions.push(`DATE(${alias}.created_at) >= DATE(@date_from)`);
    params.date_from = filters.date_from;
  }

  if (filters.date_to) {
    conditions.push(`DATE(${alias}.created_at) <= DATE(@date_to)`);
    params.date_to = filters.date_to;
  }

  return {
    whereSql: conditions.length > 0 ? conditions.join(" AND ") : "1 = 1",
    params,
  };
}

router.get("/", (req, res) => {
  try {
    const projectId = parseOptionalId(req.query.project_id);
    const assigneeId = parseOptionalId(req.query.assignee_id);
    const approvalStatus = APPROVAL_STATUSES.includes(String(req.query.approval_status || "").trim())
      ? String(req.query.approval_status).trim()
      : "";

    const dateFrom = normalizeDateText(req.query.date_from);
    const dateTo = normalizeDateText(req.query.date_to);
    const requestedWindowDays = parsePositiveInt(req.query.window_days, 30, 1, 365);
    const windowDays = WINDOW_DAY_OPTIONS.includes(requestedWindowDays) ? requestedWindowDays : 30;

    const normalizedRange = buildDateRange(dateFrom, dateTo, windowDays);

    const filters = {
      project_id: projectId,
      assignee_id: assigneeId,
      approval_status: approvalStatus || null,
      date_from: dateFrom,
      date_to: dateTo,
    };

    const { whereSql, params } = buildWhereContext(req.user, filters, "tasks");

    const totalTasks = db
      .prepare(`SELECT COUNT(*) AS value FROM tasks WHERE ${whereSql}`)
      .get(params).value;
    const completedTasks = db
      .prepare(`SELECT COUNT(*) AS value FROM tasks WHERE ${whereSql} AND status = 'completed'`)
      .get(params).value;

    const overdueTasks = db
      .prepare(
        `SELECT COUNT(*) AS value FROM tasks
         WHERE ${whereSql}
         AND deadline IS NOT NULL
         AND DATE(deadline) < DATE('now')
         AND status != 'completed'`
      )
      .get(params).value;

    const byStatusRaw = db
      .prepare(`SELECT status AS key, COUNT(*) AS value FROM tasks WHERE ${whereSql} GROUP BY status`)
      .all(params);
    const byPriorityRaw = db
      .prepare(`SELECT priority AS key, COUNT(*) AS value FROM tasks WHERE ${whereSql} GROUP BY priority`)
      .all(params);
    const byCategoryRaw = db
      .prepare(`SELECT category AS key, COUNT(*) AS value FROM tasks WHERE ${whereSql} GROUP BY category`)
      .all(params);
    const byApprovalRaw = db
      .prepare(`SELECT approval_status AS key, COUNT(*) AS value FROM tasks WHERE ${whereSql} GROUP BY approval_status`)
      .all(params);

    const byStatus = mapGroupCounts(byStatusRaw, STATUSES);
    const byPriority = mapGroupCounts(byPriorityRaw, PRIORITIES);
    const byCategory = mapGroupCounts(byCategoryRaw, CATEGORIES);
    const byApproval = mapGroupCounts(byApprovalRaw, APPROVAL_STATUSES);

    const completionRate = totalTasks === 0 ? 0 : Number(((completedTasks / totalTasks) * 100).toFixed(2));

    const trendFilters = {
      ...filters,
      date_from: null,
      date_to: null,
    };
    const { whereSql: trendWhereSql, params: trendParams } = buildWhereContext(req.user, trendFilters, "tasks");

    const trendDates = listDates(normalizedRange.date_from, normalizedRange.date_to);
    const createdStmt = db.prepare(
      `SELECT COUNT(*) AS value FROM tasks WHERE ${trendWhereSql} AND DATE(tasks.created_at) = DATE(@day)`
    );
    const completedStmt = db.prepare(
      `SELECT COUNT(*) AS value FROM tasks WHERE ${trendWhereSql} AND tasks.status = 'completed' AND DATE(tasks.updated_at) = DATE(@day)`
    );
    const dueStmt = db.prepare(
      `SELECT COUNT(*) AS value FROM tasks WHERE ${trendWhereSql} AND tasks.deadline IS NOT NULL AND DATE(tasks.deadline) = DATE(@day)`
    );

    const trend = trendDates.map((day) => {
      const dayParams = { ...trendParams, day };
      return {
        date: day,
        created: createdStmt.get(dayParams).value,
        completed: completedStmt.get(dayParams).value,
        due: dueStmt.get(dayParams).value,
      };
    });

    return res.json({
      data: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        overdue_tasks: overdueTasks,
        completion_rate: completionRate,
        by_status: byStatus,
        by_priority: byPriority,
        by_category: byCategory,
        by_approval: byApproval,
        trend,
        filters: {
          project_id: projectId,
          assignee_id: assigneeId,
          approval_status: approvalStatus || "",
          date_from: dateFrom || "",
          date_to: dateTo || "",
          window_days: windowDays,
          trend_date_from: normalizedRange.date_from,
          trend_date_to: normalizedRange.date_to,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

router.get("/executive", (req, res) => {
  try {
    const projectId = parseOptionalId(req.query.project_id);
    const assigneeId = parseOptionalId(req.query.assignee_id);
    const approvalStatus = APPROVAL_STATUSES.includes(String(req.query.approval_status || "").trim())
      ? String(req.query.approval_status).trim()
      : "";

    const dateFrom = normalizeDateText(req.query.date_from);
    const dateTo = normalizeDateText(req.query.date_to);
    const requestedWindowDays = parsePositiveInt(req.query.window_days, 14, 7, 60);
    const normalizedRange = buildDateRange(dateFrom, dateTo, requestedWindowDays);
    const trendDates = listDates(normalizedRange.date_from, normalizedRange.date_to);

    const filters = {
      project_id: projectId,
      assignee_id: assigneeId,
      approval_status: approvalStatus || null,
      date_from: null,
      date_to: null,
    };

    const { whereSql, params } = buildWhereContext(req.user, filters, "t");

    const summary = db
      .prepare(
        `SELECT
           SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) AS open_total,
           SUM(CASE WHEN t.status != 'completed' AND t.deadline IS NOT NULL AND DATE(t.deadline) < DATE('now') THEN 1 ELSE 0 END) AS overdue_open,
           SUM(CASE WHEN t.status != 'completed' AND t.deadline IS NOT NULL AND DATE(t.deadline) BETWEEN DATE('now') AND DATE('now', '+7 day') THEN 1 ELSE 0 END) AS due_next_7_days,
           SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_total,
           SUM(CASE WHEN t.status = 'completed' AND DATE(COALESCE(t.completed_at, t.updated_at)) >= DATE('now', '-7 day') THEN 1 ELSE 0 END) AS completed_last_7_days
         FROM tasks t
         WHERE ${whereSql}`
      )
      .get(params);

    const openTotal = Number(summary.open_total || 0);
    const overdueOpen = Number(summary.overdue_open || 0);
    const slaOnTimeRate = openTotal === 0 ? 100 : Number((((openTotal - overdueOpen) / openTotal) * 100).toFixed(2));

    const rangeParams = {
      ...params,
      range_start: normalizedRange.date_from,
      range_end: normalizedRange.date_to,
    };

    const baseRemaining = db
      .prepare(
        `SELECT COUNT(*) AS value
         FROM tasks t
         WHERE ${whereSql}
           AND DATE(t.created_at) < DATE(@range_start)
           AND (
             t.status != 'completed'
             OR DATE(COALESCE(t.completed_at, t.updated_at)) >= DATE(@range_start)
           )`
      )
      .get(rangeParams).value;

    const createdRows = db
      .prepare(
        `SELECT DATE(t.created_at) AS day, COUNT(*) AS value
         FROM tasks t
         WHERE ${whereSql}
           AND DATE(t.created_at) BETWEEN DATE(@range_start) AND DATE(@range_end)
         GROUP BY DATE(t.created_at)`
      )
      .all(rangeParams);

    const completedRows = db
      .prepare(
        `SELECT DATE(COALESCE(t.completed_at, t.updated_at)) AS day, COUNT(*) AS value
         FROM tasks t
         WHERE ${whereSql}
           AND t.status = 'completed'
           AND DATE(COALESCE(t.completed_at, t.updated_at)) BETWEEN DATE(@range_start) AND DATE(@range_end)
         GROUP BY DATE(COALESCE(t.completed_at, t.updated_at))`
      )
      .all(rangeParams);

    const createdLookup = new Map(createdRows.map((row) => [row.day, Number(row.value || 0)]));
    const completedLookup = new Map(completedRows.map((row) => [row.day, Number(row.value || 0)]));

    let runningRemaining = Number(baseRemaining || 0);
    const burnDown = trendDates.map((day) => {
      const created = createdLookup.get(day) || 0;
      const completed = completedLookup.get(day) || 0;
      runningRemaining = Math.max(0, runningRemaining + created - completed);
      return {
        date: day,
        remaining: runningRemaining,
        created,
        completed,
      };
    });

    const firstRemaining = burnDown.length ? burnDown[0].remaining : 0;
    const denominator = Math.max(1, burnDown.length - 1);
    const burnDownWithTarget = burnDown.map((row, index) => ({
      ...row,
      target: Math.max(0, Number((firstRemaining - (firstRemaining * index) / denominator).toFixed(2))),
    }));

    const workloadByUser = db
      .prepare(
        `SELECT
           u.id,
           u.name,
           u.email,
           SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) AS open_tasks,
           SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
           SUM(CASE WHEN t.status != 'completed' AND t.priority = 'high' THEN 1 ELSE 0 END) AS high_priority_open,
           SUM(CASE WHEN t.status != 'completed' AND t.deadline IS NOT NULL AND DATE(t.deadline) < DATE('now') THEN 1 ELSE 0 END) AS overdue_open
         FROM tasks t
         LEFT JOIN users u ON u.id = COALESCE(t.assignee_id, t.user_id)
         WHERE ${whereSql}
         GROUP BY u.id, u.name, u.email
         HAVING u.id IS NOT NULL
         ORDER BY overdue_open DESC, high_priority_open DESC, open_tasks DESC, completed_tasks DESC
         LIMIT 12`
      )
      .all(params);

    const projectRisk = db
      .prepare(
        `SELECT
           p.id,
           p.name,
           SUM(CASE WHEN t.status != 'completed' THEN 1 ELSE 0 END) AS open_tasks,
           SUM(CASE WHEN t.status != 'completed' AND t.deadline IS NOT NULL AND DATE(t.deadline) < DATE('now') THEN 1 ELSE 0 END) AS overdue_open
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         WHERE ${whereSql}
           AND t.project_id IS NOT NULL
         GROUP BY p.id, p.name
         HAVING open_tasks > 0
         ORDER BY overdue_open DESC, open_tasks DESC
         LIMIT 12`
      )
      .all(params)
      .map((item) => ({
        ...item,
        overdue_rate: Number(item.open_tasks || 0) === 0 ? 0 : Number(((Number(item.overdue_open || 0) / Number(item.open_tasks)) * 100).toFixed(2)),
      }));

    const trend = trendDates.map((day) => ({
      date: day,
      created: createdLookup.get(day) || 0,
      completed: completedLookup.get(day) || 0,
    }));

    return res.json({
      data: {
        summary: {
          open_total: openTotal,
          overdue_open: overdueOpen,
          due_next_7_days: Number(summary.due_next_7_days || 0),
          completed_total: Number(summary.completed_total || 0),
          completed_last_7_days: Number(summary.completed_last_7_days || 0),
          sla_on_time_rate: slaOnTimeRate,
        },
        burn_down: burnDownWithTarget,
        trend,
        workload_by_user: workloadByUser,
        project_risk: projectRisk,
        filters: {
          project_id: projectId,
          assignee_id: assigneeId,
          approval_status: approvalStatus || "",
          date_from: normalizedRange.date_from,
          date_to: normalizedRange.date_to,
          window_days: requestedWindowDays,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch executive statistics" });
  }
});

module.exports = router;
