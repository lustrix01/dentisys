import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';

// Faculty Page Imports
import { Dashboard as FacultyDashboard } from './pages/faculty/Dashboard';
import { StudentManagement } from './pages/faculty/StudentManagement';
import { GradeComputation } from './pages/faculty/GradeComputation';
import { RetentionMonitoring } from './pages/faculty/RetentionMonitoring';
import { AttendanceMonitoring } from './pages/faculty/AttendanceMonitoring';
import { Reports } from './pages/faculty/Reports';

// Dean (Admin) Page Imports
import { Dashboard as DeanDashboard } from './pages/admin/Dashboard';
import { RetentionCriteria } from './pages/admin/RetentionCriteria';
import { DeanReports } from './pages/admin/SystemAudit';

// Class Secretary Page Imports
import { Dashboard as SecretaryDashboard } from './pages/secretary/Dashboard';
import { AttendanceList as SecretaryAttendanceList } from './pages/secretary/AttendanceList';
import { ManualAttendanceOverride } from './pages/secretary/ManualAttendanceOverride';
import { CCTVFeed as SecretaryCCTVFeed } from './pages/secretary/CCTVFeed';

// Shared Page Imports
import { Profile } from './pages/shared/Profile';
import { Settings } from './pages/shared/Settings';
import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';

const MainApp = () => {
  const userStr = localStorage.getItem('dentisys_user');
  if (!userStr) {
    return <Navigate to="/login" replace />;
  }

  const currentUser = JSON.parse(userStr);

  return (
    <Layout>
      <Routes>
        {/* Dynamic Root Dashboard Selection */}
        <Route path="/" element={
          currentUser.role === 'admin'
            ? <DeanDashboard />
            : currentUser.role === 'secretary'
            ? <SecretaryDashboard />
            : <FacultyDashboard />
        } />

        {/* Faculty Routes */}
        <Route path="/students" element={currentUser.role === 'faculty' ? <StudentManagement /> : <Navigate to="/" replace />} />
        <Route path="/grades" element={currentUser.role === 'faculty' ? <GradeComputation /> : <Navigate to="/" replace />} />
        <Route path="/retention" element={currentUser.role === 'faculty' ? <RetentionMonitoring /> : <Navigate to="/" replace />} />
        <Route path="/attendance" element={currentUser.role === 'faculty' ? <AttendanceMonitoring /> : <Navigate to="/" replace />} />
        <Route path="/reports" element={currentUser.role === 'faculty' ? <Reports /> : <Navigate to="/" replace />} />

        {/* Dean Routes */}
        <Route path="/admin/retention-criteria" element={currentUser.role === 'admin' ? <RetentionCriteria /> : <Navigate to="/" replace />} />
        <Route path="/admin/reports" element={currentUser.role === 'admin' ? <DeanReports /> : <Navigate to="/" replace />} />
        {/* Legacy routes: redirect to dashboard */}
        <Route path="/admin/users" element={<Navigate to="/" replace />} />
        <Route path="/admin/audit" element={<Navigate to="/admin/reports" replace />} />

        {/* Class Secretary Routes */}
        <Route
          path="/secretary/attendance"
          element={currentUser.role === 'secretary' ? <SecretaryAttendanceList /> : <Navigate to="/" replace />}
        />
        <Route
          path="/secretary/override"
          element={currentUser.role === 'secretary' ? <ManualAttendanceOverride /> : <Navigate to="/" replace />}
        />
        <Route
          path="/secretary/cctv"
          element={currentUser.role === 'secretary' ? <SecretaryCCTVFeed /> : <Navigate to="/" replace />}
        />

        {/* Shared Routes */}
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};

function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/*" element={<MainApp />} />
        </Routes>
      </Router>
    </AppProvider>
  );
}

export default App;
