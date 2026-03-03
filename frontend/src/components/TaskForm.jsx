import { useEffect, useMemo, useState } from "react";

const defaultData = {
  title: "",
  description: "",
  category: "work",
  priority: "medium",
  status: "pending",
  estimated_hours: "",
  deadline: "",
  assignee: "",
  assignee_id: "",
  project_id: "",
  approval_status: "draft",
  approval_policy: "single",
  approval_required_level: 1,
  recurrence_type: "none",
  recurrence_interval: 1,
  recurrence_end_date: "",
};

function TaskForm({ open, onClose, onSubmit, initialData, isSubmitting, users = [], projects = [] }) {
  const [form, setForm] = useState(defaultData);
  const isEdit = Boolean(initialData?.id);
  const labelClass = "mb-1.5 block text-[13px] font-semibold tracking-wide text-slate-800";
  const fieldClass =
    "w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20";
  const selectClass =
    "w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 pr-8 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20";

  const computedInitial = useMemo(() => {
    if (!initialData) return defaultData;
    return {
      title: initialData.title || "",
      description: initialData.description || "",
      category: initialData.category || "work",
      priority: initialData.priority || "medium",
      status: initialData.status || "pending",
      estimated_hours:
        initialData.estimated_hours === null || initialData.estimated_hours === undefined ? "" : String(initialData.estimated_hours),
      deadline: initialData.deadline ? String(initialData.deadline).slice(0, 10) : "",
      assignee: initialData.assignee || "",
      assignee_id: initialData.assignee_id || "",
      project_id: initialData.project_id || "",
      approval_status: initialData.approval_status || "draft",
      approval_policy: initialData.approval_policy || "single",
      approval_required_level: initialData.approval_required_level || 1,
      recurrence_type: initialData.recurrence_type || "none",
      recurrence_interval: initialData.recurrence_interval || 1,
      recurrence_end_date: initialData.recurrence_end_date ? String(initialData.recurrence_end_date).slice(0, 10) : "",
    };
  }, [initialData]);

  useEffect(() => {
    setForm(computedInitial);
  }, [computedInitial]);

  if (!open) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({
      ...form,
      deadline: form.deadline || null,
      description: form.description || null,
      assignee: form.assignee || null,
      assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
      project_id: form.project_id ? Number(form.project_id) : null,
      approval_status: form.approval_status,
      approval_policy: form.approval_policy,
      approval_required_level: Math.max(1, Number(form.approval_required_level || 1)),
      recurrence_interval: Number(form.recurrence_interval || 1),
      estimated_hours: form.estimated_hours === "" ? null : Number(form.estimated_hours),
      recurrence_end_date: form.recurrence_end_date || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 p-4">
      <div className="flex min-h-full items-start justify-center py-4 md:items-center md:py-8">
        <form
          onSubmit={handleSubmit}
          className="panel max-h-[92vh] w-full max-w-2xl animate-slide-up overflow-y-auto border-2 border-slate-200 bg-white p-6 shadow-2xl"
        >
          <div className="mb-5 flex items-start justify-between border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-800">{isEdit ? "Edit Task" : "Create Task"}</h3>
              <p className="mt-1 text-xs font-medium text-slate-600">Fill fields below clearly to save the task.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              X
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className={labelClass}>Title</span>
            <input
              required
              name="title"
              value={form.title}
              onChange={handleChange}
              className={fieldClass}
              placeholder="Task title"
            />
          </label>

          <label className="md:col-span-2">
            <span className={labelClass}>Description</span>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className={`${fieldClass} min-h-[96px] resize-y`}
              placeholder="Task description"
            />
          </label>

          <label>
            <span className={labelClass}>Category</span>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              <option value="project">Project</option>
              <option value="meeting">Meeting</option>
            </select>
          </label>

          <label>
            <span className={labelClass}>Priority</span>
            <select
              name="priority"
              value={form.priority}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label>
            <span className={labelClass}>Status</span>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </label>

          <label>
            <span className={labelClass}>Deadline</span>
            <input
              type="date"
              name="deadline"
              value={form.deadline}
              onChange={handleChange}
              className={fieldClass}
            />
          </label>

          <label>
            <span className={labelClass}>Estimate Hours</span>
            <input
              type="number"
              min={0}
              max={1000}
              step="0.25"
              name="estimated_hours"
              value={form.estimated_hours}
              onChange={handleChange}
              className={fieldClass}
              placeholder="e.g. 4"
            />
          </label>

          <label className="md:col-span-2">
            <span className={labelClass}>Assignee</span>
            <input
              name="assignee"
              value={form.assignee}
              onChange={handleChange}
              className={fieldClass}
              placeholder="Owner name"
            />
          </label>

          <label className="md:col-span-2">
            <span className={labelClass}>Assign To User</span>
            <select
              name="assignee_id"
              value={form.assignee_id}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email}) - {user.role}
                </option>
              ))}
            </select>
          </label>

          <label className="md:col-span-2">
            <span className={labelClass}>Project</span>
            <select
              name="project_id"
              value={form.project_id}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className={labelClass}>Approval</span>
            <select
              name="approval_status"
              value={form.approval_status}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>

          <label>
            <span className={labelClass}>Approval Policy</span>
            <select name="approval_policy" value={form.approval_policy} onChange={handleChange} className={selectClass}>
              <option value="single">Single level</option>
              <option value="multi">Multi level</option>
            </select>
          </label>

          <label>
            <span className={labelClass}>Approval Levels</span>
            <input
              type="number"
              min={1}
              max={5}
              name="approval_required_level"
              value={form.approval_policy === "single" ? 1 : form.approval_required_level}
              onChange={handleChange}
              disabled={form.approval_policy === "single"}
              className={fieldClass}
            />
          </label>

          <label>
            <span className={labelClass}>Recurrence</span>
            <select
              name="recurrence_type"
              value={form.recurrence_type}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>

          <label>
            <span className={labelClass}>Recurrence Interval</span>
            <input
              type="number"
              min={1}
              name="recurrence_interval"
              value={form.recurrence_interval}
              onChange={handleChange}
              className={fieldClass}
            />
          </label>

          <label>
            <span className={labelClass}>Recurrence End</span>
            <input
              type="date"
              name="recurrence_end_date"
              value={form.recurrence_end_date}
              onChange={handleChange}
              className={fieldClass}
            />
          </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : isEdit ? "Update Task" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TaskForm;
