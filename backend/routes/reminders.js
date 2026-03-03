const express = require("express");
const db = require("../database");
const { runReminders } = require("../services/reminders");

const router = express.Router();

function toBit(value, fallback = 0) {
  if (value === undefined) return fallback;
  return Number(value) === 1 || String(value).toLowerCase() === "true" ? 1 : 0;
}

router.get("/settings/me", (req, res) => {
  try {
    const settings = db
      .prepare(
        `SELECT
           telegram_chat_id, slack_webhook_url,
           reminders_email_enabled, reminders_telegram_enabled, reminders_slack_enabled, reminders_webpush_enabled
         FROM users WHERE id = ?`
      )
      .get(req.user.id);

    return res.json({ data: settings });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch reminder settings" });
  }
});

router.put("/settings/me", (req, res) => {
  try {
    const telegramChatId = req.body?.telegram_chat_id ? String(req.body.telegram_chat_id).trim() : null;
    const slackWebhookUrl = req.body?.slack_webhook_url ? String(req.body.slack_webhook_url).trim() : null;

    db.prepare(
      `UPDATE users
       SET telegram_chat_id = ?, slack_webhook_url = ?,
           reminders_email_enabled = ?, reminders_telegram_enabled = ?,
           reminders_slack_enabled = ?, reminders_webpush_enabled = ?
       WHERE id = ?`
    ).run(
      telegramChatId || null,
      slackWebhookUrl || null,
      toBit(req.body?.reminders_email_enabled, 1),
      toBit(req.body?.reminders_telegram_enabled, 0),
      toBit(req.body?.reminders_slack_enabled, 0),
      toBit(req.body?.reminders_webpush_enabled, 0),
      req.user.id
    );

    const settings = db
      .prepare(
        `SELECT
           telegram_chat_id, slack_webhook_url,
           reminders_email_enabled, reminders_telegram_enabled, reminders_slack_enabled, reminders_webpush_enabled
         FROM users WHERE id = ?`
      )
      .get(req.user.id);

    return res.json({ data: settings });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update reminder settings" });
  }
});

router.post("/run", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admin can trigger reminders manually" });
    }

    const result = await runReminders({
      triggeredByUserId: req.user.id,
      scopeLabel: "manual run",
    });
    return res.json({ data: result });
  } catch (error) {
    return res.status(500).json({ error: "Failed to run reminders" });
  }
});

module.exports = router;
