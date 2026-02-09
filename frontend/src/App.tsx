import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import AuthLayout from './components/AuthLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import StatusPage from './pages/StatusPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import ReviewQueuePage from './pages/admin/ReviewQueuePage';
import ReviewDetailPage from './pages/admin/ReviewDetailPage';

// Route for regular users only (not admin/reviewer)
function UserRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Redirect admin/reviewer to admin dashboard
  if (user?.role === 'admin' || user?.role === 'reviewer') {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

// Route for admin/reviewer only
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'admin' && user?.role !== 'reviewer') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// Smart redirect based on role
function RoleBasedRedirect() {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'admin' || user?.role === 'reviewer') {
    return <Navigate to="/admin" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Protected user routes - regular users only */}
      <Route
        element={
          <UserRoute>
            <Layout />
          </UserRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/status/:submissionId" element={<StatusPage />} />
      </Route>

      {/* Admin routes - admin/reviewer only */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <Layout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="queue" element={<ReviewQueuePage />} />
        <Route path="review/:queueId" element={<ReviewDetailPage />} />
      </Route>

      {/* Smart redirect based on role */}
      <Route path="/" element={<RoleBasedRedirect />} />

      {/* 404 */}
      <Route
        path="*"
        element={
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
              <p className="text-gray-600">Page not found</p>
            </div>
          </div>
        }
      />
    </Routes>
  );
}

export default App;
