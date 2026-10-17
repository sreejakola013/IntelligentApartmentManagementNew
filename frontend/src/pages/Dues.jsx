import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../services/api";

function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    ""
  );
}

function getSavedRole() {
  const user = getSavedUser();
  return String(user.role || localStorage.getItem("role") || "").toUpperCase();
}

export default function Dues() {
  const role = getSavedRole();
  const isAdmin = role === "ADMIN";

  const [dues, setDues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    resident_id: "",
    title: "Monthly Maintenance",
    description: "",
    amount: "",
    due_date: "",
  });

  const loadDues = useCallback(async () => {
    try {
      const data = await apiRequest("/dues", {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      setDues(data.dues || []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load dues.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDues();
    const interval = setInterval(loadDues, 15000);
    return () => clearInterval(interval);
  }, [loadDues]);

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const data = await apiRequest("/dues", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
        }),
      });

      setMessage(data.message || "Dues created successfully.");
      setForm({
        resident_id: "",
        title: "Monthly Maintenance",
        description: "",
        amount: "",
        due_date: "",
      });

      await loadDues();
    } catch (err) {
      setError(err.message || "Could not create dues.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmPayment(dueId) {
    const confirmed = window.confirm(
      "Confirm that this resident has paid these dues?"
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/dues/${dueId}/confirm-payment`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        }
      );

      setMessage(data.message || "Payment confirmed successfully.");
      await loadDues();
    } catch (err) {
      setError(err.message || "Could not confirm payment.");
    }
  }

  const totalPending = dues
    .filter((due) => due.status === "PENDING")
    .reduce((sum, due) => sum + Number(due.amount || 0), 0);

  const totalPaid = dues
    .filter((due) => due.status === "PAID")
    .reduce((sum, due) => sum + Number(due.amount || 0), 0);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.heading}>Apartment Dues</h1>
          <p style={styles.subtitle}>
            View maintenance charges and track payment status.
          </p>
        </div>
        <button style={styles.button} onClick={loadDues}>
          Refresh
        </button>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <section style={styles.summary}>
        <div style={styles.summaryCard}>
          <span>Pending Amount</span>
          <strong>₹{totalPending.toLocaleString("en-IN")}</strong>
        </div>
        <div style={styles.summaryCard}>
          <span>Paid Amount</span>
          <strong>₹{totalPaid.toLocaleString("en-IN")}</strong>
        </div>
        <div style={styles.summaryCard}>
          <span>Total Records</span>
          <strong>{dues.length}</strong>
        </div>
      </section>

      {isAdmin && (
        <section style={styles.card}>
          <h2 style={styles.sectionHeading}>Create Resident Dues</h2>

          <form onSubmit={handleCreate} style={styles.form}>
            <label style={styles.label}>
              Resident MongoDB ID
              <input
                style={styles.input}
                name="resident_id"
                value={form.resident_id}
                onChange={handleChange}
                placeholder="Enter the resident's _id"
                required
              />
            </label>

            <label style={styles.label}>
              Charge Title
              <input
                style={styles.input}
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Monthly Maintenance"
                maxLength={150}
                required
              />
            </label>

            <label style={styles.label}>
              Description
              <textarea
                style={styles.input}
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Description of the charge"
                maxLength={1000}
                rows={3}
              />
            </label>

            <label style={styles.label}>
              Amount (₹)
              <input
                style={styles.input}
                type="number"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                min="0.01"
                step="0.01"
                required
              />
            </label>

            <label style={styles.label}>
              Due Date
              <input
                style={styles.input}
                type="date"
                name="due_date"
                value={form.due_date}
                onChange={handleChange}
                required
              />
            </label>

            <button
              style={styles.submitButton}
              type="submit"
              disabled={saving}
            >
              {saving ? "Creating..." : "Create Dues"}
            </button>
          </form>
          <p style={styles.hint}>
            Use the resident's MongoDB user ID, not a dues record ID.
          </p>
        </section>
      )}

      <section style={styles.card}>
        <h2 style={styles.sectionHeading}>
          {isAdmin ? "All Dues Records" : "My Dues"}
        </h2>

        {loading ? (
          <p>Loading dues...</p>
        ) : dues.length === 0 ? (
          <p>No dues records found.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {isAdmin && <th style={styles.th}>Resident</th>}
                  <th style={styles.th}>Charge</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Due Date</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Payment Date</th>
                  {isAdmin && <th style={styles.th}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {dues.map((due) => (
                  <tr key={due.id}>
                    {isAdmin && (
                      <td style={styles.td}>
                        <strong>{due.resident_name}</strong>
                        <div style={styles.smallText}>{due.resident_id}</div>
                      </td>
                    )}
                    <td style={styles.td}>
                      <strong>{due.title}</strong>
                      {due.description && (
                        <div style={styles.smallText}>{due.description}</div>
                      )}
                    </td>
                    <td style={styles.td}>
                      ₹{Number(due.amount).toLocaleString("en-IN")}
                    </td>
                    <td style={styles.td}>{due.due_date}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.status,
                          ...(due.status === "PAID"
                            ? styles.paid
                            : styles.pending),
                        }}
                      >
                        {due.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {due.paid_at
                        ? new Date(due.paid_at).toLocaleDateString()
                        : "—"}
                    </td>
                    {isAdmin && (
                      <td style={styles.td}>
                        {due.status === "PENDING" ? (
                          <button
                            style={styles.payButton}
                            onClick={() => handleConfirmPayment(due.id)}
                          >
                            Confirm Payment
                          </button>
                        ) : (
                          <span style={styles.smallText}>Completed</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "24px",
  },
  heading: { margin: 0, fontSize: "28px" },
  subtitle: { color: "#6b7280", marginTop: "8px" },
  summary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  summaryCard: {
    padding: "20px",
    background: "#f3f4f6",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "24px",
  },
  sectionHeading: { marginTop: 0, marginBottom: "18px", fontSize: "20px" },
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "16px",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    fontWeight: 600,
    fontSize: "14px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    padding: "10px",
    font: "inherit",
    fontWeight: 400,
  },
  button: {
    background: "#374151",
    color: "#fff",
    border: 0,
    borderRadius: "7px",
    padding: "10px 16px",
    cursor: "pointer",
  },
  submitButton: {
    background: "#2563eb",
    color: "#fff",
    border: 0,
    borderRadius: "7px",
    padding: "12px 16px",
    cursor: "pointer",
    alignSelf: "end",
  },
  payButton: {
    background: "#15803d",
    color: "#fff",
    border: 0,
    borderRadius: "6px",
    padding: "8px 10px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  hint: { color: "#6b7280", fontSize: "13px", marginBottom: 0 },
  error: {
    padding: "12px",
    marginBottom: "16px",
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: "8px",
  },
  success: {
    padding: "12px",
    marginBottom: "16px",
    background: "#dcfce7",
    color: "#166534",
    borderRadius: "8px",
  },
  tableWrapper: { width: "100%", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "760px" },
  th: {
    textAlign: "left",
    padding: "12px",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    fontSize: "13px",
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
    fontSize: "14px",
  },
  smallText: {
    color: "#6b7280",
    fontSize: "12px",
    marginTop: "5px",
    overflowWrap: "anywhere",
  },
  status: {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 700,
  },
  paid: { background: "#dcfce7", color: "#166534" },
  pending: { background: "#fef3c7", color: "#92400e" },
};