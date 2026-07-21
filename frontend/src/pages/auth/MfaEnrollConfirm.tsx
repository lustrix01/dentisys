import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { confirmEnrollment, getMe, ApiError } from '../../services/apiClient';

export function MfaEnrollConfirm() {
  const navigate = useNavigate();
  const {
    confirmationToken,
    setAccessToken,
    setUser,
    setAuthenticated,
    setRecoveryCodes,
    clearAuth,
    setError: setContextError,
  } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!confirmationToken) {
    navigate('/login', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setError('Please enter a valid 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await confirmEnrollment(confirmationToken, trimmed);
      setAccessToken(result.access_token);
      setRecoveryCodes(result.recovery_codes);
      const user = await getMe();
      setUser(user);
      setAuthenticated();
      navigate('/recovery-codes', { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuth();
        setContextError('Your session has expired. Please log in again.');
        navigate('/login', { replace: true });
      } else {
        const message = err instanceof Error ? err.message : 'An error occurred.';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-xl border border-slate-200/30 dark:border-slate-800/80 overflow-hidden">
          <div className="bg-[#EAE5F8] dark:bg-accent-950/20 p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center mb-3">
              <ShieldCheck className="w-8 h-8 text-accent-600 dark:text-accent-400" />
            </div>
            <h1 className="text-xl font-extrabold font-heading text-accent-800 dark:text-accent-300">
              Verify Setup
            </h1>
            <p className="text-xs text-accent-600/80 dark:text-accent-400/80 mt-1">
              Enter the 6-digit code from your authenticator app.
            </p>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  disabled={loading}
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono px-4 py-3 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all outline-none placeholder-slate-300 dark:placeholder-slate-600 dark:text-slate-200 disabled:opacity-50"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-lg shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Verify'
                )}
              </button>
            </form>

            <button
              onClick={() => navigate('/mfa/enroll')}
              className="mt-4 w-full flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-accent-600 dark:hover:text-accent-400 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to setup instructions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
