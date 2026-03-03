const nodemailer = require("nodemailer");

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  if (!host || !port || !user || !pass || !from) {
    throw new Error("SMTP configuration is missing");
  }

  return {
    host,
    port,
    secure,
    auth: { user, pass },
    from,
  };
}

async function sendTaskEmail({ to, task, sender }) {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  const text = [
    `Task: ${task.title}`,
    `Description: ${task.description || "N/A"}`,
    `Category: ${task.category}`,
    `Priority: ${task.priority}`,
    `Status: ${task.status}`,
    `Deadline: ${task.deadline || "N/A"}`,
    `Assignee: ${task.assignee || "N/A"}`,
    "",
    `Sent by: ${sender.name} (${sender.email})`,
  ].join("\n");

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: `[TaskFlow] ${task.title}`,
    text,
  });
}

async function sendPasswordResetEmail({ to, name, resetLink, expiresMinutes = 60 }) {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  const text = [
    `Hello ${name || "there"},`,
    "",
    "We received a request to reset your TaskFlow password.",
    `Reset link: ${resetLink}`,
    `This link expires in ${expiresMinutes} minutes.`,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: "[TaskFlow] Reset your password",
    text,
  });
}

async function sendReminderSummaryEmail({ to, name, tasks, scopeLabel }) {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  const lines = [
    `Hello ${name || "there"},`,
    "",
    `Here is your TaskFlow reminder (${scopeLabel}).`,
    "",
  ];

  tasks.forEach((task, index) => {
    lines.push(
      `${index + 1}. ${task.title} | priority=${task.priority} | status=${task.status} | deadline=${task.deadline || "N/A"}`
    );
  });

  lines.push("", "Please check your dashboard for details.");

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: `[TaskFlow] Reminder (${tasks.length} tasks)`,
    text: lines.join("\n"),
  });
}

async function sendLoginOtpEmail({ to, name, code, expiresMinutes = 5 }) {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  const text = [
    `Hello ${name || "there"},`,
    "",
    "Your TaskFlow login verification code is:",
    `${code}`,
    "",
    `This code expires in ${expiresMinutes} minutes.`,
    "If this was not you, please change your password immediately.",
  ].join("\n");

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: "[TaskFlow] Login verification code",
    text,
  });
}

module.exports = {
  sendTaskEmail,
  sendPasswordResetEmail,
  sendReminderSummaryEmail,
  sendLoginOtpEmail,
};
