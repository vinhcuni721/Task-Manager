import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { projectsApi, usersApi } from "../services/api";

const ROLE_OPTIONS = ["owner", "manager", "member", "viewer"];

function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProject, setNewProject] = useState({ name: "", description: "" });
  const [memberForm, setMemberForm] = useState({ user_id: "", role: "member" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => Number(project.id) === Number(selectedProjectId)) || null,
    [projects, selectedProjectId]
  );

  const myMembership = useMemo(
    () => members.find((member) => Number(member.user_id) === Number(user?.id)) || null,
    [members, user?.id]
  );

  const canManageMembers =
    user?.role === "admin" || myMembership?.role === "owner" || myMembership?.role === "manager";

  const loadProjects = async () => {
    const response = await projectsApi.getAll();
    const rows = response.data || [];
    setProjects(rows);
    setSelectedProjectId((current) => {
      if (rows.length === 0) return "";
      if (current && rows.some((item) => Number(item.id) === Number(current))) return current;
      return String(rows[0].id);
    });
  };

  const loadMembers = async (projectId) => {
    if (!projectId) {
      setMembers([]);
      return;
    }
    const response = await projectsApi.getMembers(projectId);
    setMembers(response.data || []);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [projectsRes, usersRes] = await Promise.all([projectsApi.getAll(), usersApi.getAll()]);
        const loadedProjects = projectsRes.data || [];
        setProjects(loadedProjects);
        setUsers(usersRes.data || []);
        if (loadedProjects.length > 0) {
          setSelectedProjectId(String(loadedProjects[0].id));
        }
      } catch (err) {
        setError(err.message || "Failed to load projects");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setError("");
        await loadMembers(selectedProjectId);
      } catch (err) {
        setError(err.message || "Failed to load project members");
      }
    };

    load();
  }, [selectedProjectId]);

  const handleCreateProject = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      await projectsApi.create(newProject);
      setNewProject({ name: "", description: "" });
      await loadProjects();
    } catch (err) {
      setError(err.message || "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  const handleUpsertMember = async (event) => {
    event.preventDefault();
    if (!selectedProjectId || !memberForm.user_id) return;

    try {
      setSaving(true);
      setError("");
      await projectsApi.upsertMember(selectedProjectId, {
        user_id: Number(memberForm.user_id),
        role: memberForm.role,
      });
      await loadMembers(selectedProjectId);
      setMemberForm({ user_id: "", role: "member" });
    } catch (err) {
      setError(err.message || "Failed to update project member");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!selectedProjectId) return;
    const confirmed = window.confirm(`Remove ${member.name || member.email} from project?`);
    if (!confirmed) return;

    try {
      setError("");
      await projectsApi.removeMember(selectedProjectId, member.user_id);
      await loadMembers(selectedProjectId);
    } catch (err) {
      setError(err.message || "Failed to remove member");
    }
  };

  if (loading) return <p className="text-sm text-slate-600">Loading projects...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Create projects and manage team roles (owner/manager/member/viewer).</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <section className="panel p-4">
        <h3 className="mb-3 text-lg font-semibold text-slate-800">Create Project</h3>
        <form onSubmit={handleCreateProject} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            required
            value={newProject.name}
            onChange={(event) => setNewProject((current) => ({ ...current, name: event.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            placeholder="Project name"
          />
          <input
            value={newProject.description}
            onChange={(event) => setNewProject((current) => ({ ...current, description: event.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            placeholder="Project description"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Create Project"}
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="panel p-4 xl:col-span-1">
          <h3 className="mb-3 text-lg font-semibold text-slate-800">Projects</h3>
          {projects.length === 0 ? (
            <p className="text-sm text-slate-600">No projects yet.</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedProjectId(String(project.id))}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      Number(selectedProjectId) === Number(project.id)
                        ? "border-brand-500 bg-indigo-50 text-slate-800"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-medium">{project.name}</p>
                    {project.description && <p className="text-xs text-slate-500">{project.description}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel p-4 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-800">
              Members {selectedProject ? `- ${selectedProject.name}` : ""}
            </h3>
            <span className="pill bg-slate-100 text-slate-700">Your role: {myMembership?.role || "none"}</span>
          </div>

          {selectedProject && canManageMembers && (
            <form onSubmit={handleUpsertMember} className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <select
                value={memberForm.user_id}
                onChange={(event) => setMemberForm((current) => ({ ...current, user_id: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="">Select user</option>
                {users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.email})
                  </option>
                ))}
              </select>

              <select
                value={memberForm.role}
                onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={saving || !memberForm.user_id}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Add / Update Member
              </button>
            </form>
          )}

          {!selectedProject ? (
            <p className="text-sm text-slate-600">Select a project to view members.</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-600">No members in this project.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={`${member.project_id}-${member.user_id}`} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{member.name || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{member.email || "-"}</td>
                      <td className="px-3 py-2">
                        <span className="pill bg-slate-100 text-slate-700">{member.role}</span>
                      </td>
                      <td className="px-3 py-2">
                        {canManageMembers && member.role !== "owner" ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member)}
                            className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

export default ProjectsPage;
