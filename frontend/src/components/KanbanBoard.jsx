import { useMemo, useState } from "react";

const COLUMNS = [
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

function formatDate(value) {
  if (!value) return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function KanbanBoard({ tasks = [], canMoveTask, onMoveTask, onOpenTask }) {
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [hoverColumn, setHoverColumn] = useState("");

  const grouped = useMemo(() => {
    return COLUMNS.reduce((acc, column) => {
      acc[column.key] = tasks.filter((task) => task.status === column.key);
      return acc;
    }, {});
  }, [tasks]);

  const handleDragStart = (taskId) => {
    setDraggingTaskId(taskId);
  };

  const handleDrop = async (status) => {
    if (!draggingTaskId) return;
    const task = tasks.find((item) => Number(item.id) === Number(draggingTaskId));
    setDraggingTaskId(null);
    setHoverColumn("");
    if (!task) return;
    if (task.status === status) return;
    if (canMoveTask && !canMoveTask(task)) return;
    await onMoveTask?.(task, status);
  };

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {COLUMNS.map((column) => (
        <article
          key={column.key}
          className={`panel min-h-[380px] p-4 transition ${hoverColumn === column.key ? "ring-2 ring-brand-500/40" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setHoverColumn(column.key);
          }}
          onDragLeave={() => setHoverColumn("")}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop(column.key);
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{column.label}</h3>
            <span className="pill bg-slate-100 text-slate-700">{grouped[column.key]?.length || 0}</span>
          </div>

          <div className="space-y-2">
            {(grouped[column.key] || []).map((task) => (
              <button
                key={task.id}
                type="button"
                draggable={canMoveTask ? canMoveTask(task) : true}
                onDragStart={() => handleDragStart(task.id)}
                onClick={() => onOpenTask?.(task)}
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300"
              >
                <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(task.deadline)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="pill bg-slate-100 text-slate-700">{task.priority}</span>
                  {task.project_name && <span className="pill bg-teal-100 text-teal-700">{task.project_name}</span>}
                  {Number(task.subtasks_total) > 0 && (
                    <span className="pill bg-indigo-100 text-indigo-700">
                      {task.subtasks_completed}/{task.subtasks_total} subtasks
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

export default KanbanBoard;
