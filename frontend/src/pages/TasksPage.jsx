import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import KanbanBoard from "../components/KanbanBoard";
import TaskCalendar from "../components/TaskCalendar";
import TaskCard from "../components/TaskCard";
import TaskDetailsModal from "../components/TaskDetailsModal";
import TaskFilter from "../components/TaskFilter";
import TaskForm from "../components/TaskForm";
import TaskTemplatesPanel from "../components/TaskTemplatesPanel";
import TimeReportPanel from "../components/TimeReportPanel";
import { useAuth } from "../context/AuthContext";
import { projectsApi, taskApi, templatesApi, timeApi, usersApi } from "../services/api";

const defaultFilters = {
  search: "",
  category: "",
  priority: "",
  status: "",
  assignee: "",
  project_id: "",
  approval_status: "",
  date_from: "",
  date_to: "",
  sort_by: "updated_at",
  sort_order: "desc",
  page_size: 10,
  page: 1,
};

const defaultTimeReportFilters = {
  date_from: "",
  date_to: "",
};

function parseFiltersFromSearchParams(searchParams) {
  const next = {};
  const textKeys = [
    "search",
    "category",
    "priority",
    "status",
    "assignee",
    "project_id",
    "approval_status",
    "date_from",
    "date_to",
    "sort_by",
    "sort_order",
  ];

  textKeys.forEach((key) => {
    const value = String(searchParams.get(key) || "").trim();
    if (value) next[key] = value;
  });

  const page = Number(searchParams.get("page"));
  if (Number.isInteger(page) && page > 0) {
    next.page = page;
  }

  const pageSize = Number(searchParams.get("page_size"));
  if (Number.isInteger(pageSize) && pageSize > 0) {
    next.page_size = pageSize;
  }

  return next;
}

function TasksPage() {
  const [searchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [filters, setFilters] = useState(() => ({
    ...defaultFilters,
    ...parseFiltersFromSearchParams(searchParams),
  }));
  const [viewMode, setViewMode] = useState("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectRoles, setProjectRoles] = useState({});
  const [templates, setTemplates] = useState([]);
  const [detailsTask, setDetailsTask] = useState(null);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timeReport, setTimeReport] = useState(null);
  const [pomodoroActive, setPomodoroActive] = useState(null);
  const [pomodoroStats, setPomodoroStats] = useState(null);
  const [pomodoroLoading, setPomodoroLoading] = useState(false);
  const [pomodoroBusy, setPomodoroBusy] = useState(false);
  const [timeReportFilters, setTimeReportFilters] = useState(defaultTimeReportFilters);
  const [reportLoading, setReportLoading] = useState(false);
  const [meta, setMeta] = useState({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1,
  });

  const loadTasks = async (nextFilters = filters) => {
    try {
      setLoading(true);
      setError("");
      const [response, responseAll] = await Promise.all([
        taskApi.getAll(nextFilters),
        taskApi.getAll({
          ...nextFilters,
          page: 1,
          page_size: 1000,
        }),
      ]);

      setTasks(response.data || []);
      setAllTasks(responseAll.data || []);
      setMeta(
        response.meta || {
          page: 1,
          page_size: nextFilters.page_size || 10,
          total: response.data?.length || 0,
          total_pages: 1,
        }
      );
    } catch (err) {
      setError(err.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await usersApi.getAll();
      setUsers(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    }
  };

  const loadProjects = async () => {
    try {
      const response = await projectsApi.getAll();
      const rows = response.data || [];
      setProjects(rows);

      const roleMap = {};
      await Promise.all(
        rows.map(async (project) => {
          try {
            const membersRes = await projectsApi.getMembers(project.id);
            const members = membersRes.data || [];
            const me = members.find((member) => Number(member.user_id) === Number(user?.id));
            if (me?.role) roleMap[project.id] = me.role;
          } catch (error) {
            // Ignore per-project role lookup failure.
          }
        })
      );
      setProjectRoles(roleMap);
    } catch (err) {
      setError(err.message || "Failed to load projects");
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await templatesApi.getAll();
      setTemplates(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load templates");
    }
  };

  const loadActiveTimer = async () => {
    try {
      const response = await timeApi.getActiveMe();
      setActiveTimer(response.data || null);
    } catch (err) {
      // keep silent
    }
  };

  const loadTimeReport = async (nextFilters = timeReportFilters) => {
    try {
      setReportLoading(true);
      const response = await timeApi.getReport(nextFilters);
      setTimeReport(response.data || null);
    } catch (err) {
      setError(err.message || "Failed to load time report");
    } finally {
      setReportLoading(false);
    }
  };

  const loadPomodoroActive = async () => {
    try {
      const response = await timeApi.getActivePomodoroMe();
      setPomodoroActive(response.data || null);
    } catch (err) {
      // keep silent
    }
  };

  const loadPomodoroStats = async (nextFilters = timeReportFilters) => {
    try {
      setPomodoroLoading(true);
      const response = await timeApi.getPomodoroStats(nextFilters);
      setPomodoroStats(response.data || null);
    } catch (err) {
      setError(err.message || "Failed to load pomodoro stats");
    } finally {
      setPomodoroLoading(false);
    }
  };

  useEffect(() => {
    loadTasks(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    loadUsers();
    loadProjects();
    loadTemplates();
    loadActiveTimer();
    loadPomodoroActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fromUrl = parseFiltersFromSearchParams(searchParams);
    if (Object.keys(fromUrl).length === 0) return;
    setFilters((current) => ({
      ...current,
      ...defaultFilters,
      ...fromUrl,
    }));
  }, [searchParamsKey]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey);
    const openCreate = String(params.get("open_create") || "").trim() === "1";
    if (!openCreate) return;
    setEditingTask(null);
    setFormOpen(true);
  }, [searchParamsKey]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey);
    const taskId = Number(params.get("task_id"));
    if (!Number.isInteger(taskId) || taskId <= 0) return;

    const existingTask = [...tasks, ...allTasks].find((item) => Number(item.id) === taskId);
    if (existingTask) {
      setDetailsTask(existingTask);
      return;
    }

    let cancelled = false;
    const loadTask = async () => {
      try {
        const response = await taskApi.getById(taskId);
        if (!cancelled && response.data) {
          setDetailsTask(response.data);
        }
      } catch (error) {
        // Ignore invalid/forbidden task id from URL.
      }
    };

    loadTask();

    return () => {
      cancelled = true;
    };
  }, [allTasks, searchParamsKey, tasks]);

  useEffect(() => {
    if (viewMode !== "time") return;
    loadTimeReport(timeReportFilters);
    loadPomodoroStats(timeReportFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, timeReportFilters]);

  const handleOpenCreate = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (task) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const updateFilters = (nextFilters) => {
    setFilters((current) => ({
      ...current,
      ...nextFilters,
    }));
  };

  const canManageTask = (task) =>
    Boolean(task?.permissions?.update) ||
    user?.role === "admin" ||
    Number(task.user_id) === Number(user?.id) ||
    ["owner", "manager"].includes(projectRoles[task.project_id]);

  const canRequestApprovalTask = (task) =>
    Boolean(task?.permissions?.request_approval) ||
    user?.role === "admin" ||
    Number(task.user_id) === Number(user?.id) ||
    Number(task.assignee_id) === Number(user?.id) ||
    ["owner", "manager", "member"].includes(projectRoles[task.project_id]);

  const canApproveTask = (task) =>
    Boolean(task?.permissions?.approve) ||
    (task.approval_status === "pending_approval" &&
      (user?.role === "admin" ||
        Number(task.user_id) === Number(user?.id) ||
        ["owner", "manager"].includes(projectRoles[task.project_id])));

  const handleDelete = async (task) => {
    const confirmed = window.confirm(`Delete task "${task.title}"?`);
    if (!confirmed) return;

    try {
      await taskApi.delete(task.id);
      await loadTasks(filters);
    } catch (err) {
      setError(err.message || "Failed to delete task");
    }
  };

  const handleSubmitTask = async (payload) => {
    try {
      setIsSaving(true);
      setError("");

      if (editingTask?.id) {
        await taskApi.update(editingTask.id, payload);
      } else {
        await taskApi.create(payload);
      }

      setFormOpen(false);
      setEditingTask(null);
      await loadTasks(filters);
    } catch (err) {
      setError(err.message || "Failed to save task");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendEmail = async (task) => {
    const defaultEmail = user?.email || "";
    const recipient = window.prompt("Recipient email (leave blank to send to your account):", defaultEmail);
    if (recipient === null) return;

    try {
      setError("");
      const response = await taskApi.sendEmail(task.id, recipient.trim());
      window.alert(response.message || "Task sent by email");
    } catch (err) {
      setError(err.message || "Failed to send task email");
    }
  };

  const handleRequestApproval = async (task) => {
    try {
      setError("");
      await taskApi.requestApproval(task.id);
      await loadTasks(filters);
    } catch (err) {
      setError(err.message || "Failed to request approval");
    }
  };

  const handleApprove = async (task) => {
    const reason = window.prompt("Approval note (optional):", "");
    if (reason === null) return;
    try {
      setError("");
      await taskApi.approve(task.id, reason.trim());
      await loadTasks(filters);
    } catch (err) {
      setError(err.message || "Failed to approve task");
    }
  };

  const handleReject = async (task) => {
    const reason = window.prompt("Reject reason (optional):", "");
    if (reason === null) return;
    try {
      setError("");
      await taskApi.reject(task.id, reason.trim());
      await loadTasks(filters);
    } catch (err) {
      setError(err.message || "Failed to reject task");
    }
  };

  const handleKanbanMove = async (task, status) => {
    try {
      setError("");
      await taskApi.update(task.id, { status });
      await loadTasks(filters);
    } catch (err) {
      setError(err.message || "Failed to move task");
    }
  };

  const handleStartTimer = async (task) => {
    try {
      setError("");
      await timeApi.start(task.id);
      await Promise.all([loadTasks(filters), loadActiveTimer(), loadPomodoroActive()]);
    } catch (err) {
      setError(err.message || "Failed to start timer");
    }
  };

  const handleStopTimer = async (task) => {
    try {
      setError("");
      await timeApi.stop(task.id);
      await Promise.all([loadTasks(filters), loadActiveTimer(), loadPomodoroActive()]);
    } catch (err) {
      setError(err.message || "Failed to stop timer");
    }
  };

  const handleCreateTemplate = async (payload) => {
    try {
      setError("");
      await templatesApi.create(payload);
      await loadTemplates();
    } catch (err) {
      setError(err.message || "Failed to create template");
      throw err;
    }
  };

  const handleUseTemplate = async (template, options = {}) => {
    try {
      setError("");
      await templatesApi.createTask(template.id, {}, options);
      await loadTasks(filters);
    } catch (err) {
      setError(err.message || "Failed to create task from template");
    }
  };

  const handleDeleteTemplate = async (template) => {
    const confirmed = window.confirm(`Delete template "${template.name}"?`);
    if (!confirmed) return;

    try {
      setError("");
      await templatesApi.delete(template.id);
      await loadTemplates();
    } catch (err) {
      setError(err.message || "Failed to delete template");
    }
  };

  const handleSaveTemplateFromTask = async (task) => {
    const name = window.prompt("Template name:", `${task.title} template`);
    if (!name) return;
    try {
      setError("");
      await templatesApi.create({
        name,
        description: task.description || "",
        payload: {
          title: task.title,
          description: task.description || "",
          estimated_hours: task.estimated_hours ?? null,
          category: task.category,
          priority: task.priority,
          status: "pending",
          approval_status: "draft",
          project_id: task.project_id || null,
          recurrence_type: task.recurrence_type || "none",
          recurrence_interval: task.recurrence_interval || 1,
          recurrence_end_date: task.recurrence_end_date || null,
        },
      });
      await loadTemplates();
    } catch (err) {
      setError(err.message || "Failed to save template");
    }
  };

  const exportRows = async () => {
    const response = await taskApi.getAll({
      ...filters,
      page: 1,
      page_size: 1000,
    });

    return (response.data || []).map((task) => ({
      ID: task.id,
      Title: task.title,
      Description: task.description || "",
      Project: task.project_name || "",
      Category: task.category,
      Priority: task.priority,
      Status: task.status,
      Approval: task.approval_status || "draft",
      Deadline: task.deadline || "",
      Owner: task.owner_name || "",
      Assignee: task.assignee_name || task.assignee || "",
      TrackedHours: (Number(task.tracked_seconds || 0) / 3600).toFixed(2),
      UpdatedAt: task.updated_at,
    }));
  };

  const handleExportExcel = async () => {
    try {
      const rows = await exportRows();
      if (rows.length === 0) {
        window.alert("No tasks to export");
        return;
      }
      const sheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Tasks");
      XLSX.writeFile(workbook, `taskflow-tasks-${Date.now()}.xlsx`);
    } catch (err) {
      setError(err.message || "Failed to export Excel");
    }
  };

  const handleExportPdf = async () => {
    try {
      const rows = await exportRows();
      if (rows.length === 0) {
        window.alert("No tasks to export");
        return;
      }
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text("TaskFlow - Tasks Report", 14, 14);

      autoTable(doc, {
        startY: 20,
        head: [["ID", "Title", "Priority", "Status", "Deadline", "Owner", "Assignee", "Hours"]],
        body: rows.map((row) => [row.ID, row.Title, row.Priority, row.Status, row.Deadline, row.Owner, row.Assignee, row.TrackedHours]),
        styles: { fontSize: 8 },
      });

      doc.save(`taskflow-tasks-${Date.now()}.pdf`);
    } catch (err) {
      setError(err.message || "Failed to export PDF");
    }
  };

  const handlePrevPage = () => {
    if (filters.page <= 1) return;
    updateFilters({ page: filters.page - 1 });
  };

  const handleNextPage = () => {
    if (filters.page >= meta.total_pages) return;
    updateFilters({ page: filters.page + 1 });
  };

  const handleTimeReportFilterChange = (event) => {
    const { name, value } = event.target;
    setTimeReportFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleStartPomodoro = async (payload) => {
    try {
      setPomodoroBusy(true);
      setError("");
      await timeApi.startPomodoro(payload);
      await Promise.all([loadPomodoroActive(), loadPomodoroStats(timeReportFilters), loadActiveTimer()]);
    } catch (err) {
      setError(err.message || "Failed to start pomodoro");
    } finally {
      setPomodoroBusy(false);
    }
  };

  const handleCompletePomodoro = async () => {
    try {
      setPomodoroBusy(true);
      setError("");
      await timeApi.completePomodoro(pomodoroActive?.id);
      await Promise.all([loadPomodoroActive(), loadPomodoroStats(timeReportFilters), loadActiveTimer(), loadTasks(filters)]);
    } catch (err) {
      setError(err.message || "Failed to complete pomodoro");
    } finally {
      setPomodoroBusy(false);
    }
  };

  const handleCancelPomodoro = async () => {
    try {
      setPomodoroBusy(true);
      setError("");
      await timeApi.cancelPomodoro(pomodoroActive?.id);
      await Promise.all([loadPomodoroActive(), loadPomodoroStats(timeReportFilters), loadActiveTimer()]);
    } catch (err) {
      setError(err.message || "Failed to cancel pomodoro");
    } finally {
      setPomodoroBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Tasks with list, kanban, calendar, templates, subtasks and time tracking.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Export Excel
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
          >
            + Add Task
          </button>
        </div>
      </div>

      <div className="panel flex flex-wrap gap-2 p-3">
        {[
          { key: "list", label: "List" },
          { key: "kanban", label: "Kanban" },
          { key: "calendar", label: "Calendar" },
          { key: "time", label: "Time Report" },
        ].map((mode) => (
          <button
            key={mode.key}
            type="button"
            onClick={() => setViewMode(mode.key)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              viewMode === mode.key ? "bg-brand-500 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <TaskTemplatesPanel
        templates={templates}
        onCreateTemplate={handleCreateTemplate}
        onUseTemplate={handleUseTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />

      <TaskFilter filters={filters} onChange={updateFilters} onReset={setFilters} projects={projects} />

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-600">Loading tasks...</p>
      ) : (
        <>
          {viewMode === "list" && (
            <>
              {tasks.length === 0 ? (
                <article className="panel p-6 text-sm text-slate-600">No tasks found for current filters.</article>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onEdit={canManageTask(task) ? handleOpenEdit : null}
                      onDelete={canManageTask(task) ? handleDelete : null}
                      onSendEmail={handleSendEmail}
                      onViewDetails={setDetailsTask}
                      onRequestApproval={handleRequestApproval}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onStartTimer={handleStartTimer}
                      onStopTimer={handleStopTimer}
                      onSaveTemplate={handleSaveTemplateFromTask}
                      canRequestApproval={canRequestApprovalTask(task)}
                      canApprove={canApproveTask(task)}
                      canStartTimer={!activeTimer || Number(activeTimer.task_id) === Number(task.id)}
                      isTimerActive={Number(activeTimer?.task_id) === Number(task.id)}
                    />
                  ))}
                </div>
              )}

              <div className="panel flex flex-wrap items-center justify-between gap-3 p-3 text-sm text-slate-700">
                <p>
                  Page {meta.page} / {meta.total_pages} - {meta.total} tasks
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={filters.page <= 1}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={filters.page >= meta.total_pages}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          {viewMode === "kanban" && (
            <KanbanBoard
              tasks={allTasks}
              canMoveTask={canManageTask}
              onMoveTask={handleKanbanMove}
              onOpenTask={setDetailsTask}
            />
          )}

          {viewMode === "calendar" && <TaskCalendar tasks={allTasks} onOpenTask={setDetailsTask} />}

          {viewMode === "time" && (
            <TimeReportPanel
              report={timeReport}
              loading={reportLoading}
              filters={timeReportFilters}
              onFilterChange={handleTimeReportFilterChange}
              tasks={allTasks}
              pomodoroActive={pomodoroActive}
              pomodoroStats={pomodoroStats}
              pomodoroLoading={pomodoroLoading}
              pomodoroBusy={pomodoroBusy}
              onStartPomodoro={handleStartPomodoro}
              onCompletePomodoro={handleCompletePomodoro}
              onCancelPomodoro={handleCancelPomodoro}
            />
          )}
        </>
      )}

      <TaskForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onSubmit={handleSubmitTask}
        initialData={editingTask}
        isSubmitting={isSaving}
        users={users}
        projects={projects}
      />

      <TaskDetailsModal
        open={Boolean(detailsTask)}
        task={detailsTask}
        onClose={() => setDetailsTask(null)}
        onRefreshTasks={async () => {
          await Promise.all([loadTasks(filters), loadActiveTimer(), loadPomodoroActive()]);
        }}
      />
    </div>
  );
}

export default TasksPage;
