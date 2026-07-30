import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { AuthPhase, SafeUser } from '../types/auth';
import * as apiClient from '../services/apiClient';
import * as auditService from '../services/auditService';
import { clearCurrentSecretaryUser } from '../pages/secretary/utils';

const LEGACY_CREDENTIAL_KEYS = [
  'dentisys_user',
  'dentisys_registered_users',
  'dentisys_secretary_invitations',
];

interface AuthState {
  phase: AuthPhase;
  errorMessage: string;
  twoFactorToken: string | null;
  accessToken: string | null;
  user: SafeUser | null;
  recoveryCodes: string[];
}

interface AuthContextValue extends AuthState {
  beginLogin: () => void;
  storeTwoFactorChallenge: (token: string) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: SafeUser) => void;
  setAuthenticated: () => void;
  setRecoveryCodes: (codes: string[]) => void;
  clearRecoveryCodes: () => void;
  setError: (message: string) => void;
  clearAuth: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const initialState: AuthState = {
  phase: 'bootstrapping',
  errorMessage: '',
  twoFactorToken: null,
  accessToken: null,
  user: null,
  recoveryCodes: [],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);
  const location = useLocation();
  const prevPathnameRef = useRef<string | null>(null);
  const authOperationRef = useRef(0);

  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = location.pathname;
    if (prev === null) return;
    if (prev === '/recovery-codes' && location.pathname !== '/recovery-codes') {
      setState(prevState => ({ ...prevState, recoveryCodes: [] }));
    }
  }, [location.pathname]);

  useEffect(() => {
    for (const key of LEGACY_CREDENTIAL_KEYS) {
      localStorage.removeItem(key);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const operation = ++authOperationRef.current;
    const bootstrap = async () => {
      try {
        const refreshed = await apiClient.refreshSession();
        if (!active || authOperationRef.current !== operation) return;
        apiClient.setAccessToken(refreshed.access_token);
        const user = await apiClient.getMe();
        if (!active || authOperationRef.current !== operation) return;
        auditService.setAuditIdentity(user.display_name, user.role);
        setState(prev => ({
          ...prev,
          accessToken: refreshed.access_token,
          user,
          phase: 'authenticated',
          errorMessage: '',
        }));
      } catch (error) {
        if (!active || authOperationRef.current !== operation) return;
        apiClient.clearAccessToken();
        const message = error instanceof apiClient.ApiError && error.status !== 401
          ? error.message
          : '';
        setState(prev => ({ ...initialState, phase: 'unauthenticated', errorMessage: message, recoveryCodes: prev.recoveryCodes }));
      }
    };
    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const beginLogin = useCallback(() => {
    authOperationRef.current += 1;
    setState(prev => ({ ...prev, phase: 'submitting_login', errorMessage: '' }));
  }, []);

  const setAccessToken = useCallback((token: string) => {
    apiClient.setAccessToken(token);
    setState(prev => ({ ...prev, accessToken: token, errorMessage: '' }));
  }, []);

  const setUser = useCallback((user: SafeUser) => {
    auditService.setAuditIdentity(user.display_name, user.role);
    setState(prev => ({ ...prev, user }));
  }, []);

  const storeTwoFactorChallenge = useCallback((token: string) => {
    setState(prev => ({
      ...prev,
      twoFactorToken: token,
      phase: 'two_factor_verification_required',
      errorMessage: '',
    }));
  }, []);

  const setAuthenticated = useCallback(() => {
    setState(prev => ({ ...prev, phase: 'authenticated', errorMessage: '' }));
  }, []);

  const setRecoveryCodes = useCallback((codes: string[]) => {
    setState(prev => ({ ...prev, recoveryCodes: codes }));
  }, []);

  const clearRecoveryCodes = useCallback(() => {
    setState(prev => ({ ...prev, recoveryCodes: [] }));
  }, []);

  const setError = useCallback((message: string) => {
    setState(prev => ({ ...prev, phase: 'unauthenticated', errorMessage: message }));
  }, []);

  const clearAuth = useCallback(() => {
    authOperationRef.current += 1;
    apiClient.clearAccessToken();
    auditService.clearAuditIdentity();
    clearCurrentSecretaryUser();
    setState({ ...initialState, phase: 'unauthenticated' });
  }, []);

  const logout = useCallback(async () => {
    authOperationRef.current += 1;
    try {
      await apiClient.logoutSession();
    } finally {
      apiClient.clearAccessToken();
      auditService.clearAuditIdentity();
      clearCurrentSecretaryUser();
      setState({ ...initialState, phase: 'unauthenticated' });
    }
  }, []);

  const value: AuthContextValue = {
    ...state,
    beginLogin,
    storeTwoFactorChallenge,
    setAccessToken,
    setUser,
    setAuthenticated,
    setRecoveryCodes,
    clearRecoveryCodes,
    setError,
    clearAuth,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
