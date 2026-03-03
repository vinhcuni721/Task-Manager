const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = Math.max(3000, Number(process.env.OPENAI_TIMEOUT_MS || 12000));

function isOpenAIConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

function summarizeTask(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    approval_status: task.approval_status,
    deadline: task.deadline || null,
    project: task.project_name || null,
    assignee: task.assignee_name || null,
    updated_at: task.updated_at || null,
  };
}

function buildSystemPrompt() {
  return [
    "You are TaskFlow AI assistant.",
    "You must answer in Vietnamese, concise and practical.",
    "Use ONLY the provided JSON context data.",
    "If data is missing, say clearly what is missing instead of guessing.",
    "When suggesting priorities, prefer overdue first, then high priority, then nearest deadline.",
    "When asked for planning, provide a short action plan with clear next steps and expected outcome.",
    "When asked for risk, explain why a task is risky and how to reduce that risk.",
    "If all tasks in scope are completed, state that explicitly.",
  ].join(" ");
}

function toHistoryInput(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant") && String(item.content || "").trim())
    .slice(-8)
    .map((item) => ({
      role: item.role,
      content: [{ type: "input_text", text: String(item.content || "").trim() }],
    }));
}

async function generateTaskAssistantReply({ question, user, context, history = [] }) {
  if (!isOpenAIConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      reply: "",
      model: "",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const historyInput = toHistoryInput(history);
    const payload = {
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildSystemPrompt() }],
        },
        ...historyInput,
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(
                {
                  user: {
                    id: user.id,
                    role: user.role,
                    email: user.email,
                    name: user.name,
                  },
                  question,
                  context: {
                    ...context,
                    top_tasks: (context.top_tasks || []).map(summarizeTask),
                  },
                },
                null,
                2
              ),
            },
          ],
        },
      ],
      temperature: 0.3,
      max_output_tokens: 600,
    };

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        reason: `api_error_${response.status}`,
        reply: "",
        model: OPENAI_MODEL,
        raw_error: data?.error?.message || "OpenAI request failed",
      };
    }

    const reply = String(data?.output_text || "").trim();
    if (!reply) {
      return {
        ok: false,
        reason: "empty_output",
        reply: "",
        model: OPENAI_MODEL,
      };
    }

    return {
      ok: true,
      reason: "",
      reply,
      model: OPENAI_MODEL,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "AbortError" ? "timeout" : "request_failed",
      reply: "",
      model: OPENAI_MODEL,
      raw_error: error?.message || "OpenAI request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  isOpenAIConfigured,
  generateTaskAssistantReply,
};
