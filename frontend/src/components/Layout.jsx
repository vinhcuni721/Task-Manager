import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import CommandPalette from "./CommandPalette";
import Header from "./Header";
import Sidebar from "./Sidebar";

const PAGE_TITLES = {
  "/": "Home",
  "/dashboard": "Dashboard",
  "/admin": "Admin Dashboard",
  "/ai": "AI Assistant",
  "/tasks": "Tasks",
  "/incidents": "Incidents",
  "/projects": "Projects",
  "/security": "Security Settings",
  "/reminders": "Reminder Settings",
  "/system/backups": "System Backups",
  "/system/ops": "System Operations",
  "/statistics": "Statistics",
  "/users": "Users",
  "/audit": "Audit Logs",
};

function Layout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("taskflow_sidebar_collapsed") === "1";
    } catch (error) {
      return false;
    }
  });
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    try {
      const raw = localStorage.getItem("taskflow_sidebar_pinned");
      return raw === null ? true : raw === "1";
    } catch (error) {
      return true;
    }
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState("");
  const location = useLocation();

  const title = useMemo(() => PAGE_TITLES[location.pathname] || "TaskFlow", [location.pathname]);

  useEffect(() => {
    const message = sessionStorage.getItem("taskflow_flash_success");
    if (!message) return;

    setFlashSuccess(message);
    sessionStorage.removeItem("taskflow_flash_success");

    const timer = setTimeout(() => {
      setFlashSuccess("");
    }, 2800);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem("taskflow_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    } catch (error) {
      // Ignore storage errors.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem("taskflow_sidebar_pinned", sidebarPinned ? "1" : "0");
    } catch (error) {
      // Ignore storage errors.
    }
  }, [sidebarPinned]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((current) => !current);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setCommandPaletteOpen(false);
  }, [location.pathname, location.search]);

  const contentDesktopMarginClass = sidebarPinned ? (sidebarCollapsed ? "lg:ml-[94px]" : "lg:ml-[296px]") : "lg:ml-0";

  return (
    <div className="relative flex min-h-screen bg-[#0f1115] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_85%_90%,rgba(14,165,233,0.11),transparent_32%)]" />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        pinned={sidebarPinned}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        onTogglePinned={() => setSidebarPinned((current) => !current)}
      />

      <div className={`relative min-w-0 flex-1 ${contentDesktopMarginClass}`}>
        <Header
          title={title}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          showMenuButton={!sidebarPinned}
        />

        {flashSuccess && (
          <div className="fixed right-4 top-16 z-50 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 shadow-lg shadow-black/25">
            {flashSuccess}
          </div>
        )}

        <main className="animate-fade-in p-4 md:p-6 lg:p-7">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} user={user} />
    </div>
  );
}

export default Layout;
