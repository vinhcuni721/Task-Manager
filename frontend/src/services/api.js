export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const AUTH_STORAGE_KEY = "taskflow_auth";

function getToken() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.token || "";
  } catch (error) {
    return "";
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

function toQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value).trim());
    }
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

export const taskApi = {
  getAll(filters) {
    return request(`/tasks${toQuery(filters)}`);
  },
  getById(id) {
    return request(`/tasks/${id}`);
  },
  getRecurrencePreview(id, count = 5) {
    return request(`/tasks/${id}/recurrence-preview${toQuery({ count })}`);
  },
  getPermissions(id) {
    return request(`/tasks/${id}/permissions`);
  },
  create(payload) {
    return request("/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  update(id, payload) {
    return request(`/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  delete(id) {
    return request(`/tasks/${id}`, {
      method: "DELETE",
    });
  },
  requestApproval(id) {
    return request(`/tasks/${id}/request-approval`, {
      method: "POST",
    });
  },
  approve(id, reason) {
    return request(`/tasks/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
  },
  getApprovalLogs(id) {
    return request(`/tasks/${id}/approval-logs`);
  },
  reject(id, reason) {
    return request(`/tasks/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  sendEmail(id, to) {
    return request(`/tasks/${id}/send-email`, {
      method: "POST",
      body: JSON.stringify(to ? { to } : {}),
    });
  },
  getDetails(id) {
    return request(`/tasks/${id}/details`);
  },
  getComments(id) {
    return request(`/tasks/${id}/comments`);
  },
  addComment(id, content) {
    return request(`/tasks/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
  getActivities(id) {
    return request(`/tasks/${id}/activities`);
  },
  getAttachments(id) {
    return request(`/tasks/${id}/attachments`);
  },
  uploadAttachment(id, file) {
    const formData = new FormData();
    formData.append("file", file);
    return request(`/tasks/${id}/attachments`, {
      method: "POST",
      body: formData,
    });
  },
  deleteAttachment(id, attachmentId) {
    return request(`/tasks/${id}/attachments/${attachmentId}`, {
      method: "DELETE",
    });
  },
  getSubtasks(id) {
    return request(`/tasks/${id}/subtasks`);
  },
  addSubtask(id, title) {
    return request(`/tasks/${id}/subtasks`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  },
  updateSubtask(id, subtaskId, payload) {
    return request(`/tasks/${id}/subtasks/${subtaskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteSubtask(id, subtaskId) {
    return request(`/tasks/${id}/subtasks/${subtaskId}`, {
      method: "DELETE",
    });
  },
  getTimeEntries(id) {
    return request(`/tasks/${id}/time-entries`);
  },
};

export const statsApi = {
  getSummary(filters) {
    return request(`/stats${toQuery(filters)}`);
  },
  getExecutive(filters) {
    return request(`/stats/executive${toQuery(filters)}`);
  },
};

export const authApi = {
  register(payload) {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  login(payload) {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  verify2FA(payload) {
    return request("/auth/verify-2fa", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getSecuritySettings() {
    return request("/auth/security-settings");
  },
  updateSecuritySettings(payload) {
    return request("/auth/security-settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  forgotPassword(payload) {
    return request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  resetPassword(payload) {
    return request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

export const usersApi = {
  getAll() {
    return request("/users");
  },
  updateRole(id, role) {
    return request(`/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },
};

export const projectsApi = {
  getAll() {
    return request("/projects");
  },
  create(payload) {
    return request("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getMembers(projectId) {
    return request(`/projects/${projectId}/members`);
  },
  getPermissions(projectId) {
    return request(`/projects/${projectId}/permissions`);
  },
  upsertMember(projectId, payload) {
    return request(`/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  removeMember(projectId, userId) {
    return request(`/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    });
  },
};

export const remindersApi = {
  getMySettings() {
    return request("/reminders/settings/me");
  },
  updateMySettings(payload) {
    return request("/reminders/settings/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  runManual() {
    return request("/reminders/run", {
      method: "POST",
    });
  },
};

export const systemApi = {
  listBackups() {
    return request("/system/backups");
  },
  createBackup() {
    return request("/system/backups", {
      method: "POST",
    });
  },
  restoreBackup(fileName) {
    return request(`/system/backups/${encodeURIComponent(fileName)}/restore`, {
      method: "POST",
    });
  },
  listApiTokens(filters) {
    return request(`/system/api-tokens${toQuery(filters)}`);
  },
  createApiToken(payload) {
    return request("/system/api-tokens", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  revokeApiToken(id) {
    return request(`/system/api-tokens/${id}`, {
      method: "DELETE",
    });
  },
  listWebhooks() {
    return request("/system/webhooks");
  },
  createWebhook(payload) {
    return request("/system/webhooks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateWebhook(id, payload) {
    return request(`/system/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteWebhook(id) {
    return request(`/system/webhooks/${id}`, {
      method: "DELETE",
    });
  },
  listWebhookDeliveries(id, limit = 50) {
    return request(`/system/webhooks/${id}/deliveries${toQuery({ limit })}`);
  },
  testWebhook(id, payload) {
    return request(`/system/webhooks/${id}/test`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
  listSecurityEvents(limit = 100) {
    return request(`/system/security/events${toQuery({ limit })}`);
  },
  createSecurityEvent(payload) {
    return request("/system/security/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  runSecurityMaintenance(payload) {
    return request("/system/security/maintenance/run", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
  runSlaEscalation() {
    return request("/system/sla/run", {
      method: "POST",
    });
  },
  getSlaPreview() {
    return request("/system/sla/preview");
  },
  listAutomationRules() {
    return request("/system/automations/rules");
  },
  createAutomationRule(payload) {
    return request("/system/automations/rules", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateAutomationRule(id, payload) {
    return request(`/system/automations/rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteAutomationRule(id) {
    return request(`/system/automations/rules/${id}`, {
      method: "DELETE",
    });
  },
  runAutomations(payload) {
    return request("/system/automations/run", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
};

export const incidentsApi = {
  getAll(filters) {
    return request(`/incidents${toQuery(filters)}`);
  },
  getById(id) {
    return request(`/incidents/${id}`);
  },
  create(payload) {
    return request("/incidents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  update(id, payload) {
    return request(`/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  addEvent(id, payload) {
    return request(`/incidents/${id}/events`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  addPostmortemItem(id, payload) {
    return request(`/incidents/${id}/postmortem`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updatePostmortemItem(id, itemId, payload) {
    return request(`/incidents/${id}/postmortem/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deletePostmortemItem(id, itemId) {
    return request(`/incidents/${id}/postmortem/${itemId}`, {
      method: "DELETE",
    });
  },
};

export const notificationsApi = {
  list(filters) {
    return request(`/notifications${toQuery(filters)}`);
  },
  markAsRead(id) {
    return request(`/notifications/${id}/read`, {
      method: "POST",
    });
  },
  markAllAsRead() {
    return request("/notifications/read-all", {
      method: "POST",
    });
  },
  getMySubscriptions() {
    return request("/notifications/subscriptions/me");
  },
  saveSubscription(payload) {
    return request("/notifications/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  removeSubscription(endpoint) {
    return request("/notifications/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    });
  },
};

export const templatesApi = {
  getAll() {
    return request("/templates");
  },
  create(payload) {
    return request("/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  update(id, payload) {
    return request(`/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  delete(id) {
    return request(`/templates/${id}`, {
      method: "DELETE",
    });
  },
  createTask(id, overrides, options = {}) {
    return request(`/templates/${id}/create-task`, {
      method: "POST",
      body: JSON.stringify({
        overrides,
        ...(options || {}),
      }),
    });
  },
};

export const timeApi = {
  getActiveMe() {
    return request("/time/active/me");
  },
  start(taskId, note = "") {
    return request("/time/start", {
      method: "POST",
      body: JSON.stringify({ task_id: taskId, note }),
    });
  },
  stop(taskId) {
    return request("/time/stop", {
      method: "POST",
      body: JSON.stringify(taskId ? { task_id: taskId } : {}),
    });
  },
  getTaskEntries(taskId) {
    return request(`/time/task/${taskId}`);
  },
  getReport(filters) {
    return request(`/time/reports${toQuery(filters)}`);
  },
  getActivePomodoroMe() {
    return request("/time/pomodoro/active/me");
  },
  startPomodoro(payload) {
    return request("/time/pomodoro/start", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
  completePomodoro(sessionId) {
    return request("/time/pomodoro/complete", {
      method: "POST",
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
    });
  },
  cancelPomodoro(sessionId) {
    return request("/time/pomodoro/cancel", {
      method: "POST",
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
    });
  },
  getPomodoroStats(filters) {
    return request(`/time/pomodoro/stats${toQuery(filters)}`);
  },
};

export const aiApi = {
  chat(messageOrPayload) {
    const payload =
      typeof messageOrPayload === "string"
        ? { message: messageOrPayload }
        : { ...(messageOrPayload || {}) };

    return request("/ai/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getDailyPriority() {
    return request("/ai/daily-priority");
  },
  getInsights() {
    return request("/ai/insights");
  },
  getRiskPredictions(limit = 10) {
    return request(`/ai/risk-predictions${toQuery({ limit })}`);
  },
  getCopilotDailyBrief() {
    return request("/ai/copilot/daily-brief");
  },
  getTaskBreakdown(payload) {
    return request("/ai/copilot/task-breakdown", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
  confirmAction(id) {
    return request(`/ai/actions/${id}/confirm`, {
      method: "POST",
    });
  },
  cancelAction(id) {
    return request(`/ai/actions/${id}/cancel`, {
      method: "POST",
    });
  },
};

export const auditApi = {
  list(filters) {
    return request(`/audit${toQuery(filters)}`);
  },
};
