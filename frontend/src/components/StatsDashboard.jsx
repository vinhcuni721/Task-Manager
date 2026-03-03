function StatsDashboard({ stats }) {
  const cards = [
    { label: "Total tasks", value: stats.total_tasks },
    { label: "Completed tasks", value: stats.completed_tasks },
    { label: "Completion rate", value: `${stats.completion_rate}%` },
    { label: "Overdue tasks", value: stats.overdue_tasks },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="panel p-5">
          <p className="text-sm text-slate-500">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">{card.value}</p>
        </article>
      ))}
    </section>
  );
}

export default StatsDashboard;
