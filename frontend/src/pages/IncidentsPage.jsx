import { useEffect, useState } from "react";
import { incidentsApi } from "../services/api";

const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"];
const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];

function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "sev3",
    task_id: "",
  });

  const loadIncidents = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await incidentsApi.getAll();
      setIncidents(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load incidents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    const title = String(form.title || "").trim();
    if (!title) return;

    try {
      setSaving(true);
      setError("");
      await incidentsApi.create({
        title,
        description: String(form.description || "").trim(),
        severity: form.severity,
        task_id: form.task_id ? Number(form.task_id) : null,
      });
      setForm({
        title: "",
        description: "",
        severity: "sev3",
        task_id: "",
      });
      await loadIncidents();
    } catch (err) {
      setError(err.message || "Failed to create incident");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (incident, status) => {
    try {
      setError("");
      await incidentsApi.update(incident.id, { status });
      await loadIncidents();
    } catch (err) {
      setError(err.message || "Failed to update incident");
    }
  };

  const handleAddEvent = async (incident) => {
    const message = window.prompt("Incident update:");
    if (!message) return;
    try {
      setError("");
      await incidentsApi.addEvent(incident.id, {
        event_type: "note",
        message,
      });
      await loadIncidents();
    } catch (err) {
      setError(err.message || "Failed to add incident update");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Incident mode for SLA breaches and production issues.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <section className="panel p-4">
        <h3 className="text-lg font-semibold text-slate-800">Create Incident</h3>
        <form onSubmit={handleCreate} className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Incident title"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
            required
          />
          <select
            value={form.severity}
            onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity.toUpperCase()}
              </option>
            ))}
          </select>
          <input
            value={form.task_id}
            onChange={(event) => setForm((current) => ({ ...current, task_id: event.target.value }))}
            placeholder="Related task id (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Incident"}
          </button>
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Description (optional)"
            className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
            rows={3}
          />
        </form>
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Open Incidents</h3>
          <button
            type="button"
            onClick={loadIncidents}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading incidents...</p>
        ) : incidents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No incidents found.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {incidents.map((incident) => (
              <article key={incident.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-800">
                      #{incident.id} {incident.title}
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      {incident.task_title ? `Task: ${incident.task_title}` : "No linked task"} | Owner:{" "}
                      {incident.owner_name || "N/A"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-rose-700">
                      {incident.severity}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-amber-700">
                      {incident.status}
                    </span>
                  </div>
                </div>
                {incident.description && <p className="mt-2 text-sm text-slate-700">{incident.description}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleQuickStatus(incident, status)}
                      disabled={status === incident.status}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                    >
                      {status}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleAddEvent(incident)}
                    className="rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                  >
                    Add Update
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default IncidentsPage;
