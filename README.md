# TaskFlow - Task Management App

Full-stack task management web application with:
- Frontend: React 18 + Vite + TailwindCSS
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)

## Project Structure

```text
task-manager/
|-- backend/
|   |-- server.js
|   |-- database.js
|   |-- routes/
|       |-- tasks.js
|       |-- stats.js
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |-- pages/
|   |   |-- services/
|   |   |-- App.jsx
|   |   |-- main.jsx
|   |-- index.html
|   |-- vite.config.js
|   |-- tailwind.config.js
|-- README.md
```

## Features

- Task CRUD: create, read, update, delete
- User authentication: register + login (JWT)
- Role-based permissions: `admin` / `member`
- Project/team RBAC: `owner` / `manager` / `member` / `viewer`
- Assignment by user account (`assignee_id`)
- Task approval workflow: draft -> pending_approval -> approved/rejected
- Recurring tasks (daily/weekly/monthly auto-generate next task when completed)
- Task comments
- Task activity log
- File attachments (upload/delete/download)
- Advanced filters: category, priority, status, assignee, project, approval, date range, search
- Sorting + pagination for tasks
- Export task reports to Excel/PDF
- Realtime notifications (SSE)
- Dark mode + theme accent customization
- Dashboard with recent tasks and KPI cards
- Send task details to email from task card
- Multi-channel reminders: email / telegram / slack / web push
- Scheduled reminders + daily automatic backup
- Admin backup/restore management
- Statistics with charts:
  - tasks by status
  - tasks by priority
  - tasks by category
  - completion rate
  - overdue tasks
- Responsive layout with sidebar and mobile drawer

## API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `GET /api/notifications/stream?token=<jwt>`
- `GET /api/notifications/subscriptions/me`
- `POST /api/notifications/subscriptions`
- `DELETE /api/notifications/subscriptions`
- `GET /api/users`
- `PATCH /api/users/:id/role` (admin only)
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id/members`
- `POST /api/projects/:id/members`
- `DELETE /api/projects/:id/members/:userId`
- `GET /api/tasks`
  - query: `page`, `page_size`, `sort_by`, `sort_order`, `date_from`, `date_to`, `search`, `project_id`, `approval_status`, ...
- `GET /api/tasks/:id`
- `GET /api/tasks/:id/details`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/request-approval`
- `POST /api/tasks/:id/approve`
- `POST /api/tasks/:id/reject`
- `GET /api/tasks/:id/comments`
- `POST /api/tasks/:id/comments`
- `GET /api/tasks/:id/activities`
- `GET /api/tasks/:id/attachments`
- `POST /api/tasks/:id/attachments`
- `DELETE /api/tasks/:id/attachments/:attachmentId`
- `POST /api/tasks/:id/send-email`
- `GET /api/reminders/settings/me`
- `PUT /api/reminders/settings/me`
- `POST /api/reminders/run` (admin only)
- `GET /api/system/backups` (admin only)
- `POST /api/system/backups` (admin only)
- `POST /api/system/backups/:fileName/restore` (admin only)
- `GET /api/stats`
- `GET /api/health`

## Run Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs at: `http://localhost:4000`

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:5173`

## Optional Environment Variable

Frontend API base URL:

```bash
VITE_API_URL=http://localhost:4000/api
VITE_WEB_PUSH_PUBLIC_KEY=your-vapid-public-key
```

Backend security and email configuration:

```bash
JWT_SECRET=replace-with-strong-secret
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=your-from-address
ENABLE_AUTO_REMINDERS=true
REMINDER_INTERVAL_MINUTES=60
ENABLE_AUTO_BACKUPS=true
BACKUP_CHECK_INTERVAL_MINUTES=30
BACKUP_HOUR_UTC=2
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
WEB_PUSH_PUBLIC_KEY=your-vapid-public-key
WEB_PUSH_PRIVATE_KEY=your-vapid-private-key
WEB_PUSH_SUBJECT=mailto:admin@example.com
```

Notes:
- Without SMTP variables, login/register and task management still work.
- Email endpoint (`/api/tasks/:id/send-email`) requires SMTP configuration.
- Web push requires both backend VAPID keys and frontend `VITE_WEB_PUSH_PUBLIC_KEY`.
