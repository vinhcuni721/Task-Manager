import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { taskApi } from "../services/api";

const BASE_ROUTES = [
  { id: "route-dashboard", type: "route", label: "Go to Dashboard", description: "Overview and key metrics", path: "/dashboard" },
  { id: "route-ai", type: "route", label: "Go to AI Assistant", description: "Ask AI about your tasks", path: "/ai" },
  { id: "route-tasks", type: "route", label: "Go to Tasks", description: "List, kanban, calendar", path: "/tasks" },
  { id: "route-projects", type: "route", label: "Go to Projects", description: "Project workspace", path: "/projects" },
  { id: "route-reminders", type: "route", label: "Go to Reminders", description: "Reminder settings", path: "/reminders" },
  { id: "route-security", type: "route", label: "Go to Security", description: "2FA and password settings", path: "/security" },
  { id: "route-statistics", type: "route", label: "Go to Statistics", description: "Reports and trends", path: "/statistics" },
  { id: "route-users", type: "route", label: "Go to Users", description: "User management", path: "/users" },
];

const ACTIONS = [
  {
    id: "action-new-task",
    type: "action",
    label: "Create new task",
    description: "Open Task form directly",
    action: "create_task",
  },
  {
    id: "action-open-notifications",
    type: "action",
    label: "Review notifications",
    description: "Go to latest task alerts",
    action: "open_tasks",
  },
];

function contains(text, query) {
  return String(text || "").toLowerCase().includes(String(query || "").toLowerCase().trim());
}

function Icon({ type }) {
  if (type === "task") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="m3 6 1.5 1.5L6.5 5" />
        <path d="m3 12 1.5 1.5L6.5 11" />
        <path d="m3 18 1.5 1.5L6.5 17" />
      </svg>
    );
  }
  if (type === "action") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M3 12h18" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
    </svg>
  );
}

function CommandPalette({ open, onClose, user }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskResults, setTaskResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const routeItems = useMemo(() => {
    const allRoutes = [...BASE_ROUTES];
    if (user?.role === "admin") {
      allRoutes.push({
        id: "route-system-backups",
        type: "route",
        label: "Go to System Backups",
        description: "Backup and restore database",
        path: "/system/backups",
      });
      allRoutes.push({
        id: "route-system-ops",
        type: "route",
        label: "Go to System Ops",
        description: "Automation, webhooks, security console",
        path: "/system/ops",
      });
      allRoutes[0] = {
        id: "route-admin",
        type: "route",
        label: "Go to Admin Dashboard",
        description: "Admin overview and controls",
        path: "/admin",
      };
    }
    return allRoutes.filter((item) => !query.trim() || contains(item.label, query) || contains(item.description, query));
  }, [query, user?.role]);

  const actionItems = useMemo(
    () => ACTIONS.filter((item) => !query.trim() || contains(item.label, query) || contains(item.description, query)),
    [query]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTaskResults([]);
    setSelectedIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTaskResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoadingTasks(true);
        const response = await taskApi.getAll({
          search: trimmed,
          page: 1,
          page_size: 8,
          sort_by: "updated_at",
          sort_order: "desc",
        });
        setTaskResults(response.data || []);
      } catch (error) {
        setTaskResults([]);
      } finally {
        setLoadingTasks(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [open, query]);

  const grouped = useMemo(() => {
    const groups = [];
    if (routeItems.length) groups.push({ title: "Navigation", items: routeItems });
    if (actionItems.length) groups.push({ title: "Quick Actions", items: actionItems });
    if (taskResults.length) {
      groups.push({
        title: "Tasks",
        items: taskResults.map((task) => ({
          id: `task-${task.id}`,
          type: "task",
          label: task.title,
          description: `${task.status} | ${task.priority}${task.deadline ? ` | due ${task.deadline}` : ""}`,
          task_id: task.id,
        })),
      });
    }
    return groups;
  }, [actionItems, routeItems, taskResults]);

  const flatItems = useMemo(() => grouped.flatMap((group) => group.items), [grouped]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (flatItems.length === 0) return 0;
      return Math.max(0, Math.min(current, flatItems.length - 1));
    });
  }, [flatItems]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => (flatItems.length ? (current + 1) % flatItems.length : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => (flatItems.length ? (current - 1 + flatItems.length) % flatItems.length : 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const activeItem = flatItems[selectedIndex];
        if (activeItem) {
          selectItem(activeItem);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [flatItems, onClose, open, selectedIndex]);

  const selectItem = (item) => {
    onClose();
    if (item.type === "route") {
      navigate(item.path);
      return;
    }
    if (item.type === "task") {
      navigate(`/tasks?task_id=${item.task_id}`);
      return;
    }
    if (item.type === "action") {
      if (item.action === "create_task") {
        navigate("/tasks?open_create=1");
        return;
      }
      navigate("/tasks");
    }
  };

  if (!open) return null;

  let offset = 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/45 px-4 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, actions, tasks..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
            />
            <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">ESC</kbd>
          </div>
        </div>

        <div className="max-h-[56vh] overflow-y-auto p-2">
          {loadingTasks && <p className="px-2 py-1 text-xs text-slate-500">Searching tasks...</p>}

          {flatItems.length === 0 ? (
            <p className="px-2 py-4 text-sm text-slate-500">No results. Try another keyword.</p>
          ) : (
            grouped.map((group) => {
              const start = offset;
              offset += group.items.length;
              return (
                <div key={group.title} className="mb-2">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{group.title}</p>
                  <div className="space-y-1">
                    {group.items.map((item, index) => {
                      const absoluteIndex = start + index;
                      const active = absoluteIndex === selectedIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                          onClick={() => selectItem(item)}
                          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition ${
                            active ? "border-brand-500/40 bg-brand-500/10" : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            <Icon type={item.type} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800">{item.label}</span>
                            <span className="block truncate text-xs text-slate-500">{item.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

export default CommandPalette;
