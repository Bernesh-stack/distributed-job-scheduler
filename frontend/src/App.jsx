import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Queues from './pages/Queues';
import JobExplorer from './pages/JobExplorer';
import Workers from './pages/Workers';
import Configuration from './pages/Configuration';
import Metrics from './pages/Metrics';
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}
function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/queues" replace /> : <Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/queues" replace />} />
        <Route path="queues" element={<Queues />} />
        <Route path="jobs" element={<JobExplorer />} />
        <Route path="workers" element={<Workers />} />
        <Route path="configuration" element={<Configuration />} />
        <Route path="metrics" element={<Metrics />} />
      </Route>
      <Route path="*" element={<Navigate to="/queues" replace />} />
    </Routes>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}