import { useEffect, useState } from "react";
import StatsDashboard from "../components/StatsDashboard";
import TaskCard from "../components/TaskCard";
import { statsApi, taskApi } from "../services/api";

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const [statsRes, tasksRes] = await Promise.all([statsApi.getSummary(), taskApi.getAll()]);
        setStats(statsRes.data);
        setRecentTasks((tasksRes.data || []).slice(0, 6));
      } catch (err) {
        setError(err.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) return <p className="text-sm text-slate-600">Loading dashboard...</p>;
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <StatsDashboard stats={stats} />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-800">Recent tasks</h3>
        </div>

        {recentTasks.length === 0 ? (
          <article className="panel p-6 text-sm text-slate-600">No tasks yet. Go to Tasks page to create one.</article>
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

export default Dashboard;
