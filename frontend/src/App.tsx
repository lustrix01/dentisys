import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { FeedbackCenter } from './components/FeedbackCenter';

// Faculty Page Imports
import { Dashboard as FacultyDashboard } from './pages/faculty/Dashboard';
import { StudentManagement } from './pages/faculty/StudentManagement';
import { GradeComputation } from './pages/faculty/GradeComputation';
import { RetentionMonitoring } from './pages/faculty/RetentionMonitoring';
import { AttendanceMonitoring } from './pages/faculty/AttendanceMonitoring';
import { Reports } from './pages/faculty/Reports';
import { EmailManagement } from './pages/faculty/EmailManagement';
import { ClassManagement } from './pages/faculty/ClassManagement';
import { ClassesAndRosters } from './pages/faculty/ClassesAndRosters';

// Dean (Admin) Page Imports
import { Dashboard as DeanDashboard } from './pages/admin/Dashboard';
import { RetentionCriteria } from './pages/admin/RetentionCriteria';
import { DeanReports } from './pages/admin/SystemAudit';
import { AuditTrail as DeanAuditTrail } from './pages/admin/AuditTrail';
import { FacultyApproval } from './pages/admin/FacultyApproval';

// Class Secretary Page Imports
import { Dashboard as SecretaryDashboard } from './pages/secretary/Dashboard';
import { AttendanceList as SecretaryAttendanceList } from './pages/secretary/AttendanceList';
import { ManualAttendanceOverride } from './pages/secretary/ManualAttendanceOverride';
import { CCTVFeed as SecretaryCCTVFeed } from './pages/secretary/CCTVFeed';
import { AuditTrail as SecretaryAuditTrail } from './pages/secretary/AuditTrail';
import { AuditTrail as FacultyAuditTrail } from './pages/faculty/AuditTrail';

import { Profile as FacultyProfile } from './pages/faculty/Profile';
import { Settings as FacultySettings } from './pages/faculty/Settings';
import { Profile as DeanProfile } from './pages/admin/Profile';
import { Settings as DeanSettings } from './pages/admin/Settings';
import { Profile as SecretaryProfile } from './pages/secretary/Profile';
import { Settings as SecretarySettings } from './pages/secretary/Settings';
import { Login } from './pages/auth/Login';
import { SsoLogin } from './pages/auth/SsoLogin';
import { SignUp } from './pages/auth/SignUp';
import { ActivateSecretary } from './pages/auth/ActivateSecretary';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { MfaVerify } from './pages/auth/MfaVerify';
import { RecoveryCodes } from './pages/auth/RecoveryCodes';

import { LandingPage } from './pages/LandingPage';

function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <DeanDashboard />;
  if (user.role === 'secretary') return <SecretaryDashboard />;
  return <FacultyDashboard />;
}

function AuthenticatedLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function RootRoute() {
  const { phase, user } = useAuth();

  if (phase === 'bootstrapping') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm font-semibold text-slate-500">
        Restoring secure session…
      </div>
    );
  }

  if (phase === 'authenticated' && user) {
    return (
      <Layout>
        <RoleDashboard />
      </Layout>
    );
  }

  return <LandingPage />;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppProvider>
          <Routes>
            {/* Public Root Route: Landing page for guests, Role Dashboard for authenticated users */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/landing" element={<LandingPage />} />

            {/* Primary SSO Login & Dev Password Login */}
            <Route path="/login" element={<SsoLogin />} />
            <Route path="/login/dev" element={<Login />} />
            <Route path="/dev-login" element={<Navigate to="/login/dev" replace />} />
            <Route path="/2fa/verify" element={<MfaVerify />} />
            <Route path="/mfa/verify" element={<Navigate to="/2fa/verify" replace />} />
            <Route path="/recovery-codes" element={<RecoveryCodes />} />

            {/* Auth routes */}
            <Route path="/signup" element={<SignUp />} />
            <Route path="/register" element={<SignUp />} />
            <Route path="/activate-secretary" element={<ActivateSecretary />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AuthenticatedLayout />}>
                <Route path="/dashboard" element={<RoleDashboard />} />

                <Route element={<ProtectedRoute allowedRoles={['faculty']} />}>
                  <Route path="/classes" element={<ClassesAndRosters />} />
                  <Route path="/faculty/classes" element={<ClassesAndRosters />} />
                  <Route path="/faculty/classes-rosters" element={<ClassesAndRosters />} />
                  <Route path="/students" element={<ClassesAndRosters />} />
                  <Route path="/grades" element={<GradeComputation />} />
                  <Route path="/retention" element={<RetentionMonitoring />} />
                  <Route path="/attendance" element={<AttendanceMonitoring />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/email-management" element={<EmailManagement />} />
                  <Route path="/faculty/audit-trail" element={<FacultyAuditTrail />} />
                  <Route path="/faculty/profile" element={<FacultyProfile />} />
                  <Route path="/faculty/settings" element={<FacultySettings />} />
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                  <Route path="/admin/faculty-approval" element={<FacultyApproval />} />
                  <Route path="/admin/retention-criteria" element={<RetentionCriteria />} />
                  <Route path="/admin/reports" element={<DeanReports />} />
                  <Route path="/admin/audit-trail" element={<DeanAuditTrail />} />
                  <Route path="/admin/users" element={<Navigate to="/" replace />} />
                  <Route path="/admin/audit" element={<Navigate to="/admin/audit-trail" replace />} />
                  <Route path="/admin/profile" element={<DeanProfile />} />
                  <Route path="/admin/settings" element={<DeanSettings />} />
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['secretary']} />}>
                  <Route path="/secretary/attendance" element={<SecretaryAttendanceList />} />
                  <Route path="/secretary/override" element={<ManualAttendanceOverride />} />
                  <Route path="/secretary/cctv" element={<SecretaryCCTVFeed />} />
                  <Route path="/secretary/audit-trail" element={<SecretaryAuditTrail />} />
                  <Route path="/secretary/profile" element={<SecretaryProfile />} />
                  <Route path="/secretary/settings" element={<SecretarySettings />} />
                </Route>

                {/* Fallback route */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
          <FeedbackCenter />
        </AppProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
