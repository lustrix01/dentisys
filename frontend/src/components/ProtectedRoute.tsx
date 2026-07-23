import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/auth';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { phase, user } = useAuth();

  if (phase === 'bootstrapping') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm font-semibold text-slate-500">
        Restoring secure session…
      </div>
    );
  }

  if (phase !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Role-based access enforcement: redirect unauthorized users to root dashboard
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
