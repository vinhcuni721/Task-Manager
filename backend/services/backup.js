const fs = require("fs");
const path = require("path");
const db = require("../database");
const { publishNotification } = require("../events");

const BACKUP_DIR = path.join(__dirname, "..", "backups");

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function timestampLabel(date = new Date()) {
  const iso = date.toISOString().replace(/[:.]/g, "-");
  return iso;
}

async function createBackup({ label = "auto", triggeredByUserId = null } = {}) {
  const fileName = `taskflow-${label}-${timestampLabel()}.db`;
  const filePath = path.join(BACKUP_DIR, fileName);

  await db.backup(filePath);

  publishNotification({
    type: "backup_created",
    message: `Backup created: ${fileName}`,
    details: fileName,
    user_ids: triggeredByUserId ? [triggeredByUserId] : [],
  });

  return {
    file_name: fileName,
    file_path: filePath,
  };
}

function listBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((file) => file.endsWith(".db"))
    .map((file) => {
      const fullPath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(fullPath);
      return {
        file_name: file,
        size_bytes: stats.size,
        created_at: stats.birthtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return files;
}

function validateBackupFileName(fileName) {
  if (!/^[a-zA-Z0-9_.-]+\.db$/.test(fileName)) {
    throw new Error("Invalid backup filename");
  }
  return fileName;
}

function restoreBackupAndRestart(fileName) {
  const safeName = validateBackupFileName(fileName);
  const sourcePath = path.join(BACKUP_DIR, safeName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error("Backup file not found");
  }

  const dbPath = db.__dbPath;
  if (!dbPath) {
    throw new Error("Database path unavailable");
  }

  db.pragma("wal_checkpoint(FULL)");
  db.close();
  fs.copyFileSync(sourcePath, dbPath);

  setTimeout(() => {
    process.exit(0);
  }, 300);

  return {
    restored_file: safeName,
  };
}

module.exports = {
  BACKUP_DIR,
  createBackup,
  listBackups,
  restoreBackupAndRestart,
};
