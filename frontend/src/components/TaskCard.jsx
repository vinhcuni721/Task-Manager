const priorityClasses = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const statusClasses = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
};

const approvalClasses = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

function formatDate(value) {
  if (!value) return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function recurrenceLabel(task) {
  if (!task.recurrence_type || task.recurrence_type === "none") return null;
  return `Every ${task.recurrence_interval || 1} ${task.recurrence_type}`;
}

function formatHours(seconds) {
  const value = Number(seconds) || 0;
  return `${(value / 3600).toFixed(2)}h`;
}

function formatEstimateHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return "";
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 2)}h`;
}

function approvalLabel(status) {
  if (!status) return "draft";
  return status.replaceAll("_", " ");
}

function TaskCard({
  task,
  onEdit,
  onDelete,
  onSendEmail,
  onViewDetails,
  onRequestApproval,
  onApprove,
  onReject,
  onStartTimer,
  onStopTimer,
  onSaveTemplate,
  canRequestApproval = false,
  canApprove = false,
  canStartTimer = false,
  isTimerActive = false,
}) {
  const recurringText = recurrenceLabel(task);
  const hasSubtasks = Number(task.subtasks_total) > 0;
  const approvalRequiredLevel = Number(task.approval_required_level) || 1;
  const approvalCurrentLevel = Number(task.approval_current_level) || 0;
  const estimateText = formatEstimateHours(task.estimated_hours);

  return (
    <article className="panel animate-slide-up p-4 transition hover:scale-[1.02]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800">{task.title}</h3>
        <span className={`pill ${priorityClasses[task.priority] || priorityClasses.medium}`}>{task.priority}</span>
      </div>

      {task.description && <p className="mt-2 text-sm text-slate-600">{task.description}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className={`pill ${statusClasses[task.status] || statusClasses.pending}`}>{task.status}</span>
        <span className={`pill ${approvalClasses[task.approval_status] || approvalClasses.draft}`}>
          approval: {approvalLabel(task.approval_status)}
        </span>
        <span className="pill bg-amber-100 text-amber-700">
          level {approvalCurrentLevel}/{approvalRequiredLevel}
        </span>
        <span className="pill bg-indigo-100 text-indigo-700">{task.category}</span>
        <span className="pill bg-slate-100 text-slate-700">{formatDate(task.deadline)}</span>
        {task.project_name && <span className="pill bg-teal-100 text-teal-700">Project: {task.project_name}</span>}
        {task.assignee_name && <span className="pill bg-cyan-100 text-cyan-700">{task.assignee_name}</span>}
        {!task.assignee_name && task.assignee && <span className="pill bg-cyan-100 text-cyan-700">{task.assignee}</span>}
        {task.owner_name && <span className="pill bg-violet-100 text-violet-700">Owner: {task.owner_name}</span>}
        {task.approved_by_name && <span className="pill bg-emerald-100 text-emerald-700">Approved by: {task.approved_by_name}</span>}
        {hasSubtasks && (
          <span className="pill bg-indigo-100 text-indigo-700">
            Checklist: {task.subtasks_completed}/{task.subtasks_total}
          </span>
        )}
        <span className="pill bg-slate-100 text-slate-700">Tracked: {formatHours(task.tracked_seconds)}</span>
        {estimateText && <span className="pill bg-fuchsia-100 text-fuchsia-700">Estimate: {estimateText}</span>}
        {recurringText && <span className="pill bg-amber-100 text-amber-700">{recurringText}</span>}
      </div>

      {(onEdit || onDelete || onSendEmail || onViewDetails || onRequestApproval || onApprove || onReject || onStartTimer || onStopTimer || onSaveTemplate) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {onViewDetails && (
            <button
              type="button"
              onClick={() => onViewDetails(task)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Details
            </button>
          )}
          {onSendEmail && (
            <button
              type="button"
              onClick={() => onSendEmail(task)}
              className="rounded-lg border border-sky-300 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
            >
              Send Email
            </button>
          )}
          {onStartTimer && canStartTimer && !isTimerActive && (
            <button
              type="button"
              onClick={() => onStartTimer(task)}
              className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50"
            >
              Start Timer
            </button>
          )}
          {onStopTimer && isTimerActive && (
            <button
              type="button"
              onClick={() => onStopTimer(task)}
              className="rounded-lg border border-orange-300 px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
            >
              Stop Timer
            </button>
          )}
          {onRequestApproval && canRequestApproval && task.approval_status !== "pending_approval" && (
            <button
              type="button"
              onClick={() => onRequestApproval(task)}
              className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
            >
              Request Approval
            </button>
          )}
          {onApprove && canApprove && task.approval_status !== "approved" && (
            <button
              type="button"
              onClick={() => onApprove(task)}
              className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              Approve
            </button>
          )}
          {onReject && canApprove && task.approval_status !== "rejected" && (
            <button
              type="button"
              onClick={() => onReject(task)}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
            >
              Reject
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          )}
          {onSaveTemplate && (
            <button
              type="button"
              onClick={() => onSaveTemplate(task)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Save Template
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default TaskCard;
