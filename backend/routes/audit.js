const express = require("express");
const db = require("../database");
const { isManagerOrAdmin } = require("../services/rbac");

const router = express.Router();

function parsePositiveInt(value, fallback, min = 1, max = 200) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

router.get("/", (req, res) => {
  try {
    if (!isManagerOrAdmin(req.user)) {
      return res.status(403).json({ error: "Only admin or manager can view audit logs" });
    }

    const page = parsePositiveInt(req.query.page, 1, 1, 100000);
    const pageSize = parsePositiveInt(req.query.page_size, 30, 1, 200);
    const offset = (page - 1) * pageSize;

    const conditions = ["1 = 1"];
    const params = {};

    if (req.query.user_id) {
      const userId = Number(req.query.user_id);
      if (Number.isInteger(userId) && userId > 0) {
        conditions.push("l.user_id = @user_id");
        params.user_id = userId;
      }
    }

    if (req.query.entity_type) {
      const entityType = String(req.query.entity_type).trim();
      if (entityType) {
        conditions.push("l.entity_type = @entity_type");
        params.entity_type = entityType;
      }
    }

    if (req.query.action) {
      const action = String(req.query.action).trim();
      if (action) {
        conditions.push("l.action LIKE @action");
        params.action = `%${action}%`;
      }
    }

    const from = parseDate(req.query.date_from);
    if (from) {
      conditions.push("DATE(l.created_at) >= DATE(@date_from)");
      params.date_from = from;
    }

    const to = parseDate(req.query.date_to);
    if (to) {
      conditions.push("DATE(l.created_at) <= DATE(@date_to)");
      params.date_to = to;
    }

    const whereSql = conditions.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) AS value FROM audit_logs l WHERE ${whereSql}`).get(params).value;

    const rows = db
      .prepare(
        `SELECT
           l.*,
           u.name AS user_name
         FROM audit_logs l
         LEFT JOIN users u ON u.id = l.user_id
         WHERE ${whereSql}
         ORDER BY l.created_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({
        ...params,
        limit: pageSize,
        offset,
      })
      .map((row) => ({
        ...row,
        request_json: row.request_json ? JSON.parse(row.request_json) : null,
        metadata_json: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      }));

    return res.json({
      data: rows,
      meta: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

module.exports = router;
