
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

export default function Notifications() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async (showLoading = false) => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    if (showLoading) setLoading(true);

    try {
      const result = await apiRequest("/notifications", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setNotifications(result.notifications || []);
      setUnreadCount(result.unread_count || 0);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    loadNotifications(true);
  }, [token, navigate, loadNotifications]);

  useEffect(() => {
    if (!token) return;

    const intervalId = setInterval(() => {
      loadNotifications(false);
    }, 15000);

    return () => clearInterval(intervalId);
  }, [token, loadNotifications]);

  async function markAsRead(notification) {
    if (notification.is_read) return;

    setUpdatingId(notification.id);
    setError("");

    try {
      const result = await apiRequest(
        `/notifications/${notification.id}/read`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notification.id
            ? { ...item, is_read: true }
            : item
        )
      );

      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      setError(err.message || "Unable to mark notification as read.");
    } finally {
      setUpdatingId("");
    }
  }

  async function markAllAsRead() {
    if (unreadCount === 0) return;

    setMarkingAll(true);
    setError("");

    try {
      await apiRequest("/notifications/read-all", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setNotifications((previous) =>
        previous.map((item) => ({ ...item, is_read: true }))
      );

      setUnreadCount(0);
    } catch (err) {
      setError(err.message || "Unable to mark all as read.");
    } finally {
      setMarkingAll(false);
    }
  }

  function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Date unavailable";

    return date.toLocaleString();
  }

  function getIcon(category) {
    switch (category) {
      case "COMPLAINT":
        return "📝";
      case "MAINTENANCE_TASK":
        return "🔧";
      case "SECURITY":
        return "🚨";
      default:
        return "🔔";
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
        <div className="welcome-panel">
          <p className="eyebrow">APARTMENT UPDATES</p>
          <h1>Notifications 🔔</h1>
          <p>View your complaint updates, task assignments, and other alerts.</p>

          <span className="role-pill">
            {unreadCount} unread
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            margin: "24px 0",
          }}
        >
          <h2>Your Notifications</h2>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              className="primary-link"
              onClick={() => loadNotifications(true)}
              disabled={loading}
            >
              Refresh
            </button>

            <button
              className="primary-link"
              onClick={markAllAsRead}
              disabled={markingAll || unreadCount === 0}
            >
              {markingAll ? "Updating..." : "Mark All as Read"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}

        {loading ? (
          <p>Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <article className="module-card">
            <div className="module-icon">🔔</div>
            <h3>No notifications yet</h3>
            <p>New updates will appear here when an event occurs.</p>
          </article>
        ) : (
          <div className="module-grid">
            {notifications.map((notification) => (
              <article
                className="module-card"
                key={notification.id}
                style={{
                  border: notification.is_read
                    ? undefined
                    : "1px solid #64748b",
                }}
              >
                <div className="module-icon">
                  {getIcon(notification.category)}
                </div>

                <h3>{notification.title}</h3>

                <p>{notification.message}</p>

                <p>
                  <small>{formatDate(notification.created_at)}</small>
                </p>

                <p>
                  <strong>
                    {notification.is_read ? "Read" : "Unread"}
                  </strong>
                </p>

                {!notification.is_read && (
                  <button
                    className="primary-link"
                    onClick={() => markAsRead(notification)}
                    disabled={updatingId === notification.id}
                  >
                    {updatingId === notification.id
                      ? "Updating..."
                      : "Mark as Read"}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
