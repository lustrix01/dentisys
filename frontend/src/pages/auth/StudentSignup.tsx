import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestStudentActivation } from '../../services/apiClient';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';

export function StudentSignup() {
  const runtimeConfig = useRuntimeConfig();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!runtimeConfig.features.student_auth_enabled) {
    return <main className="min-h-screen flex items-center justify-center p-6 text-sm text-slate-600">Student account activation is unavailable.</main>;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await requestStudentActivation(email);
      setMessage(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to request activation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Activate Student account</h1>
        <p className="mt-2 text-sm text-slate-500">Use the institutional email on your Student record.</p>
        {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <label className="mt-6 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Institutional email
          <input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3 dark:bg-slate-800 dark:border-slate-700" />
        </label>
        <button type="submit" disabled={loading} className="mt-6 w-full rounded-lg bg-accent-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {loading ? 'Requesting…' : 'Request activation link'}
        </button>
        <Link to="/login" className="mt-4 block text-center text-sm font-semibold text-accent-600 hover:underline">Back to login</Link>
      </form>
    </main>
  );
}
