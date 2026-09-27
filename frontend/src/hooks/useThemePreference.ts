import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { updateThemePreferenceApi } from '../services/apiClient';

export type ThemeMode = 'light' | 'dark';

/**
 * Appearance preference: a change is applied to the page immediately and
 * saved to the signed-in account, so it follows the user to other browsers.
 */
export function useThemePreference() {
  const { settings, applyTheme } = useApp();
  const { user, setUser } = useAuth();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const changeTheme = useCallback(async (theme: ThemeMode): Promise<void> => {
    applyTheme(theme);
    const current = userRef.current;
    if (!current) return;
    await updateThemePreferenceApi(theme);
    const latest = userRef.current ?? current;
    if (latest.theme !== theme) setUser({ ...latest, theme });
  }, [applyTheme, setUser]);

  return { theme: settings.theme as ThemeMode, changeTheme };
}

/**
 * Apply the account's saved theme once per sign-in session. Later changes go
 * through changeTheme, which keeps the account copy in step.
 */
export function useApplySavedTheme() {
  const { applyTheme } = useApp();
  const { user } = useAuth();
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.theme) return;
    const key = `${user.user_id}:${user.session_uuid}`;
    if (appliedFor.current === key) return;
    appliedFor.current = key;
    applyTheme(user.theme);
  }, [user?.user_id, user?.session_uuid, user?.theme, applyTheme]);
}
