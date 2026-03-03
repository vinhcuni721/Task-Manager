const db = require("../database");
const { publishNotification } = require("../events");
const { sendReminderSummaryEmail } = require("./email");

let webpush = null;
try {
  // Optional dependency.
  webpush = require("web-push");
} catch (error) {
  webpush = null;
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function getReminderTasksForUser(userId, limit = 20) {
  return db
    .prepare(
      `
      SELECT DISTINCT t.id, t.title, t.priority, t.status, t.deadline
      FROM tasks t
      WHERE t.approval_status = 'approved'
        AND t.status != 'completed'
        AND t.deadline IS NOT NULL
        AND DATE(t.deadline) <= DATE('now', '+1 day')
        AND (
          t.user_id = @user_id
          OR t.assignee_id = @user_id
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = t.project_id
              AND pm.user_id = @user_id
          )
        )
      ORDER BY DATE(t.deadline) ASC, t.priority DESC
      LIMIT @limit
    `
    )
    .all({ user_id: userId, limit });
}

function buildSummaryText(tasks, label) {
  const header = `TaskFlow reminder (${label})`;
  const items = tasks.map(
    (task, index) =>
      `${index + 1}. ${task.title} | priority=${task.priority} | status=${task.status} | deadline=${task.deadline || "N/A"}`
  );
  return [header, "", ...items].join("\n");
}

async function sendTelegram({ chatId, text }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
  return response.ok;
}

async function sendSlack({ webhookUrl, text }) {
  if (!webhookUrl) return false;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return response.ok;
}

async function sendWebPush(userId, payload) {
  if (!webpush) return 0;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT || "mailto:admin@taskflow.local";
  if (!publicKey || !privateKey) return 0;

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const subscriptions = db
    .prepare("SELECT * FROM push_subscriptions WHERE user_id = ?")
    .all(userId);
  if (subscriptions.length === 0) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        body
      );
      sent += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(subscription.id);
      }
    }
  }

  return sent;
}

async function runReminders({ triggeredByUserId = null, scopeLabel = "due soon or overdue" } = {}) {
  const users = db
    .prepare(
      `SELECT id, name, email, telegram_chat_id, slack_webhook_url,
              reminders_email_enabled, reminders_telegram_enabled, reminders_slack_enabled, reminders_webpush_enabled
       FROM users`
    )
    .all();

  let usersNotified = 0;
  let channelsSent = 0;
  const failures = [];

  for (const user of users) {
    const tasks = getReminderTasksForUser(user.id, 50);
    if (tasks.length === 0) continue;

    const text = buildSummaryText(tasks, scopeLabel);
    const pushPayload = {
      title: "TaskFlow reminder",
      body: `${tasks.length} task(s) need attention`,
      tasks: tasks.slice(0, 5),
    };

    let userSentAny = false;

    if (Number(user.reminders_email_enabled) === 1) {
      try {
        await sendReminderSummaryEmail({
          to: user.email,
          name: user.name,
          tasks,
          scopeLabel,
        });
        channelsSent += 1;
        userSentAny = true;
      } catch (error) {
        failures.push(`email:${user.email}`);
      }
    }

    if (Number(user.reminders_telegram_enabled) === 1) {
      try {
        const ok = await sendTelegram({ chatId: user.telegram_chat_id, text });
        if (ok) {
          channelsSent += 1;
          userSentAny = true;
        }
      } catch (error) {
        failures.push(`telegram:${user.email}`);
      }
    }

    if (Number(user.reminders_slack_enabled) === 1) {
      try {
        const ok = await sendSlack({ webhookUrl: user.slack_webhook_url, text });
        if (ok) {
          channelsSent += 1;
          userSentAny = true;
        }
      } catch (error) {
        failures.push(`slack:${user.email}`);
      }
    }

    if (Number(user.reminders_webpush_enabled) === 1) {
      try {
        const sentCount = await sendWebPush(user.id, pushPayload);
        if (sentCount > 0) {
          channelsSent += 1;
          userSentAny = true;
        }
      } catch (error) {
        failures.push(`webpush:${user.email}`);
      }
    }

    if (userSentAny) {
      usersNotified += 1;
      publishNotification({
        type: "reminder_sent",
        message: `Reminder sent to ${user.email} (${tasks.length} tasks)`,
        user_ids: [user.id, triggeredByUserId].filter(Boolean),
      });
    }
  }

  return {
    users_notified: usersNotified,
    channels_sent: channelsSent,
    failures,
  };
}

module.exports = {
  runReminders,
};
