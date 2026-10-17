
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

export default function AdminComplaints() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [complaints, setComplaints] = useState([]);
  const [staff, setStaff] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [assigningId, setAssigningId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const [complaintResult, staffResult] = await Promise.all([
        apiRequest("/complaints/all", { headers }),
        apiRequest("/complaints/maintenance-users", { headers }),
      ]);

      setComplaints(complaintResult.complaints || []);
      setStaff(staffResult.staff || []);
    } catch (err) {
      setError(err.message || "Could not load complaints and staff.");
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

  async function handleStatusChange(complaintId, newStatus) {
    setError("");
    setMessage("");
    setUpdatingId(complaintId);

    try {
      await apiRequest(`/complaints/${complaintId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      setMessage("Complaint status updated.");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not update complaint status.");
    } finally {
      setUpdatingId("");
    }
  }

  async function handleAssign(complaint) {
    const staffId = assignments[complaint.id];

    if (!staffId) {
      setError("Please select a maintenance staff member first.");
      return;
    }

    const selectedStaff = staff.find(
      (person) => person.id === staffId
    );

    if (!selectedStaff) {
      setError("Selected maintenance staff member was not found.");
      return;
    }

    setError("");
    setMessage("");
    setAssigningId(complaint.id);

    try {
      // Create a maintenance task linked to this resident complaint.
      const taskResult = await apiRequest("/complaints/tasks", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: complaint.title,
          description: complaint.description,
          category: complaint.category,
          assigned_to: staffId,
          due_date: "",
          complaint_id: complaint.id,
        }),
      });

      // Update the complaint status after the task is created.
      try {
        await apiRequest(
          `/complaints/${complaint.id}/status`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              status: "In Progress",
            }),
          }
        );
      } catch (statusError) {
        setMessage(
          `${taskResult.message || "Task assigned successfully."} ` +
          `However, the complaint status could not be updated: ${statusError.message}`
        );
        await loadData();
        return;
      }

      setMessage(
        `Complaint assigned to ${selectedStaff.name || selectedStaff.email}.`
      );

      setAssignments((previous) => ({
        ...previous,
        [complaint.id]: "",
      }));

      await loadData();
    } catch (err) {
      setError(err.message || "Could not assign complaint.");
    } finally {
      setAssigningId("");
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  }

  return (
    <main className="admin-complaints-page">
      <header className="topbar">
        <div className="topbar-brand">🏢 ApartmentIQ</div>

        <button className="logout-button" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <section className="admin-complaints-content">
        <Link to="/dashboard" className="back-link">
          ← Back to Dashboard
        </Link>

        <h1 className="page-heading">Admin Complaint Management</h1>

        <p className="page-description">
          Review resident complaints, assign maintenance staff, and
          track their progress.
        </p>

        <div className="admin-complaints-summary">
          <div className="admin-summary-card">
            <span>Total Complaints</span>
            <strong>{complaints.length}</strong>
          </div>

          <div className="admin-summary-card">
            <span>Pending</span>
            <strong>
              {complaints.filter((c) => c.status === "Pending").length}
            </strong>
          </div>

          <div className="admin-summary-card">
            <span>In Progress</span>
            <strong>
              {complaints.filter((c) => c.status === "In Progress").length}
            </strong>
          </div>

          <div className="admin-summary-card">
            <span>Resolved</span>
            <strong>
              {complaints.filter((c) => c.status === "Resolved").length}
            </strong>
          </div>
        </div>

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

        <div className="admin-complaints-heading">
          <h2>All Resident Complaints</h2>

          <button
            type="button"
            className="refresh-button"
            onClick={loadData}
            disabled={loading}
          >
            {loading ? "Loading..." : "↻ Refresh"}
          </button>
        </div>

        {loading ? (
          <p className="empty-state">Loading complaints...</p>
        ) : complaints.length === 0 ? (
          <p className="empty-state">
            No complaints have been submitted yet.
          </p>
        ) : (
          complaints.map((complaint) => (
            <article className="complaint-item" key={complaint.id}>
              <div className="complaint-item-header">
                <div>
                  <h3>{complaint.title}</h3>
                  <p className="admin-resident-name">
                    Resident: {complaint.user_name || "Unknown"}
                  </p>
                </div>

                <span
                  className={`status-pill ${
                    String(complaint.status || "Pending")
                      .toLowerCase()
                      .replaceAll(" ", "-")
                  }`}
                >
                  {complaint.status || "Pending"}
                </span>
              </div>

              <p>{complaint.description}</p>
              
{complaint.ai_analysis ? (
  <section className="module-card">
    <h3>AI Analysis</h3>

    <p>
      <strong>AI-predicted category:</strong>{" "}
      {complaint.ai_analysis.predicted_category || "Unknown"}
    </p>

    <p>
      <strong>Recommended priority:</strong>{" "}
      <span
        className={`status-pill priority-${String(
          complaint.ai_analysis.priority || "unknown"
        )
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`}
      >
        {complaint.ai_analysis.priority || "Unknown"}
      </span>
    </p>

    {complaint.ai_analysis.reasons?.length > 0 && (
      <p>
        <strong>Reason:</strong>{" "}
        {complaint.ai_analysis.reasons.join(" ")}
      </p>
    )}

    <p>
      <strong>Suggested action:</strong>{" "}
      {complaint.ai_analysis.suggested_action || "Review complaint manually."}
    </p>

    <p>
      <small>
        AI priority is advisory. Review the complaint before assigning work.
      </small>
    </p>
  </section>
) : (
  <p><strong>AI analysis:</strong> Not available for this older complaint.</p>
)}


              <div className="complaint-meta">
                <span>Category: {complaint.category}</span>
                <span>
                  Submitted:{" "}
                  {complaint.created_at
                    ? new Date(complaint.created_at).toLocaleString()
                    : "Unknown"}
                </span>
              </div>

              <div className="admin-status-control">
                <label htmlFor={`status-${complaint.id}`}>
                  Update status
                </label>

                <select
                  id={`status-${complaint.id}`}
                  value={complaint.status || "Pending"}
                  disabled={updatingId === complaint.id}
                  onChange={(event) =>
                    handleStatusChange(
                      complaint.id,
                      event.target.value
                    )
                  }
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>

                {updatingId === complaint.id && (
                  <span className="updating-text">Saving...</span>
                )}
              </div>

              <div className="admin-status-control">
                <label htmlFor={`staff-${complaint.id}`}>
                  Assign to maintenance staff
                </label>

                <select
                  id={`staff-${complaint.id}`}
                  value={assignments[complaint.id] || ""}
                  disabled={
                    assigningId === complaint.id ||
                    complaint.status === "Resolved"
                  }
                  onChange={(event) =>
                    setAssignments((previous) => ({
                      ...previous,
                      [complaint.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Select maintenance staff</option>

                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name || person.email} ({person.email})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={
                    !assignments[complaint.id] ||
                    assigningId === complaint.id ||
                    complaint.status === "Resolved"
                  }
                  onClick={() => handleAssign(complaint)}
                >
                  {assigningId === complaint.id
                    ? "Assigning..."
                    : "Assign Complaint"}
                </button>

                {complaint.status === "Resolved" && (
                  <p>This complaint is already resolved.</p>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
