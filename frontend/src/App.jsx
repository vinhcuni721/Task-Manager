import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminRoute, GuestRoute, ManagerRoute, ProtectedRoute } from "./components/RouteGuards";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AIChatPage = lazy(() => import("./pages/AIChatPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const IncidentsPage = lazy(() => import("./pages/IncidentsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ReminderSettingsPage = lazy(() => import("./pages/ReminderSettingsPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const SecuritySettingsPage = lazy(() => import("./pages/SecuritySettingsPage"));
const SystemBackupsPage = lazy(() => import("./pages/SystemBackupsPage"));
const SystemOpsPage = lazy(() => import("./pages/SystemOpsPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const StatisticsPage = lazy(() => import("./pages/StatisticsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "admin" ? "/admin" : "/dashboard"} replace />;
}

function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading page...</div>}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<HomeRedirect />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ai" element={<AIChatPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/reminders" element={<ReminderSettingsPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/security" element={<SecuritySettingsPage />} />
          </Route>
        </Route>

        <Route element={<ManagerRoute />}>
          <Route element={<Layout />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/audit" element={<AuditLogsPage />} />
          </Route>
        </Route>

        <Route element={<AdminRoute />}>
          <Route element={<Layout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/system/backups" element={<SystemBackupsPage />} />
            <Route path="/system/ops" element={<SystemOpsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
