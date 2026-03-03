import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatsChart from "../components/StatsChart";
import StatsDashboard from "../components/StatsDashboard";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, projectsApi, statsApi, usersApi } from "../services/api";

const defaultFilters = {
  date_from: "",
  date_to: "",
  project_id: "",
  assignee_id: "",
  approval_status: "",
  window_days: 30,
};

function StatisticsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [executive, setExecutive] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [realtimeTick, setRealtimeTick] = useState(0);

  const queryFilters = useMemo(
    () => ({
      ...filters,
      window_days: Number(filters.window_days) || 30,
    }),
    [filters]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [summaryResponse, executiveResponse] = await Promise.all([
          statsApi.getSummary(queryFilters),
          statsApi.getExecutive(queryFilters),
        ]);
        setStats(summaryResponse.data);
        setExecutive(executiveResponse.data);
      } catch (err) {
        setError(err.message || "Failed to load statistics");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [queryFilters, realtimeTick]);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [projectsRes, usersRes] = await Promise.all([projectsApi.getAll(), usersApi.getAll()]);
        setProjects(projectsRes.data || []);
        setUsers(usersRes.data || []);
      } catch (err) {
        // Keep page usable even if options fail.
      }
    };

    loadOptions();
  }, []);

  useEffect(() => {
    if (!token) return;

    const url = `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);
    let timer = null;

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "connected") return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          setRealtimeTick((current) => current + 1);
        }, 600);
      } catch (error) {
        // Ignore invalid SSE payload.
      }
    };

    eventSource.onerror = () => {
      // Keep connection open and let browser handle reconnection.
    };

    return () => {
      clearTimeout(timer);
      eventSource.close();
    };
  }, [token]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === "window_days" ? Number(value) : value;
    setFilters((current) => ({ ...current, [name]: nextValue }));
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
  };

  const handleDrillDown = (key, value) => {
    if (!value) return;
    const params = new URLSearchParams();
    params.set(key, String(value));
    navigate(`/tasks?${params.toString()}`);
  };

  if (loading) return <p className="text-sm text-slate-600">Loading statistics...</p>;
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>;
  if (!stats) return null;

  const executiveSummary = executive?.summary || null;
  const burnDownData = executive?.burn_down || [];
  const throughputTrend = executive?.trend || [];
  const workloadByUser = (executive?.workload_by_user || []).map((item) => ({
    key: item.id,
    name: item.name || item.email || `User #${item.id}`,
    value: Number(item.open_tasks || 0),
    ...item,
  }));
  const projectRisk = (executive?.project_risk || []).map((item) => ({
    key: item.id,
    name: item.name || `Project #${item.id}`,
    value: Number(item.overdue_open || 0),
    ...item,
  }));

  return (
    <div className="space-y-6">
      <section className="panel p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          <input
            type="date"
            name="date_from"
            value={filters.date_from}
            onChange={handleFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            title="Created from"
          />
          <input
            type="date"
            name="date_to"
            value={filters.date_to}
            onChange={handleFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            title="Created to"
          />

          <select
            name="project_id"
            value={filters.project_id}
            onChange={handleFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <select
            name="assignee_id"
            value={filters.assignee_id}
            onChange={handleFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">All assignees</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>

          <select
            name="approval_status"
            value={filters.approval_status}
            onChange={handleFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">All approvals</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            name="window_days"
            value={filters.window_days}
            onChange={handleFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value={7}>Trend 7 days</option>
            <option value={30}>Trend 30 days</option>
            <option value={90}>Trend 90 days</option>
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Reset filters
          </button>
          <span className="text-xs text-slate-500">Realtime auto refresh is enabled.</span>
        </div>
      </section>

      <StatsDashboard stats={stats} />

      {executiveSummary && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="panel p-5">
            <p className="text-sm text-slate-500">Open workload</p>
            <p className="mt-2 text-3xl font-semibold text-slate-800">{executiveSummary.open_total}</p>
          </article>
          <article className="panel p-5">
            <p className="text-sm text-slate-500">SLA on-time</p>
            <p className="mt-2 text-3xl font-semibold text-slate-800">{executiveSummary.sla_on_time_rate}%</p>
          </article>
          <article className="panel p-5">
            <p className="text-sm text-slate-500">Overdue open</p>
            <p className="mt-2 text-3xl font-semibold text-slate-800">{executiveSummary.overdue_open}</p>
          </article>
          <article className="panel p-5">
            <p className="text-sm text-slate-500">Due in 7 days</p>
            <p className="mt-2 text-3xl font-semibold text-slate-800">{executiveSummary.due_next_7_days}</p>
          </article>
          <article className="panel p-5">
            <p className="text-sm text-slate-500">Completed (7d)</p>
            <p className="mt-2 text-3xl font-semibold text-slate-800">{executiveSummary.completed_last_7_days}</p>
          </article>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <StatsChart
          title="Tasks by status"
          type="pie"
          data={stats.by_status}
          onPointClick={(entry) => handleDrillDown("status", entry?.name || entry?.key)}
        />
        <StatsChart
          title="Tasks by priority"
          type="bar"
          data={stats.by_priority}
          onPointClick={(entry) => handleDrillDown("priority", entry?.name || entry?.key)}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <StatsChart
          title="Tasks by category"
          type="bar"
          data={stats.by_category}
          onPointClick={(entry) => handleDrillDown("category", entry?.name || entry?.key)}
        />
        <StatsChart
          title="Tasks by approval status"
          type="bar"
          data={stats.by_approval}
          onPointClick={(entry) => handleDrillDown("approval_status", entry?.name || entry?.key)}
        />
      </section>

      <section>
        <StatsChart
          title={`Trend (${stats.filters?.trend_date_from || ""} -> ${stats.filters?.trend_date_to || ""})`}
          type="line"
          data={stats.trend}
          lines={[
            { key: "created", label: "Created", color: "#6366f1" },
            { key: "completed", label: "Completed", color: "#10b981" },
            { key: "due", label: "Due", color: "#f59e0b" },
          ]}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <StatsChart
          title="Burn-down (Remaining vs Target)"
          type="line"
          data={burnDownData}
          lines={[
            { key: "remaining", label: "Remaining", color: "#ef4444" },
            { key: "target", label: "Target", color: "#10b981" },
            { key: "completed", label: "Completed/day", color: "#0ea5e9" },
          ]}
        />
        <StatsChart
          title="Throughput Trend (Created vs Completed)"
          type="line"
          data={throughputTrend}
          lines={[
            { key: "created", label: "Created", color: "#6366f1" },
            { key: "completed", label: "Completed", color: "#10b981" },
          ]}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <StatsChart title="Workload by user (open tasks)" type="bar" data={workloadByUser} />
        <StatsChart title="Project risk (overdue open tasks)" type="bar" data={projectRisk} />
      </section>
    </div>
  );
}

export default StatisticsPage;
