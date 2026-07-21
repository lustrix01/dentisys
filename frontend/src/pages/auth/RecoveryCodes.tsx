import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function RecoveryCodes() {
  const navigate = useNavigate();
  const { recoveryCodes, clearRecoveryCodes } = useAuth();
  const [acknowledged, setAcknowledged] = useState(false);
  const [allCopied, setAllCopied] = useState(false);

  useEffect(() => {
    if (!recoveryCodes || recoveryCodes.length === 0) {
      navigate('/', { replace: true });
    }
  }, [recoveryCodes, navigate]);

  if (!recoveryCodes || recoveryCodes.length === 0) {
    return null;
  }

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleContinue = () => {
    clearRecoveryCodes();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-xl border border-slate-200/30 dark:border-slate-800/80 overflow-hidden">
          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-3">
              <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-xl font-extrabold font-heading text-emerald-800 dark:text-emerald-300">
              Recovery Codes
            </h1>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">
              Save these codes in a secure location. You can use each code once if you lose access to your authenticator app.
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>These codes are shown only once.</strong> If you close this page without saving them,
                they cannot be recovered. Store them securely offline.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recoveryCodes.map((code, index) => (
                <code
                  key={index}
                  className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 dark:text-slate-300 select-all text-center"
                >
                  {code}
                </code>
              ))}
            </div>

            <button
              onClick={handleCopyAll}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {allCopied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy All Codes
                </>
              )}
            </button>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={e => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-accent-600 focus:ring-accent-500 border-slate-300 dark:border-slate-700 rounded cursor-pointer"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                I have saved my recovery codes securely. I understand they will not be shown again.
              </span>
            </label>

            <button
              onClick={handleContinue}
              disabled={!acknowledged}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-lg shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              Continue to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
