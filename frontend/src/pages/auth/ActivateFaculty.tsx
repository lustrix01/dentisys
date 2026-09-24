import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react';
import { activateFacultyInvitation, getFacultyInvitation } from '../../services/apiClient';
import { validatePasswordRequirements } from '../../services/authService';

export function ActivateFaculty() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token') || '');
  const [invitation, setInvitation] = useState<{ name: string; email: string; expiresAt: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const passwordCriteria = validatePasswordRequirements(password);

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
      await activateFacultyInvitation(token, password);
      navigate('/login?activated=1', { replace: true });
    } catch (err) {
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
            <label htmlFor="faculty-password" className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Password
              <div className="relative mt-2">
                <input id="faculty-password" aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} aria-describedby="faculty-password-requirements" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 p-3 pr-11 dark:border-slate-700 dark:bg-slate-800" />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 text-slate-500">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              <div id="faculty-password-requirements" className="mt-2 grid grid-cols-2 gap-1 text-xs" aria-live="polite">
                <PasswordRequirement valid={passwordCriteria.hasMinLength} label="8+ characters" />
                <PasswordRequirement valid={passwordCriteria.hasUppercase} label="Uppercase letter" />
                <PasswordRequirement valid={passwordCriteria.hasLowercase} label="Lowercase letter" />
                <PasswordRequirement valid={passwordCriteria.hasNumber} label="Number" />
                <PasswordRequirement valid={passwordCriteria.hasSpecial} label="Special character" />
              </div>
            </label>
            <label htmlFor="faculty-password-confirmation" className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Confirm password
              <div className="relative mt-2">
                <input id="faculty-password-confirmation" aria-label="Confirm password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required minLength={8} aria-invalid={Boolean(confirmation && password !== confirmation)} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-300 p-3 pr-11 dark:border-slate-700 dark:bg-slate-800" />
                <button type="button" onClick={() => setShowConfirmation(value => !value)} aria-label={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} className="absolute inset-y-0 right-0 px-3 text-slate-500">{showConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              {confirmation && password !== confirmation && <p role="alert" className="mt-1 text-xs font-medium text-rose-600">Passwords do not match.</p>}
            </label>
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
