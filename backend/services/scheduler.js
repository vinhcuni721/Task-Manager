const { runReminders } = require("./reminders");
const { createBackup } = require("./backup");
const { runSlaEscalations } = require("./sla");
const { cleanupSecurityData } = require("./security");
const { runAutomationBatch } = require("./automations");

let reminderTimer = null;
let backupTimer = null;
let slaTimer = null;
let securityTimer = null;
let automationTimer = null;
let lastBackupDay = "";

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function startSchedulers() {
  if (reminderTimer || backupTimer || slaTimer || securityTimer || automationTimer) {
    return;
  }

  const reminderIntervalMs = Math.max(60 * 1000, Number(process.env.REMINDER_INTERVAL_MINUTES || 60) * 60 * 1000);
  const backupCheckIntervalMs = Math.max(60 * 1000, Number(process.env.BACKUP_CHECK_INTERVAL_MINUTES || 30) * 60 * 1000);
  const slaIntervalMs = Math.max(60 * 1000, Number(process.env.SLA_ESCALATION_INTERVAL_MINUTES || 30) * 60 * 1000);
  const securityIntervalMs = Math.max(
    60 * 1000,
    Number(process.env.SECURITY_MAINTENANCE_INTERVAL_MINUTES || 360) * 60 * 1000
  );
  const automationIntervalMs = Math.max(60 * 1000, Number(process.env.AUTOMATION_INTERVAL_MINUTES || 15) * 60 * 1000);
  const enableReminders = String(process.env.ENABLE_AUTO_REMINDERS || "true").toLowerCase() === "true";
  const enableBackups = String(process.env.ENABLE_AUTO_BACKUPS || "true").toLowerCase() === "true";
  const enableSlaEscalation = String(process.env.ENABLE_SLA_ESCALATION || "true").toLowerCase() === "true";
  const enableSecurityMaintenance = String(process.env.ENABLE_SECURITY_MAINTENANCE || "true").toLowerCase() === "true";
  const enableAutomations = String(process.env.ENABLE_AUTOMATIONS || "true").toLowerCase() === "true";

  if (enableReminders) {
    reminderTimer = setInterval(async () => {
      try {
        await runReminders({ scopeLabel: "scheduled run" });
      } catch (error) {
        console.error("Automatic reminder job failed:", error.message);
      }
    }, reminderIntervalMs);
  }

  if (enableBackups) {
    backupTimer = setInterval(async () => {
      const today = dayKey();
      if (today === lastBackupDay) return;

      const backupHour = Number(process.env.BACKUP_HOUR_UTC || 2);
      const nowHour = new Date().getUTCHours();
      if (nowHour < backupHour) return;

      try {
        await createBackup({ label: "auto" });
        lastBackupDay = today;
      } catch (error) {
        console.error("Automatic backup job failed:", error.message);
      }
    }, backupCheckIntervalMs);
  }

  if (enableSlaEscalation) {
    slaTimer = setInterval(async () => {
      try {
        await runSlaEscalations();
      } catch (error) {
        console.error("Automatic SLA escalation job failed:", error.message);
      }
    }, slaIntervalMs);
  }

  if (enableSecurityMaintenance) {
    securityTimer = setInterval(() => {
      try {
        cleanupSecurityData();
      } catch (error) {
        console.error("Automatic security maintenance job failed:", error.message);
      }
    }, securityIntervalMs);
  }

  if (enableAutomations) {
    automationTimer = setInterval(() => {
      try {
        runAutomationBatch({ trigger: "schedule.hourly", actorUserId: null });
      } catch (error) {
        console.error("Automatic automation rules job failed:", error.message);
      }
    }, automationIntervalMs);
  }
}

module.exports = {
  startSchedulers,
};
