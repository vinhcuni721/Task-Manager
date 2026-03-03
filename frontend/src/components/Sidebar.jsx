import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandLogo from "./BrandLogo";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 2.5L4.5 18A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}

function TaskIcon() {
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

function ProjectIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5" width="8" height="6" rx="1.5" />
      <rect x="13" y="5" width="8" height="6" rx="1.5" />
      <rect x="3" y="13" width="8" height="6" rx="1.5" />
      <rect x="13" y="13" width="8" height="6" rx="1.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 16.5h12l-1.2-1.6a4.4 4.4 0 0 1-.8-2.6V10a4 4 0 1 0-8 0v2.3a4.4 4.4 0 0 1-.8 2.6L6 16.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IncidentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 4 21 20H3L12 4Z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-4" />
      <path d="M12 16V8" />
      <path d="M16 16v-7" />
      <path d="M20 16v-2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3 5 6v6c0 4.2 2.7 7.8 7 9 4.3-1.2 7-4.8 7-9V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8L14.7 10.5" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M8 4h8" />
      <path d="M9 2h6v4H9z" />
      <rect x="5" y="6" width="14" height="16" rx="2" />
      <path d="M8 11h8" />
      <path d="M8 15h8" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9 6 3 12l6 6" />
      <path d="M21 5v14" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 6 6 6-6 6" />
      <path d="M3 5v14" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m14 4 6 6-2 2-2-2-4 4v6l-2-2-2 2v-6l4-4-2-2 2-2Z" />
    </svg>
  );
}

function UnpinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="m14 4 6 6-2 2-2-2-4 4v6l-2-2-2 2v-6l4-4-2-2 2-2Z" />
    </svg>
  );
}

const ICONS = {
  dashboard: HomeIcon,
  ai: ChatIcon,
  tasks: TaskIcon,
  projects: ProjectIcon,
  reminders: BellIcon,
  incidents: IncidentIcon,
  statistics: ChartIcon,
  users: UserIcon,
  backups: ShieldIcon,
  security: ShieldIcon,
  system_ops: AuditIcon,
  audit: AuditIcon,
};

function MenuSection({ title, items, onClose, compact }) {
  return (
    <section className="space-y-1.5">
      {!compact && <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>}
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon] || HomeIcon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              end
              title={item.label}
              className={({ isActive }) =>
                `group flex items-center rounded-xl border text-sm font-medium transition-all ${
                  compact ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                } ${
                  isActive
                    ? "border-brand-500/60 bg-brand-500/20 text-white"
                    : "border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800/80 hover:text-white"
                }`
              }
            >
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 ${
                  compact ? "" : "group-hover:border-slate-600"
                }`}
              >
                <Icon />
              </span>
              {!compact && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </div>
    </section>
  );
}

function Sidebar({
  open,
  onClose,
  collapsed = false,
  pinned = true,
  onToggleCollapse,
  onTogglePinned,
}) {
  const { user } = useAuth();
  const compact = pinned && collapsed;

  const homeItems = [
    {
      to: user?.role === "admin" ? "/admin" : "/dashboard",
      label: user?.role === "admin" ? "Admin Dashboard" : "Dashboard",
      icon: "dashboard",
    },
  ];

  const workspaceItems = [
    { to: "/ai", label: "AI Assistant", icon: "ai" },
    { to: "/tasks", label: "Task Inbox", icon: "tasks" },
    { to: "/incidents", label: "Incidents", icon: "incidents" },
    { to: "/projects", label: "Projects", icon: "projects" },
    { to: "/reminders", label: "Reminders", icon: "reminders" },
    { to: "/security", label: "Security", icon: "security" },
  ];

  const managementItems = [
    { to: "/statistics", label: "Analytics", icon: "statistics" },
    ...(user?.role === "admin" || user?.role === "manager" ? [{ to: "/users", label: "Team Members", icon: "users" }] : []),
    ...(user?.role === "admin" || user?.role === "manager" ? [{ to: "/audit", label: "Audit Logs", icon: "audit" }] : []),
  ];

  const adminItems =
    user?.role === "admin"
      ? [
          { to: "/system/backups", label: "System Backups", icon: "backups" },
          { to: "/system/ops", label: "System Ops", icon: "system_ops" },
        ]
      : [];

  const desktopTranslateClass = pinned ? "lg:translate-x-0" : open ? "lg:translate-x-0" : "lg:-translate-x-full";
  const initials = (user?.name || user?.email || "U").trim().charAt(0).toUpperCase();

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        } ${pinned ? "lg:hidden" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-[296px] flex-col border-r border-slate-800/80 bg-[#111317]/95 px-4 py-5 shadow-2xl backdrop-blur-xl transition-all duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${desktopTranslateClass} ${compact ? "lg:w-[94px]" : "lg:w-[296px]"}`}
      >
        <div className={`mb-4 rounded-2xl border border-slate-800 bg-[#1a1e24] p-3 ${compact ? "lg:px-2 lg:py-3" : ""}`}>
          <div className={`flex items-center ${compact ? "justify-center" : ""}`}>
            {compact ? (
              <BrandLogo compact className="hidden lg:inline-flex" />
            ) : (
              <BrandLogo inverse subtitle="Work Command Center" />
            )}
          </div>
        </div>

        <div className={`mb-4 rounded-2xl border border-slate-800 bg-[#181b20] p-3 ${compact ? "lg:px-2 lg:py-3" : ""}`}>
          {compact ? (
            <div className="hidden justify-center lg:flex">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">{initials}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">{initials}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{user?.name || "User"}</p>
                  <p className="truncate text-xs text-slate-400">{user?.email || ""}</p>
                </div>
              </div>
              <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {user?.role === "admin" ? "Administrator" : user?.role === "manager" ? "Manager" : "Member"}
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto pr-1">
          <MenuSection title="Main" items={homeItems} onClose={onClose} compact={compact} />
          <MenuSection title="Workspace" items={workspaceItems} onClose={onClose} compact={compact} />
          <MenuSection title="Management" items={managementItems} onClose={onClose} compact={compact} />
          {adminItems.length > 0 && <MenuSection title="Administration" items={adminItems} onClose={onClose} compact={compact} />}
        </nav>

        <div className={`mt-4 grid gap-2 ${compact ? "lg:grid-cols-1" : "grid-cols-2"}`}>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            title={compact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {compact ? <ExpandIcon /> : <CollapseIcon />}
            {!compact && <span>Collapse</span>}
          </button>
          <button
            type="button"
            onClick={onTogglePinned}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            title={pinned ? "Unpin sidebar" : "Pin sidebar"}
          >
            {pinned ? <UnpinIcon /> : <PinIcon />}
            {!compact && <span>{pinned ? "Unpin" : "Pin"}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
