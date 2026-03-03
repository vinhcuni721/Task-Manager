const initialFilters = {
  search: "",
  category: "",
  priority: "",
  status: "",
  assignee: "",
  project_id: "",
  approval_status: "",
  date_from: "",
  date_to: "",
  sort_by: "updated_at",
  sort_order: "desc",
  page_size: 10,
  page: 1,
};

function TaskFilter({ filters, onChange, onReset, projects = [] }) {
  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === "page_size" ? Number(value) : value;
    onChange({ ...filters, [name]: nextValue, page: 1 });
  };

  return (
    <section className="panel p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
        <input
          name="search"
          value={filters.search}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Search title..."
        />

        <select
          name="category"
          value={filters.category}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All categories</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="project">Project</option>
          <option value="meeting">Meeting</option>
        </select>

        <select
          name="priority"
          value={filters.priority}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <select
          name="status"
          value={filters.status}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>

        <input
          name="assignee"
          value={filters.assignee}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          placeholder="Filter assignee"
        />

        <select
          name="project_id"
          value={filters.project_id || ""}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <select
          name="approval_status"
          value={filters.approval_status || ""}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All approvals</option>
          <option value="draft">Draft</option>
          <option value="pending_approval">Pending approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <input
          type="date"
          name="date_from"
          value={filters.date_from || ""}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          title="Deadline from"
        />

        <input
          type="date"
          name="date_to"
          value={filters.date_to || ""}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          title="Deadline to"
        />

        <select
          name="sort_by"
          value={filters.sort_by || "updated_at"}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="updated_at">Sort: Updated at</option>
          <option value="created_at">Sort: Created at</option>
          <option value="deadline">Sort: Deadline</option>
          <option value="priority">Sort: Priority</option>
          <option value="status">Sort: Status</option>
          <option value="approval_status">Sort: Approval</option>
          <option value="title">Sort: Title</option>
        </select>

        <select
          name="sort_order"
          value={filters.sort_order || "desc"}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="desc">Order: Desc</option>
          <option value="asc">Order: Asc</option>
        </select>

        <select
          name="page_size"
          value={filters.page_size || 10}
          onChange={handleChange}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
        </select>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => onReset(initialFilters)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Reset filters
        </button>
      </div>
    </section>
  );
}

export default TaskFilter;
