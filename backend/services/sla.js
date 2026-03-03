const db = require("../database");
const { publishNotification } = require("../events");

function uniqueInt(values) {
  return [...new Set(values.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
}

function getEscalationCandidates() {
  return db
    .prepare(
      `SELECT t.*
       FROM tasks t
       WHERE t.approval_status = 'approved'
         AND t.status != 'completed'
         AND t.deadline IS NOT NULL
         AND (
           (t.sla_level = 0 AND DATE(t.deadline) <= DATE('now', '+1 day'))
           OR (t.sla_level <= 1 AND DATE(t.deadline) < DATE('now'))
           OR (t.sla_level <= 2 AND DATE(t.deadline) < DATE('now', '-2 day'))
         )
       ORDER BY DATE(t.deadline) ASC, t.updated_at ASC
       LIMIT 200`
    )
    .all();
}

function insertTaskActivity(taskId, userId, action, details) {
  db.prepare("INSERT INTO task_activities (task_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    taskId,
    userId || null,
    action,
    details || null
  );
}

function createIncidentForTask(task, triggeredByUserId = null) {
  const existingIncidentId = Number(task.incident_id);
  if (Number.isInteger(existingIncidentId) && existingIncidentId > 0) return existingIncidentId;

  const incident = db
    .prepare(
      `INSERT INTO incidents (title, description, severity, status, owner_user_id, task_id, started_at)
       VALUES (?, ?, 'sev2', 'open', ?, ?, CURRENT_TIMESTAMP)`
    )
    .run(
      `SLA Breach: ${task.title}`,
      `Task #${task.id} breached SLA and was auto-promoted to incident mode.`,
      task.user_id || null,
      task.id
    );

  const incidentId = Number(incident.lastInsertRowid);
  db.prepare("UPDATE tasks SET incident_id = ? WHERE id = ?").run(incidentId, task.id);

  db.prepare("INSERT INTO incident_events (incident_id, user_id, event_type, message) VALUES (?, ?, ?, ?)").run(
    incidentId,
    triggeredByUserId || null,
    "created",
    `Incident auto-created from task #${task.id} due to SLA breach`
  );

  return incidentId;
}

function resolveRecipients(task, actorUserId = null) {
  const recipients = [task.user_id, task.assignee_id, actorUserId];
  if (task.project_id) {
    const managers = db
      .prepare(
        `SELECT user_id
         FROM project_members
         WHERE project_id = ?
           AND role IN ('owner', 'manager')`
      )
      .all(task.project_id)
      .map((row) => row.user_id);
    recipients.push(...managers);
  }

  const workspaceManagers = db
    .prepare("SELECT id FROM users WHERE role IN ('admin', 'manager')")
    .all()
    .map((row) => row.id);
  recipients.push(...workspaceManagers);

  return uniqueInt(recipients);
}

function determineEscalation(task) {
  const deadlineDate = new Date(`${task.deadline}T00:00:00`);
  if (Number.isNaN(deadlineDate.getTime())) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((deadlineDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (task.sla_level <= 1 && diffDays < 0) {
    return {
      newPriority: "high",
      newSlaLevel: 2,
      reason: `Task is overdue (${Math.abs(diffDays)} day(s))`,
      createIncident: diffDays <= -2,
    };
  }

  if (task.sla_level === 0 && diffDays <= 1) {
    const newPriority = task.priority === "low" ? "medium" : "high";
    return {
      newPriority,
      newSlaLevel: 1,
      reason: diffDays === 0 ? "Task due today" : "Task due tomorrow",
      createIncident: false,
    };
  }

  if (task.sla_level <= 2 && diffDays <= -2) {
    return {
      newPriority: "high",
      newSlaLevel: 3,
      reason: `Critical SLA breach (${Math.abs(diffDays)} day(s) overdue)`,
      createIncident: true,
    };
  }

  return null;
}

async function runSlaEscalations({ triggeredByUserId = null } = {}) {
  const candidates = getEscalationCandidates();
  let escalated = 0;
  let incidentsCreated = 0;

  for (const task of candidates) {
    const escalation = determineEscalation(task);
    if (!escalation) continue;

    db.prepare(
      `UPDATE tasks
       SET priority = ?, sla_level = ?, sla_last_escalated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(escalation.newPriority, escalation.newSlaLevel, task.id);

    insertTaskActivity(task.id, triggeredByUserId, "sla_escalated", escalation.reason);

    let incidentId = null;
    if (escalation.createIncident) {
      incidentId = createIncidentForTask(task, triggeredByUserId);
      if (incidentId) incidentsCreated += 1;
    }

    const recipients = resolveRecipients(task, triggeredByUserId);
    publishNotification({
      type: "sla_escalation",
      task_id: task.id,
      title: task.title,
      message: `SLA escalation: ${task.title}`,
      details: escalation.reason,
      incident_id: incidentId,
      user_ids: recipients,
    });

    escalated += 1;
  }

  return {
    scanned: candidates.length,
    escalated,
    incidents_created: incidentsCreated,
  };
}

module.exports = {
  runSlaEscalations,
};
