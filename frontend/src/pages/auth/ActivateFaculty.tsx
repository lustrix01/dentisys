import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { activateFacultyInvitation, getFacultyInvitation } from '../../services/apiClient';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';

export function ActivateFaculty() {
  const runtimeConfig = useRuntimeConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token') || '');
  const [invitation, setInvitation] = useState<{ name: string; email: string; expiresAt: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [credential, setCredential] = useState('');
  const [googleState, setGoogleState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = runtimeConfig.providers.identity.google.client_id;
  const googleEnabled = runtimeConfig.providers.identity.google.enabled && Boolean(googleClientId);

  useEffect(() => {
    const scrubbed = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, scrubbed);
  }, []);

  useEffect(() => {
    let active = true;
    if (!token) {
      setError('This Faculty invitation link is missing its token.');
      setLoading(false);
      return () => { active = false; };
    }
    void getFacultyInvitation(token).then(response => {
      if (active) setInvitation(response.invitation);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'This Faculty invitation is invalid or expired.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!googleEnabled || !invitation || !googleClientId || !googleButtonRef.current) return;
    let active = true;
    const render = () => {
      if (!active || !window.google || !googleButtonRef.current) {
        if (active) setGoogleState('error');
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        ux_mode: 'popup',
        callback: response => { if (active) setCredential(response.credential); },
      });
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with' });
      setGoogleState('ready');
    };
    const existing = document.getElementById('google-gis-client');
    const script = existing instanceof HTMLScriptElement ? existing : document.createElement('script');
    script.id = 'google-gis-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = render;
    script.onerror = () => { if (active) setGoogleState('error'); };
    if (window.google) render();
    else if (!existing) document.head.appendChild(script);
    return () => { active = false; script.onload = null; script.onerror = null; };
  }, [googleEnabled, googleClientId, invitation]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await activateFacultyInvitation(token, password, credential || undefined);
      navigate('/login?activated=1', { replace: true });
    } catch (err) {
      setCredential('');
      setError(err instanceof Error ? err.message : 'Unable to accept Faculty invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wider text-accent-600">Faculty invitation</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Set your DentiSys password</h1>
        {loading && <p className="mt-4 text-sm text-slate-500">Checking invitation…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
        {invitation && !loading && (
          <>
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{invitation.name}</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{invitation.email}</p>
              <p className="mt-2 text-xs text-slate-500">The Admin invitation is your approval. Your account becomes active when setup is complete.</p>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Password
              <input type="password" autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3 dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Confirm password
              <input type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3 dark:border-slate-700 dark:bg-slate-800" />
            </label>
            {googleEnabled && <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="mb-3 text-center text-xs text-slate-500">Optional: verify this invited institutional email with Google</p>
              <div ref={googleButtonRef} className={googleState === 'ready' ? 'flex justify-center' : 'hidden'} />
              {googleState === 'error' && <p className="text-center text-xs text-rose-600">Google verification could not be loaded. You can continue with your password.</p>}
              {credential && <p className="mt-2 text-center text-xs text-emerald-700">Google identity selected for verification.</p>}
            </div>}
            <button type="submit" disabled={submitting || !invitation} className="mt-6 w-full rounded-lg bg-accent-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{submitting ? 'Activating…' : 'Accept invitation and activate'}</button>
          </>
        )}
        <Link to="/login" className="mt-5 block text-center text-sm font-semibold text-accent-600 hover:underline">Back to login</Link>
      </form>
    </main>
  );
}
