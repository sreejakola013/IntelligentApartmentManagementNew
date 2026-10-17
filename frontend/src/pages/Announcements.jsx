
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../services/api";
import "./Announcements.css";

const getToken = () =>
  localStorage.getItem("token") ||
  localStorage.getItem("access_token") ||
  localStorage.getItem("accessToken");

const getRole = () => {
  try {
    return (
      JSON.parse(localStorage.getItem("user") || "{}").role || ""
    ).toUpperCase();
  } catch {
    return "";
  }
};

const categories = [
  "GENERAL",
  "MAINTENANCE",
  "WATER_SUPPLY",
  "MEETING",
  "EVENT",
  "EMERGENCY",
];

function Announcements() {
  const role = getRole();
  const isAdmin = role === "ADMIN";

  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadAnnouncements = useCallback(async () => {
    const token = getToken();

    if (!token) {
      setError("Login token not found. Please log in again.");
      setLoading(false);
      return;
    }

    try {
      const data = await apiRequest("/announcements", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setAnnouncements(data.announcements || []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load announcements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();

    const timer = setInterval(loadAnnouncements, 15000);
    return () => clearInterval(timer);
  }, [loadAnnouncements]);

  const handlePublish = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const token = getToken();

      if (!token) {
        throw new Error("Please log in again.");
      }

      const result = await apiRequest("/announcements", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
        }),
      });

      setMessage(result.message || "Announcement published successfully.");
      setTitle("");
      setDescription("");
      setCategory("GENERAL");

      await loadAnnouncements();
    } catch (err) {
      setError(err.message || "Could not publish announcement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (announcementId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this announcement?"
      )
    ) {
      return;
    }

    setDeletingId(announcementId);
    setError("");
    setMessage("");

    try {
      const token = getToken();

      if (!token) {
        throw new Error("Please log in again.");
      }

      const result = await apiRequest(
        `/announcements/${announcementId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessage(result.message || "Announcement deleted successfully.");
      await loadAnnouncements();
    } catch (err) {
      setError(err.message || "Could not delete announcement.");
    } finally {
      setDeletingId("");
    }
  };

  const formatDate = (value) => {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString();
  };

  const getCategoryClass = (value) => {
    const normalized = String(value || "GENERAL").toLowerCase();

    return `announcement-category announcement-category-${normalized.replace(
      /[^a-z0-9-]/g,
      "-"
    )}`;
  };

  const filteredAnnouncements = announcements.filter((item) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      !query ||
      [
        item.title,
        item.description,
        item.category,
        item.created_by,
      ].some((value) =>
        String(value || "").toLowerCase().includes(query)
      );

    const matchesCategory =
      categoryFilter === "ALL" ||
      String(item.category || "GENERAL").toUpperCase() ===
        categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const emergencyCount = announcements.filter(
    (item) => item.category === "EMERGENCY"
  ).length;

  return (
    <main className="announcements-page">
      <header className="announcements-topbar">
        <Link to="/dashboard" className="announcements-brand">
          <span className="announcements-brand-icon">🏢</span>
          ApartmentIQ
        </Link>

        <Link to="/dashboard" className="announcements-back-button">
          ← Back to Dashboard
        </Link>
      </header>

      <div className="announcements-content">
        <section className="announcements-heading">
          <div>
            <span className="announcements-eyebrow">
              COMMUNITY UPDATES
            </span>
            <h1>Apartment Announcements</h1>
            <p>
              Stay informed about maintenance, events, meetings, and
              important apartment updates.
            </p>
          </div>

          <button
            type="button"
            className="announcements-refresh-button"
            onClick={loadAnnouncements}
            disabled={loading}
          >
            ↻ {loading ? "Loading..." : "Refresh"}
          </button>
        </section>

        <section className="announcements-stats">
          <article className="announcement-stat-card">
            <span className="announcement-stat-icon">📢</span>
            <div>
              <p>Total Announcements</p>
              <h2>{announcements.length}</h2>
            </div>
          </article>

          <article className="announcement-stat-card">
            <span className="announcement-stat-icon">🚨</span>
            <div>
              <p>Emergency Notices</p>
              <h2>{emergencyCount}</h2>
            </div>
          </article>

          <article className="announcement-stat-card">
            <span className="announcement-stat-icon">🗓️</span>
            <div>
              <p>Categories</p>
              <h2>
                {
                  new Set(
                    announcements.map(
                      (item) => item.category || "GENERAL"
                    )
                  ).size
                }
              </h2>
            </div>
          </article>
        </section>

        {error && (
          <div className="announcement-alert announcement-alert-error" role="alert">
            <span>⚠️</span>
            <p>{error}</p>
            <button type="button" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        {message && (
          <div
            className="announcement-alert announcement-alert-success"
            role="status"
          >
            <span>✓</span>
            <p>{message}</p>
            <button type="button" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}

        {isAdmin && (
          <section className="announcements-panel">
            <div className="announcements-panel-heading">
              <span className="announcement-compose-icon">＋</span>
              <div>
                <h2>Publish an Announcement</h2>
                <p>
                  Share important information with apartment residents.
                </p>
              </div>
            </div>

            <form onSubmit={handlePublish}>
              <div className="announcement-form-grid">
                <div className="announcement-field announcement-field-full">
                  <label htmlFor="announcement-title">
                    Announcement Title *
                  </label>
                  <input
                    id="announcement-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={150}
                    placeholder="e.g. Water Supply Maintenance"
                    required
                  />
                </div>

                <div className="announcement-field">
                  <label htmlFor="announcement-category">Category *</label>
                  <select
                    id="announcement-category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    required
                  >
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="announcement-field announcement-field-full">
                  <label htmlFor="announcement-description">
                    Description *
                  </label>
                  <textarea
                    id="announcement-description"
                    rows={5}
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    maxLength={3000}
                    placeholder="Enter the full announcement details..."
                    required
                  />
                  <span className="announcement-field-hint">
                    {description.length}/3000 characters
                  </span>
                </div>
              </div>

              <div className="announcement-form-footer">
                <p>Fields marked * are required.</p>
                <button
                  type="submit"
                  className="announcement-publish-button"
                  disabled={saving}
                >
                  {saving ? "Publishing..." : "📢 Publish Announcement"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="announcements-panel">
          <div className="announcements-list-heading">
            <div>
              <h2>Latest Announcements</h2>
              <p>Browse the latest news and community notices.</p>
            </div>

            <span className="announcements-count">
              {filteredAnnouncements.length} shown
            </span>
          </div>

          <div className="announcements-filters">
            <div className="announcements-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="Search announcements"
                placeholder="Search announcements..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select
              className="announcements-category-filter"
              aria-label="Filter by announcement category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="ALL">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="announcements-empty-state">
              <span>⏳</span>
              <h3>Loading announcements...</h3>
              <p>Please wait while we retrieve the latest updates.</p>
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="announcements-empty-state">
              <span>📭</span>
              <h3>
                {announcements.length === 0
                  ? "No announcements yet"
                  : "No matching announcements"}
              </h3>
              <p>
                {announcements.length === 0
                  ? "New community updates will appear here when published."
                  : "Try another search term or category."}
              </p>

              {(search || categoryFilter !== "ALL") && (
                <button
                  type="button"
                  className="announcement-clear-button"
                  onClick={() => {
                    setSearch("");
                    setCategoryFilter("ALL");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="announcements-grid">
              {filteredAnnouncements.map((item) => (
                <article className="announcement-card" key={item.id}>
                  <div className="announcement-card-top">
                    <span className={getCategoryClass(item.category)}>
                      {String(item.category || "GENERAL").replaceAll(
                        "_",
                        " "
                      )}
                    </span>

                    {isAdmin && (
                      <button
                        type="button"
                        className="announcement-delete-button"
                        disabled={deletingId === item.id}
                        onClick={() => handleDelete(item.id)}
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </div>

                  <h3>{item.title}</h3>

                  <p className="announcement-description">
                    {item.description}
                  </p>

                  <div className="announcement-card-footer">
                    <div className="announcement-author">
                      <span className="announcement-author-icon">👤</span>
                      <div>
                        <span>Published by</span>
                        <strong>{item.created_by || "Admin"}</strong>
                      </div>
                    </div>

                    <div className="announcement-date">
                      <span>🕒</span>
                      {formatDate(item.created_at)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="announcements-footer">
          <Link to="/dashboard">← Back to Dashboard</Link>
          <span>ApartmentIQ · Community Updates</span>
        </footer>
      </div>
    </main>
  );
}

export default Announcements;
