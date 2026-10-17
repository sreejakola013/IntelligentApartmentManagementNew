
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";
import "./AdminTasks.css";

export default function AdminTasks() {
  const navigate = useNavigate();

  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "PLUMBING",
    assigned_to: "",
    due_date: "",
  });

  const token = localStorage.getItem("token");

  const loadData = useCallback(async () => {
    setError("");

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    try {
      const [staffResult, taskResult] = await Promise.all([
        apiRequest("/complaints/maintenance-users", { headers }),
        apiRequest("/complaints/tasks", { headers }),
      ]);

      setStaff(staffResult.staff || []);
      setTasks(taskResult.tasks || []);
    } catch (err) {
      setError(err.message || "Unable to load maintenance data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    let user = {};

    try {
      user = JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      user = {};
    }

    if (user.role?.toUpperCase() !== "ADMIN") {
      navigate("/dashboard", { replace: true });
      return;
    }

    loadData();
  }, [token, navigate, loadData]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!form.assigned_to) {
      setError("Please select a maintenance staff member.");
      return;
    }

    setSaving(true);

    try {
      const result = await apiRequest("/complaints/tasks", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      setMessage(result.message || "Task assigned successfully.");

      setForm({
        title: "",
        description: "",
        category: "PLUMBING",
        assigned_to: "",
        due_date: "",
      });

      await loadData();
    } catch (err) {
      setError(err.message || "Unable to assign task.");
    } finally {
      setSaving(false);
    }
  }

  const filteredTasks = tasks.filter((task) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      !query ||
      [
        task.title,
        task.description,
        task.category,
        task.assigned_to_name,
        task.assigned_to_email,
      ].some((value) => String(value || "").toLowerCase().includes(query));

    const matchesStatus =
      statusFilter === "ALL" ||
      String(task.status || "").toUpperCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const completedCount = tasks.filter(
    (task) => String(task.status || "").toUpperCase() === "COMPLETED"
  ).length;

  const pendingCount = tasks.filter((task) =>
    ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(
      String(task.status || "").toUpperCase()
    )
  ).length;

  function getStatusClass(status) {
    const normalized = String(status || "PENDING")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

    return `task-status task-status-${normalized}`;
  }

  return (
    <main className="admin-tasks-page">
      <header className="tasks-topbar">
        <Link to="/dashboard" className="tasks-brand">
          <span className="tasks-brand-icon">🏢</span>
          ApartmentIQ
        </Link>

        <button
          type="button"
          className="tasks-back-button"
          onClick={() => navigate("/dashboard")}
        >
          ← Back to Dashboard
        </button>
      </header>

      <div className="tasks-content">
        <div className="tasks-page-heading">
          <div>
            <span className="tasks-eyebrow">ADMINISTRATION</span>
            <h1>Maintenance Tasks</h1>
            <p>
              Assign maintenance work, manage responsibilities, and track
              progress across your apartment.
            </p>
          </div>

          <button
            type="button"
            className="tasks-refresh-button"
            onClick={loadData}
            disabled={loading}
          >
            ↻ {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <section className="tasks-stats">
          <article className="tasks-stat-card">
            <span className="tasks-stat-icon tasks-stat-blue">📋</span>
            <div>
              <p>Total Tasks</p>
              <h2>{tasks.length}</h2>
            </div>
          </article>

          <article className="tasks-stat-card">
            <span className="tasks-stat-icon tasks-stat-orange">⏳</span>
            <div>
              <p>Pending / In Progress</p>
              <h2>{pendingCount}</h2>
            </div>
          </article>

          <article className="tasks-stat-card">
            <span className="tasks-stat-icon tasks-stat-green">✓</span>
            <div>
              <p>Completed</p>
              <h2>{completedCount}</h2>
            </div>
          </article>

          <article className="tasks-stat-card">
            <span className="tasks-stat-icon tasks-stat-purple">👷</span>
            <div>
              <p>Maintenance Staff</p>
              <h2>{staff.length}</h2>
            </div>
          </article>
        </section>

        {error && (
          <div className="tasks-alert tasks-alert-error" role="alert">
            <span>⚠️</span>
            <p>{error}</p>
            <button type="button" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        {message && (
          <div className="tasks-alert tasks-alert-success" role="status">
            <span>✓</span>
            <p>{message}</p>
            <button type="button" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}

        <section className="tasks-panel">
          <div className="tasks-panel-heading">
            <div className="tasks-heading-icon">＋</div>
            <div>
              <h2>Assign a New Task</h2>
              <p>Enter the work details and select a staff member.</p>
            </div>
          </div>

          {staff.length === 0 && !loading && (
            <div className="tasks-staff-warning">
              No maintenance staff accounts were found. Register a user with
              the MAINTENANCE role before assigning a task.
            </div>
          )}

          <form className="tasks-form" onSubmit={handleSubmit}>
            <div className="tasks-form-grid">
              <div className="tasks-field tasks-field-full">
                <label htmlFor="title">Task title *</label>
                <input
                  id="title"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="e.g. Repair water leakage"
                  maxLength={120}
                  required
                />
              </div>

              <div className="tasks-field tasks-field-full">
                <label htmlFor="description">Description *</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Describe the issue and the work required..."
                  maxLength={2000}
                  rows={4}
                  required
                />
                <span className="tasks-field-hint">
                  Include the location and any important details.
                </span>
              </div>

              <div className="tasks-field">
                <label htmlFor="category">Category *</label>
                <select
                  id="category"
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  required
                >
                  <option value="PLUMBING">🔧 Plumbing</option>
                  <option value="ELECTRICAL">⚡ Electrical</option>
                  <option value="CLEANING">🧹 Cleaning</option>
                  <option value="LIFT">🛗 Lift</option>
                  <option value="OTHER">📌 Other</option>
                </select>
              </div>

              <div className="tasks-field">
                <label htmlFor="assigned_to">Assign to *</label>
                <select
                  id="assigned_to"
                  name="assigned_to"
                  value={form.assigned_to}
                  onChange={handleChange}
                  required
                  disabled={staff.length === 0}
                >
                  <option value="">Select maintenance staff</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name || person.email} ({person.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="tasks-field">
                <label htmlFor="due_date">Due date</label>
                <input
                  id="due_date"
                  name="due_date"
                  type="date"
                  value={form.due_date}
                  onChange={handleChange}
                />
                <span className="tasks-field-hint">Optional</span>
              </div>
            </div>

            <div className="tasks-form-footer">
              <p>Fields marked * are required.</p>
              <button
                type="submit"
                className="tasks-submit-button"
                disabled={saving || loading || staff.length === 0}
              >
                {saving ? "Assigning Task..." : "＋ Assign Task"}
              </button>
            </div>
          </form>
        </section>

        <section className="tasks-panel">
          <div className="tasks-list-heading">
            <div>
              <h2>All Maintenance Tasks</h2>
              <p>Track assignments and check task progress.</p>
            </div>
            <span className="tasks-total-badge">
              {filteredTasks.length} tasks
            </span>
          </div>

          <div className="tasks-filters">
            <div className="tasks-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="Search maintenance tasks"
                placeholder="Search by title, category or staff..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select
              className="tasks-status-filter"
              aria-label="Filter tasks by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          {loading ? (
            <div className="tasks-empty-state">
              <span className="tasks-loading-icon">⏳</span>
              <h3>Loading tasks...</h3>
              <p>Please wait while we retrieve maintenance data.</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="tasks-empty-state">
              <span>📋</span>
              <h3>
                {tasks.length === 0
                  ? "No tasks assigned yet"
                  : "No matching tasks"}
              </h3>
              <p>
                {tasks.length === 0
                  ? "Use the form above to assign your first maintenance task."
                  : "Try changing your search or status filter."}
              </p>
              {(search || statusFilter !== "ALL") && (
                <button
                  type="button"
                  className="tasks-clear-button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("ALL");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="tasks-list">
              {filteredTasks.map((task) => (
                <article className="task-item" key={task.id}>
                  <div className="task-item-top">
                    <div className="task-item-title">
                      <span className="task-item-icon">🛠️</span>
                      <div>
                        <h3>{task.title}</h3>
                        <span className="task-category">
                          {task.category || "OTHER"}
                        </span>
                      </div>
                    </div>

                    <span className={getStatusClass(task.status)}>
                      {String(task.status || "PENDING").replace(/_/g, " ")}
                    </span>
                  </div>

                  <p className="task-description">
                    {task.description || "No description provided."}
                  </p>

                  <div className="task-item-details">
                    <div>
                      <span className="task-detail-label">Assigned to</span>
                      <strong>
                        {task.assigned_to_name ||
                          task.assigned_to_email ||
                          "Not assigned"}
                      </strong>
                    </div>

                    <div>
                      <span className="task-detail-label">Due date</span>
                      <strong>
                        {task.due_date || "No due date"}
                      </strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="tasks-page-footer">
          <Link to="/admin/complaints">
            ← Open Complaint Management
          </Link>
          <span>ApartmentIQ · Maintenance Management</span>
        </footer>
      </div>
    </main>
  );
}
