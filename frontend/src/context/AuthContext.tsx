import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { AuthPhase, SafeUser } from '../types/auth';
import * as apiClient from '../services/apiClient';
import * as auditService from '../services/auditService';
import { clearCurrentSecretaryUser } from '../pages/secretary/utils';
import { clearAllMatrixDrafts } from '../utils/matrixDraft';

const LEGACY_CREDENTIAL_KEYS = [
  'dentisys_user',
  'dentisys_registered_users',
  'dentisys_secretary_invitations',
];
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVITY_KEY = 'dentisys_auth_last_activity_at';
const LOGOUT_MARKER_KEY = 'dentisys_auth_logged_out_at';

function readStoredTime(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function storeTime(key: string, value: number): void {
  try { localStorage.setItem(key, String(value)); } catch { /* The server still enforces the idle limit. */ }
}

function removeStoredTime(key: string): void {
  try { localStorage.removeItem(key); } catch { /* The server still enforces the idle limit. */ }
}

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
  const lastActivityRef = useRef(Date.now());
  const lastStoredActivityRef = useRef(0);
  const lastHeartbeatRef = useRef(Date.now());
  const idleLogoutStartedRef = useRef(false);
  const logoutInFlightRef = useRef(false);

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
        const now = Date.now();
        const storedActivity = readStoredTime(ACTIVITY_KEY);
        lastActivityRef.current = storedActivity ?? now;
        lastStoredActivityRef.current = storedActivity ?? now;
        lastHeartbeatRef.current = lastActivityRef.current;
        if (readStoredTime(LOGOUT_MARKER_KEY) !== null || now - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
          storeTime(LOGOUT_MARKER_KEY, now);
          await apiClient.logoutSession().catch(() => undefined);
          if (!active || authOperationRef.current !== operation) return;
          apiClient.clearAccessToken();
          setState(prev => ({ ...initialState, phase: 'unauthenticated', recoveryCodes: prev.recoveryCodes }));
          return;
        }
        lastActivityRef.current = now;
        lastStoredActivityRef.current = now;
        storeTime(ACTIVITY_KEY, now);
        apiClient.setRecentUserActivity(now);
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
    const now = Date.now();
    lastActivityRef.current = now;
    lastStoredActivityRef.current = now;
    lastHeartbeatRef.current = now;
    apiClient.setRecentUserActivity(now);
    idleLogoutStartedRef.current = false;
    logoutInFlightRef.current = false;
    removeStoredTime(LOGOUT_MARKER_KEY);
    storeTime(ACTIVITY_KEY, now);
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

  // Ends the session without touching the tab's unsaved-score drafts (idle expiry, expired token, other tab).
  const forceLogout = useCallback(async () => {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    authOperationRef.current += 1;
    storeTime(LOGOUT_MARKER_KEY, Date.now());
    const logoutRequest = apiClient.logoutSession();
    apiClient.clearAccessToken();
    auditService.clearAuditIdentity();
    clearCurrentSecretaryUser();
    setState({ ...initialState, phase: 'unauthenticated' });
    try {
      await logoutRequest;
    } catch {
      // The stored logout marker prevents a later page load from restoring this session.
    } finally {
      logoutInFlightRef.current = false;
    }
  }, []);

  // The user's own Sign out: unsaved-score drafts of this tab are discarded too.
  const logout = useCallback(async () => {
    clearAllMatrixDrafts();
    await forceLogout();
  }, [forceLogout]);

  useEffect(() => {
    if (state.phase !== 'authenticated') return undefined;
    const expireIfIdle = () => {
      const persisted = readStoredTime(ACTIVITY_KEY);
      const lastActivity = Math.max(lastActivityRef.current, persisted ?? 0);
      lastActivityRef.current = lastActivity;
      if (Date.now() - lastActivity < IDLE_TIMEOUT_MS) return false;
      if (!idleLogoutStartedRef.current) {
        idleLogoutStartedRef.current = true;
        void forceLogout();
      }
      return true;
    };
    let lastWriteAt = lastStoredActivityRef.current;
    const recordActivity = () => {
      if (expireIfIdle()) return;
      const now = Date.now();
      lastActivityRef.current = now;
      apiClient.setRecentUserActivity(now);
      if (now - lastWriteAt >= 5000) {
        lastWriteAt = now;
        lastStoredActivityRef.current = now;
        storeTime(ACTIVITY_KEY, now);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_MARKER_KEY && event.newValue) {
        if (!idleLogoutStartedRef.current) {
          idleLogoutStartedRef.current = true;
          void forceLogout();
        }
        return;
      }
      if (event.key !== ACTIVITY_KEY || !event.newValue) return;
      const activityAt = Number(event.newValue);
      if (!Number.isFinite(activityAt)) return;
      lastActivityRef.current = Math.max(lastActivityRef.current, activityAt);
      apiClient.setRecentUserActivity(lastActivityRef.current);
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) expireIfIdle();
    };
    const checkAndHeartbeat = () => {
      if (expireIfIdle()) return;
      const now = Date.now();
      if (now - lastHeartbeatRef.current >= HEARTBEAT_INTERVAL_MS
        && now - lastActivityRef.current < HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatRef.current = now;
        void apiClient.getMe().catch(() => undefined);
      }
    };
    const activityEvents: Array<keyof DocumentEventMap> = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'scroll', 'input'];
    for (const eventName of activityEvents) document.addEventListener(eventName, recordActivity, { passive: true });
    window.addEventListener('focus', checkAndHeartbeat);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', checkAndHeartbeat);
    const timer = window.setInterval(checkAndHeartbeat, 15000);
    return () => {
      window.clearInterval(timer);
      for (const eventName of activityEvents) document.removeEventListener(eventName, recordActivity);
      window.removeEventListener('focus', checkAndHeartbeat);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', checkAndHeartbeat);
    };
  }, [state.phase, forceLogout]);

  useEffect(() => {
    const onExpired = () => { void forceLogout(); };
    const onTokenRefreshed = (event: Event) => {
      const token = (event as CustomEvent<string>).detail;
      if (!token) return;
      setState(prev => ({ ...prev, accessToken: token }));
    };
    window.addEventListener('dentisys:auth-expired', onExpired);
    window.addEventListener('dentisys:access-token-refreshed', onTokenRefreshed);
    return () => {
      window.removeEventListener('dentisys:auth-expired', onExpired);
      window.removeEventListener('dentisys:access-token-refreshed', onTokenRefreshed);
    };
  }, [forceLogout]);

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
