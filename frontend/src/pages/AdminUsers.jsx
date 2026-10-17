
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../services/api";

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    ""
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (search.trim()) params.set("search", search.trim());
      if (role) params.set("role", role);

      const query = params.toString();
      const data = await apiRequest(
        `/auth/users${query ? `?${query}` : ""}`,
        {
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        }
      );

      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [search, role]);

  useEffect(() => {
    const timeout = setTimeout(loadUsers, 300);
    return () => clearTimeout(timeout);
  }, [loadUsers]);

  async function handleDelete(user) {
    const confirmed = window.confirm(
      `Delete the account for ${user.name} (${user.email})? This cannot be undone.`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setDeletingId(user.id);

    try {
      const data = await apiRequest(`/auth/users/${user.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      setMessage(data.message || "User deleted successfully.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Could not delete this user.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.heading}>User Management</h1>
          <p style={styles.subtitle}>
            View, search, filter, and manage registered apartment users.
          </p>
        </div>

        <button style={styles.refreshButton} onClick={loadUsers}>
          Refresh
        </button>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <section style={styles.summary}>
        <div style={styles.summaryCard}>
          <span>Total Users</span>
          <strong>{users.length}</strong>
        </div>
        <div style={styles.summaryCard}>
          <span>Residents</span>
          <strong>
            {users.filter((user) => user.role === "RESIDENT").length}
          </strong>
        </div>
        <div style={styles.summaryCard}>
          <span>Security</span>
          <strong>
            {users.filter((user) => user.role === "SECURITY").length}
          </strong>
        </div>
        <div style={styles.summaryCard}>
          <span>Maintenance</span>
          <strong>
            {users.filter((user) => user.role === "MAINTENANCE").length}
          </strong>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.filters}>
          <input
            style={styles.searchInput}
            type="search"
            placeholder="Search by name or email..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            style={styles.roleSelect}
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">All roles</option>
            <option value="ADMIN">Admin</option>
            <option value="RESIDENT">Resident</option>
            <option value="SECURITY">Security</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </div>

        {loading ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users match your search.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Registered</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td style={styles.td}>
                      <strong>{user.name || "Unnamed user"}</strong>
                    </td>
                    <td style={styles.td}>{user.email}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.roleBadge,
                          ...(user.role === "ADMIN"
                            ? styles.adminBadge
                            : user.role === "RESIDENT"
                              ? styles.residentBadge
                              : styles.otherBadge),
                        }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td style={styles.td}>
                      {user.role === "ADMIN" ? (
                        <span style={styles.protectedText}>
                          Protected account
                        </span>
                      ) : (
                        <button
                          style={styles.deleteButton}
                          disabled={deletingId === user.id}
                          onClick={() => handleDelete(user)}
                        >
                          {deletingId === user.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={styles.footerText}>
          Showing {users.length} user(s). The API returns a maximum of 500
          records per request.
        </p>
      </section>
    </main>
  );
}

const styles = {
  page: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "24px",
    color: "#1f2937",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "24px",
  },
  heading: { margin: 0, fontSize: "28px" },
  subtitle: { color: "#6b7280", marginTop: "8px" },
  refreshButton: {
    background: "#374151",
    color: "white",
    padding: "10px 16px",
    border: 0,
    borderRadius: "7px",
    cursor: "pointer",
  },
  summary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "14px",
    marginBottom: "24px",
  },
  summaryCard: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "18px",
    background: "#f3f4f6",
    borderRadius: "10px",
  },
  card: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "20px",
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "20px",
  },
  searchInput: {
    flex: "1 1 250px",
    minWidth: 0,
    padding: "11px",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    fontSize: "14px",
  },
  roleSelect: {
    minWidth: "160px",
    padding: "11px",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    background: "white",
  },
  tableWrapper: { width: "100%", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "700px" },
  th: {
    padding: "12px",
    background: "#f9fafb",
    textAlign: "left",
    borderBottom: "1px solid #e5e7eb",
    fontSize: "13px",
  },
  td: {
    padding: "13px 12px",
    borderBottom: "1px solid #e5e7eb",
    fontSize: "14px",
    verticalAlign: "middle",
  },
  roleBadge: {
    display: "inline-block",
    borderRadius: "20px",
    padding: "5px 9px",
    fontSize: "11px",
    fontWeight: 700,
  },
  adminBadge: { background: "#ede9fe", color: "#5b21b6" },
  residentBadge: { background: "#dbeafe", color: "#1d4ed8" },
  otherBadge: { background: "#e5e7eb", color: "#374151" },
  deleteButton: {
    background: "#dc2626",
    color: "white",
    border: 0,
    borderRadius: "6px",
    padding: "8px 12px",
    cursor: "pointer",
  },
  protectedText: { color: "#6b7280", fontSize: "12px" },
  error: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  success: {
    background: "#dcfce7",
    color: "#166534",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  footerText: { color: "#6b7280", fontSize: "12px", marginTop: "16px" },
};
