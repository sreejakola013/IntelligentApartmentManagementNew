
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../services/api";

export default function Complaints() {
  const [form, setForm] = useState({
    title: "",
    category: "PLUMBING",
    description: "",
  });

  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadComplaints = useCallback(async (showLoading = false) => {
    if (showLoading) setRefreshing(true);

    try {
      const result = await apiRequest("/complaints", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      setComplaints(result.complaints || []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load complaints.");
    } finally {
      if (showLoading) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadComplaints();

    const intervalId = setInterval(() => loadComplaints(), 10000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadComplaints();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [loadComplaints]);

  function handleChange(event) {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const result = await apiRequest("/complaints", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(form),
      });

      setMessage(
        result.message || "Complaint submitted successfully."
      );

      setForm({
        title: "",
        category: "PLUMBING",
        description: "",
      });

      await loadComplaints();
    } catch (err) {
      setError(err.message || "Unable to submit complaint.");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Date unavailable"
      : date.toLocaleString();
  }

  function formatStatus(status) {
    const normalized = String(status || "Pending").toLowerCase();

    if (normalized === "resolved" || normalized === "completed") {
      return "Resolved";
    }

    if (normalized === "in progress") return "In Progress";
    if (normalized === "pending") return "Pending";

    return status;
  }

  function priorityClass(priority) {
    return String(priority || "Unknown")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
  }

  return (
    <main className="dashboard-content">
      <Link to="/dashboard" className="back-link">
        ← Back to Dashboard
      </Link>

      <h1 className="page-heading">Complaint Management</h1>
      <p className="page-description">
        Submit an apartment issue and track its progress and AI analysis.
      </p>

      <section className="complaint-form-card">
        <h2>Submit a Complaint</h2>

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

        <form onSubmit={handleSubmit} className="complaint-form">
          <label htmlFor="title">Complaint title</label>
          <input
            id="title"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="e.g. Water leakage in bathroom"
            maxLength={120}
            required
          />

          <label htmlFor="category">Category selected by you</label>
          <select
            id="category"
            name="category"
            value={form.category}
            onChange={handleChange}
            required
          >
            <option value="PLUMBING">Plumbing</option>
            <option value="ELECTRICAL">Electrical</option>
            <option value="CLEANING">Cleaning</option>
            <option value="SECURITY">Security</option>
            <option value="LIFT">Lift</option>
            <option value="OTHER">Other</option>
          </select>

          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Describe the issue and its location..."
            maxLength={2000}
            rows={4}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Submit Complaint"}
          </button>
        </form>
      </section>

      <section className="complaints-list">
        <div className="complaint-item-header">
          <h2>My Complaints</h2>

          <button
            type="button"
            onClick={() => loadComplaints(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>

        {complaints.length === 0 ? (
          <p className="empty-state">
            No complaints yet. Your submitted complaints will appear here.
          </p>
        ) : (
          complaints.map((complaint) => {
            const status = formatStatus(complaint.status);
            const ai = complaint.ai_analysis;

            return (
              <article className="complaint-item" key={complaint.id}>
                <div className="complaint-item-header">
                  <h3>{complaint.title}</h3>

                  <span
                    className={`status-pill ${status
                      .toLowerCase()
                      .replaceAll(" ", "-")}`}
                  >
                    {status}
                  </span>
                </div>

                <p>{complaint.description}</p>

                <div className="complaint-meta">
                  <span>Selected category: {complaint.category}</span>
                  <span>Submitted: {formatDate(complaint.created_at)}</span>
                </div>

                {ai ? (
                  <section className="module-card" aria-label="AI analysis">
                    <h3>AI Complaint Analysis</h3>

                    <p>
                      <strong>Predicted category:</strong>{" "}
                      {ai.predicted_category || "Not available"}
                    </p>

                    <p>
                      <strong>Recommended priority:</strong>{" "}
                      <span
                        className={`status-pill priority-${priorityClass(
                          ai.priority
                        )}`}
                      >
                        {ai.priority || "Not available"}
                      </span>
                    </p>

                    <p>
                      <strong>Keyword match score:</strong>{" "}
                      {Math.round((ai.confidence || 0) * 100)}%
                    </p>

                    {ai.reasons?.length > 0 && (
                      <div>
                        <strong>Why it was classified this way:</strong>
                        <ul>
                          {ai.reasons.map((reason, index) => (
                            <li key={`${complaint.id}-reason-${index}`}>
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p>
                      <strong>Suggested action:</strong>{" "}
                      {ai.suggested_action || "Admin review recommended."}
                    </p>

                    <p>
                      <small>
                        This is an automated recommendation. Please verify
                        the priority, especially for safety-related issues.
                      </small>
                    </p>
                  </section>
                ) : (
                  <p>
                    <strong>AI analysis:</strong> Not available for this
                    older complaint.
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
