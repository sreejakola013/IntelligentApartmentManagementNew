
import { useCallback, useEffect, useState } from "react";

export default function AIHistory() {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    totalScans: 0,
    totalObjects: 0,
    fireSmokeScans: 0,
    fireSmokeDetections: 0,
    fireAlerts: 0,
    smokeAlerts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState("all");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("Please log in again to view AI history.");
      }

      const apiBase =
        import.meta.env.VITE_API_URL ||
        "http://127.0.0.1:5000/api";

      const response = await fetch(`${apiBase}/ai/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load scan history.");
      }

      const scans = Array.isArray(data.scans) ? data.scans : [];

      setHistory(scans);
      setStats({
        totalScans: Number(data.total_scans) || 0,
        totalObjects: Number(data.total_objects) || 0,
        fireSmokeScans: Number(data.total_fire_smoke_scans) || 0,
        fireSmokeDetections:
          Number(data.total_fire_smoke_detections) || 0,
        fireAlerts: Number(data.fire_alerts) || 0,
        smokeAlerts: Number(data.smoke_alerts) || 0,
      });
    } catch (err) {
      setError(err.message || "Could not connect to the backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function scanType(scan) {
    return scan.detection_type === "fire_smoke"
      ? "fire_smoke"
      : "objects";
  }

  function alertCode(scan) {
    return String(scan.alert_level || "").toUpperCase();
  }

  function alertLabel(scan) {
    const labels = {
      FIRE_DETECTED: "Fire detected",
      SMOKE_DETECTED: "Smoke detected",
      NO_FIRE_OR_SMOKE_DETECTED: "No fire or smoke detected",
    };

    if (labels[alertCode(scan)]) return labels[alertCode(scan)];

    return scanType(scan) === "fire_smoke"
      ? "Alert status unavailable"
      : "Object scan";
  }

  function alertStyle(scan) {
    const level = alertCode(scan);

    if (level === "FIRE_DETECTED") return styles.fireAlert;
    if (level === "SMOKE_DETECTED") return styles.smokeAlert;
    if (level === "NO_FIRE_OR_SMOKE_DETECTED") return styles.safeAlert;

    return styles.neutralAlert;
  }

  function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "Date unavailable"
      : date.toLocaleString();
  }

  function confidence(value) {
    if (value === undefined || value === null || value === "") {
      return "Unavailable";
    }

    const number = Number(value);
    if (!Number.isFinite(number)) return "Unavailable";

    return `${(
      number >= 0 && number <= 1 ? number * 100 : number
    ).toFixed(1)}%`;
  }

  function detections(scan) {
    return Array.isArray(scan.detections) ? scan.detections : [];
  }

  function detectionCount(scan) {
    if (scan.object_count != null) return scan.object_count;
    if (scan.count != null) return scan.count;
    return detections(scan).length;
  }

  const listedFireSmoke = history.filter(
    (scan) => scanType(scan) === "fire_smoke"
  ).length;

  const listedObjects = history.length - listedFireSmoke;

  const filteredHistory = history.filter((scan) => {
    const type = scanType(scan);
    const level = alertCode(scan);

    if (filter === "all") return true;
    if (filter === "objects") return type === "objects";
    if (filter === "fire_smoke") return type === "fire_smoke";
    if (filter === "fire_alerts") return level === "FIRE_DETECTED";
    if (filter === "smoke_alerts") return level === "SMOKE_DETECTED";

    return true;
  });

  const filters = [
    { id: "all", label: `All scans (${history.length})` },
    { id: "objects", label: `Objects (${listedObjects})` },
    { id: "fire_smoke", label: `Fire & Smoke (${listedFireSmoke})` },
    {
      id: "fire_alerts",
      label: `Fire alerts (${history.filter(
        (s) => alertCode(s) === "FIRE_DETECTED"
      ).length})`,
    },
    {
      id: "smoke_alerts",
      label: `Smoke alerts (${history.filter(
        (s) => alertCode(s) === "SMOKE_DETECTED"
      ).length})`,
    },
  ];

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.heading}>AI Monitoring History</h1>
          <p style={styles.subtitle}>
            Review saved object detection and fire/smoke image scans.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={loading}
          style={styles.refreshButton}
        >
          {loading ? "Loading..." : "Refresh History"}
        </button>
      </header>

      {error && (
        <div role="alert" style={styles.error}>
          {error}
          {error.toLowerCase().includes("log in") && (
            <p>Sign in again, then reopen AI Monitoring History.</p>
          )}
        </div>
      )}

      <section style={styles.stats}>
        <Stat label="Total scans" value={stats.totalScans} />
        <Stat label="Objects detected" value={stats.totalObjects} />
        <Stat label="Fire/smoke scans" value={stats.fireSmokeScans} />
        <Stat
          label="Fire/smoke detections"
          value={stats.fireSmokeDetections}
        />
        <Stat label="Fire alerts" value={stats.fireAlerts} danger />
        <Stat label="Smoke alerts" value={stats.smokeAlerts} warning />
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionHeading}>Previous Scans</h2>

        <div style={styles.filters}>
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              style={
                filter === item.id
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading && history.length === 0 ? (
          <p>Loading AI monitoring history...</p>
        ) : filteredHistory.length === 0 ? (
          <p>
            {history.length === 0
              ? "No scans have been saved yet. Run AI detection first."
              : "No scans match this filter."}
          </p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.cell}>Date and time</th>
                  <th style={styles.cell}>Scan type</th>
                  <th style={styles.cell}>Scanned by</th>
                  <th style={styles.cell}>Image size</th>
                  <th style={styles.cell}>Detections</th>
                  <th style={styles.cell}>Alert / status</th>
                  <th style={styles.cell}>Details</th>
                </tr>
              </thead>

              <tbody>
                {filteredHistory.map((scan, index) => {
                  const id = String(scan.id ?? scan._id ?? index);
                  const type = scanType(scan);
                  const expanded = expandedId === id;
                  const scanDetections = detections(scan);

                  return (
                    <ScanRow
                      key={id}
                      scan={scan}
                      id={id}
                      type={type}
                      expanded={expanded}
                      onToggle={() =>
                        setExpandedId(expanded ? null : id)
                      }
                      alertLabel={alertLabel}
                      alertStyle={alertStyle}
                      formatDate={formatDate}
                      confidence={confidence}
                      detections={scanDetections}
                      count={detectionCount(scan)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={styles.note}>
          Summary cards use the totals returned by the backend. The table
          shows the scans included in the history response, which may be
          limited to recent records. These are uploaded-image checks, not
          continuous CCTV monitoring. A negative model result does not
          guarantee that an area is safe.
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value, danger = false, warning = false }) {
  return (
    <div style={styles.statCard}>
      <span style={styles.statLabel}>{label}</span>
      <strong
        style={{
          ...styles.statValue,
          ...(danger ? { color: "#b91c1c" } : {}),
          ...(warning ? { color: "#c2410c" } : {}),
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function ScanRow({
  scan,
  id,
  type,
  expanded,
  onToggle,
  alertLabel,
  alertStyle,
  formatDate,
  confidence,
  detections,
  count,
}) {
  return (
    <>
      <tr>
        <td style={styles.cell}>{formatDate(scan.created_at)}</td>

        <td style={styles.cell}>
          <span style={type === "fire_smoke" ? styles.fireType : styles.objectType}>
            {type === "fire_smoke" ? "Fire & Smoke" : "Object Detection"}
          </span>
        </td>

        <td style={styles.cell}>
          {scan.user_role || "Unknown"}
          <div style={styles.smallText}>
            ID: {scan.user_id ?? "Unavailable"}
          </div>
        </td>

        <td style={styles.cell}>
          {scan.image_width ?? "?"} × {scan.image_height ?? "?"}
        </td>

        <td style={styles.cell}>
          <strong>{count}</strong>
        </td>

        <td style={styles.cell}>
          <span style={alertStyle(scan)}>{alertLabel(scan)}</span>
        </td>

        <td style={styles.cell}>
          <button
            type="button"
            style={styles.detailsButton}
            onClick={onToggle}
          >
            {expanded ? "Hide Details" : "View Details"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} style={styles.detailsCell}>
            <h3 style={styles.detailsHeading}>Scan Details</h3>

            <p>
              <strong>Scan ID:</strong> {String(scan.id ?? scan._id ?? id)}
            </p>

            {scan.alert_level && (
              <p>
                <strong>Alert code:</strong> {scan.alert_level}
              </p>
            )}

            {scan.image_width != null && scan.image_height != null && (
              <p>
                <strong>Image dimensions:</strong> {scan.image_width} ×{" "}
                {scan.image_height}
              </p>
            )}

            {detections.length === 0 ? (
              <p>No detections were recorded for this scan.</p>
            ) : (
              <div style={styles.tableWrapper}>
                <table style={styles.innerTable}>
                  <thead>
                    <tr>
                      <th style={styles.cell}>Detected class</th>
                      <th style={styles.cell}>Confidence</th>
                      <th style={styles.cell}>Bounding box</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detections.map((item, index) => {
                      const box = item.box ?? item.bbox ?? item.xyxy;

                      return (
                        <tr key={`${id}-detection-${index}`}>
                          <td style={styles.cell}>
                            {item.label ??
                              item.class_name ??
                              item.name ??
                              "Unknown"}
                          </td>
                          <td style={styles.cell}>
                            {confidence(item.confidence)}
                          </td>
                          <td style={styles.cell}>
                            {Array.isArray(box)
                              ? box
                                  .map((value) =>
                                    Number.isFinite(Number(value))
                                      ? Math.round(Number(value))
                                      : value
                                  )
                                  .join(", ")
                              : "Unavailable"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const styles = {
  page: {
    maxWidth: "1400px",
    margin: "30px auto",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
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
  heading: { marginBottom: "8px" },
  subtitle: { color: "#6b7280", margin: 0 },
  refreshButton: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "11px 16px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  statCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "22px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  statLabel: { color: "#6b7280", fontSize: "14px" },
  statValue: { fontSize: "30px" },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "24px",
  },
  sectionHeading: { marginTop: 0 },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "20px",
  },
  filterButton: {
    background: "#fff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    padding: "9px 12px",
    cursor: "pointer",
  },
  activeFilter: {
    background: "#1d4ed8",
    color: "#fff",
    border: "1px solid #1d4ed8",
    borderRadius: "7px",
    padding: "9px 12px",
    cursor: "pointer",
  },
  tableWrapper: { width: "100%", overflowX: "auto" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
    minWidth: "950px",
  },
  innerTable: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  cell: {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
  },
  objectType: {
    display: "inline-block",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "5px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "bold",
  },
  fireType: {
    display: "inline-block",
    background: "#fff7ed",
    color: "#c2410c",
    padding: "5px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "bold",
  },
  fireAlert: {
    display: "inline-block",
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "5px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "bold",
  },
  smokeAlert: {
    display: "inline-block",
    background: "#ffedd5",
    color: "#9a3412",
    padding: "5px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "bold",
  },
  safeAlert: {
    display: "inline-block",
    background: "#dcfce7",
    color: "#166534",
    padding: "5px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "bold",
  },
  neutralAlert: {
    display: "inline-block",
    background: "#f3f4f6",
    color: "#374151",
    padding: "5px 8px",
    borderRadius: "6px",
    fontSize: "12px",
  },
  detailsCell: {
    padding: "18px",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
  },
  detailsHeading: { marginTop: 0 },
  detailsButton: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "6px",
    padding: "7px 10px",
    cursor: "pointer",
  },
  smallText: {
    marginTop: "5px",
    color: "#6b7280",
    fontSize: "12px",
    overflowWrap: "anywhere",
  },
  error: {
    color: "#b91c1c",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "20px",
  },
  note: { marginTop: "18px", fontSize: "13px", color: "#6b7280" },
};
