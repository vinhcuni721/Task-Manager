import { useEffect, useState } from "react";
import { authApi } from "../services/api";

function SecuritySettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await authApi.getSecuritySettings();
      setSettings(response.data || null);
    } catch (err) {
      setError(err.message || "Failed to load security settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      setError("");
      setMessage("");
      await authApi.updateSecuritySettings({
        two_factor_enabled: settings.two_factor_enabled,
        two_factor_email_enabled: settings.two_factor_email_enabled,
      });
      setMessage("Security settings updated");
      await loadSettings();
    } catch (err) {
      setError(err.message || "Failed to update security settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-600">Loading security settings...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Manage account security, password age and 2FA protection.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <section className="panel p-4">
        <h3 className="text-lg font-semibold text-slate-800">Authentication</h3>
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(settings?.two_factor_enabled)}
              onChange={(event) =>
                setSettings((current) => ({
                  ...(current || {}),
                  two_factor_enabled: event.target.checked,
                }))
              }
            />
            <span>Enable 2FA on login</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(settings?.two_factor_email_enabled)}
              onChange={(event) =>
                setSettings((current) => ({
                  ...(current || {}),
                  two_factor_email_enabled: event.target.checked,
                }))
              }
            />
            <span>Deliver OTP via email</span>
          </label>
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="text-lg font-semibold text-slate-800">Password Policy</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Minimum 8 characters</li>
          <li>Must include uppercase, lowercase, number and special character</li>
          <li>Password expiry follows server policy</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          Last changed: {settings?.password_changed_at ? new Date(settings.password_changed_at).toLocaleString() : "N/A"}
        </p>
        <p className={`mt-1 text-sm font-medium ${settings?.password_expired ? "text-red-600" : "text-emerald-700"}`}>
          {settings?.password_expired ? "Password is expired, reset is required." : "Password status is healthy."}
        </p>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Security Settings"}
        </button>
      </div>
    </div>
  );
}

export default SecuritySettingsPage;
