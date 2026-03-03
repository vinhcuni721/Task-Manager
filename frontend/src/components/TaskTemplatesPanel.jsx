import { useMemo, useState } from "react";

const defaultTemplateForm = {
  name: "",
  description: "",
  title: "",
  category: "work",
  priority: "medium",
  estimated_hours: "",
};

function TaskTemplatesPanel({ templates = [], onCreateTemplate, onUseTemplate, onDeleteTemplate }) {
  const [form, setForm] = useState(defaultTemplateForm);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [createCount, setCreateCount] = useState(1);
  const [createSeries, setCreateSeries] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((item) => Number(item.id) === Number(selectedTemplateId)),
    [templates, selectedTemplateId]
  );

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.title.trim()) return;

    try {
      setSaving(true);
      await onCreateTemplate?.({
        name: form.name.trim(),
        description: form.description.trim() || null,
        payload: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          estimated_hours: form.estimated_hours === "" ? null : Number(form.estimated_hours),
          category: form.category,
          priority: form.priority,
          status: "pending",
          approval_status: "draft",
        },
      });
      setForm(defaultTemplateForm);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-800">Task Templates</h3>
        <div className="flex gap-2">
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">Select template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedTemplate}
            onClick={() =>
              selectedTemplate &&
              onUseTemplate?.(selectedTemplate, {
                count: Number(createCount) || 1,
                create_series: createSeries,
              })
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Use Template
          </button>
          <button
            type="button"
            disabled={!selectedTemplate}
            onClick={() => selectedTemplate && onDeleteTemplate?.(selectedTemplate)}
            className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-xs text-slate-600">
          Create count
          <input
            type="number"
            min={1}
            max={30}
            value={createCount}
            onChange={(event) => setCreateCount(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </label>
        <label className="text-xs text-slate-600 md:col-span-2">
          Create recurrence series
          <div className="mt-1 flex h-[42px] items-center rounded-lg border border-slate-300 px-3">
            <input type="checkbox" checked={createSeries} onChange={(event) => setCreateSeries(event.target.checked)} />
            <span className="ml-2 text-sm text-slate-700">Auto create multiple recurring instances (if template has recurrence)</span>
          </div>
        </label>
      </div>

      <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Template name"
          required
        />
        <input
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Task title default"
          required
        />
        <select
          value={form.category}
          onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="project">Project</option>
          <option value="meeting">Meeting</option>
        </select>
        <select
          value={form.priority}
          onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Template"}
        </button>
        <input
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          className="md:col-span-5 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Description default (optional)"
        />
        <input
          type="number"
          min={0}
          max={1000}
          step="0.25"
          value={form.estimated_hours}
          onChange={(event) => setForm((current) => ({ ...current, estimated_hours: event.target.value }))}
          className="md:col-span-5 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Estimate hours default (optional)"
        />
      </form>
    </section>
  );
}

export default TaskTemplatesPanel;
