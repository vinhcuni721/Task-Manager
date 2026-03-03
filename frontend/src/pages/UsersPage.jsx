import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { usersApi } from "../services/api";

function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await usersApi.getAll();
      setUsers(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (targetUserId, role) => {
    try {
      setError("");
      await usersApi.updateRole(targetUserId, role);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Failed to update role");
    }
  };

  if (loading) return <p className="text-sm text-slate-600">Loading users...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Manage workspace users and permissions.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="px-4 py-3 text-slate-700">{item.name}</td>
                <td className="px-4 py-3 text-slate-700">{item.email}</td>
                <td className="px-4 py-3">
                  {user?.role === "admin" ? (
                    <select
                      value={item.role}
                      onChange={(event) => handleRoleChange(item.id, event.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    >
                      <option value="member">member</option>
                      <option value="manager">manager</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {item.role}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{new Date(item.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UsersPage;
