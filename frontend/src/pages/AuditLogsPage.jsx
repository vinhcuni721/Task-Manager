import { useEffect, useMemo, useState } from "react";
import { auditApi } from "../services/api";

const defaultFilters = {
  action: "",
  entity_type: "",
  date_from: "",
  date_to: "",
  page: 1,
  page_size: 30,
};

function AuditLogsPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 30, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(
    () => ({
      ...filters,
      page: Number(filters.page) || 1,
      page_size: Number(filters.page_size) || 30,
    }),
    [filters]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await auditApi.list(query);
        setRows(response.data || []);
        setMeta(response.meta || { page: 1, page_size: 30, total: 0, total_pages: 1 });
      } catch (err) {
        setError(err.message || "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [query]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
      page: name === "page" ? Number(value) : 1,
    }));
  };

  const handleReset = () => {
    setFilters(defaultFilters);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">System audit trail for changes in workspace data.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <section className="panel p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="text"
            name="action"
            value={filters.action}
            onChange={handleFilterChange}
            placeholder="Action contains..."
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            type="text"
            name="entity_type"
            value={filters.entity_type}
            onChange={handleFilterChange}
            placeholder="Entity type (tasks, users...)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            type="date"
            name="date_from"
            value={filters.date_from}
            onChange={handleFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            type="date"
            name="date_to"
            value={filters.date_to}
            onChange={handleFilterChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="panel overflow-x-auto">
        {loading ? (
          <p className="p-4 text-sm text-slate-600">Loading audit logs...</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Path</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-sm text-slate-500">
                    No audit logs found.
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{new Date(item.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-700">{item.user_name || item.actor_email || "System"}</td>
                    <td className="px-3 py-2 text-slate-700">{item.action}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.entity_type || "-"}
                      {item.entity_id ? ` #${item.entity_id}` : ""}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{item.status_code}</td>
                    <td className="px-3 py-2 text-slate-600">{item.path}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Page {meta.page} / {meta.total_pages} - {meta.total} records
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, Number(current.page || 1) - 1) }))}
            disabled={Number(meta.page) <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() =>
              setFilters((current) => ({ ...current, page: Math.min(Number(meta.total_pages || 1), Number(current.page || 1) + 1) }))
            }
            disabled={Number(meta.page) >= Number(meta.total_pages)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}

export default AuditLogsPage;
