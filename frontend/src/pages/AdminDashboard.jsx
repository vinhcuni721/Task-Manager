import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TaskCard from "../components/TaskCard";
import { statsApi, taskApi, usersApi } from "../services/api";

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [statsRes, usersRes, tasksRes] = await Promise.all([
          statsApi.getSummary(),
          usersApi.getAll(),
          taskApi.getAll(),
        ]);
        setStats(statsRes.data);
        setUsers(usersRes.data || []);
        setRecentTasks((tasksRes.data || []).slice(0, 6));
      } catch (err) {
        setError(err.message || "Failed to load admin dashboard");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) return <p className="text-sm text-slate-600">Loading admin dashboard...</p>;
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>;
  if (!stats) return null;

  const adminCount = users.filter((user) => user.role === "admin").length;
  const memberCount = users.length - adminCount;
  const recentUsers = [...users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Admin Controls</h3>
          <p className="text-sm text-slate-600">Manage integrations, automation rules, security events and SLA operations.</p>
        </div>
        <Link to="/system/ops" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          Open System Ops
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="panel p-5">
          <p className="text-sm text-slate-500">Total users</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">{users.length}</p>
        </article>
        <article className="panel p-5">
          <p className="text-sm text-slate-500">Admins</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">{adminCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-sm text-slate-500">Members</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">{memberCount}</p>
        </article>
        <article className="panel p-5">
          <p className="text-sm text-slate-500">Total tasks</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">{stats.total_tasks}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="panel p-5">
          <h3 className="mb-3 text-lg font-semibold text-slate-800">Newest users</h3>
          {recentUsers.length === 0 ? (
            <p className="text-sm text-slate-600">No users found.</p>
          ) : (
            <ul className="space-y-2">
              {recentUsers.map((user) => (
                <li key={user.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  <span className="pill bg-slate-100 text-slate-700">{user.role}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel p-5">
          <h3 className="mb-3 text-lg font-semibold text-slate-800">Task health</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <span className="text-slate-600">Completed tasks</span>
              <span className="font-semibold text-slate-800">{stats.completed_tasks}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <span className="text-slate-600">Completion rate</span>
              <span className="font-semibold text-slate-800">{stats.completion_rate}%</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <span className="text-slate-600">Overdue tasks</span>
              <span className="font-semibold text-slate-800">{stats.overdue_tasks}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold text-slate-800">Recent tasks (all users)</h3>
        {recentTasks.length === 0 ? (
          <article className="panel p-6 text-sm text-slate-600">No tasks found.</article>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {recentTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminDashboard;
