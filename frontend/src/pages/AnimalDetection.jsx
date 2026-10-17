
import { useCallback, useEffect, useState } from "react";

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api"
).replace(/\/$/, "");

export default function AnimalDetection() {
  const [file, setFile] = useState(null);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verification, setVerification] = useState({});
  const [notes, setNotes] = useState({});

  const token = localStorage.getItem("token");

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
  }, []);

  const loadDetections = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await request("/animals");
      setDetections(data.detections || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (token) loadDetections();
  }, [token, loadDetections]);

  async function handleDetect(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!file) {
      setError("Please select an image first.");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setDetecting(true);

    try {
      const data = await request("/animals/detect", {
        method: "POST",
        body: formData,
      });

      setMessage(data.message || "Detection completed.");
      setFile(null);
      event.target.reset();
      await loadDetections();
    } catch (err) {
      setError(err.message);
    } finally {
      setDetecting(false);
    }
  }

  async function handleVerify(id) {
    setError("");
    setMessage("");

    const status = verification[id] || "UNCONFIRMED";

    try {
      const data = await request(`/animals/${id}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_status: status,
          verification_note: notes[id] || "",
        }),
      });

      setMessage(data.message || "Verification updated.");
      await loadDetections();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Stray-Animal Detection</h1>
          <p style={styles.subtitle}>
            Detect cats and dogs, review sightings, and record verification.
          </p>
        </div>

        <button
          type="button"
          style={styles.secondaryButton}
          onClick={loadDetections}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh History"}
        </button>
      </div>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Upload an Image</h2>
        <p style={styles.help}>
          Select a JPG or PNG image containing a cat or dog. Maximum size: 10 MB.
        </p>

        <form onSubmit={handleDetect}>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            style={styles.fileInput}
          />

          {file && (
            <p style={styles.help}>Selected: {file.name}</p>
          )}

          <button
            type="submit"
            style={styles.primaryButton}
            disabled={detecting}
          >
            {detecting ? "Detecting..." : "Detect Animals"}
          </button>
        </form>
      </section>

      {error && (
        <div role="alert" style={styles.error}>
          {error}
        </div>
      )}

      {message && (
        <div role="status" style={styles.success}>
          {message}
        </div>
      )}

      <section style={styles.card}>
        <div style={styles.historyHeader}>
          <h2 style={styles.sectionTitle}>Detection History</h2>
          <span style={styles.count}>
            {detections.length} record(s)
          </span>
        </div>

        {loading && detections.length === 0 ? (
          <p>Loading detections...</p>
        ) : detections.length === 0 ? (
          <p style={styles.help}>
            No animal detections yet. Upload an image to get started.
          </p>
        ) : (
          <div style={styles.list}>
            {detections.map((item) => (
              <article key={item.id} style={styles.record}>
                <div style={styles.recordTop}>
                  <div>
                    <h3 style={styles.animalName}>
                      {item.animal === "cat" ? "🐈" : "🐕"}{" "}
                      {item.animal?.toUpperCase()}
                    </h3>
                    <p style={styles.help}>
                      Confidence:{" "}
                      {typeof item.confidence === "number"
                        ? `${(item.confidence * 100).toFixed(2)}%`
                        : "N/A"}
                    </p>
                    <p style={styles.help}>
                      Image: {item.image_name || "Unknown"}
                    </p>
                    <p style={styles.help}>
                      Detected:{" "}
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString()
                        : "Unknown"}
                    </p>
                  </div>

                  <span style={styles.status}>
                    {item.verification_status || "UNCONFIRMED"}
                  </span>
                </div>

                {item.bounding_box && (
                  <p style={styles.help}>
                    Bounding box: x1={item.bounding_box.x1},{" "}
                    y1={item.bounding_box.y1}, x2={item.bounding_box.x2},{" "}
                    y2={item.bounding_box.y2}
                  </p>
                )}

                {item.verification_note && (
                  <p style={styles.note}>
                    Note: {item.verification_note}
                  </p>
                )}

                <div style={styles.verifyArea}>
                  <label style={styles.label}>
                    Verification status
                    <select
                      value={
                        verification[item.id] ??
                        item.verification_status ??
                        "UNCONFIRMED"
                      }
                      onChange={(event) =>
                        setVerification((previous) => ({
                          ...previous,
                          [item.id]: event.target.value,
                        }))
                      }
                      style={styles.select}
                    >
                      <option value="STRAY">Stray</option>
                      <option value="PET">Pet</option>
                      <option value="UNCONFIRMED">Unconfirmed</option>
                    </select>
                  </label>

                  <label style={styles.label}>
                    Verification note
                    <input
                      type="text"
                      maxLength={500}
                      placeholder="Optional observation"
                      value={notes[item.id] ?? item.verification_note ?? ""}
                      onChange={(event) =>
                        setNotes((previous) => ({
                          ...previous,
                          [item.id]: event.target.value,
                        }))
                      }
                      style={styles.textInput}
                    />
                  </label>

                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => handleVerify(item.id)}
                  >
                    Save Verification
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "28px 18px",
    color: "#1f2937",
    fontFamily: "Arial, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 24,
  },
  heading: { margin: "0 0 8px", fontSize: 28 },
  subtitle: { margin: 0, color: "#64748b" },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 22,
    marginBottom: 22,
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  },
  sectionTitle: { margin: "0 0 12px", fontSize: 20 },
  help: { color: "#64748b", fontSize: 14, overflowWrap: "anywhere" },
  fileInput: { display: "block", margin: "18px 0" },
  primaryButton: {
    background: "#2563eb",
    color: "#fff",
    border: 0,
    borderRadius: 7,
    padding: "10px 16px",
    cursor: "pointer",
    marginTop: 8,
  },
  secondaryButton: {
    background: "#fff",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: 7,
    padding: "10px 14px",
    cursor: "pointer",
  },
  error: {
    background: "#fef2f2",
    color: "#b91c1c",
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  success: {
    background: "#f0fdf4",
    color: "#166534",
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  historyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  count: {
    background: "#f1f5f9",
    padding: "5px 10px",
    borderRadius: 20,
    fontSize: 13,
  },
  list: { display: "grid", gap: 16 },
  record: {
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 16,
    minWidth: 0,
  },
  recordTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  animalName: { margin: "0 0 8px", fontSize: 18 },
  status: {
    background: "#fef3c7",
    color: "#92400e",
    padding: "6px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: "bold",
  },
  note: { color: "#334155", fontSize: 14 },
  verifyArea: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    marginTop: 16,
    alignItems: "end",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    fontSize: 13,
    fontWeight: "bold",
  },
  select: {
    width: "100%",
    padding: 10,
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    background: "#fff",
  },
  textInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: 10,
    border: "1px solid #cbd5e1",
    borderRadius: 6,
  },
};
