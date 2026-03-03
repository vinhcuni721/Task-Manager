import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, notificationsApi } from "../services/api";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 16.5h12l-1.2-1.6a4.4 4.4 0 0 1-.8-2.6V10a4 4 0 1 0-8 0v2.3a4.4 4.4 0 0 1-.8 2.6L6 16.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function mapNotificationTarget(item) {
  if (Number.isInteger(Number(item.task_id)) && Number(item.task_id) > 0) {
    return `/tasks?task_id=${Number(item.task_id)}`;
  }
  if (item.type === "backup_created") {
    return "/system/backups";
  }
  if (String(item.type || "").includes("reminder")) {
    return "/reminders";
  }
  if (String(item.type || "").includes("task")) {
    return "/tasks";
  }
  return "/dashboard";
}

function normalizeIncoming(item) {
  return {
    id: Number(item.id),
    type: item.type || "notification",
    title: item.title || "",
    message: item.message || item.action || "Notification",
    details: item.details || "",
    task_id: Number.isInteger(Number(item.task_id)) ? Number(item.task_id) : null,
    created_at: item.created_at || new Date().toISOString(),
    is_read: Boolean(item.is_read),
  };
}

function RealtimeBell({ compact = false }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const panelRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewMode, setViewMode] = useState("all");

  const fetchNotifications = async (mode = viewMode) => {
    try {
      setLoading(true);
      setError("");
      const response = await notificationsApi.list({
        page: 1,
        page_size: 40,
        unread_only: mode === "unread" ? 1 : 0,
      });
      setItems((response.data || []).map(normalizeIncoming));
      setUnreadCount(Number(response.meta?.unread || 0));
    } catch (err) {
      setError(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchNotifications("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const url = `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (payload.type === "connected") return;

        const incoming = normalizeIncoming({
          ...payload,
          is_read: false,
        });

        setItems((current) => {
          const existing = current.find((item) => Number(item.id) === Number(incoming.id));
          if (existing) return current;

          const merged = [incoming, ...current];
          if (viewMode === "unread") {
            return merged.filter((item) => !item.is_read).slice(0, 40);
          }
          return merged.slice(0, 40);
        });
        setUnreadCount((current) => current + 1);
      } catch (streamError) {
        // Ignore malformed event payload.
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [token, viewMode]);

  useEffect(() => {
    if (!open) return;
    fetchNotifications(viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, viewMode]);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const renderedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        displayTime: formatDateTime(item.created_at),
        targetPath: mapNotificationTarget(item),
      })),
    [items]
  );

  const handleOpenItem = async (item) => {
    try {
      if (!item.is_read) {
        await notificationsApi.markAsRead(item.id);
        setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)));
        setUnreadCount((current) => Math.max(0, current - 1));
      }
    } catch (markError) {
      // Navigation should continue even if read-state API fails.
    }

    setOpen(false);
    navigate(item.targetPath);
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setItems((current) => current.map((row) => ({ ...row, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err.message || "Failed to mark all as read");
    }
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700 ${
          compact ? "h-10 w-10" : "gap-2 px-3 py-2 text-xs font-semibold"
        }`}
      >
        <BellIcon />
        {!compact && <span>Notifications</span>}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section className="absolute right-0 z-50 mt-2 w-[420px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-700 bg-[#181b20] shadow-2xl shadow-black/40">
          <header className="border-b border-slate-700 p-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Notification Center</h4>
                <p className="text-xs text-slate-400">Realtime updates and activity history</p>
              </div>
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
                className="rounded-lg border border-slate-600 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
              >
                Mark all read
              </button>
            </div>
            <div className="mt-3 inline-flex rounded-lg border border-slate-700 bg-slate-800 p-1">
              {[
                { key: "all", label: "All" },
                { key: "unread", label: "Unread" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setViewMode(tab.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    viewMode === tab.key ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </header>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading ? (
              <p className="p-3 text-xs text-slate-400">Loading notifications...</p>
            ) : renderedItems.length === 0 ? (
              <p className="p-3 text-xs text-slate-400">No notifications found.</p>
            ) : (
              renderedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenItem(item)}
                  className={`mb-1 w-full rounded-xl border px-3 py-2 text-left transition ${
                    item.is_read
                      ? "border-slate-700 bg-slate-800/40 hover:bg-slate-800"
                      : "border-brand-500/50 bg-brand-500/15 hover:bg-brand-500/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-100">{item.message}</p>
                    {!item.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />}
                  </div>
                  {item.details && <p className="mt-1 text-xs text-slate-300">{item.details}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{item.displayTime}</p>
                </button>
              ))
            )}
            {error && <p className="p-3 text-xs text-red-400">{error}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

export default RealtimeBell;
