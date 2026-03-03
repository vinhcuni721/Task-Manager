try {
  require("dotenv").config();
} catch (error) {
  // Allow server startup even if dotenv is not installed yet.
}

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

require("./database");

const authRoutes = require("./routes/auth");
const aiRoutes = require("./routes/ai");
const notificationRoutes = require("./routes/notifications");
const projectRoutes = require("./routes/projects");
const reminderRoutes = require("./routes/reminders");
const incidentRoutes = require("./routes/incidents");
const systemRoutes = require("./routes/system");
const taskRoutes = require("./routes/tasks");
const templateRoutes = require("./routes/templates");
const timeRoutes = require("./routes/time");
const statsRoutes = require("./routes/stats");
const userRoutes = require("./routes/users");
const auditRoutes = require("./routes/audit");
const { requireAuth } = require("./middleware/auth");
const { createAuditMiddleware } = require("./services/audit");
const { startSchedulers } = require("./services/scheduler");

const app = express();
const PORT = process.env.PORT || 4000;
const uploadsDir = path.join(__dirname, "uploads");
const configuredOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const allowOriginList = configuredOrigins.length > 0 ? configuredOrigins : [process.env.FRONTEND_URL].filter(Boolean);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowOriginList.length === 0 || allowOriginList.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.json());
app.use(createAuditMiddleware());
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/ai", requireAuth, aiRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/projects", requireAuth, projectRoutes);
app.use("/api/reminders", requireAuth, reminderRoutes);
app.use("/api/incidents", requireAuth, incidentRoutes);
app.use("/api/system", requireAuth, systemRoutes);
app.use("/api/tasks", requireAuth, taskRoutes);
app.use("/api/templates", requireAuth, templateRoutes);
app.use("/api/time", requireAuth, timeRoutes);
app.use("/api/stats", requireAuth, statsRoutes);
app.use("/api/users", requireAuth, userRoutes);
app.use("/api/audit", requireAuth, auditRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`TaskFlow backend is running on http://localhost:${PORT}`);
  startSchedulers();
});
