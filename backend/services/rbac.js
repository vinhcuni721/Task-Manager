const db = require("../database");

const PROJECT_ROLES = ["owner", "manager", "member", "viewer"];
const WORKSPACE_ROLES = ["admin", "manager", "member"];

function isAdmin(user) {
  return user?.role === "admin";
}

function isManager(user) {
  return user?.role === "manager";
}

function isManagerOrAdmin(user) {
  return isAdmin(user) || isManager(user);
}

function getProjectRole(projectId, userId) {
  if (!projectId || !userId) return null;

  const membership = db
    .prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?")
    .get(projectId, userId);

  return membership?.role || null;
}

function canViewProject(projectId, user) {
  if (!projectId) return true;
  if (isManagerOrAdmin(user)) return true;
  return Boolean(getProjectRole(projectId, user.id));
}

function canManageProject(projectId, user) {
  if (!projectId) return false;
  if (isManagerOrAdmin(user)) return true;
  const role = getProjectRole(projectId, user.id);
  return role === "owner" || role === "manager";
}

function canCreateTaskInProject(projectId, user) {
  if (!projectId) return true;
  if (isManagerOrAdmin(user)) return true;
  const role = getProjectRole(projectId, user.id);
  return role === "owner" || role === "manager" || role === "member";
}

module.exports = {
  PROJECT_ROLES,
  WORKSPACE_ROLES,
  isAdmin,
  isManager,
  isManagerOrAdmin,
  getProjectRole,
  canViewProject,
  canManageProject,
  canCreateTaskInProject,
};
