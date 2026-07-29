import React, { useState } from 'react';
import { ArrowLeft, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { startMfaChallenge } from '../../services/apiClient';

export function MfaMethodSelection() {
  const navigate = useNavigate();
  const {
    mfaSelectionToken,
    mfaMethods,
    storeSelectedMfaChallenge,
    clearAuth,
  } = useAuth();
  const [working, setWorking] = useState<'email' | 'authenticator' | null>(null);
  const [error, setError] = useState('');

  if (!mfaSelectionToken || mfaMethods.length === 0) {
    navigate('/login', { replace: true });
    return null;
  }

  const select = async (method: 'email' | 'authenticator') => {
    setWorking(method);
    setError('');
    try {
      const challenge = await startMfaChallenge(mfaSelectionToken, method);
      storeSelectedMfaChallenge(
        challenge.mfa_challenge_token,
        challenge.method,
        challenge.masked_email,
      );
      navigate('/mfa/verify', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to start verification.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-accent-600" />
          <h1 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-white">Choose a verification method</h1>
          <p className="mt-1 text-sm text-slate-500">Complete one of your enabled second factors.</p>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-6 space-y-3">
          {mfaMethods.includes('email') && (
            <button type="button" onClick={() => void select('email')} disabled={working !== null} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-accent-400 disabled:opacity-50 dark:border-slate-700">
              <Mail className="h-5 w-5 text-accent-600" />
              <span><strong className="block text-sm">Email code</strong><span className="text-xs text-slate-500">Send a six-digit code to your account email.</span></span>
            </button>
          )}
          {mfaMethods.includes('authenticator') && (
            <button type="button" onClick={() => void select('authenticator')} disabled={working !== null} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-accent-400 disabled:opacity-50 dark:border-slate-700">
              <Smartphone className="h-5 w-5 text-accent-600" />
              <span><strong className="block text-sm">Authenticator app</strong><span className="text-xs text-slate-500">Use Google Authenticator or another compatible app.</span></span>
            </button>
          )}
        </div>
        <button type="button" onClick={() => { clearAuth(); navigate('/login', { replace: true }); }} className="mt-5 flex w-full items-center justify-center gap-2 text-xs font-semibold text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </button>
      </div>
    </div>
  );
}
