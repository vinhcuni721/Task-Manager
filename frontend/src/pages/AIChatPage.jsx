import { useEffect, useMemo, useRef, useState } from "react";
import { aiApi } from "../services/api";

const QUICK_PROMPTS = [
  "Tong quan task cua toi hom nay",
  "Task nao qua han can lam truoc?",
  "Lap uu tien hom nay cho toi",
  "Cho minh weekly plan de tranh tre han",
  "Task nao co nguy co tre cao nhat?",
  "Goi y toi nen lam gi tiep theo",
  "Danh dau task #1 hoan thanh",
  "Doi deadline task #1 thanh ngay mai",
  "Phan cong task #1 cho minh@example.com",
  "Tom tat tien do cong viec thang nay",
];

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return "0%";
  return `${Number(value).toFixed(1)}%`;
}

function formatDateLabel(value) {
  if (!value) return "No deadline";
  return value;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function messageBubbleClass(role) {
  if (role === "user") return "ml-auto border-transparent bg-brand-500 text-white";
  if (role === "error") return "mr-auto border-red-200 bg-red-50 text-red-700";
  if (role === "system") return "mr-auto border-emerald-200 bg-emerald-50 text-emerald-700";
  return "mr-auto border-slate-200 bg-white text-slate-700";
}

function RoleBadge({ role }) {
  const label = role === "user" ? "You" : role === "assistant" ? "TaskFlow AI" : role === "system" ? "System" : "Error";
  const badgeClass =
    role === "user"
      ? "bg-brand-500/15 text-brand-600"
      : role === "assistant"
        ? "bg-sky-500/15 text-sky-700"
        : role === "system"
          ? "bg-emerald-500/15 text-emerald-700"
          : "bg-red-500/15 text-red-700";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>{label}</span>;
}

function StatCard({ label, value, tone = "default" }) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : tone === "brand"
          ? "border-brand-500/30 bg-brand-500/10 text-brand-600"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <article className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </article>
  );
}

function mapMessageMeta(payload) {
  return {
    metrics: payload.metrics || null,
    interpreted: payload.interpreted || null,
    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
    top_tasks: Array.isArray(payload.top_tasks) ? payload.top_tasks : [],
    breakdown: payload.breakdown || null,
    generated_at: payload.generated_at || "",
    ai_provider: payload.ai_provider || null,
    pending_action: payload.pending_action || null,
    pending_action_state: payload.pending_action ? "pending" : "",
  };
}

function buildHistoryPayload(messages) {
  return messages
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .slice(-10)
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").trim(),
      top_task_ids: Array.isArray(item.meta?.top_tasks) ? item.meta.top_tasks.map((task) => task.id).filter(Boolean).slice(0, 5) : [],
    }))
    .filter((item) => item.content);
}

function ActionControls({ pendingAction, busy, onConfirm, onCancel, status }) {
  if (!pendingAction) return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action Confirmation</p>
      <p className="mt-1 text-sm font-medium text-slate-700">{pendingAction.summary}</p>
      <p className="mt-1 text-xs text-slate-500">Expires: {formatDateTime(pendingAction.expires_at)}</p>

      {status === "confirmed" && <p className="mt-2 text-xs font-semibold text-emerald-700">Executed.</p>}
      {status === "canceled" && <p className="mt-2 text-xs font-semibold text-amber-700">Canceled.</p>}

      {status === "pending" && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Executing..." : "Confirm"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function AIChatPage() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      content:
        "Chao ban, minh la AI Assistant cua TaskFlow. Minh co the nho ngu canh chat, goi y uu tien hom nay, va de xuat thao tac task de ban xac nhan truoc khi thuc thi.",
      meta: null,
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [latestInsight, setLatestInsight] = useState(null);
  const [actionBusyId, setActionBusyId] = useState("");
  const [dailyPlan, setDailyPlan] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [copilotBrief, setCopilotBrief] = useState(null);
  const [copilotBriefLoading, setCopilotBriefLoading] = useState(false);
  const [advancedInsights, setAdvancedInsights] = useState(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [riskPrediction, setRiskPrediction] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [breakdownInput, setBreakdownInput] = useState({ title: "", description: "" });
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownResult, setBreakdownResult] = useState(null);
  const scrollRef = useRef(null);

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const appendMessage = (role, content, meta = null) => {
    setMessages((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        role,
        content,
        meta,
      },
    ]);
  };

  const loadDailyPriority = async () => {
    try {
      setDailyLoading(true);
      const response = await aiApi.getDailyPriority();
      const payload = response.data || response;
      setDailyPlan({
        reply: payload.reply || "",
        data: Array.isArray(payload.data) ? payload.data : [],
        summary: payload.summary || null,
        generated_at: payload.generated_at || "",
        ai_provider: payload.ai_provider || null,
      });
    } catch (error) {
      setDailyPlan(null);
      appendMessage("error", error.message || "Khong tai duoc daily priority.");
    } finally {
      setDailyLoading(false);
    }
  };

  const loadAdvancedInsights = async () => {
    try {
      setAdvancedLoading(true);
      const response = await aiApi.getInsights();
      const payload = response.data || response;
      setAdvancedInsights({
        reply: payload.reply || "",
        data: payload.data || null,
        generated_at: payload.generated_at || "",
        ai_provider: payload.ai_provider || null,
      });
    } catch (error) {
      setAdvancedInsights(null);
      appendMessage("error", error.message || "Khong tai duoc AI insights.");
    } finally {
      setAdvancedLoading(false);
    }
  };

  const loadCopilotBrief = async () => {
    try {
      setCopilotBriefLoading(true);
      const response = await aiApi.getCopilotDailyBrief();
      const payload = response.data || response;
      setCopilotBrief({
        reply: payload.reply || "",
        data: payload.data || null,
        generated_at: payload.generated_at || "",
        ai_provider: payload.ai_provider || null,
      });
    } catch (error) {
      setCopilotBrief(null);
      appendMessage("error", error.message || "Khong tai duoc copilot daily brief.");
    } finally {
      setCopilotBriefLoading(false);
    }
  };

  const loadRiskPrediction = async () => {
    try {
      setRiskLoading(true);
      const response = await aiApi.getRiskPredictions(10);
      const payload = response.data || response;
      setRiskPrediction({
        reply: payload.reply || "",
        data: payload.data || null,
        generated_at: payload.generated_at || "",
        ai_provider: payload.ai_provider || null,
      });
    } catch (error) {
      setRiskPrediction(null);
      appendMessage("error", error.message || "Khong tai duoc risk prediction.");
    } finally {
      setRiskLoading(false);
    }
  };

  useEffect(() => {
    loadDailyPriority();
    loadCopilotBrief();
    loadAdvancedInsights();
    loadRiskPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateBreakdown = async (event) => {
    event.preventDefault();
    if (!breakdownInput.title.trim()) return;
    try {
      setBreakdownLoading(true);
      const response = await aiApi.getTaskBreakdown({
        title: breakdownInput.title.trim(),
        description: breakdownInput.description.trim(),
      });
      const payload = response.data || response;
      setBreakdownResult({
        reply: payload.reply || "",
        data: payload.data || null,
      });
    } catch (error) {
      setBreakdownResult(null);
      appendMessage("error", error.message || "Khong tao duoc task breakdown.");
    } finally {
      setBreakdownLoading(false);
    }
  };

  const sendMessage = async (rawText) => {
    const text = String(rawText || input).trim();
    if (!text || sending) return;

    const pendingUserMessage = {
      id: Date.now() + Math.random(),
      role: "user",
      content: text,
      meta: null,
    };

    const nextMessages = [...messages, pendingUserMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const response = await aiApi.chat({
        message: text,
        history: buildHistoryPayload(nextMessages),
      });
      const payload = response.data || response;
      const meta = mapMessageMeta(payload);
      appendMessage("assistant", payload.reply || "Khong co phan hoi tu AI.", meta);
      setLatestInsight(meta);
    } catch (error) {
      appendMessage("error", error.message || "AI assistant tam thoi ban. Thu lai sau.");
    } finally {
      setSending(false);
    }
  };

  const markActionState = (messageId, state) => {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;
        if (!message.meta?.pending_action) return message;
        return {
          ...message,
          meta: {
            ...message.meta,
            pending_action_state: state,
          },
        };
      })
    );
  };

  const handleConfirmAction = async (messageId, actionId) => {
    try {
      setActionBusyId(actionId);
      const response = await aiApi.confirmAction(actionId);
      markActionState(messageId, "confirmed");
      appendMessage("system", response.message || "Action executed.");
      await loadDailyPriority();
      await loadAdvancedInsights();
      await loadRiskPrediction();
    } catch (error) {
      appendMessage("error", error.message || "Failed to execute action.");
    } finally {
      setActionBusyId("");
    }
  };

  const handleCancelAction = async (messageId, actionId) => {
    try {
      setActionBusyId(actionId);
      const response = await aiApi.cancelAction(actionId);
      markActionState(messageId, "canceled");
      appendMessage("system", response.message || "Action canceled.");
    } catch (error) {
      appendMessage("error", error.message || "Failed to cancel action.");
    } finally {
      setActionBusyId("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendMessage(input);
  };

  const insight = latestInsight || {};
  const metrics = insight.metrics || {};
  const interpreted = insight.interpreted || {};
  const suggestions = Array.isArray(insight.suggestions) ? insight.suggestions : [];
  const topTasks = Array.isArray(insight.top_tasks) ? insight.top_tasks : [];
  const byPriority = insight.breakdown?.by_priority || [];
  const byStatus = insight.breakdown?.by_status || [];
  const aiProvider = insight.ai_provider || null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-slate-100 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,0.20),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(99,102,241,0.22),transparent_40%)]" />
        <div className="relative flex flex-col gap-3">
          <p className="inline-flex w-fit rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
            AI Task Copilot
          </p>
          <h2 className="text-2xl font-bold">Context memory, confirm actions, and daily focus</h2>
          <p className="max-w-3xl text-sm text-slate-300">
            AI nho context chat nhieu luot, de xuat thao tac de ban xac nhan truoc, va tao danh sach uu tien hang ngay tu du lieu task.
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                disabled={sending}
                className="rounded-full border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-400 hover:bg-slate-700 disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <section className="xl:col-span-8">
          <div className="panel flex min-h-[620px] flex-col p-4 md:p-5">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">AI Conversation</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {sending ? "Analyzing..." : "Ready"}
              </span>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 md:p-4">
              {messages.map((message) => (
                <article key={message.id} className={`max-w-[94%] rounded-2xl border px-3 py-2.5 text-sm shadow-sm ${messageBubbleClass(message.role)}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <RoleBadge role={message.role} />
                  </div>
                  <p className="whitespace-pre-line leading-relaxed">{message.content}</p>

                  {message.role === "assistant" && message.meta?.pending_action && (
                    <ActionControls
                      pendingAction={message.meta.pending_action}
                      busy={actionBusyId === message.meta.pending_action.id}
                      status={message.meta.pending_action_state || "pending"}
                      onConfirm={() => handleConfirmAction(message.id, message.meta.pending_action.id)}
                      onCancel={() => handleCancelAction(message.id, message.meta.pending_action.id)}
                    />
                  )}
                </article>
              ))}

              {sending && (
                <article className="mr-auto max-w-[94%] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 shadow-sm">
                  Dang phan tich task, context va tao goi y...
                </article>
              )}
            </div>

            <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 md:flex-row">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Vi du: Danh dau task #12 hoan thanh neu no dang approved."
                rows={2}
                className="min-h-[52px] w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 md:self-end"
              >
                Send
              </button>
            </form>
          </div>
        </section>

        <aside className="space-y-4 xl:col-span-4">
          <section className="panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Copilot Daily Brief</h4>
              <button
                type="button"
                onClick={loadCopilotBrief}
                disabled={copilotBriefLoading}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {copilotBriefLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {copilotBrief ? (
              <div className="mt-3 space-y-2">
                <p className="whitespace-pre-line text-sm text-slate-700">{copilotBrief.reply}</p>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Total" value={copilotBrief.data?.totals?.total || 0} />
                  <StatCard label="Overdue" value={copilotBrief.data?.totals?.overdue || 0} tone="danger" />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Chua co copilot brief.</p>
            )}
          </section>

          <section className="panel p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Task Breakdown Copilot</h4>
            <form onSubmit={handleGenerateBreakdown} className="mt-3 space-y-2">
              <input
                value={breakdownInput.title}
                onChange={(event) => setBreakdownInput((current) => ({ ...current, title: event.target.value }))}
                placeholder="Task title"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                value={breakdownInput.description}
                onChange={(event) => setBreakdownInput((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                placeholder="Description/context"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={breakdownLoading || !breakdownInput.title.trim()}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {breakdownLoading ? "Generating..." : "Generate Breakdown"}
              </button>
            </form>
            {breakdownResult && (
              <div className="mt-3 space-y-2">
                <p className="whitespace-pre-line text-sm text-slate-700">{breakdownResult.reply}</p>
                <p className="text-xs text-slate-600">Estimate: {breakdownResult.data?.estimate_hours || 0}h</p>
                <div className="space-y-1">
                  {(breakdownResult.data?.subtasks || []).slice(0, 6).map((item) => (
                    <p key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Daily Priority</h4>
              <button
                type="button"
                onClick={loadDailyPriority}
                disabled={dailyLoading}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {dailyLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {dailyPlan ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-slate-700 whitespace-pre-line">{dailyPlan.reply}</p>
                {Array.isArray(dailyPlan.data) &&
                  dailyPlan.data.slice(0, 4).map((task) => (
                    <article key={`daily-${task.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        #{task.id} | {task.status} | {task.priority}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateLabel(task.deadline)}</p>
                    </article>
                  ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Chua co daily priority data.</p>
            )}
          </section>

          <section className="panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Risk Prediction</h4>
              <button
                type="button"
                onClick={loadRiskPrediction}
                disabled={riskLoading}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {riskLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {riskPrediction ? (
              <div className="mt-3 space-y-2">
                <p className="whitespace-pre-line text-sm text-slate-700">{riskPrediction.reply}</p>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Critical" value={riskPrediction.data?.summary?.critical || 0} tone="danger" />
                  <StatCard label="High" value={riskPrediction.data?.summary?.high || 0} tone="brand" />
                </div>
                <div className="space-y-1.5">
                  {(riskPrediction.data?.predictions || []).slice(0, 4).map((task) => (
                    <article
                      key={`risk-predict-${task.id}`}
                      className={`rounded-lg border px-2.5 py-2 ${
                        task.risk_band === "critical"
                          ? "border-red-200 bg-red-50"
                          : task.risk_band === "high"
                            ? "border-amber-200 bg-amber-50"
                            : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-800">
                        #{task.id} {task.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Risk {task.risk_score}% ({task.risk_band}){task.deadline ? ` | due ${task.deadline}` : ""}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Chua co risk prediction.</p>
            )}
          </section>

          <section className="panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">AI Weekly Insights</h4>
              <button
                type="button"
                onClick={loadAdvancedInsights}
                disabled={advancedLoading}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {advancedLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {advancedInsights ? (
              <div className="mt-3 space-y-2">
                <p className="whitespace-pre-line text-sm text-slate-700">{advancedInsights.reply}</p>

                {Array.isArray(advancedInsights.data?.recommendations) &&
                  advancedInsights.data.recommendations.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommendations</p>
                      <ul className="mt-1 space-y-1 text-xs text-slate-600">
                        {advancedInsights.data.recommendations.slice(0, 4).map((item) => (
                          <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {Array.isArray(advancedInsights.data?.delay_risk) && advancedInsights.data.delay_risk.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delay Risk</p>
                    <div className="mt-1 space-y-1.5">
                      {advancedInsights.data.delay_risk.slice(0, 3).map((task) => (
                        <article key={`risk-${task.id}`} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
                          <p className="text-xs font-semibold text-red-700">
                            #{task.id} {task.title}
                          </p>
                          <p className="mt-1 text-xs text-red-600">Risk: {task.risk_score}%</p>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Chua co AI weekly insights.</p>
            )}
          </section>

          <section className="panel p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Insight Snapshot</h4>
            <div className="mt-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                Engine: {aiProvider?.mode === "openai" ? `OpenAI (${aiProvider?.model || "configured"})` : "Rule-based fallback"}
              </span>
              {aiProvider?.mode !== "openai" && aiProvider?.fallback_reason && (
                <p className="mt-2 text-xs text-amber-600">Fallback reason: {aiProvider.fallback_reason}</p>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatCard label="Total" value={metrics.total ?? 0} />
              <StatCard label="Completed" value={metrics.completed ?? 0} tone="success" />
              <StatCard label="In Progress" value={metrics.in_progress ?? 0} tone="brand" />
              <StatCard label="Overdue" value={metrics.overdue ?? 0} tone="danger" />
            </div>
            <div className="mt-2">
              <StatCard label="Completion Rate" value={formatPercent(metrics.completion_rate || 0)} tone="brand" />
            </div>
          </section>

          <section className="panel p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Interpreted Query</h4>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Timeframe:</span> {interpreted.timeframe || "all"}
              </p>
              <p>
                <span className="font-semibold">Project:</span> {interpreted.project?.name || "all"}
              </p>
              <p>
                <span className="font-semibold">Status:</span>{" "}
                {Array.isArray(interpreted.statuses) && interpreted.statuses.length ? interpreted.statuses.join(", ") : "all"}
              </p>
              <p>
                <span className="font-semibold">Priority:</span>{" "}
                {Array.isArray(interpreted.priorities) && interpreted.priorities.length ? interpreted.priorities.join(", ") : "all"}
              </p>
              <p>
                <span className="font-semibold">Approval:</span> {interpreted.approval_status || "all"}
              </p>
            </div>
          </section>

          <section className="panel p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Breakdown</h4>
            <div className="mt-3 space-y-2">
              <div>
                <p className="text-xs font-semibold text-slate-500">By Priority</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {byPriority.length ? (
                    byPriority.map((item) => (
                      <span key={`priority-${item.key}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                        {item.label}: {item.value}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No data</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">By Status</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {byStatus.length ? (
                    byStatus.map((item) => (
                      <span key={`status-${item.key}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                        {item.label}: {item.value}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No data</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Suggested Questions</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.length ? (
                suggestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => sendMessage(question)}
                    disabled={sending}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    {question}
                  </button>
                ))
              ) : (
                <p className="text-xs text-slate-500">Gui 1 cau hoi de AI de xuat follow-up.</p>
              )}
            </div>
          </section>

          <section className="panel p-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Top Tasks</h4>
            <div className="mt-3 space-y-2">
              {topTasks.length ? (
                topTasks.slice(0, 5).map((task) => (
                  <article key={task.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      #{task.id} | {task.status} | {task.priority}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateLabel(task.deadline)}</p>
                  </article>
                ))
              ) : (
                <p className="text-xs text-slate-500">No matching tasks.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default AIChatPage;
