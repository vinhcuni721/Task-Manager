import { useEffect, useState } from "react";
import { systemApi } from "../services/api";

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function SystemBackupsPage() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadBackups = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await systemApi.listBackups();
      setBackups(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load backups");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setSaving(true);
      setError("");
      setMessage("");
      const response = await systemApi.createBackup();
      const fileName = response.data?.file_name || "new backup";
      setMessage(`Backup created: ${fileName}`);
      await loadBackups();
    } catch (err) {
      setError(err.message || "Failed to create backup");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (backup) => {
    const confirmed = window.confirm(
      `Restore backup "${backup.file_name}"?\n\nThis will replace current database and restart backend server.`
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");
      const response = await systemApi.restoreBackup(backup.file_name);
      setMessage(response.message || "Restore request sent. Backend restarting...");
    } catch (err) {
      setError(err.message || "Failed to restore backup");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Manage system database backups and restore points.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Backups</h3>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Processing..." : "Create Backup"}
          </button>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading backups...</p>
        ) : backups.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No backup files found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.file_name} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{backup.file_name}</td>
                    <td className="px-3 py-2 text-slate-700">{formatBytes(backup.size_bytes)}</td>
                    <td className="px-3 py-2 text-slate-700">{new Date(backup.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(backup)}
                        disabled={saving}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default SystemBackupsPage;
