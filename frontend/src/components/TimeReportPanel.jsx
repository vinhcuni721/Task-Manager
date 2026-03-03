import { useEffect, useMemo, useState } from "react";

function formatHours(seconds) {
  const value = Number(seconds) || 0;
  return (value / 3600).toFixed(2);
}

function formatMinutes(seconds) {
  const value = Number(seconds) || 0;
  return Number((value / 60).toFixed(1));
}

function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function TimeReportPanel({
  report,
  loading,
  filters,
  onFilterChange,
  tasks = [],
  pomodoroActive,
  pomodoroStats,
  pomodoroLoading,
  pomodoroBusy,
  onStartPomodoro,
  onCompletePomodoro,
  onCancelPomodoro,
}) {
  const byTask = report?.by_task || [];
  const byUser = report?.by_user || [];
  const [pomodoroForm, setPomodoroForm] = useState({
    task_id: "",
    focus_minutes: 25,
    auto_start_timer: true,
    note: "",
  });
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (!pomodoroActive) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pomodoroActive]);

  const availableTasks = useMemo(
    () => tasks.filter((task) => task.status !== "completed").slice(0, 200),
    [tasks]
  );

  const pomodoroCountdown = useMemo(() => {
    if (!pomodoroActive?.started_at) return 0;
    const startedAtMs = new Date(pomodoroActive.started_at).getTime();
    if (Number.isNaN(startedAtMs)) return 0;
    const plannedSeconds = Math.max(1, Number(pomodoroActive.planned_minutes || 25) * 60);
    const elapsed = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    return Math.max(0, plannedSeconds - elapsed);
  }, [nowMs, pomodoroActive]);

  const handleStartPomodoro = async (event) => {
    event.preventDefault();
    if (!pomodoroForm.task_id) return;
    await onStartPomodoro?.({
      task_id: Number(pomodoroForm.task_id),
      focus_minutes: Number(pomodoroForm.focus_minutes || 25),
      auto_start_timer: pomodoroForm.auto_start_timer,
      note: pomodoroForm.note.trim(),
    });
  };

  return (
    <section className="space-y-4">
      <article className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-800">Time Tracking Report</h3>
          <span className="pill bg-indigo-100 text-indigo-700">Total: {report?.total_hours || 0}h</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="date"
            name="date_from"
            value={filters.date_from || ""}
            onChange={onFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            type="date"
            name="date_to"
            value={filters.date_to || ""}
            onChange={onFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {loading ? "Loading..." : "Updated report"}
          </div>
        </div>
      </article>

      <article className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pomodoro Focus</h4>
          {pomodoroActive ? (
            <span className="pill bg-emerald-100 text-emerald-700">Active {formatCountdown(pomodoroCountdown)}</span>
          ) : (
            <span className="pill bg-slate-100 text-slate-700">No active session</span>
          )}
        </div>

        {!pomodoroActive ? (
          <form onSubmit={handleStartPomodoro} className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <select
              value={pomodoroForm.task_id}
              onChange={(event) => setPomodoroForm((current) => ({ ...current, task_id: event.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            >
              <option value="">Select task</option>
              {availableTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  #{task.id} {task.title}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={5}
              max={120}
              value={pomodoroForm.focus_minutes}
              onChange={(event) =>
                setPomodoroForm((current) => ({
                  ...current,
                  focus_minutes: Math.max(5, Math.min(120, Number(event.target.value) || 25)),
                }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Minutes"
            />
            <input
              value={pomodoroForm.note}
              onChange={(event) => setPomodoroForm((current) => ({ ...current, note: event.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Note (optional)"
            />
            <button
              type="submit"
              disabled={pomodoroBusy || !pomodoroForm.task_id}
              className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {pomodoroBusy ? "Starting..." : "Start Focus"}
            </button>
            <label className="md:col-span-5 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={pomodoroForm.auto_start_timer}
                onChange={(event) =>
                  setPomodoroForm((current) => ({
                    ...current,
                    auto_start_timer: event.target.checked,
                  }))
                }
              />
              Auto start time entry when pomodoro starts
            </label>
          </form>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Task:</span> #{pomodoroActive.task_id} {pomodoroActive.task_title || ""}
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-semibold">Planned:</span> {pomodoroActive.planned_minutes}m
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCompletePomodoro}
                disabled={pomodoroBusy}
                className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                {pomodoroBusy ? "Working..." : "Complete Focus"}
              </button>
              <button
                type="button"
                onClick={onCancelPomodoro}
                disabled={pomodoroBusy}
                className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Sessions: <span className="font-semibold text-slate-800">{pomodoroStats?.total_sessions || 0}</span>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Completed: <span className="font-semibold">{pomodoroStats?.completed_sessions || 0}</span>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Interrupted: <span className="font-semibold">{pomodoroStats?.interrupted_sessions || 0}</span>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            Planned: <span className="font-semibold">{pomodoroStats?.planned_minutes || 0}m</span>
          </div>
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-700">
            Actual: <span className="font-semibold">{pomodoroStats?.actual_minutes || 0}m</span>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">{pomodoroLoading ? "Loading pomodoro stats..." : "Pomodoro stats updated"}</div>
      </article>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="panel overflow-x-auto p-4">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">By task</h4>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2 py-2 font-medium">Task</th>
                <th className="px-2 py-2 font-medium">Hours</th>
              </tr>
            </thead>
            <tbody>
              {byTask.map((row) => (
                <tr key={row.task_id} className="border-b border-slate-100">
                  <td className="px-2 py-2 text-slate-700">{row.title || `Task #${row.task_id}`}</td>
                  <td className="px-2 py-2 text-slate-700">{formatHours(row.total_seconds)}h</td>
                </tr>
              ))}
              {byTask.length === 0 && (
                <tr>
                  <td className="px-2 py-3 text-slate-500" colSpan={2}>
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>

        <article className="panel overflow-x-auto p-4">
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">By user</h4>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2 py-2 font-medium">User</th>
                <th className="px-2 py-2 font-medium">Hours</th>
              </tr>
            </thead>
            <tbody>
              {byUser.map((row) => (
                <tr key={row.user_id} className="border-b border-slate-100">
                  <td className="px-2 py-2 text-slate-700">{row.name || row.email || `User #${row.user_id}`}</td>
                  <td className="px-2 py-2 text-slate-700">{formatHours(row.total_seconds)}h</td>
                </tr>
              ))}
              {byUser.length === 0 && (
                <tr>
                  <td className="px-2 py-3 text-slate-500" colSpan={2}>
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>
      </div>

      <article className="panel overflow-x-auto p-4">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Pomodoro By Task</h4>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-2 py-2 font-medium">Task</th>
              <th className="px-2 py-2 font-medium">Sessions</th>
              <th className="px-2 py-2 font-medium">Minutes</th>
            </tr>
          </thead>
          <tbody>
            {(pomodoroStats?.by_task || []).map((row) => (
              <tr key={`pom-${row.task_id}`} className="border-b border-slate-100">
                <td className="px-2 py-2 text-slate-700">{row.title || `Task #${row.task_id}`}</td>
                <td className="px-2 py-2 text-slate-700">{row.sessions}</td>
                <td className="px-2 py-2 text-slate-700">{formatMinutes(row.actual_seconds)}m</td>
              </tr>
            ))}
            {(!pomodoroStats?.by_task || pomodoroStats.by_task.length === 0) && (
              <tr>
                <td className="px-2 py-3 text-slate-500" colSpan={3}>
                  No pomodoro data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}

export default TimeReportPanel;
