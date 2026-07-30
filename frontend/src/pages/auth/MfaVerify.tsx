import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { verifyMfa, recoverMfa, getMe, setAccessToken as setApiAccessToken, ApiError } from '../../services/apiClient';

type Mode = 'totp' | 'recovery';

export function MfaVerify() {
  const navigate = useNavigate();
  const {
    twoFactorToken,
    setAccessToken,
    setUser,
    setAuthenticated,
    clearAuth,
    setError: setContextError,
  } = useAuth();
  const [mode, setMode] = useState<Mode>('totp');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!twoFactorToken) {
    navigate('/login', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError(mode === 'totp' ? 'Please enter a verification code.' : 'Please enter a recovery code.');
      return;
    }
    if (mode === 'totp' && (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed))) {
      setError('Please enter a valid 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const result = mode === 'totp'
        ? await verifyMfa(twoFactorToken, trimmed)
        : await recoverMfa(twoFactorToken, trimmed);
      const accessTokenToUse = result.access_token;

      setApiAccessToken(accessTokenToUse);
      setAccessToken(accessTokenToUse);
      const user = await getMe();
      setUser(user);
      setAuthenticated();
      navigate('/', { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuth();
        setContextError('Your session has expired. Please log in again.');
        navigate('/login', { replace: true });
      } else {
        const message = err instanceof Error ? err.message : 'An error occurred.';
        setError(message || 'Invalid verification code.');
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
              Two-Factor Authentication
            </h1>
            <p className="text-xs text-accent-600/80 dark:text-accent-400/80 mt-1">
              {mode === 'totp'
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Enter one of your recovery codes to sign in.'}
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
                  {mode === 'totp' ? 'Authenticator Code' : 'Recovery Code'}
                </label>
                <input
                  type="text"
                  inputMode={mode === 'totp' ? 'numeric' : 'text'}
                  maxLength={mode === 'totp' ? 6 : undefined}
                  value={code}
                  onChange={e => setCode(mode === 'totp' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                  placeholder={mode === 'totp' ? '000000' : 'XXXX-XXXX-XXXX-XXXX'}
                  disabled={loading}
                  className="w-full text-center text-xl tracking-wider font-mono px-4 py-3 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all outline-none placeholder-slate-300 dark:placeholder-slate-600 dark:text-slate-200 disabled:opacity-50"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-lg shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Verify'
                )}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  setMode(mode === 'totp' ? 'recovery' : 'totp');
                  setCode('');
                  setError('');
                }}
                className="text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline transition-all cursor-pointer"
              >
                {mode === 'totp' ? 'Use a recovery code instead' : 'Use authenticator code instead'}
              </button>
            </div>

            <button
              onClick={() => {
                clearAuth();
                navigate('/login', { replace: true });
              }}
              className="mt-4 w-full flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
