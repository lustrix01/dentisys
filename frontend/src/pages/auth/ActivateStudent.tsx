import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { activateStudent } from '../../services/apiClient';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';

export function ActivateStudent() {
  const runtimeConfig = useRuntimeConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activationToken] = useState(() => searchParams.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const scrubbed = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, scrubbed);
  }, []);

  if (!runtimeConfig.features.student_auth_enabled) {
    return <main className="min-h-screen flex items-center justify-center p-6 text-sm text-slate-600">Student account activation is unavailable.</main>;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await activateStudent(activationToken, password);
      navigate('/login?activated=1', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to activate Student account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Set Student password</h1>
        {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <label className="mt-6 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Password
          <input type="password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3 dark:bg-slate-800 dark:border-slate-700" />
        </label>
        <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Confirm password
          <input type="password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3 dark:bg-slate-800 dark:border-slate-700" />
        </label>
        <button type="submit" disabled={loading || activationToken === ''} className="mt-6 w-full rounded-lg bg-accent-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {loading ? 'Activating…' : 'Activate account'}
        </button>
      </form>
    </main>
  );
}
