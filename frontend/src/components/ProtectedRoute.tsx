import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute() {
  const { phase, user } = useAuth();
  if (phase !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
