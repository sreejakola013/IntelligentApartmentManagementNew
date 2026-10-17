
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();

  let storedUser = {};

  try {
    storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    storedUser = {};
  }

  const role = (
    storedUser.role ||
    localStorage.getItem("role") ||
    ""
  ).toUpperCase();

  const modules = {
    ADMIN: [
      {
        title: "Complaint Management",
        path: "/admin/complaints",
        icon: "📝",
        description: "Review complaints and manage their status.",
      },
      {
        title: "AI Detection",
        path: "/ai-monitoring",
        icon: "🤖",
        description: "Upload images and detect objects using AI.",
      },
      {
        title: "AI History",
        path: "/ai-history",
        icon: "📊",
        description: "Review previous AI detection results.",
      },
      {
        title: "Fire Alert Monitoring",
        path: "/fire-alerts",
        icon: "🚨",
        description:
          "Monitor fire and smoke alerts and track incident resolution.",
      },
      {
        title: "Stray-Animal Detection",
        path: "/animal-detection",
        icon: "🐕",
        description:
          "Detect cats and dogs, review sightings, and verify whether they are stray or pets.",
      },
      {
        title: "Task Assignment",
        path: "/admin/tasks",
        icon: "🛠️",
        description: "Assign maintenance work and track progress.",
      },
      {
        title: "Announcements",
        path: "/announcements",
        icon: "📢",
        description: "Publish and manage apartment announcements.",
      },
      {
        title: "Visitor Management",
        path: "/visitors",
        icon: "👥",
        description: "Manage visitor registrations and entry records.",
      },
      {
        title: "Dues Management",
        path: "/dues",
        icon: "💰",
        description: "Manage maintenance dues and payment status.",
      },
      {
        title: "User Management",
        path: "/admin/users",
        icon: "👤",
        description: "View registered users and manage accounts.",
      },
      {
        title: "Notifications",
        path: "/notifications",
        icon: "🔔",
        description: "View alerts and important updates.",
      },
    ],

    RESIDENT: [
      {
        title: "My Complaints",
        path: "/complaints",
        icon: "📝",
        description: "Submit and track your complaints.",
      },
      {
        title: "Maintenance Requests",
        path: "/complaints",
        icon: "🛠️",
        description: "View your maintenance-related requests.",
      },
      {
        title: "Announcements",
        path: "/announcements",
        icon: "📢",
        description: "Read apartment announcements.",
      },
      {
        title: "Visitors",
        path: "/visitors",
        icon: "👥",
        description: "Register expected visitors and view records.",
      },
      {
        title: "Maintenance Dues",
        path: "/dues",
        icon: "💰",
        description: "View your maintenance dues.",
      },
      {
        title: "Notifications",
        path: "/notifications",
        icon: "🔔",
        description: "View your latest notifications.",
      },
    ],

    SECURITY: [
      {
        title: "AI Detection",
        path: "/ai-monitoring",
        icon: "🤖",
        description: "Run AI-based image detection.",
      },
      {
        title: "AI History",
        path: "/ai-history",
        icon: "📊",
        description: "Review previous detection records.",
      },
      {
        title: "Fire Alert Monitoring",
        path: "/fire-alerts",
        icon: "🚨",
        description:
          "View fire and smoke alerts, acknowledge incidents, and mark them resolved.",
      },
      {
        title: "Stray-Animal Detection",
        path: "/animal-detection",
        icon: "🐕",
        description:
          "Detect cats and dogs, review sightings, and verify whether they are stray or pets.",
      },
      {
        title: "Visitor Management",
        path: "/visitors",
        icon: "👥",
        description: "Manage visitor check-in and check-out.",
      },
      {
        title: "Announcements",
        path: "/announcements",
        icon: "📢",
        description: "Read apartment announcements.",
      },
      {
        title: "Notifications",
        path: "/notifications",
        icon: "🔔",
        description: "View security-related updates.",
      },
    ],

    MAINTENANCE: [
      {
        title: "My Tasks",
        path: "/maintenance/tasks",
        icon: "🛠️",
        description: "View assigned work and update its status.",
      },
      {
        title: "Announcements",
        path: "/announcements",
        icon: "📢",
        description: "Read apartment announcements.",
      },
      {
        title: "Notifications",
        path: "/notifications",
        icon: "🔔",
        description: "View task updates and alerts.",
      },
    ],
  };

  const roleModules = modules[role] || [];

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("access_token");
    localStorage.removeItem("role");

    navigate("/login", { replace: true });
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            Welcome! You are logged in as{" "}
            <strong>{role || "User"}</strong>.
          </p>
        </div>

        <button
          type="button"
          className="dashboard-logout"
          onClick={logout}
        >
          Logout
        </button>
      </header>

      {roleModules.length === 0 ? (
        <section>
          <h2>Unable to load dashboard</h2>
          <p>
            Your user role was not detected. Please log out and
            log in again.
          </p>
        </section>
      ) : (
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <h2>Your Modules</h2>
            <span>{roleModules.length} available</span>
          </div>

          <div className="dashboard-grid">
            {roleModules.map((item) => (
              <button
                key={item.title}
                type="button"
                className="dashboard-card"
                onClick={() => navigate(item.path)}
                aria-label={`Open ${item.title}`}
              >
                <span
                  className="dashboard-card-icon"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <h3>{item.title}</h3>

                <p>{item.description}</p>

                <span className="dashboard-card-action">
                  Open module <span aria-hidden="true">→</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
