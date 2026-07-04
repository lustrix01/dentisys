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

// Admin Page Imports
import { Dashboard as AdminDashboard } from './pages/admin/Dashboard';
import { UserManagement } from './pages/admin/UserManagement';
import { SystemAudit } from './pages/admin/SystemAudit';

// Student Secretary Page Imports
import { Dashboard as StudentDashboard } from './pages/student/Dashboard';
import { AttendanceLogger } from './pages/student/AttendanceLogger';
import { FacialEnrollment } from './pages/student/FacialEnrollment';
import { CCTVMonitoring } from './pages/student/CCTVMonitoring';

// Shared Page Imports
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
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
            ? <AdminDashboard /> 
            : currentUser.role === 'student' 
            ? <StudentDashboard /> 
            : <FacultyDashboard />
        } />
        
        {/* Faculty Routes */}
        <Route path="/students" element={<StudentManagement />} />
        <Route path="/grades" element={<GradeComputation />} />
        <Route path="/retention" element={<RetentionMonitoring />} />
        <Route path="/attendance" element={<AttendanceMonitoring />} />
        <Route path="/reports" element={<Reports />} />
        
        {/* Admin Routes */}
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/audit" element={<SystemAudit />} />
        
        {/* Student Secretary Routes */}
        <Route path="/student/attendance" element={<AttendanceLogger />} />
        <Route path="/student/facial-enrollment" element={<FacialEnrollment />} />
        <Route path="/student/cctv" element={<CCTVMonitoring />} />
        
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
