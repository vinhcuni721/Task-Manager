import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import BrandLogo from "./BrandLogo";
import RealtimeBell from "./RealtimeBell";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
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

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="3" y="13" width="7" height="7" rx="1.5" />
      <rect x="14" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m6 6 2.5 2.5" />
      <path d="m15.5 15.5 2.5 2.5" />
      <path d="m18 6-2.5 2.5" />
      <path d="M8.5 15.5 6 18" />
    </svg>
  );
}

function AlertIcon() {
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

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5" />
      <path d="M12 19v2.5" />
      <path d="m4.2 4.2 1.8 1.8" />
      <path d="m18 18 1.8 1.8" />
      <path d="M2.5 12H5" />
      <path d="M19 12h2.5" />
      <path d="m4.2 19.8 1.8-1.8" />
      <path d="M18 6l1.8-1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M20 14.2A8 8 0 1 1 9.8 4 6.5 6.5 0 0 0 20 14.2Z" />
    </svg>
  );
}

function ChevronDownIcon({ open = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M16 16l4-4-4-4" />
      <path d="M20 12H9" />
    </svg>
  );
}

const NAV_ITEMS = [
  { key: "home", to: "__HOME__", label: "Home", icon: HomeIcon },
  { key: "tasks", to: "/tasks", label: "Tasks", icon: TaskIcon },
  { key: "incidents", to: "/incidents", label: "Incidents", icon: AlertIcon },
  { key: "projects", to: "/projects", label: "Projects", icon: GridIcon },
  { key: "ai", to: "/ai", label: "AI", icon: SparkIcon },
  { key: "statistics", to: "/statistics", label: "Stats", icon: ChartIcon },
];

function userInitials(user) {
  const name = String(user?.name || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || "";
    const second = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
    return (first + second || first || "U").toUpperCase();
  }

  return String(user?.email || "U").trim().charAt(0).toUpperCase() || "U";
}

function formatLastUsed(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `Last used: ${date.toLocaleString()}`;
}

function getHomePathForUser(nextUser) {
  return nextUser?.role === "admin" ? "/admin" : "/dashboard";
}

function Header({ title, onOpenSidebar, onOpenCommandPalette, showMenuButton = false }) {
  const { user, logout, accountSessions, switchAccount, currentAccountId } = useAuth();
  const { mode, toggleMode } = useTheme();
  const navigate = useNavigate();

  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  const homePath = getHomePathForUser(user);
  const navItems = NAV_ITEMS.map((item) => (item.to === "__HOME__" ? { ...item, to: homePath } : item));

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handleOutsideClick = (event) => {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountMenuOpen]);

  const handleLogout = () => {
    setAccountMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  const handleSwitchAccount = (accountId) => {
    const selected = accountSessions.find((item) => item.id === accountId);
    if (!selected) return;

    const switched = switchAccount(accountId);
    if (!switched) return;

    setAccountMenuOpen(false);
    sessionStorage.setItem("taskflow_flash_success", `Switched to ${selected.user?.email || selected.user?.name || "account"}`);
    navigate(getHomePathForUser(selected.user), { replace: true });
  };

  const currentInitials = userInitials(user);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/70 bg-[#181b20]/95 px-3 py-2 backdrop-blur md:px-5">
      <div className="mx-auto flex w-full max-w-[1700px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenSidebar}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700 ${
              showMenuButton ? "" : "lg:hidden"
            }`}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </button>

          <BrandLogo compact className="hidden sm:inline-flex" />

          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden h-11 min-w-[280px] items-center gap-2 rounded-full border border-slate-700 bg-[#252931] px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-[#2c313a] md:inline-flex"
            title="Open command palette"
          >
            <SearchIcon />
            <span className="truncate">Search tasks, projects, commands</span>
            <span className="ml-auto rounded-md border border-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">Ctrl+K</span>
          </button>
        </div>

        <nav className="hidden items-center gap-2 lg:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end
                title={item.label}
                className={({ isActive }) =>
                  `group inline-flex h-12 min-w-[84px] items-center justify-center rounded-xl border px-2 transition ${
                    isActive
                      ? "border-brand-500/70 bg-brand-500/20 text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
                      : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/80 hover:text-slate-100"
                  }`
                }
              >
                <div className="flex flex-col items-center gap-1">
                  <Icon />
                  <span className="text-[11px] font-semibold">{item.label}</span>
                </div>
              </NavLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMode}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700"
            title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {mode === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          <RealtimeBell compact />

          <div ref={accountMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((current) => !current)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-2 text-slate-100 transition hover:bg-slate-700"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{currentInitials}</span>
              <span className="hidden max-w-[120px] truncate text-xs font-semibold sm:block">{user?.name || user?.email || "Account"}</span>
              <ChevronDownIcon open={accountMenuOpen} />
            </button>

            {accountMenuOpen && (
              <section className="absolute right-0 z-50 mt-2 w-[360px] max-w-[90vw] rounded-2xl border border-slate-700 bg-[#1b1f26] p-3 shadow-2xl shadow-black/50">
                <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                      {currentInitials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{user?.name || "User"}</p>
                      <p className="truncate text-xs text-slate-400">{user?.email || ""}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{title}</p>
                </div>

                <div className="mt-3">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Signed-in Accounts</p>
                  <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
                    {accountSessions.length === 0 ? (
                      <p className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
                        No account history found on this browser.
                      </p>
                    ) : (
                      accountSessions.map((account) => {
                        const isCurrent = account.id === currentAccountId;
                        const accountName = account.user?.name || account.user?.email || "User";
                        const accountEmail = account.user?.email || "No email";

                        return (
                          <button
                            key={account.id}
                            type="button"
                            onClick={() => handleSwitchAccount(account.id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                              isCurrent
                                ? "border-brand-500/65 bg-brand-500/18"
                                : "border-slate-700 bg-slate-800/45 hover:bg-slate-800"
                            }`}
                          >
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-100">
                              {userInitials(account.user)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-100">{accountName}</span>
                              <span className="block truncate text-[11px] text-slate-400">{accountEmail}</span>
                              <span className="block truncate text-[10px] text-slate-500">{formatLastUsed(account.lastUsedAt)}</span>
                            </span>
                            <span className={`inline-flex items-center text-xs ${isCurrent ? "text-emerald-400" : "text-slate-300"}`}>
                              {isCurrent ? <CheckIcon /> : "Switch"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
                >
                  <LogoutIcon />
                  Logout
                </button>
              </section>
            )}
          </div>
        </div>
      </div>

      <nav className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={`mobile-${item.key}`}
              to={item.to}
              end
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "border-brand-500/70 bg-brand-500/20 text-white"
                    : "border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-700"
                }`
              }
            >
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}

export default Header;
