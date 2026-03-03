const express = require("express");
const db = require("../database");

const router = express.Router();

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function parseOptionalId(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveInt(value, fallback, min = 1, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeDateText(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildTaskVisibility(user, alias = "t") {
  if (user.role === "admin") return { whereSql: "1 = 1", params: {} };
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

function getVisibleTask(taskId, user) {
  const { whereSql, params } = buildTaskVisibility(user, "t");
  return db
    .prepare(
      `SELECT t.*
       FROM tasks t
       WHERE t.id = @task_id
         AND ${whereSql}`
    )
    .get({ ...params, task_id: taskId });
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  return value;
}

function getActivePomodoroSession(userId) {
  return db
    .prepare(
      `SELECT ps.*, t.title AS task_title
       FROM pomodoro_sessions ps
       LEFT JOIN tasks t ON t.id = ps.task_id
       WHERE ps.user_id = ?
         AND ps.ended_at IS NULL
         AND ps.completed = 0
         AND ps.interrupted = 0
       ORDER BY ps.started_at DESC
       LIMIT 1`
    )
    .get(userId);
}

function closeLinkedTimeEntryIfNeeded(timeEntryId, endedAt) {
  if (!timeEntryId) return null;
  const entry = db
    .prepare(
      `SELECT * FROM time_entries
       WHERE id = ?
         AND ended_at IS NULL`
    )
    .get(timeEntryId);
  if (!entry) return null;

  const durationSeconds = Math.max(
    0,
    Math.floor((new Date(endedAt).getTime() - new Date(entry.started_at).getTime()) / 1000)
  );
  db.prepare("UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?").run(endedAt, durationSeconds, entry.id);
  return db.prepare("SELECT * FROM time_entries WHERE id = ?").get(entry.id);
}

function finishPomodoro(session, { completed, interrupted }) {
  const endedAt = new Date().toISOString();
  const actualSeconds = Math.max(
    0,
    Math.floor((new Date(endedAt).getTime() - new Date(session.started_at).getTime()) / 1000)
  );

  db.prepare(
    `UPDATE pomodoro_sessions
     SET ended_at = ?,
         actual_seconds = ?,
         completed = ?,
         interrupted = ?
     WHERE id = ?`
  ).run(endedAt, actualSeconds, completed ? 1 : 0, interrupted ? 1 : 0, session.id);

  const closedTimeEntry = closeLinkedTimeEntryIfNeeded(session.time_entry_id, endedAt);
  const updated = db
    .prepare(
      `SELECT ps.*, t.title AS task_title
       FROM pomodoro_sessions ps
       LEFT JOIN tasks t ON t.id = ps.task_id
       WHERE ps.id = ?`
    )
    .get(session.id);

  return { session: updated, linked_time_entry: closedTimeEntry };
}

router.get("/active/me", (req, res) => {
  try {
    const active = db
      .prepare(
        `SELECT te.*, t.title AS task_title
         FROM time_entries te
         LEFT JOIN tasks t ON t.id = te.task_id
         WHERE te.user_id = ?
           AND te.ended_at IS NULL
         ORDER BY te.started_at DESC
         LIMIT 1`
      )
      .get(req.user.id);

    return res.json({ data: active || null });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch active timer" });
  }
});

router.get("/pomodoro/active/me", (req, res) => {
  try {
    const active = getActivePomodoroSession(req.user.id);
    return res.json({ data: active || null });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch active pomodoro session" });
  }
});

router.post("/pomodoro/start", (req, res) => {
  try {
    const taskId = parseOptionalId(req.body?.task_id);
    if (!taskId) return res.status(400).json({ error: "task_id is required" });

    const task = getVisibleTask(taskId, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const focusMinutes = parsePositiveInt(req.body?.focus_minutes, 25, 5, 120);
    const note = normalizeText(req.body?.note);
    const autoStartTimer = Number(req.body?.auto_start_timer) === 1 || String(req.body?.auto_start_timer).toLowerCase() === "true";

    const activePomodoro = getActivePomodoroSession(req.user.id);
    if (activePomodoro) {
      return res.status(400).json({ error: "You already have an active pomodoro session" });
    }

    const activeTimer = db
      .prepare(
        `SELECT *
         FROM time_entries
         WHERE user_id = ?
           AND ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .get(req.user.id);
    if (autoStartTimer && activeTimer) {
      return res.status(400).json({ error: "Cannot auto-start timer while another timer is active" });
    }

    let linkedTimeEntryId = null;
    const startedAt = new Date().toISOString();
    if (autoStartTimer) {
      const entryResult = db
        .prepare("INSERT INTO time_entries (task_id, user_id, started_at, note) VALUES (?, ?, ?, ?)")
        .run(taskId, req.user.id, startedAt, note || `Pomodoro focus ${focusMinutes}m`);
      linkedTimeEntryId = Number(entryResult.lastInsertRowid);
    }

    const result = db
      .prepare(
        `INSERT INTO pomodoro_sessions (
           task_id, user_id, time_entry_id, planned_minutes, started_at, note
         ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(taskId, req.user.id, linkedTimeEntryId, focusMinutes, startedAt, note);

    const session = db
      .prepare(
        `SELECT ps.*, t.title AS task_title
         FROM pomodoro_sessions ps
         LEFT JOIN tasks t ON t.id = ps.task_id
         WHERE ps.id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: session });
  } catch (error) {
    return res.status(500).json({ error: "Failed to start pomodoro session" });
  }
});

router.post("/pomodoro/complete", (req, res) => {
  try {
    const sessionId = parseOptionalId(req.body?.session_id);
    const session =
      sessionId !== null
        ? db
            .prepare(
              `SELECT *
               FROM pomodoro_sessions
               WHERE id = ?
                 AND user_id = ?
                 AND ended_at IS NULL
                 AND completed = 0
                 AND interrupted = 0`
            )
            .get(sessionId, req.user.id)
        : getActivePomodoroSession(req.user.id);

    if (!session) return res.status(400).json({ error: "No active pomodoro session found" });
    const finalSession = finishPomodoro(session, { completed: true, interrupted: false });
    return res.json({ data: finalSession.session, linked_time_entry: finalSession.linked_time_entry || null });
  } catch (error) {
    return res.status(500).json({ error: "Failed to complete pomodoro session" });
  }
});

router.post("/pomodoro/cancel", (req, res) => {
  try {
    const sessionId = parseOptionalId(req.body?.session_id);
    const session =
      sessionId !== null
        ? db
            .prepare(
              `SELECT *
               FROM pomodoro_sessions
               WHERE id = ?
                 AND user_id = ?
                 AND ended_at IS NULL
                 AND completed = 0
                 AND interrupted = 0`
            )
            .get(sessionId, req.user.id)
        : getActivePomodoroSession(req.user.id);

    if (!session) return res.status(400).json({ error: "No active pomodoro session found" });
    const finalSession = finishPomodoro(session, { completed: false, interrupted: true });
    return res.json({ data: finalSession.session, linked_time_entry: finalSession.linked_time_entry || null });
  } catch (error) {
    return res.status(500).json({ error: "Failed to cancel pomodoro session" });
  }
});

router.get("/pomodoro/stats", (req, res) => {
  try {
    const dateFrom = normalizeDateText(req.query.date_from);
    const dateTo = normalizeDateText(req.query.date_to);
    const conditions = ["ps.user_id = @user_id", "ps.ended_at IS NOT NULL"];
    const params = { user_id: req.user.id };

    if (dateFrom) {
      conditions.push("DATE(ps.started_at) >= DATE(@date_from)");
      params.date_from = dateFrom;
    }
    if (dateTo) {
      conditions.push("DATE(ps.started_at) <= DATE(@date_to)");
      params.date_to = dateTo;
    }

    const whereSql = conditions.join(" AND ");
    const summary = db
      .prepare(
        `SELECT
           COUNT(*) AS total_sessions,
           SUM(CASE WHEN ps.completed = 1 THEN 1 ELSE 0 END) AS completed_sessions,
           SUM(CASE WHEN ps.interrupted = 1 THEN 1 ELSE 0 END) AS interrupted_sessions,
           IFNULL(SUM(ps.planned_minutes), 0) AS planned_minutes,
           IFNULL(SUM(ps.actual_seconds), 0) AS actual_seconds
         FROM pomodoro_sessions ps
         WHERE ${whereSql}`
      )
      .get(params);

    const byTask = db
      .prepare(
        `SELECT
           ps.task_id,
           t.title,
           COUNT(*) AS sessions,
           IFNULL(SUM(ps.actual_seconds), 0) AS actual_seconds
         FROM pomodoro_sessions ps
         LEFT JOIN tasks t ON t.id = ps.task_id
         WHERE ${whereSql}
         GROUP BY ps.task_id, t.title
         ORDER BY sessions DESC, actual_seconds DESC
         LIMIT 20`
      )
      .all(params);

    return res.json({
      data: {
        total_sessions: Number(summary.total_sessions || 0),
        completed_sessions: Number(summary.completed_sessions || 0),
        interrupted_sessions: Number(summary.interrupted_sessions || 0),
        planned_minutes: Number(summary.planned_minutes || 0),
        actual_minutes: Number(((summary.actual_seconds || 0) / 60).toFixed(1)),
        by_task: byTask,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch pomodoro stats" });
  }
});

router.post("/start", (req, res) => {
  try {
    const taskId = parseOptionalId(req.body?.task_id);
    if (!taskId) return res.status(400).json({ error: "task_id is required" });

    const task = getVisibleTask(taskId, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const activeGlobal = db
      .prepare("SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
      .get(req.user.id);
    if (activeGlobal) {
      return res.status(400).json({ error: "You already have an active timer. Stop it first." });
    }

    const startedAt = new Date().toISOString();
    const note = normalizeText(req.body?.note);

    const result = db
      .prepare("INSERT INTO time_entries (task_id, user_id, started_at, note) VALUES (?, ?, ?, ?)")
      .run(taskId, req.user.id, startedAt, note);

    const entry = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({ data: entry });
  } catch (error) {
    return res.status(500).json({ error: "Failed to start timer" });
  }
});

router.post("/stop", (req, res) => {
  try {
    const taskId = parseOptionalId(req.body?.task_id);
    const entry = taskId
      ? db
          .prepare(
            `SELECT * FROM time_entries
             WHERE user_id = ?
               AND task_id = ?
               AND ended_at IS NULL
             ORDER BY started_at DESC
             LIMIT 1`
          )
          .get(req.user.id, taskId)
      : db
          .prepare(
            `SELECT * FROM time_entries
             WHERE user_id = ?
               AND ended_at IS NULL
             ORDER BY started_at DESC
             LIMIT 1`
          )
          .get(req.user.id);

    if (!entry) return res.status(400).json({ error: "No active timer found" });

    const endedAt = new Date().toISOString();
    const durationSeconds = Math.max(
      0,
      Math.floor((new Date(endedAt).getTime() - new Date(entry.started_at).getTime()) / 1000)
    );

    db.prepare("UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?").run(
      endedAt,
      durationSeconds,
      entry.id
    );
    const updated = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(entry.id);

    return res.json({ data: { ...updated, duration_seconds: formatDuration(updated.duration_seconds) } });
  } catch (error) {
    return res.status(500).json({ error: "Failed to stop timer" });
  }
});

router.get("/task/:taskId", (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) return res.status(400).json({ error: "Invalid task id" });

    const task = getVisibleTask(taskId, req.user);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const entries = db
      .prepare(
        `SELECT te.*, u.name AS user_name, u.email AS user_email
         FROM time_entries te
         LEFT JOIN users u ON u.id = te.user_id
         WHERE te.task_id = ?
         ORDER BY te.started_at DESC`
      )
      .all(taskId);

    return res.json({ data: entries });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch task time entries" });
  }
});

router.get("/reports", (req, res) => {
  try {
    const dateFrom = normalizeDateText(req.query.date_from);
    const dateTo = normalizeDateText(req.query.date_to);
    const userIdFilter = parseOptionalId(req.query.user_id);
    const taskIdFilter = parseOptionalId(req.query.task_id);

    const { whereSql, params } = buildTaskVisibility(req.user, "t");
    const conditions = [whereSql, "te.ended_at IS NOT NULL"];
    const queryParams = { ...params };

    if (dateFrom) {
      conditions.push("DATE(te.started_at) >= DATE(@date_from)");
      queryParams.date_from = dateFrom;
    }
    if (dateTo) {
      conditions.push("DATE(te.started_at) <= DATE(@date_to)");
      queryParams.date_to = dateTo;
    }
    if (userIdFilter) {
      conditions.push("te.user_id = @user_id");
      queryParams.user_id = userIdFilter;
    }
    if (taskIdFilter) {
      conditions.push("te.task_id = @task_id");
      queryParams.task_id = taskIdFilter;
    }

    const whereClause = conditions.join(" AND ");

    const total = db
      .prepare(
        `SELECT IFNULL(SUM(te.duration_seconds), 0) AS total_seconds
         FROM time_entries te
         LEFT JOIN tasks t ON t.id = te.task_id
         WHERE ${whereClause}`
      )
      .get(queryParams).total_seconds;

    const byTask = db
      .prepare(
        `SELECT te.task_id, t.title, IFNULL(SUM(te.duration_seconds), 0) AS total_seconds
         FROM time_entries te
         LEFT JOIN tasks t ON t.id = te.task_id
         WHERE ${whereClause}
         GROUP BY te.task_id, t.title
         ORDER BY total_seconds DESC
         LIMIT 30`
      )
      .all(queryParams);

    const byUser = db
      .prepare(
        `SELECT te.user_id, u.name, u.email, IFNULL(SUM(te.duration_seconds), 0) AS total_seconds
         FROM time_entries te
         LEFT JOIN tasks t ON t.id = te.task_id
         LEFT JOIN users u ON u.id = te.user_id
         WHERE ${whereClause}
         GROUP BY te.user_id, u.name, u.email
         ORDER BY total_seconds DESC
         LIMIT 30`
      )
      .all(queryParams);

    return res.json({
      data: {
        total_seconds: total || 0,
        total_hours: Number(((total || 0) / 3600).toFixed(2)),
        by_task: byTask,
        by_user: byUser,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch time reports" });
  }
});

module.exports = router;
