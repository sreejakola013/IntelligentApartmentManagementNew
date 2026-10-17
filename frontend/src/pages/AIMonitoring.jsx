
import { useEffect, useState } from "react";

export default function AIMonitoring() {
  const [mode, setMode] = useState("objects");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  function handleImageChange(event) {
    const file = event.target.files?.[0];

    setResult(null);
    setError("");
    setImage(null);
    setPreview("");

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/bmp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Please select a JPG, PNG, or BMP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Please select an image smaller than 10 MB.");
      event.target.value = "";
      return;
    }

    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  function handleModeChange(newMode) {
    setMode(newMode);
    setResult(null);
    setError("");
  }

  async function handleDetect() {
    if (!image) {
      setError("Please select an image first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", image);

      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("Please log in again before running detection.");
      }

      const apiBase =
        import.meta.env.VITE_API_URL ||
        "http://127.0.0.1:5000/api";

      const endpoint =
        mode === "fire"
          ? "/ai/fire-smoke-detect"
          : "/ai/detect";

      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "AI detection failed.");
      }

      setResult(data);
    } catch (err) {
      setError(err.message || "Unable to connect to the AI service.");
    } finally {
      setLoading(false);
    }
  }

  const fireDetected =
    result?.alert_level === "FIRE_DETECTED";

  const smokeDetected =
    result?.alert_level === "SMOKE_DETECTED";

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1>AI Safety Monitoring</h1>
        <p>
          Analyze uploaded images for supported objects or possible
          fire and smoke.
        </p>
      </header>

      <section style={styles.card}>
        <h2>Choose Detection Type</h2>

        <div style={styles.modeButtons}>
          <button
            type="button"
            onClick={() => handleModeChange("objects")}
            disabled={loading}
            style={{
              ...styles.modeButton,
              ...(mode === "objects" ? styles.selectedMode : {}),
            }}
          >
            Object Detection
          </button>

          <button
            type="button"
            onClick={() => handleModeChange("fire")}
            disabled={loading}
            style={{
              ...styles.modeButton,
              ...(mode === "fire" ? styles.selectedFireMode : {}),
            }}
          >
            Fire & Smoke Detection
          </button>
        </div>

        <p style={styles.note}>
          {mode === "fire"
            ? "Uses the separate fire/smoke model. Results are estimates, not proof that an area is safe."
            : "Uses your existing yolov8n.pt object-detection model."}
        </p>

        <label htmlFor="ai-image" style={styles.label}>
          Select an image
        </label>

        <input
          id="ai-image"
          type="file"
          accept="image/jpeg,image/png,image/bmp"
          onChange={handleImageChange}
          disabled={loading}
        />

        {preview && (
          <div style={styles.imageSection}>
            <h3>Original Image</h3>
            <img
              src={preview}
              alt="Selected image"
              style={styles.image}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleDetect}
          disabled={!image || loading}
          style={{
            ...styles.button,
            opacity: !image || loading ? 0.6 : 1,
            cursor: !image || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading
            ? "Analyzing image..."
            : mode === "fire"
              ? "Detect Fire & Smoke"
              : "Run Object Detection"}
        </button>

        {error && (
          <p role="alert" style={styles.error}>
            {error}
          </p>
        )}
      </section>

      {result && (
        <section style={styles.card}>
          <h2>Detection Results</h2>

          {mode === "fire" && (
            <div
              role="status"
              style={{
                ...styles.alert,
                ...(fireDetected || smokeDetected
                  ? styles.dangerAlert
                  : styles.safeAlert),
              }}
            >
              <strong>
                {fireDetected
                  ? "WARNING: Possible fire detected"
                  : smokeDetected
                    ? "WARNING: Possible smoke detected"
                    : "No fire or smoke detected by the model"}
              </strong>
              <p>
                {fireDetected || smokeDetected
                  ? "Verify immediately using established safety procedures. If danger is present, alert emergency services and follow your building's fire-safety plan."
                  : "The model may miss hazards. Do not use this result to rule out a fire."}
              </p>
            </div>
          )}

          <div style={styles.stats}>
            <div style={styles.stat}>
              <strong>{result.count ?? result.detections?.length ?? 0}</strong>
              <span>
                {mode === "fire" ? "Fire/smoke detections" : "Objects detected"}
              </span>
            </div>

            <div style={styles.stat}>
              <strong>
                {result.image_width} × {result.image_height}
              </strong>
              <span>Image dimensions</span>
            </div>
          </div>

          {result.annotated_image && (
            <div style={styles.imageSection}>
              <h3>Annotated Image</h3>
              <img
                src={result.annotated_image}
                alt="AI annotated detection results"
                style={styles.image}
              />
            </div>
          )}

          {!result.detections?.length ? (
            <p>No supported detections were returned.</p>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.cell}>Label</th>
                    <th style={styles.cell}>Confidence</th>
                    <th style={styles.cell}>Bounding box (x1, y1, x2, y2)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.detections.map((detection, index) => (
                    <tr key={`${detection.label}-${index}`}>
                      <td style={styles.cell}>{detection.label}</td>
                      <td style={styles.cell}>
                        {(detection.confidence * 100).toFixed(1)}%
                      </td>
                      <td style={styles.cell}>
                        {detection.box
                          .map((value) => Math.round(value))
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.history_id && (
            <p style={styles.note}>
              Scan saved. History ID: {result.history_id}
            </p>
          )}

          <p style={styles.note}>
            This feature analyzes uploaded images, not continuous live CCTV.
            AI results can be incorrect; use established safety procedures.
          </p>
        </section>
      )}
    </main>
  );
}

const styles = {
  page: {
    maxWidth: "1000px",
    margin: "30px auto",
    padding: "20px",
    color: "#1f2937",
    fontFamily: "Arial, sans-serif",
  },
  header: { marginBottom: "24px" },
  card: {
    background: "#ffffff",
    padding: "24px",
    marginBottom: "24px",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 3px 12px rgba(0,0,0,0.05)",
  },
  modeButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    margin: "16px 0",
  },
  modeButton: {
    padding: "11px 16px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "#f9fafb",
    color: "#1f2937",
    cursor: "pointer",
    fontWeight: "bold",
  },
  selectedMode: {
    background: "#dbeafe",
    border: "1px solid #2563eb",
  },
  selectedFireMode: {
    background: "#ffedd5",
    border: "1px solid #ea580c",
  },
  label: {
    display: "block",
    fontWeight: "bold",
    marginTop: "20px",
    marginBottom: "12px",
  },
  imageSection: { marginTop: "24px" },
  image: {
    display: "block",
    width: "100%",
    maxWidth: "800px",
    maxHeight: "520px",
    objectFit: "contain",
    objectPosition: "left top",
    marginTop: "12px",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  button: {
    marginTop: "20px",
    padding: "12px 20px",
    background: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  error: { color: "#b91c1c", marginTop: "16px" },
  alert: {
    padding: "16px",
    margin: "16px 0",
    borderRadius: "8px",
    border: "1px solid",
  },
  dangerAlert: {
    color: "#991b1b",
    background: "#fef2f2",
    borderColor: "#fca5a5",
  },
  safeAlert: {
    color: "#166534",
    background: "#f0fdf4",
    borderColor: "#86efac",
  },
  stats: {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    margin: "20px 0",
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "16px",
    background: "#f3f4f6",
    borderRadius: "8px",
    minWidth: "150px",
  },
  tableWrapper: { width: "100%", overflowX: "auto", marginTop: "20px" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  cell: {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
  },
  note: { marginTop: "12px", fontSize: "14px", color: "#6b7280" },
};
