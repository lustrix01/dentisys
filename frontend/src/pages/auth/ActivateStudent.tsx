import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react';
import { activateStudent, getStudentInvitation, StudentInvitation } from '../../services/apiClient';
import { validatePasswordRequirements } from '../../services/authService';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';

export function ActivateStudent() {
  const runtimeConfig = useRuntimeConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token') || '');
  const [invitation, setInvitation] = useState<StudentInvitation | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [credential, setCredential] = useState('');
  const [googleState, setGoogleState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = runtimeConfig.providers.identity.google.client_id;
  const googleEnabled = runtimeConfig.providers.identity.google.enabled && Boolean(googleClientId);
  const passwordCriteria = validatePasswordRequirements(password);

  useEffect(() => {
    const scrubbed = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, scrubbed);
  }, []);

  useEffect(() => {
    let active = true;
    if (runtimeConfig.loading) {
      setError('');
      setLoading(true);
      return () => { active = false; };
    }
    if (!runtimeConfig.features.student_auth_enabled) {
      setError('Student account activation is unavailable.');
      setLoading(false);
      return () => { active = false; };
    }
    if (!token) {
      setError('This Student invitation link is missing its token.');
      setLoading(false);
      return () => { active = false; };
    }
    void getStudentInvitation(token).then(response => {
      if (active) setInvitation(response.invitation);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'This Student invitation is invalid or expired.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [runtimeConfig.features.student_auth_enabled, runtimeConfig.loading, token]);

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
    if (!passwordCriteria.isValid) {
      setError('Password does not meet all security requirements.');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await activateStudent(token, password, credential || undefined);
      navigate('/login?activated=1', { replace: true });
    } catch (err) {
      setCredential('');
      setError(err instanceof Error ? err.message : 'Unable to accept Student invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-wider text-accent-600">Student invitation</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Set your DentiSys password</h1>
        {loading && <p className="mt-4 text-sm text-slate-500">Checking invitation…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
        {invitation && !loading && (
          <>
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{invitation.studentName} <span className="font-normal text-slate-500">({invitation.studentNumber})</span></p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{invitation.email}</p>
              <p className="mt-1 text-xs text-slate-500">Class: {invitation.className}</p>
            </div>
            <label htmlFor="student-password" className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Password
              <div className="relative mt-2">
                <input id="student-password" aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} aria-describedby="student-password-requirements" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 p-3 pr-11 dark:border-slate-700 dark:bg-slate-800" />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 text-slate-500">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              <div id="student-password-requirements" className="mt-2 grid grid-cols-2 gap-1 text-xs" aria-live="polite">
                <PasswordRequirement valid={passwordCriteria.hasMinLength} label="8+ characters" />
                <PasswordRequirement valid={passwordCriteria.hasUppercase} label="Uppercase letter" />
                <PasswordRequirement valid={passwordCriteria.hasLowercase} label="Lowercase letter" />
                <PasswordRequirement valid={passwordCriteria.hasNumber} label="Number" />
                <PasswordRequirement valid={passwordCriteria.hasSpecial} label="Special character" />
              </div>
            </label>
            <label htmlFor="student-password-confirmation" className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Confirm password
              <div className="relative mt-2">
                <input id="student-password-confirmation" aria-label="Confirm password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required minLength={8} aria-invalid={Boolean(confirmation && password !== confirmation)} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-300 p-3 pr-11 dark:border-slate-700 dark:bg-slate-800" />
                <button type="button" onClick={() => setShowConfirmation(value => !value)} aria-label={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} className="absolute inset-y-0 right-0 px-3 text-slate-500">{showConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              {confirmation && password !== confirmation && <p role="alert" className="mt-1 text-xs font-medium text-rose-600">Passwords do not match.</p>}
            </label>
            {googleEnabled && <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="mb-3 text-center text-xs text-slate-500">Optional: verify this invited institutional email with Google</p>
              <div ref={googleButtonRef} className={googleState === 'ready' ? 'flex justify-center' : 'hidden'} />
              {googleState === 'error' && <p className="text-center text-xs text-rose-600">Google verification could not be loaded. You can continue with your password.</p>}
              {credential && <p className="mt-2 text-center text-xs text-emerald-700">Google identity selected for verification.</p>}
            </div>}
            <button type="submit" disabled={submitting || !invitation || !passwordCriteria.isValid || password !== confirmation} className="mt-6 w-full rounded-lg bg-accent-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{submitting ? 'Activating…' : 'Accept invitation and activate'}</button>
          </>
        )}
        <Link to="/login" className="mt-5 block text-center text-sm font-semibold text-accent-600 hover:underline">Back to login</Link>
      </form>
    </main>
  );
}

function PasswordRequirement({ valid, label }: { valid: boolean; label: string }) {
  return <span className={valid ? 'text-emerald-600' : 'text-slate-500'}>{valid ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : <XCircle className="mr-1 inline h-3.5 w-3.5" />}{label}</span>;
}
