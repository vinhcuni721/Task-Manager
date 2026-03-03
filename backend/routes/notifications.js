const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../database");
const { JWT_SECRET } = require("../middleware/auth");
const { notifications } = require("../events");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function parsePositiveInt(value, fallback, min = 1, max = 200) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function buildListWhere(user) {
  if (user.role === "admin") {
    return {
      whereSql: "1 = 1",
      params: { viewer_user_id: user.id },
    };
  }

  return {
    whereSql: `EXISTS (
      SELECT 1 FROM notification_recipients nrp
      WHERE nrp.notification_id = n.id
        AND nrp.user_id = @viewer_user_id
    )`,
    params: { viewer_user_id: user.id },
  };
}

function canAccessNotification(notificationId, user) {
  if (user.role === "admin") {
    const existing = db.prepare("SELECT id FROM notifications WHERE id = ?").get(notificationId);
    return Boolean(existing);
  }

  const existing = db
    .prepare(
      `SELECT n.id
       FROM notifications n
       WHERE n.id = @notification_id
         AND EXISTS (
           SELECT 1 FROM notification_recipients nrp
           WHERE nrp.notification_id = n.id
             AND nrp.user_id = @viewer_user_id
         )`
    )
    .get({ notification_id: notificationId, viewer_user_id: user.id });

  return Boolean(existing);
}

router.get("/", requireAuth, (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 1, 100000);
    const pageSize = parsePositiveInt(req.query.page_size, 20, 1, 100);
    const unreadOnly = String(req.query.unread_only || "").trim() === "1";
    const offset = (page - 1) * pageSize;

    const context = buildListWhere(req.user);
    const whereParts = [context.whereSql];
    const params = { ...context.params };

    if (unreadOnly) {
      whereParts.push(
        `NOT EXISTS (
          SELECT 1 FROM notification_reads nr
          WHERE nr.notification_id = n.id
            AND nr.user_id = @viewer_user_id
        )`
      );
    }

    const whereSql = whereParts.join(" AND ");

    const rows = db
      .prepare(
        `SELECT
          n.id,
          n.type,
          n.title,
          n.message,
          n.details,
          n.task_id,
          n.created_at,
          CASE WHEN EXISTS (
            SELECT 1 FROM notification_reads nr
            WHERE nr.notification_id = n.id
              AND nr.user_id = @viewer_user_id
          ) THEN 1 ELSE 0 END AS is_read
         FROM notifications n
         WHERE ${whereSql}
         ORDER BY datetime(n.created_at) DESC, n.id DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset });

    const total = db
      .prepare(`SELECT COUNT(*) AS value FROM notifications n WHERE ${whereSql}`)
      .get(params).value;

    const unreadCount = db
      .prepare(
        `SELECT COUNT(*) AS value
         FROM notifications n
         WHERE ${context.whereSql}
           AND NOT EXISTS (
             SELECT 1 FROM notification_reads nr
             WHERE nr.notification_id = n.id
               AND nr.user_id = @viewer_user_id
           )`
      )
      .get(context.params).value;

    return res.json({
      data: rows.map((row) => ({
        ...row,
        is_read: Number(row.is_read) === 1,
      })),
      meta: {
        page,
        page_size: pageSize,
        total: Number(total || 0),
        unread: Number(unreadCount || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.post("/:id/read", requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid notification id" });
    }

    if (!canAccessNotification(id, req.user)) {
      return res.status(404).json({ error: "Notification not found" });
    }

    db.prepare(
      `INSERT INTO notification_reads (notification_id, user_id, read_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP`
    ).run(id, req.user.id);

    return res.json({ message: "Notification marked as read" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.post("/read-all", requireAuth, (req, res) => {
  try {
    const context = buildListWhere(req.user);
    const notificationsToMark = db
      .prepare(
        `SELECT n.id
         FROM notifications n
         WHERE ${context.whereSql}
           AND NOT EXISTS (
             SELECT 1 FROM notification_reads nr
             WHERE nr.notification_id = n.id
               AND nr.user_id = @viewer_user_id
           )`
      )
      .all(context.params);

    if (notificationsToMark.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO notification_reads (notification_id, user_id, read_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP`
      );

      const tx = db.transaction((rows) => {
        rows.forEach((row) => {
          stmt.run(row.id, req.user.id);
        });
      });

      tx(notificationsToMark);
    }

    return res.json({ message: "All notifications marked as read" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

router.get("/stream", (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) {
    return res.status(401).json({ error: "Token is required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const user = db
    .prepare("SELECT id, role FROM users WHERE id = ?")
    .get(payload.id);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "connected", message: "Realtime stream connected" });

  const listener = (event) => {
    if (user.role === "admin") {
      send(event);
      return;
    }

    const userIds = Array.isArray(event.user_ids) ? event.user_ids : [];
    if (userIds.includes(user.id)) {
      send(event);
    }
  };

  notifications.on("notification", listener);

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    notifications.off("notification", listener);
  });
});

router.get("/subscriptions/me", requireAuth, (req, res) => {
  try {
    const subscriptions = db
      .prepare(
        "SELECT id, endpoint, created_at FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC"
      )
      .all(req.user.id);
    return res.json({ data: subscriptions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

router.post("/subscriptions", requireAuth, (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "").trim();
    const p256dh = String(req.body?.keys?.p256dh || "").trim();
    const auth = String(req.body?.keys?.auth || "").trim();

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "Invalid push subscription payload" });
    }

    db.prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
    ).run(req.user.id, endpoint, p256dh, auth);

    return res.status(201).json({ message: "Push subscription saved" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to save subscription" });
  }
});

router.delete("/subscriptions", requireAuth, (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "").trim();
    if (!endpoint) {
      return res.status(400).json({ error: "Endpoint is required" });
    }

    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(req.user.id, endpoint);
    return res.json({ message: "Push subscription removed" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to remove subscription" });
  }
});

module.exports = router;
