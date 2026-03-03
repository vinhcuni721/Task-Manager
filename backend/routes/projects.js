const express = require("express");
const db = require("../database");
const { PROJECT_ROLES, canCreateTaskInProject, canManageProject, isAdmin, isManagerOrAdmin, getProjectRole } = require("../services/rbac");

const router = express.Router();

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function canViewProject(projectId, user) {
  if (isManagerOrAdmin(user)) return true;
  return Boolean(getProjectRole(projectId, user.id));
}

function canManageMembers(projectId, user) {
  if (isManagerOrAdmin(user)) return true;
  const role = getProjectRole(projectId, user.id);
  return role === "owner" || role === "manager";
}

router.get("/", (req, res) => {
  try {
    let projects;
    if (isManagerOrAdmin(req.user)) {
      projects = db
        .prepare(
          `SELECT p.*, u.name AS owner_name, u.email AS owner_email
           FROM projects p
           LEFT JOIN users u ON u.id = p.owner_id
           ORDER BY p.updated_at DESC`
        )
        .all();
    } else {
      projects = db
        .prepare(
          `SELECT DISTINCT p.*, u.name AS owner_name, u.email AS owner_email
           FROM projects p
           LEFT JOIN users u ON u.id = p.owner_id
           LEFT JOIN project_members pm ON pm.project_id = p.id
           WHERE pm.user_id = ?
           ORDER BY p.updated_at DESC`
        )
        .all(req.user.id);
    }
    return res.json({ data: projects });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.post("/", (req, res) => {
  try {
    const name = normalizeText(req.body?.name);
    const description = normalizeText(req.body?.description);
    if (!name) {
      return res.status(400).json({ error: "Project name is required" });
    }

    const result = db
      .prepare("INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)")
      .run(name, description, req.user.id);

    db.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')").run(
      result.lastInsertRowid,
      req.user.id
    );

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({ data: project });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create project" });
  }
});

router.get("/:id/members", (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    if (!canViewProject(projectId, req.user)) {
      return res.status(403).json({ error: "No access to this project" });
    }

    const members = db
      .prepare(
        `SELECT pm.*, u.name, u.email
         FROM project_members pm
         LEFT JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ?
         ORDER BY pm.role ASC, u.name ASC`
      )
      .all(projectId);

    return res.json({ data: members });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch project members" });
  }
});

router.get("/:id/permissions", (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId)) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const project = db.prepare("SELECT id, owner_id FROM projects WHERE id = ?").get(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectRole = getProjectRole(projectId, req.user.id) || "";
    const permissions = {
      can_view: canViewProject(projectId, req.user),
      can_manage_project: canManageProject(projectId, req.user),
      can_manage_members: canManageMembers(projectId, req.user),
      can_create_task: canCreateTaskInProject(projectId, req.user),
      can_delete_project: isManagerOrAdmin(req.user) || Number(project.owner_id) === Number(req.user.id),
      project_role: projectRole || (isManagerOrAdmin(req.user) ? "manager" : ""),
    };

    return res.json({ data: permissions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch project permissions" });
  }
});

router.post("/:id/members", (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const userId = Number(req.body?.user_id);
    const role = String(req.body?.role || "").trim();

    if (!Number.isInteger(projectId) || !Number.isInteger(userId)) {
      return res.status(400).json({ error: "Invalid project_id or user_id" });
    }
    if (!PROJECT_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid project role" });
    }
    if (!canManageMembers(projectId, req.user)) {
      return res.status(403).json({ error: "No permission to manage members" });
    }

    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const targetUser = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    db.prepare(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`
    ).run(projectId, userId, role);

    const member = db
      .prepare(
        `SELECT pm.*, u.name, u.email
         FROM project_members pm
         LEFT JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ? AND pm.user_id = ?`
      )
      .get(projectId, userId);

    return res.json({ data: member });
  } catch (error) {
    return res.status(500).json({ error: "Failed to add/update project member" });
  }
});

router.delete("/:id/members/:userId", (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(projectId) || !Number.isInteger(userId)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    if (!canManageMembers(projectId, req.user)) {
      return res.status(403).json({ error: "No permission to manage members" });
    }

    const existing = db
      .prepare("SELECT * FROM project_members WHERE project_id = ? AND user_id = ?")
      .get(projectId, userId);
    if (!existing) {
      return res.status(404).json({ error: "Project member not found" });
    }

    if (existing.role === "owner") {
      return res.status(400).json({ error: "Cannot remove owner from project" });
    }

    db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(projectId, userId);
    return res.json({ message: "Project member removed" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to remove member" });
  }
});

module.exports = router;
