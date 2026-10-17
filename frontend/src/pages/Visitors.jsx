
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../services/api";
import "./Visitors.css";

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

const initialForm = {
  visitor_name: "",
  phone: "",
  purpose: "",
  expected_at: "",
  resident_id: "",
};

function Visitors() {
  const role = getRole();
  const isResident = role === "RESIDENT";
  const canRegister = isResident || role === "ADMIN";
  const canManage = role === "ADMIN" || role === "SECURITY";

  const [visitors, setVisitors] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const loadVisitors = useCallback(async () => {
    const token = getToken();

    if (!token) {
      setError("Login token not found. Please log in again.");
      setLoading(false);
      return;
    }

    try {
      const suffix = filter === "ALL" ? "" : `?status=${filter}`;

      const data = await apiRequest(`/visitors${suffix}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setVisitors(data.visitors || []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load visitors.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadVisitors();

    const timer = setInterval(loadVisitors, 15000);
    return () => clearInterval(timer);
  }, [loadVisitors]);

  const updateForm = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const registerVisitor = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const token = getToken();

      if (!token) {
        throw new Error("Please log in again.");
      }

      const expectedDate = new Date(form.expected_at);

      if (Number.isNaN(expectedDate.getTime())) {
        throw new Error("Please select a valid expected date and time.");
      }

      const payload = {
        visitor_name: form.visitor_name.trim(),
        phone: form.phone.trim(),
        purpose: form.purpose.trim(),
        expected_at: expectedDate.toISOString(),
      };

      if (role === "ADMIN" && form.resident_id.trim()) {
        payload.resident_id = form.resident_id.trim();
      }

      const result = await apiRequest("/visitors", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      setMessage(result.message || "Visitor registered successfully.");
      setForm(initialForm);
      await loadVisitors();
    } catch (err) {
      setError(err.message || "Visitor registration failed.");
    } finally {
      setSaving(false);
    }
  };

  const updateVisitorStatus = async (visitorId, action) => {
    setError("");
    setMessage("");
    setUpdatingId(visitorId);

    try {
      const token = getToken();

      if (!token) {
        throw new Error("Please log in again.");
      }

      const result = await apiRequest(
        `/visitors/${visitorId}/${action}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessage(result.message || "Visitor status updated.");
      await loadVisitors();
    } catch (err) {
      setError(err.message || "Could not update visitor status.");
    } finally {
      setUpdatingId("");
    }
  };

  const formatDate = (value) => {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString();
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "CHECKED_IN":
        return "visitor-status visitor-status-in";
      case "CHECKED_OUT":
        return "visitor-status visitor-status-out";
      default:
        return "visitor-status visitor-status-expected";
    }
  };

  const filteredVisitors = visitors.filter((visitor) => {
    const query = search.trim().toLowerCase();

    if (!query) return true;

    return [
      visitor.visitor_name,
      visitor.phone,
      visitor.purpose,
      visitor.resident_name,
      visitor.status,
    ].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });

  const checkedInCount = visitors.filter(
    (visitor) => visitor.status === "CHECKED_IN"
  ).length;

  const expectedCount = visitors.filter(
    (visitor) => visitor.status === "EXPECTED"
  ).length;

  const checkedOutCount = visitors.filter(
    (visitor) => visitor.status === "CHECKED_OUT"
  ).length;

  return (
    <main className="visitors-page">
      <header className="visitors-topbar">
        <Link to="/dashboard" className="visitors-brand">
          <span className="visitors-brand-icon">🏢</span>
          ApartmentIQ
        </Link>

        <Link to="/dashboard" className="visitors-back-button">
          ← Back to Dashboard
        </Link>
      </header>

      <div className="visitors-content">
        <section className="visitors-heading">
          <div>
            <span className="visitors-eyebrow">SECURITY & ACCESS</span>
            <h1>Visitor Management</h1>
            <p>
              Register expected visitors, monitor apartment entry,
              and keep track of completed visits.
            </p>
          </div>

          <button
            type="button"
            className="visitors-refresh-button"
            onClick={loadVisitors}
            disabled={loading}
          >
            ↻ {loading ? "Loading..." : "Refresh"}
          </button>
        </section>

        <section className="visitors-stats">
          <article className="visitor-stat-card">
            <span className="visitor-stat-icon visitor-icon-blue">👥</span>
            <div>
              <p>Total Records</p>
              <h2>{visitors.length}</h2>
            </div>
          </article>

          <article className="visitor-stat-card">
            <span className="visitor-stat-icon visitor-icon-orange">🕒</span>
            <div>
              <p>Expected Visitors</p>
              <h2>{expectedCount}</h2>
            </div>
          </article>

          <article className="visitor-stat-card">
            <span className="visitor-stat-icon visitor-icon-green">✓</span>
            <div>
              <p>Currently Inside</p>
              <h2>{checkedInCount}</h2>
            </div>
          </article>

          <article className="visitor-stat-card">
            <span className="visitor-stat-icon visitor-icon-gray">↗</span>
            <div>
              <p>Checked Out</p>
              <h2>{checkedOutCount}</h2>
            </div>
          </article>
        </section>

        {error && (
          <div className="visitor-alert visitor-alert-error" role="alert">
            <span>⚠️</span>
            <p>{error}</p>
            <button type="button" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}

        {message && (
          <div className="visitor-alert visitor-alert-success" role="status">
            <span>✓</span>
            <p>{message}</p>
            <button type="button" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}

        {canRegister && (
          <section className="visitors-panel">
            <div className="visitors-panel-heading">
              <span className="visitor-compose-icon">＋</span>
              <div>
                <h2>Register an Expected Visitor</h2>
                <p>
                  Enter visitor details before their arrival.
                </p>
              </div>
            </div>

            <form onSubmit={registerVisitor}>
              <div className="visitor-form-grid">
                <div className="visitor-field">
                  <label htmlFor="visitor-name">Visitor Name *</label>
                  <input
                    id="visitor-name"
                    name="visitor_name"
                    value={form.visitor_name}
                    onChange={updateForm}
                    maxLength={100}
                    placeholder="Enter visitor's full name"
                    required
                  />
                </div>

                <div className="visitor-field">
                  <label htmlFor="visitor-phone">Phone Number *</label>
                  <input
                    id="visitor-phone"
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={updateForm}
                    maxLength={30}
                    placeholder="Enter contact number"
                    required
                  />
                </div>

                <div className="visitor-field">
                  <label htmlFor="visitor-purpose">Purpose of Visit *</label>
                  <input
                    id="visitor-purpose"
                    name="purpose"
                    value={form.purpose}
                    onChange={updateForm}
                    maxLength={300}
                    placeholder="e.g. Family visit, delivery"
                    required
                  />
                </div>

                <div className="visitor-field">
                  <label htmlFor="visitor-expected">
                    Expected Date and Time *
                  </label>
                  <input
                    id="visitor-expected"
                    type="datetime-local"
                    name="expected_at"
                    value={form.expected_at}
                    onChange={updateForm}
                    min={new Date(
                      Date.now() - new Date().getTimezoneOffset() * 60000
                    )
                      .toISOString()
                      .slice(0, 16)}
                    required
                  />
                </div>

                {role === "ADMIN" && (
                  <div className="visitor-field visitor-field-full">
                    <label htmlFor="visitor-resident">
                      Resident ID (optional)
                    </label>
                    <input
                      id="visitor-resident"
                      name="resident_id"
                      value={form.resident_id}
                      onChange={updateForm}
                      placeholder="Enter the resident's MongoDB user ID"
                    />
                    <small>
                      Enter a valid resident ID to associate this visitor
                      with that resident. If left blank, the record will
                      be associated according to your backend's default.
                    </small>
                  </div>
                )}
              </div>

              <div className="visitor-form-footer">
                <p>Fields marked * are required.</p>
                <button
                  type="submit"
                  className="visitor-primary-button"
                  disabled={saving}
                >
                  {saving ? "Registering..." : "＋ Register Visitor"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="visitors-panel">
          <div className="visitors-list-heading">
            <div>
              <h2>Visitor Records</h2>
              <p>Review visitor details and manage entry and exit.</p>
            </div>

            <span className="visitors-record-count">
              {filteredVisitors.length} record(s)
            </span>
          </div>

          <div className="visitors-filters">
            <div className="visitors-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="Search visitors"
                placeholder="Search name, phone, resident..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select
              aria-label="Filter visitors by status"
              className="visitors-status-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="ALL">All Visitors</option>
              <option value="EXPECTED">Expected</option>
              <option value="CHECKED_IN">Currently Inside</option>
              <option value="CHECKED_OUT">Checked Out</option>
            </select>
          </div>

          {loading ? (
            <div className="visitors-empty-state">
              <span>⏳</span>
              <h3>Loading visitor records...</h3>
              <p>Please wait while we retrieve the latest records.</p>
            </div>
          ) : filteredVisitors.length === 0 ? (
            <div className="visitors-empty-state">
              <span>👥</span>
              <h3>
                {visitors.length === 0
                  ? "No visitor records found"
                  : "No matching visitors"}
              </h3>
              <p>
                {visitors.length === 0
                  ? "Registered visitors will appear here."
                  : "Try another search or status filter."}
              </p>

              {(search || filter !== "ALL") && (
                <button
                  type="button"
                  className="visitor-clear-button"
                  onClick={() => {
                    setSearch("");
                    setFilter("ALL");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="visitors-table-wrap">
              <table className="visitors-table">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Contact</th>
                    <th>Resident</th>
                    <th>Expected At</th>
                    <th>Status</th>
                    <th>Entry / Exit</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredVisitors.map((visitor) => (
                    <tr key={visitor.id}>
                      <td>
                        <div className="visitor-name-cell">
                          <span className="visitor-avatar">👤</span>
                          <div>
                            <strong>{visitor.visitor_name}</strong>
                            <span>{visitor.purpose || "No purpose specified"}</span>
                          </div>
                        </div>
                      </td>

                      <td>{visitor.phone || "—"}</td>
                      <td>{visitor.resident_name || "—"}</td>
                      <td>{formatDate(visitor.expected_at)}</td>

                      <td>
                        <span className={getStatusClass(visitor.status)}>
                          {String(visitor.status || "EXPECTED").replaceAll(
                            "_",
                            " "
                          )}
                        </span>
                      </td>

                      <td>
                        <div className="visitor-action-cell">
                          {canManage && visitor.status === "EXPECTED" && (
                            <button
                              type="button"
                              className="visitor-action-button visitor-checkin-button"
                              disabled={updatingId === visitor.id}
                              onClick={() =>
                                updateVisitorStatus(visitor.id, "check-in")
                              }
                            >
                              {updatingId === visitor.id
                                ? "Updating..."
                                : "✓ Check In"}
                            </button>
                          )}

                          {canManage && visitor.status === "CHECKED_IN" && (
                            <button
                              type="button"
                              className="visitor-action-button visitor-checkout-button"
                              disabled={updatingId === visitor.id}
                              onClick={() =>
                                updateVisitorStatus(visitor.id, "check-out")
                              }
                            >
                              {updatingId === visitor.id
                                ? "Updating..."
                                : "↗ Check Out"}
                            </button>
                          )}

                          {visitor.status === "CHECKED_OUT" && (
                            <span className="visitor-completed">
                              ✓ Visit completed
                            </span>
                          )}

                          {!canManage && visitor.status !== "CHECKED_OUT" && (
                            <span className="visitor-no-action">View only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="visitors-footer">
          <Link to="/dashboard">← Back to Dashboard</Link>
          <span>ApartmentIQ · Visitor & Access Management</span>
        </footer>
      </div>
    </main>
  );
}

export default Visitors;
