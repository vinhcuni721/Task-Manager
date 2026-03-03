const express = require("express");
const db = require("../database");
const { WORKSPACE_ROLES, isManagerOrAdmin } = require("../services/rbac");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ error: "Only admin or manager can view users" });
    }

    const users = db
      .prepare("SELECT id, name, email, role, created_at FROM users ORDER BY name ASC, email ASC")
      .all();
    return res.json({ data: users });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.patch("/:id/role", (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admin can change user roles" });
    }

    const id = Number(req.params.id);
    const role = String(req.body?.role || "").trim();
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    if (!WORKSPACE_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
    const user = db
      .prepare("SELECT id, name, email, role, created_at FROM users WHERE id = ?")
      .get(id);
    return res.json({ data: user });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update role" });
  }
});

module.exports = router;
