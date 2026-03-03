const { EventEmitter } = require("events");
const db = require("./database");
const { emitWebhookEvent } = require("./services/webhooks");

const notifications = new EventEmitter();
notifications.setMaxListeners(200);

function toUniqueUserIds(userIds) {
  if (!Array.isArray(userIds)) return [];
  return [...new Set(userIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

const insertNotificationTx = db.transaction((payload, recipientUserIds, createdAt) => {
  const row = {
    type: String(payload.type || "system"),
    title: payload.title ? String(payload.title) : null,
    message: payload.message ? String(payload.message) : null,
    details: payload.details ? String(payload.details) : null,
    task_id: Number.isInteger(Number(payload.task_id)) ? Number(payload.task_id) : null,
    payload_json: JSON.stringify(payload),
    created_at: createdAt,
  };

  const result = db
    .prepare(
      `INSERT INTO notifications (type, title, message, details, task_id, payload_json, created_at)
       VALUES (@type, @title, @message, @details, @task_id, @payload_json, @created_at)`
    )
    .run(row);

  if (recipientUserIds.length > 0) {
    const stmt = db.prepare(
      `INSERT INTO notification_recipients (notification_id, user_id)
       VALUES (?, ?)
       ON CONFLICT(notification_id, user_id) DO NOTHING`
    );

    recipientUserIds.forEach((userId) => {
      stmt.run(result.lastInsertRowid, userId);
    });
  }

  return Number(result.lastInsertRowid);
});

function publishNotification(payload) {
  const createdAt = new Date().toISOString();
  const recipientUserIds = toUniqueUserIds(payload?.user_ids);
  let notificationId = Date.now() + Math.floor(Math.random() * 100000);

  try {
    notificationId = insertNotificationTx(payload || {}, recipientUserIds, createdAt);
  } catch (error) {
    // Do not block realtime flow if DB persistence fails.
  }

  notifications.emit("notification", {
    id: notificationId,
    created_at: createdAt,
    ...payload,
    user_ids: recipientUserIds,
  });

  emitWebhookEvent("notification.created", {
    id: notificationId,
    created_at: createdAt,
    ...payload,
    user_ids: recipientUserIds,
  }).catch(() => {
    // Ignore webhook failures in notification flow.
  });
}

module.exports = {
  notifications,
  publishNotification,
};
