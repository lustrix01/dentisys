import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Link2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { useAuth } from '../context/AuthContext';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';
import {
  ApiError,
  getGoogleLinkStatus,
  linkCurrentGoogleAccount,
} from '../services/apiClient';

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        ux_mode?: 'popup';
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

function browserGoogle(): GoogleIdentityApi | undefined {
  return (window as unknown as { google?: GoogleIdentityApi }).google;
}

export const GoogleLinkCard: React.FC = () => {
  const { storeTwoFactorChallenge } = useAuth();
  const navigate = useNavigate();
  const runtimeConfig = useRuntimeConfig();
  const clientId = runtimeConfig.providers.identity.google.client_id;
  const enabled = runtimeConfig.providers.identity.google.enabled && Boolean(clientId);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleCredential = useCallback((response: { credential: string }) => {
    if (!response.credential) {
      setError('Google did not return an identity token. Choose Google again.');
      return;
    }
    setCredential(response.credential);
    setPassword('');
    setError('');
    setSuccess('');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setLinked(null);
    void getGoogleLinkStatus()
      .then(response => setLinked(response.linked))
      .catch(requestError => {
        setLinked(false);
        setError(requestError instanceof Error ? requestError.message : 'Unable to load Google link status.');
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || linked === true || !clientId || !buttonRef.current) return;
    setLoadState('loading');
    let cancelled = false;
    const render = () => {
      if (cancelled) return;
      const google = browserGoogle();
      if (!google || !buttonRef.current) {
        setLoadState('error');
        return;
      }
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: handleCredential,
        });
        buttonRef.current.innerHTML = '';
        google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          width: 360,
          text: 'continue_with',
        });
        setLoadState('ready');
      } catch {
        setLoadState('error');
      }
    };

    const existing = document.getElementById('google-gis-client');
    const script = existing instanceof HTMLScriptElement ? existing : document.createElement('script');
    const handleLoad = () => render();
    const handleError = () => setLoadState('error');
    if (browserGoogle()) {
      render();
    } else {
      script.id = 'google-gis-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = handleLoad;
      script.onerror = handleError;
      if (!existing) document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      script.onload = null;
      script.onerror = null;
    };
  }, [clientId, enabled, handleCredential, linked]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!credential || !password || working) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      const response = await linkCurrentGoogleAccount(credential, password);
      if (response.type === 'two_factor_required' && response.two_factor_challenge_token) {
        storeTwoFactorChallenge(response.two_factor_challenge_token);
        navigate('/2fa/verify');
        return;
      }
      if (response.type !== 'google_linked' && response.linked !== true) {
        throw new Error('Unexpected Google linking response.');
      }
      setLinked(true);
      setCredential('');
      setPassword('');
      setSuccess('Google Sign-In is now linked to this DentiSys account.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'INVALID_GOOGLE_IDENTITY') {
        setCredential('');
      }
      setError(requestError instanceof Error ? requestError.message : 'Unable to link Google Sign-In.');
    } finally {
      setWorking(false);
    }
  };

  if (!enabled) return null;

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Link2 className="h-4 w-4 text-accent-500" />
          Google Sign-In
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        {success && <div role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>}

        {linked === true ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div><p className="font-bold">Google account linked</p><p className="mt-1">You can use Google Sign-In while keeping your DentiSys password.</p></div>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500">Link Google from Profile Settings. Your institutional email must match this DentiSys account, and your password confirms ownership.</p>
            <div className="flex min-h-11 justify-center" aria-live="polite">
              <div ref={buttonRef} className={loadState === 'ready' ? 'flex justify-center' : 'hidden'} aria-label="Choose Google account" />
              {loadState === 'loading' && <p className="self-center text-xs text-slate-500">Loading Google Sign-In…</p>}
              {loadState === 'error' && <p className="self-center text-center text-xs font-semibold text-rose-600">Google Sign-In could not be loaded. Try again later.</p>}
            </div>
            {credential && <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="flex items-center gap-2 text-xs font-bold"><ShieldCheck className="h-4 w-4 text-accent-500" />Confirm with your DentiSys password</p>
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="DentiSys password"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
              />
              <button type="submit" disabled={working || !password} className="w-full rounded-xl bg-accent-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {working ? 'Linking…' : 'Confirm and link Google'}
              </button>
            </form>}
          </>
        )}
      </CardContent>
    </Card>
  );
};
