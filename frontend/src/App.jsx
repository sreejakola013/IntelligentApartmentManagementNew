import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Complaints from "./pages/Complaints";
import AdminComplaints from "./pages/AdminComplaints";
import AIMonitoring from "./pages/AIMonitoring";
import AIHistory from "./pages/AIHistory";
import AdminTasks from "./pages/AdminTasks";
import MaintenanceTasks from "./pages/MaintenanceTasks";
import Notifications from "./pages/Notifications";
import Visitors from "./pages/Visitors";
import Announcements from "./pages/Announcements";
import Dues from "./pages/Dues";
import AdminUsers from "./pages/AdminUsers";
import FireAlertMonitoring from "./pages/FireAlertMonitoring";
import AnimalDetection from "./pages/AnimalDetection";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");

  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to="/login" replace />}
      />

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/complaints"
        element={
          <ProtectedRoute>
            <Complaints />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/complaints"
        element={
          <ProtectedRoute>
            <AdminComplaints />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-monitoring"
        element={
          <ProtectedRoute>
            <AIMonitoring />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ai-history"
        element={
          <ProtectedRoute>
            <AIHistory />
          </ProtectedRoute>
        }
      />
      <Route
  path="/admin/tasks"
  element={
    <ProtectedRoute>
      <AdminTasks />
    </ProtectedRoute>
  }
/>

<Route
  path="/maintenance/tasks"
  element={
    <ProtectedRoute>
      <MaintenanceTasks />
    </ProtectedRoute>
  }
/>
<Route
  path="/notifications"
  element={
    <ProtectedRoute>
      <Notifications />
    </ProtectedRoute>
  }
/>
<Route
  path="/visitors"
  element={
    <ProtectedRoute>
      <Visitors />
    </ProtectedRoute>
  }
/>
<Route
  path="/announcements"
  element={
    <ProtectedRoute>
      <Announcements />
    </ProtectedRoute>
  }
/>
<Route
  path="/dues"
  element={
    <ProtectedRoute>
      <Dues />
    </ProtectedRoute>
  }
/>
<Route
  path="/admin/users"
  element={
    <ProtectedRoute>
      <AdminUsers />
    </ProtectedRoute>
  }
/>
<Route
  path="/fire-alerts"
  element={
    <ProtectedRoute>
      <FireAlertMonitoring />
    </ProtectedRoute>
  }
/>
<Route
  path="/animal-detection"
  element={
    <ProtectedRoute>
      <AnimalDetection />
    </ProtectedRoute>
  }
/>

      <Route
        path="*"
        element={<Navigate to="/login" replace />}
      />
    </Routes>
  );
}