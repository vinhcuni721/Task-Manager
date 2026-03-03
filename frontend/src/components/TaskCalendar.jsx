import { useMemo, useState } from "react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function buildCalendarDays(currentMonthDate) {
  const start = startOfMonth(currentMonthDate);
  const end = endOfMonth(currentMonthDate);
  const firstDayIndex = start.getDay();
  const totalDays = end.getDate();
  const cells = [];

  for (let i = 0; i < firstDayIndex; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function TaskCalendar({ tasks = [], onOpenTask }) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  const tasksByDate = useMemo(() => {
    const grouped = new Map();
    tasks.forEach((task) => {
      if (!task.deadline) return;
      const date = new Date(task.deadline);
      if (Number.isNaN(date.getTime())) return;
      const key = toDateKey(date);
      const current = grouped.get(key) || [];
      current.push(task);
      grouped.set(key, current);
    });
    return grouped;
  }, [tasks]);

  const calendarCells = useMemo(() => buildCalendarDays(monthCursor), [monthCursor]);
  const monthLabel = monthCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          Prev
        </button>
        <h3 className="text-lg font-semibold text-slate-800">{monthLabel}</h3>
        <button
          type="button"
          onClick={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAY_NAMES.map((name) => (
          <div key={name} className="rounded-md bg-slate-100 px-2 py-1 text-center text-xs font-semibold text-slate-600">
            {name}
          </div>
        ))}

        {calendarCells.map((date, index) => {
          if (!date) {
            return <div key={`blank-${index}`} className="min-h-[110px] rounded-md border border-dashed border-slate-200 bg-slate-50" />;
          }

          const key = toDateKey(date);
          const dayTasks = tasksByDate.get(key) || [];
          const isToday = key === toDateKey(new Date());

          return (
            <div
              key={key}
              className={`min-h-[110px] rounded-md border p-2 ${isToday ? "border-brand-500 bg-indigo-50/50" : "border-slate-200 bg-white"}`}
            >
              <p className="text-xs font-semibold text-slate-700">{date.getDate()}</p>
              <div className="mt-1 space-y-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask?.(task)}
                    className="block w-full truncate rounded bg-slate-100 px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-200"
                  >
                    {task.title}
                  </button>
                ))}
                {dayTasks.length > 3 && <p className="text-[11px] text-slate-500">+{dayTasks.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default TaskCalendar;
