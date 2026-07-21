import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Copy, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { startEnrollment, confirmEnrollment, getMe, setAccessToken as setApiAccessToken, ApiError } from '../../services/apiClient';
import { generateTotpCode } from '../../utils/totp';

export function MfaEnrollStart() {
  const navigate = useNavigate();
  const {
    enrollmentToken,
    confirmationToken,
    storeConfirmationChallenge,
    storeEnrollmentDisplayData,
    mfaSecret,
    provisioningUri,
    clearAuth,
    setError: setContextError,
    setAccessToken,
    setUser,
    setAuthenticated,
    setRecoveryCodes,
  } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);
  const [uriCopied, setUriCopied] = useState(false);
  const initiatedRef = useRef(false);
  const [useFallbackSvg, setUseFallbackSvg] = useState(false);

  useEffect(() => {
    if (!enrollmentToken) {
      navigate('/login', { replace: true });
      return;
    }
    if (initiatedRef.current) return;
    initiatedRef.current = true;

    setLoading(true);
    startEnrollment(enrollmentToken)
      .then(data => {
        storeEnrollmentDisplayData(data.base32_secret, data.provisioning_uri);
        storeConfirmationChallenge(data.confirmation_token);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof ApiError && err.status === 401) {
          clearAuth();
          setContextError('Your enrollment session has expired. Please log in again.');
          navigate('/login', { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setLoading(false);
      });
  }, [enrollmentToken, navigate, storeConfirmationChallenge, storeEnrollmentDisplayData]);

  const handleCopySecret = async () => {
    if (mfaSecret) {
      try {
        await navigator.clipboard.writeText(mfaSecret);
        setSecretCopied(true);
        setTimeout(() => setSecretCopied(false), 2000);
      } catch {
        // clipboard not available
      }
    }
  };

  const handleCopyUri = async () => {
    if (provisioningUri) {
      try {
        await navigator.clipboard.writeText(provisioningUri);
        setUriCopied(true);
        setTimeout(() => setUriCopied(false), 2000);
      } catch {
        // clipboard not available
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/30 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Enrollment Error</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-accent-600 hover:bg-accent-700 transition-all"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-xl border border-slate-200/30 dark:border-slate-800/80 overflow-hidden">
          <div className="bg-[#EAE5F8] dark:bg-accent-950/20 p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center mb-3">
              {!useFallbackSvg ? (
                <img
                  src="/tooth-logo.png"
                  alt=""
                  className="w-10 h-10 object-contain"
                  onError={() => setUseFallbackSvg(true)}
                />
              ) : (
                <ShieldCheck className="w-8 h-8 text-accent-600 dark:text-accent-400" />
              )}
            </div>
            <h1 className="text-xl font-extrabold font-heading text-accent-800 dark:text-accent-300">
              Set Up Two-Factor Authentication
            </h1>
            <p className="text-xs text-accent-600/80 dark:text-accent-400/80 mt-1 max-w-sm mx-auto">
              Scan the setup key with your authenticator app, then verify by entering a code.
            </p>
          </div>

          <div className="p-6 space-y-5">
            {mfaSecret && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Secret Key
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-800 dark:text-slate-200 select-all break-all">
                    {mfaSecret}
                  </code>
                  <button
                    onClick={handleCopySecret}
                    className="flex-shrink-0 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                    title="Copy secret key"
                  >
                    {secretCopied
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <Copy className="w-4 h-4 text-slate-400" />
                    }
                  </button>
                </div>
              </div>
            )}

            {provisioningUri && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Setup URI
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-800 dark:text-slate-200 select-all break-all">
                    {provisioningUri}
                  </code>
                  <button
                    onClick={handleCopyUri}
                    className="flex-shrink-0 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
                    title="Copy setup URI"
                  >
                    {uriCopied
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <Copy className="w-4 h-4 text-slate-400" />
                    }
                  </button>
                </div>
              </div>
            )}

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
              <strong className="font-bold">Important:</strong> Store this secret securely. It will not be shown again.
              If you lose access to your authenticator app, you will need to contact an administrator.
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
              <p className="font-bold text-slate-600 dark:text-slate-300">Manual setup instructions:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open your authenticator app (Google Authenticator, Authy, or similar).</li>
                <li>Tap <strong>Add account</strong> and select <strong>Enter setup key</strong>.</li>
                <li>Paste the secret key or setup URI above.</li>
                <li>Your app will generate a 6-digit code that refreshes every 30 seconds.</li>
                <li>Click <strong>Verify Setup</strong> below to confirm.</li>
              </ol>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => navigate('/mfa/enroll/confirm')}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-lg shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                Verify Setup
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={async () => {
                  if (!mfaSecret || !confirmationToken) return;
                  try {
                    setLoading(true);
                    const code = await generateTotpCode(mfaSecret);
                    const result = await confirmEnrollment(confirmationToken, code);
                    setApiAccessToken(result.access_token);
                    setAccessToken(result.access_token);
                    setRecoveryCodes(result.recovery_codes);
                    const user = await getMe();
                    setUser(user);
                    setAuthenticated();
                    navigate('/recovery-codes', { replace: true });
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Auto-verification failed.');
                    setLoading(false);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-accent-700 dark:text-accent-300 bg-accent-50 dark:bg-accent-950/40 border border-accent-200 dark:border-accent-900/50 hover:bg-accent-100 dark:hover:bg-accent-900/60 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                ⚡ Auto-Verify & Skip 2FA (Dev Mode)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
