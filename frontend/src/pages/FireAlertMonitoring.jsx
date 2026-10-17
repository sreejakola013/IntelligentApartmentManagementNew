
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api";

const styles = {
  page: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "24px 16px",
    color: "#1f2937",
  },
  heading: { fontSize: "28px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { color: "#6b7280", marginBottom: "24px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "16px",
    marginBottom: "28px",
  },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  },
  label: { color: "#6b7280", fontSize: "14px", marginBottom: "10px" },
  number: { fontSize: "30px", fontWeight: 700 },
  alert: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "16px",
  },
  button: {
    border: 0,
    borderRadius: "7px",
    padding: "10px 15px",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    marginRight: "8px",
    marginTop: "12px",
  },
};

function statusStyle(status) {
  if (status === "RESOLVED") {
    return { background: "#dcfce7", color: "#166534" };
  }
  if (status === "ACKNOWLEDGED") {
    return { background: "#dbeafe", color: "#1d4ed8" };
  }
  return { background: "#fee2e2", color: "#991b1b" };
}

function FireAlertMonitoring() {
  const [data, setData] = useState({
    total: 0,
    pending: 0,
    acknowledged: 0,
    resolved: 0,
    alerts: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const token = localStorage.getItem("token");
  let user = {};

  try {
    user = JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    user = {};
  }

  const role = String(user.role || "").toUpperCase();
  const isSecurity = role === "SECURITY";
  const canView = role === "ADMIN" || isSecurity;

  const loadAlerts = useCallback(async () => {
    if (!token) {
      setError("Your session is missing. Please log in again.");
      setLoading(false);
      return;
    }

    try {
      setError("");

      const response = await fetch(
        `${API_BASE_URL}/ai/fire-smoke-alerts`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to load fire alerts.");
      }

      setData({
        total: result.total ?? result.alerts?.length ?? 0,
        pending:
          result.pending ??
          result.alerts?.filter((a) => a.response_status === "PENDING").length ??
          0,
        acknowledged:
          result.acknowledged ??
          result.alerts?.filter((a) => a.response_status === "ACKNOWLEDGED")
            .length ??
          0,
        resolved:
          result.resolved ??
          result.alerts?.filter((a) => a.response_status === "RESOLVED")
            .length ??
          0,
        alerts: result.alerts || [],
      });
    } catch (err) {
      setError(err.message || "Could not connect to the backend.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAlerts();
    const timer = setInterval(loadAlerts, 15000);
    return () => clearInterval(timer);
  }, [loadAlerts]);

  async function updateAlert(alertId, action) {
    const actionLabel = action === "acknowledge" ? "acknowledge" : "resolve";

    if (
      action === "resolve" &&
      !window.confirm("Confirm that this fire/smoke alert is resolved?")
    ) {
      return;
    }

    try {
      setBusyId(alertId);
      setError("");
      setMessage("");

      const response = await fetch(
        `${API_BASE_URL}/ai/fire-smoke-alerts/${alertId}/${action}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `Failed to ${actionLabel} alert.`);
      }

      setMessage(
        action === "acknowledge"
          ? "Alert acknowledged successfully."
          : "Alert marked as resolved successfully."
      );

      await loadAlerts();
    } catch (err) {
      setError(err.message || "Unable to update alert.");
    } finally {
      setBusyId("");
    }
  }

  if (!canView) {
    return (
      <div style={styles.page}>
        <h2 style={styles.heading}>Fire Alert Monitoring</h2>
        <p>
          This page is available only to Admin and Security users. Please log
          in with an authorized account.
        </p>
      </div>
    );
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.heading}>🔥 Fire Alert Monitoring</h1>
      <p style={styles.subtitle}>
        Monitor detected fire and smoke incidents and track response progress.
        Alerts refresh automatically every 15 seconds.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          style={{
            background: "#dcfce7",
            color: "#166534",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          {message}
        </div>
      )}

      <section style={styles.grid}>
        {[
          ["Total Alerts", data.total, "#111827"],
          ["Pending", data.pending, "#dc2626"],
          ["Acknowledged", data.acknowledged, "#2563eb"],
          ["Resolved", data.resolved, "#15803d"],
        ].map(([label, number, color]) => (
          <div style={styles.card} key={label}>
            <div style={styles.label}>{label}</div>
            <div style={{ ...styles.number, color }}>{number}</div>
          </div>
        ))}
      </section>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <h2 style={{ margin: 0 }}>Detected Incidents</h2>
        <button
          type="button"
          onClick={loadAlerts}
          style={{
            ...styles.button,
            background: "#374151",
            marginTop: 0,
          }}
        >
          Refresh Alerts
        </button>
      </div>

      {loading ? (
        <p>Loading fire alerts...</p>
      ) : data.alerts.length === 0 ? (
        <div style={styles.card}>No fire or smoke alerts found.</div>
      ) : (
        data.alerts.map((alert) => {
          const status = alert.response_status || "PENDING";
          const detections = alert.detections || [];

          return (
            <article key={alert.id} style={styles.alert}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ margin: 0 }}>
                  🚨 {String(alert.alert_level || "FIRE/SMOKE ALERT").replaceAll("_", " ")}
                </h3>

                <span
                  style={{
                    ...statusStyle(status),
                    borderRadius: "20px",
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {status}
                </span>
              </div>

              <p style={{ color: "#6b7280", marginBottom: "8px" }}>
                Detected:{" "}
                {alert.created_at
                  ? new Date(alert.created_at).toLocaleString()
                  : "Time unavailable"}
              </p>

              <p>
                <strong>Detection type:</strong>{" "}
                {alert.detection_type || "fire_smoke"}
              </p>
              <p>
                <strong>Detected objects:</strong>{" "}
                {alert.object_count ?? detections.length}
              </p>

              {detections.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <strong>Detection details</strong>
                  <ul>
                    {detections.map((item, index) => (
                      <li key={`${alert.id}-${index}`}>
                        {item.label || "Object"} — confidence{" "}
                        {typeof item.confidence === "number"
                          ? `${(item.confidence * 100).toFixed(1)}%`
                          : "N/A"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {alert.acknowledged_at && (
                <p>
                  <strong>Acknowledged:</strong>{" "}
                  {new Date(alert.acknowledged_at).toLocaleString()}
                </p>
              )}

              {alert.resolved_at && (
                <p>
                  <strong>Resolved:</strong>{" "}
                  {new Date(alert.resolved_at).toLocaleString()}
                </p>
              )}

              {isSecurity && status === "PENDING" && (
                <button
                  type="button"
                  disabled={busyId === alert.id}
                  onClick={() => updateAlert(alert.id, "acknowledge")}
                  style={{
                    ...styles.button,
                    background: "#2563eb",
                    opacity: busyId === alert.id ? 0.6 : 1,
                  }}
                >
                  {busyId === alert.id ? "Updating..." : "Acknowledge Alert"}
                </button>
              )}

              {isSecurity && status === "ACKNOWLEDGED" && (
                <button
                  type="button"
                  disabled={busyId === alert.id}
                  onClick={() => updateAlert(alert.id, "resolve")}
                  style={{
                    ...styles.button,
                    background: "#15803d",
                    opacity: busyId === alert.id ? 0.6 : 1,
                  }}
                >
                  {busyId === alert.id ? "Updating..." : "Resolve Alert"}
                </button>
              )}
            </article>
          );
        })
      )}
    </main>
  );
}

export default FireAlertMonitoring;
