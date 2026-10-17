
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

export default function MaintenanceTasks() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  // Fetch tasks assigned to the logged-in maintenance staff member.
  const loadTasks = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setError("");

      const result = await apiRequest(
        "/complaints/tasks/assigned",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setTasks(result.tasks || []);
    } catch (err) {
      setError(err.message || "Unable to load assigned tasks.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Verify authentication and role, then load tasks initially.
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

    if (user.role?.toUpperCase() !== "MAINTENANCE") {
      navigate("/dashboard", { replace: true });
      return;
    }

    loadTasks();
  }, [token, navigate, loadTasks]);

  // Automatically refresh tasks every 15 seconds.
  useEffect(() => {
    if (!token) return;

    const intervalId = setInterval(() => {
      loadTasks();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [token, loadTasks]);

  // Update the status of a task assigned to this user.
  async function updateStatus(taskId, status) {
    setError("");
    setMessage("");
    setUpdatingId(taskId);

    try {
      const result = await apiRequest(
        `/complaints/tasks/${taskId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status }),
        }
      );

      setMessage(result.message || "Task status updated.");

      await loadTasks();
    } catch (err) {
      setError(err.message || "Unable to update task status.");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <main className="dashboard-page">
      <header className="topbar">
        <div className="topbar-brand">🏢 ApartmentIQ</div>

        <button
          className="logout-button"
          onClick={() => navigate("/dashboard")}
        >
          Back to Dashboard
        </button>
      </header>

      <section className="dashboard-content">
        <p className="eyebrow">MAINTENANCE STAFF</p>

        <h1>My Assigned Tasks</h1>

        <p>
          Review your assignments and keep their progress up to date.
          Tasks refresh automatically every 15 seconds.
        </p>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="success-message" role="status">
            {message}
          </div>
        )}

        {loading ? (
          <p>Loading your tasks...</p>
        ) : tasks.length === 0 ? (
          <section className="module-card">
            <h2>No assigned tasks yet</h2>
            <p>
              Tasks assigned by the administrator will appear here.
            </p>
          </section>
        ) : (
          <div className="task-list">
            {tasks.map((task) => (
              <article className="module-card" key={task.id}>
                <h2>{task.title}</h2>

                <p>{task.description}</p>

                <p>
                  <strong>Category:</strong> {task.category}
                </p>

                <p>
                  <strong>Due date:</strong>{" "}
                  {task.due_date || "Not specified"}
                </p>

                <p>
                  <strong>Current status:</strong> {task.status}
                </p>

                <label htmlFor={`status-${task.id}`}>
                  Update task status
                </label>

                <select
                  id={`status-${task.id}`}
                  value={task.status}
                  disabled={
                    updatingId === task.id ||
                    task.status === "Completed"
                  }
                  onChange={(event) =>
                    updateStatus(task.id, event.target.value)
                  }
                >
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>

                {updatingId === task.id && (
                  <p>Updating...</p>
                )}
              </article>
            ))}
          </div>
        )}

        <button type="button" onClick={loadTasks}>
          Refresh Tasks
        </button>
      </section>
    </main>
  );
}
