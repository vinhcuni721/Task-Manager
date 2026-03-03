import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { notificationsApi, remindersApi } from "../services/api";

const WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || "";

const defaultSettings = {
  telegram_chat_id: "",
  slack_webhook_url: "",
  reminders_email_enabled: true,
  reminders_telegram_enabled: false,
  reminders_slack_enabled: false,
  reminders_webpush_enabled: false,
};

function toUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function ReminderSettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(defaultSettings);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [settingsRes, subsRes] = await Promise.all([remindersApi.getMySettings(), notificationsApi.getMySubscriptions()]);
      const row = settingsRes.data || {};
      setSettings({
        telegram_chat_id: row.telegram_chat_id || "",
        slack_webhook_url: row.slack_webhook_url || "",
        reminders_email_enabled: Number(row.reminders_email_enabled) === 1,
        reminders_telegram_enabled: Number(row.reminders_telegram_enabled) === 1,
        reminders_slack_enabled: Number(row.reminders_slack_enabled) === 1,
        reminders_webpush_enabled: Number(row.reminders_webpush_enabled) === 1,
      });
      setSubscriptionCount((subsRes.data || []).length);
    } catch (err) {
      setError(err.message || "Failed to load reminder settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCheckbox = (event) => {
    const { name, checked } = event.target;
    setSettings((current) => ({ ...current, [name]: checked }));
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setSettings((current) => ({ ...current, [name]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      setMessage("");
      await remindersApi.updateMySettings(settings);
      setMessage("Settings saved");
      await load();
    } catch (err) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleRunManual = async () => {
    try {
      setRunning(true);
      setError("");
      setMessage("");
      const response = await remindersApi.runManual();
      const summary = response.data
        ? `Reminder sent to ${response.data.users_notified} user(s), channels sent: ${response.data.channels_sent}`
        : "Manual reminder run completed";
      setMessage(summary);
    } catch (err) {
      setError(err.message || "Failed to run reminders");
    } finally {
      setRunning(false);
    }
  };

  const handleEnableWebPush = async () => {
    try {
      setError("");
      setMessage("");

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("This browser does not support web push");
      }
      if (!WEB_PUSH_PUBLIC_KEY) {
        throw new Error("Missing VITE_WEB_PUSH_PUBLIC_KEY in frontend .env");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(WEB_PUSH_PUBLIC_KEY),
      });

      await notificationsApi.saveSubscription(subscription.toJSON());
      setMessage("Web push subscription saved");
      await load();
    } catch (err) {
      setError(err.message || "Failed to enable web push");
    }
  };

  const handleDisableWebPush = async () => {
    try {
      setError("");
      setMessage("");

      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await notificationsApi.removeSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
      }

      setSettings((current) => ({ ...current, reminders_webpush_enabled: false }));
      setMessage("Web push unsubscribed");
      await load();
    } catch (err) {
      setError(err.message || "Failed to disable web push");
    }
  };

  if (loading) return <p className="text-sm text-slate-600">Loading reminder settings...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Configure channels for due-soon/overdue task reminders.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <form onSubmit={handleSave} className="panel space-y-4 p-4">
        <h3 className="text-lg font-semibold text-slate-800">My Reminder Channels</h3>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="reminders_email_enabled"
              checked={settings.reminders_email_enabled}
              onChange={handleCheckbox}
            />
            Email reminders
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="reminders_telegram_enabled"
              checked={settings.reminders_telegram_enabled}
              onChange={handleCheckbox}
            />
            Telegram reminders
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="reminders_slack_enabled"
              checked={settings.reminders_slack_enabled}
              onChange={handleCheckbox}
            />
            Slack reminders
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="reminders_webpush_enabled"
              checked={settings.reminders_webpush_enabled}
              onChange={handleCheckbox}
            />
            Web push reminders
          </label>

          <input
            name="telegram_chat_id"
            value={settings.telegram_chat_id}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            placeholder="Telegram chat id"
          />

          <input
            name="slack_webhook_url"
            value={settings.slack_webhook_url}
            onChange={handleChange}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            placeholder="Slack incoming webhook URL"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>

          <button
            type="button"
            onClick={handleEnableWebPush}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Enable Browser Push
          </button>

          <button
            type="button"
            onClick={handleDisableWebPush}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Disable Browser Push
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Web push subscriptions: {subscriptionCount}. Requires backend VAPID keys and frontend
          `VITE_WEB_PUSH_PUBLIC_KEY`.
        </p>
      </form>

      {user?.role === "admin" && (
        <section className="panel p-4">
          <h3 className="mb-2 text-lg font-semibold text-slate-800">Admin Controls</h3>
          <p className="mb-3 text-sm text-slate-600">Run reminder dispatch immediately for all users.</p>
          <button
            type="button"
            onClick={handleRunManual}
            disabled={running}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            {running ? "Running..." : "Run Reminder Now"}
          </button>
        </section>
      )}
    </div>
  );
}

export default ReminderSettingsPage;
