import { useEffect, useState } from "react";
import { systemApi } from "../services/api";

const DEFAULT_RULE = {
  name: "",
  description: "",
  trigger: "task.updated",
  conditions: "{}",
  actions: "{}",
  is_active: true,
};

const DEFAULT_WEBHOOK = {
  name: "",
  url: "",
  secret: "",
  event_types: "notification.created,incident.created",
};

function parseJsonOrNull(text) {
  try {
    return JSON.parse(String(text || "{}"));
  } catch (error) {
    return null;
  }
}

function SystemOpsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [tokens, setTokens] = useState([]);
  const [tokenName, setTokenName] = useState("");
  const [tokenScopes, setTokenScopes] = useState("system:read,system:write");
  const [newToken, setNewToken] = useState("");

  const [webhooks, setWebhooks] = useState([]);
  const [webhookForm, setWebhookForm] = useState(DEFAULT_WEBHOOK);

  const [securityEvents, setSecurityEvents] = useState([]);
  const [slaPreview, setSlaPreview] = useState(null);

  const [rules, setRules] = useState([]);
  const [ruleForm, setRuleForm] = useState(DEFAULT_RULE);

  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      const [tokensRes, webhooksRes, eventsRes, slaRes, rulesRes] = await Promise.all([
        systemApi.listApiTokens(),
        systemApi.listWebhooks(),
        systemApi.listSecurityEvents(40),
        systemApi.getSlaPreview(),
        systemApi.listAutomationRules(),
      ]);
      setTokens(tokensRes.data || []);
      setWebhooks(webhooksRes.data || []);
      setSecurityEvents(eventsRes.data || []);
      setSlaPreview(slaRes.data || null);
      setRules(rulesRes.data || []);
    } catch (err) {
      setError(err.message || "Failed to load system ops data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const runSlaNow = async () => {
    try {
      setSaving(true);
      const response = await systemApi.runSlaEscalation();
      setMessage(`SLA run done. Escalated: ${response.data?.escalated || 0}`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to run SLA");
    } finally {
      setSaving(false);
    }
  };

  const runAutomations = async () => {
    try {
      setSaving(true);
      const response = await systemApi.runAutomations({ trigger: "manual", limit: 150 });
      setMessage(`Automation run: scanned ${response.data?.scanned || 0}, executed ${response.data?.executed || 0}`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to run automations");
    } finally {
      setSaving(false);
    }
  };

  const createApiToken = async () => {
    try {
      setSaving(true);
      setError("");
      const scopes = tokenScopes
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const response = await systemApi.createApiToken({
        name: tokenName || "System Token",
        scopes,
      });
      setNewToken(response.data?.token || "");
      setTokenName("");
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to create API token");
    } finally {
      setSaving(false);
    }
  };

  const revokeToken = async (id) => {
    try {
      setSaving(true);
      await systemApi.revokeApiToken(id);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to revoke token");
    } finally {
      setSaving(false);
    }
  };

  const createWebhook = async () => {
    try {
      setSaving(true);
      const eventTypes = webhookForm.event_types
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await systemApi.createWebhook({
        name: webhookForm.name,
        url: webhookForm.url,
        secret: webhookForm.secret,
        event_types: eventTypes,
      });
      setWebhookForm(DEFAULT_WEBHOOK);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to create webhook");
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async (id) => {
    try {
      setSaving(true);
      await systemApi.testWebhook(id, { ping: "manual-test" });
      setMessage(`Webhook #${id} tested`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to test webhook");
    } finally {
      setSaving(false);
    }
  };

  const deleteWebhook = async (id) => {
    try {
      setSaving(true);
      await systemApi.deleteWebhook(id);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to delete webhook");
    } finally {
      setSaving(false);
    }
  };

  const createRule = async () => {
    const conditions = parseJsonOrNull(ruleForm.conditions);
    const actions = parseJsonOrNull(ruleForm.actions);
    if (!conditions || !actions) {
      setError("Conditions/actions must be valid JSON");
      return;
    }
    try {
      setSaving(true);
      await systemApi.createAutomationRule({
        name: ruleForm.name,
        description: ruleForm.description,
        trigger: ruleForm.trigger,
        conditions,
        actions,
        is_active: ruleForm.is_active,
      });
      setRuleForm(DEFAULT_RULE);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to create automation rule");
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule) => {
    try {
      setSaving(true);
      await systemApi.updateAutomationRule(rule.id, { is_active: Number(rule.is_active) === 1 ? 0 : 1 });
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to toggle rule");
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (id) => {
    try {
      setSaving(true);
      await systemApi.deleteAutomationRule(id);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to delete rule");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-600">Loading system ops...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Central admin console for automation, integrations, SLA and security monitoring.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-800">SLA Monitor</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runSlaNow}
              disabled={saving}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              Run SLA Escalation
            </button>
            <button
              type="button"
              onClick={runAutomations}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              Run Automations
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Due Soon</p>
            <p className="text-xl font-semibold text-slate-800">{slaPreview?.due_soon || 0}</p>
          </article>
          <article className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Overdue</p>
            <p className="text-xl font-semibold text-slate-800">{slaPreview?.overdue || 0}</p>
          </article>
          <article className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Critical Overdue</p>
            <p className="text-xl font-semibold text-red-600">{slaPreview?.critical_overdue || 0}</p>
          </article>
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="text-lg font-semibold text-slate-800">Automation Rules</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            value={ruleForm.name}
            onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Rule name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={ruleForm.trigger}
            onChange={(event) => setRuleForm((current) => ({ ...current, trigger: event.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="task.created">task.created</option>
            <option value="task.updated">task.updated</option>
            <option value="task.status_changed">task.status_changed</option>
            <option value="schedule.hourly">schedule.hourly</option>
            <option value="manual">manual</option>
          </select>
          <textarea
            value={ruleForm.description}
            onChange={(event) => setRuleForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Description"
            rows={2}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ruleForm.is_active}
              onChange={(event) => setRuleForm((current) => ({ ...current, is_active: event.target.checked }))}
            />
            Active
          </label>
          <textarea
            value={ruleForm.conditions}
            onChange={(event) => setRuleForm((current) => ({ ...current, conditions: event.target.value }))}
            placeholder='Conditions JSON, e.g. {"status_is":["pending"],"overdue_only":true}'
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
          />
          <textarea
            value={ruleForm.actions}
            onChange={(event) => setRuleForm((current) => ({ ...current, actions: event.target.value }))}
            placeholder='Actions JSON, e.g. {"set_priority":"high","notify_message":"SLA risk"}'
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
          />
        </div>
        <button
          type="button"
          onClick={createRule}
          disabled={saving}
          className="mt-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Create Rule
        </button>

        <div className="mt-3 space-y-2">
          {rules.map((rule) => (
            <article key={rule.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  #{rule.id} {rule.name}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleRule(rule)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                  >
                    {Number(rule.is_active) === 1 ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRule(rule.id)}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-600">Trigger: {rule.trigger}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="text-lg font-semibold text-slate-800">API Tokens</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={tokenName}
            onChange={(event) => setTokenName(event.target.value)}
            placeholder="Token name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={tokenScopes}
            onChange={(event) => setTokenScopes(event.target.value)}
            placeholder="Scopes comma-separated"
            className="min-w-[280px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="button" onClick={createApiToken} disabled={saving} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white">
            Create Token
          </button>
        </div>
        {newToken && (
          <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
            Copy new token now: <code>{newToken}</code>
          </p>
        )}
        <div className="mt-3 space-y-2">
          {tokens.map((token) => (
            <article key={token.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-800">
                  #{token.id} {token.name}
                </p>
                <button type="button" onClick={() => revokeToken(token.id)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">
                  Revoke
                </button>
              </div>
              <p className="text-xs text-slate-600">Prefix: {token.prefix}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="text-lg font-semibold text-slate-800">Webhooks</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            value={webhookForm.name}
            onChange={(event) => setWebhookForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Webhook name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={webhookForm.url}
            onChange={(event) => setWebhookForm((current) => ({ ...current, url: event.target.value }))}
            placeholder="https://..."
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={webhookForm.secret}
            onChange={(event) => setWebhookForm((current) => ({ ...current, secret: event.target.value }))}
            placeholder="Secret (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={webhookForm.event_types}
            onChange={(event) => setWebhookForm((current) => ({ ...current, event_types: event.target.value }))}
            placeholder="event1,event2"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={createWebhook}
          disabled={saving}
          className="mt-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Create Webhook
        </button>
        <div className="mt-3 space-y-2">
          {webhooks.map((webhook) => (
            <article key={webhook.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  #{webhook.id} {webhook.name}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => testWebhook(webhook.id)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
                    Test
                  </button>
                  <button type="button" onClick={() => deleteWebhook(webhook.id)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-600">{webhook.url}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h3 className="text-lg font-semibold text-slate-800">Recent Security Events</h3>
        <div className="mt-3 space-y-2">
          {securityEvents.map((event) => (
            <article key={event.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-800">
                [{event.severity}] {event.type}
              </p>
              <p className="mt-1 text-xs text-slate-600">{new Date(event.created_at).toLocaleString()}</p>
              {event.email && <p className="text-xs text-slate-600">{event.email}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default SystemOpsPage;
