import { useEffect, useState } from "react";
import { taskApi, timeApi } from "../services/api";

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function TaskDetailsModal({ open, task, onClose, onRefreshTasks }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const [savingSubtask, setSavingSubtask] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const [recurrencePreview, setRecurrencePreview] = useState([]);
  const [recurrenceLoading, setRecurrenceLoading] = useState(false);

  const loadDetails = async () => {
    if (!task?.id) return;
    try {
      setLoading(true);
      setError("");
      const response = await taskApi.getDetails(task.id);
      setDetails(response.data);
    } catch (err) {
      setError(err.message || "Failed to load task details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  useEffect(() => {
    const loadRecurrence = async () => {
      if (!open || !task?.id) return;
      if (!task?.recurrence_type || task.recurrence_type === "none") {
        setRecurrencePreview([]);
        return;
      }
      try {
        setRecurrenceLoading(true);
        const response = await taskApi.getRecurrencePreview(task.id, 6);
        setRecurrencePreview(response.data?.next_dates || []);
      } catch (err) {
        setRecurrencePreview([]);
      } finally {
        setRecurrenceLoading(false);
      }
    };
    loadRecurrence();
  }, [open, task?.id, task?.recurrence_type]);

  if (!open || !task) return null;

  const handleAddComment = async (event) => {
    event.preventDefault();
    const content = commentText.trim();
    if (!content) return;

    try {
      setSavingComment(true);
      setError("");
      await taskApi.addComment(task.id, content);
      setCommentText("");
      await loadDetails();
    } catch (err) {
      setError(err.message || "Failed to add comment");
    } finally {
      setSavingComment(false);
    }
  };

  const handleUploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setUploading(true);
      setError("");
      await taskApi.uploadAttachment(task.id, file);
      await loadDetails();
      if (onRefreshTasks) await onRefreshTasks();
    } catch (err) {
      setError(err.message || "Failed to upload attachment");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    const confirmed = window.confirm("Delete this attachment?");
    if (!confirmed) return;

    try {
      setError("");
      await taskApi.deleteAttachment(task.id, attachmentId);
      await loadDetails();
    } catch (err) {
      setError(err.message || "Failed to delete attachment");
    }
  };

  const handleAddSubtask = async (event) => {
    event.preventDefault();
    const title = subtaskText.trim();
    if (!title) return;

    try {
      setSavingSubtask(true);
      setError("");
      await taskApi.addSubtask(task.id, title);
      setSubtaskText("");
      await loadDetails();
      if (onRefreshTasks) await onRefreshTasks();
    } catch (err) {
      setError(err.message || "Failed to add subtask");
    } finally {
      setSavingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtask) => {
    try {
      setError("");
      await taskApi.updateSubtask(task.id, subtask.id, { is_completed: Number(subtask.is_completed) !== 1 });
      await loadDetails();
      if (onRefreshTasks) await onRefreshTasks();
    } catch (err) {
      setError(err.message || "Failed to update subtask");
    }
  };

  const handleDeleteSubtask = async (subtask) => {
    const confirmed = window.confirm(`Delete subtask "${subtask.title}"?`);
    if (!confirmed) return;
    try {
      setError("");
      await taskApi.deleteSubtask(task.id, subtask.id);
      await loadDetails();
      if (onRefreshTasks) await onRefreshTasks();
    } catch (err) {
      setError(err.message || "Failed to delete subtask");
    }
  };

  const handleStartTimer = async () => {
    try {
      setTimerBusy(true);
      setError("");
      await timeApi.start(task.id);
      await loadDetails();
      if (onRefreshTasks) await onRefreshTasks();
    } catch (err) {
      setError(err.message || "Failed to start timer");
    } finally {
      setTimerBusy(false);
    }
  };

  const handleStopTimer = async () => {
    try {
      setTimerBusy(true);
      setError("");
      await timeApi.stop(task.id);
      await loadDetails();
      if (onRefreshTasks) await onRefreshTasks();
    } catch (err) {
      setError(err.message || "Failed to stop timer");
    } finally {
      setTimerBusy(false);
    }
  };

  const comments = details?.comments || [];
  const activities = details?.activities || [];
  const attachments = details?.attachments || [];
  const subtasks = details?.subtasks || [];
  const timeEntries = details?.time_entries || [];
  const activeTimeEntry = details?.active_time_entry || null;
  const detailTask = details?.task || task;
  const subtasksCompleted = subtasks.filter((item) => Number(item.is_completed) === 1).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="panel max-h-[92vh] w-full max-w-5xl overflow-y-auto p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-800">Task Details</h3>
            <p className="mt-1 text-sm text-slate-500">{task.title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700">
            X
          </button>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="mb-4 text-sm text-slate-600">Loading details...</p>}

        <section className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimate</p>
            <p className="mt-1 font-semibold">{detailTask.estimated_hours ? `${detailTask.estimated_hours}h` : "Not set"}</p>
          </article>
          <article className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recurrence preview</p>
            {!detailTask.recurrence_type || detailTask.recurrence_type === "none" ? (
              <p className="mt-1 text-slate-500">Not recurring</p>
            ) : recurrenceLoading ? (
              <p className="mt-1 text-slate-500">Loading next dates...</p>
            ) : recurrencePreview.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {recurrencePreview.map((item) => (
                  <span key={item} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-slate-500">No upcoming occurrence</p>
            )}
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <article className="rounded-lg border border-slate-200 p-4 lg:col-span-1">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Checklist</h4>
              <span className="pill bg-indigo-100 text-indigo-700">
                {subtasksCompleted}/{subtasks.length}
              </span>
            </div>

            <form onSubmit={handleAddSubtask} className="mb-3 flex gap-2">
              <input
                value={subtaskText}
                onChange={(event) => setSubtaskText(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                placeholder="Add subtask..."
              />
              <button
                type="submit"
                disabled={savingSubtask}
                className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                +
              </button>
            </form>

            {subtasks.length === 0 ? (
              <p className="text-sm text-slate-500">No subtasks yet</p>
            ) : (
              <ul className="space-y-2">
                {subtasks.map((subtask) => (
                  <li key={subtask.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Number(subtask.is_completed) === 1}
                        onChange={() => handleToggleSubtask(subtask)}
                      />
                      <span className={Number(subtask.is_completed) === 1 ? "line-through text-slate-400" : ""}>{subtask.title}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeleteSubtask(subtask)}
                      className="text-xs font-medium text-red-600 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-lg border border-slate-200 p-4 lg:col-span-1">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Time Tracking</h4>
              <span className="pill bg-slate-100 text-slate-700">
                {Number(detailTask.tracked_seconds || 0) > 0 ? `${(Number(detailTask.tracked_seconds) / 3600).toFixed(2)}h` : "0h"}
              </span>
            </div>

            <div className="mb-3 flex gap-2">
              {!activeTimeEntry ? (
                <button
                  type="button"
                  onClick={handleStartTimer}
                  disabled={timerBusy}
                  className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                >
                  Start Timer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopTimer}
                  disabled={timerBusy}
                  className="rounded-lg border border-orange-300 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                >
                  Stop Timer
                </button>
              )}
              {activeTimeEntry && <span className="text-xs text-emerald-600">Timer running</span>}
            </div>

            {timeEntries.length === 0 ? (
              <p className="text-sm text-slate-500">No time entries</p>
            ) : (
              <ul className="space-y-2">
                {timeEntries.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="rounded-md border border-slate-200 p-2 text-sm">
                    <p className="font-medium text-slate-700">{entry.user_name || "User"}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(entry.started_at)} - {entry.ended_at ? formatDateTime(entry.ended_at) : "running"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {entry.ended_at ? `${(Number(entry.duration_seconds || 0) / 3600).toFixed(2)}h` : "-"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-lg border border-slate-200 p-4 lg:col-span-1">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Attachments</h4>
            <label className="mb-3 inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {uploading ? "Uploading..." : "Upload File"}
              <input type="file" onChange={handleUploadAttachment} className="hidden" disabled={uploading} />
            </label>

            {attachments.length === 0 ? (
              <p className="text-sm text-slate-500">No attachments</p>
            ) : (
              <ul className="space-y-2">
                {attachments.map((attachment) => (
                  <li key={attachment.id} className="rounded-md border border-slate-200 p-2 text-sm">
                    <a href={attachment.url} target="_blank" rel="noreferrer" className="font-medium text-brand-600">
                      {attachment.original_name}
                    </a>
                    <p className="text-xs text-slate-500">{formatDateTime(attachment.created_at)}</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(attachment.id)}
                      className="mt-1 text-xs font-medium text-red-600 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-lg border border-slate-200 p-4 lg:col-span-1">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Comments</h4>
            <form onSubmit={handleAddComment} className="mb-3 space-y-2">
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                rows={3}
                placeholder="Write a comment..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={savingComment}
                className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {savingComment ? "Saving..." : "Add Comment"}
              </button>
            </form>

            {comments.length === 0 ? (
              <p className="text-sm text-slate-500">No comments</p>
            ) : (
              <ul className="space-y-2">
                {comments.map((comment) => (
                  <li key={comment.id} className="rounded-md border border-slate-200 p-2">
                    <p className="text-sm text-slate-700">{comment.content}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {comment.user_name || "Unknown"} - {formatDateTime(comment.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-lg border border-slate-200 p-4 lg:col-span-1">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Activity Log</h4>
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet</p>
            ) : (
              <ul className="space-y-2">
                {activities.map((activity) => (
                  <li key={activity.id} className="rounded-md border border-slate-200 p-2">
                    <p className="text-sm font-medium text-slate-700">{activity.action}</p>
                    {activity.details && <p className="text-sm text-slate-600">{activity.details}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {activity.user_name || "System"} - {formatDateTime(activity.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}

export default TaskDetailsModal;
