import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Modal } from './Modal';
import {
  getMfaSettingsApi,
  regenerateMfaRecoveryCodesApi,
  revokeMfaApi,
} from '../services/apiClient';

interface MfaSettingsCardProps {
  userEmail?: string;
  roleName?: string;
}

export const MfaSettingsCard: React.FC<MfaSettingsCardProps> = ({
  userEmail = '',
  roleName = 'User',
}) => {
  const [enabled, setEnabled] = useState(false);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRevoke, setShowRevoke] = useState(false);
  const [stepUpCode, setStepUpCode] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getMfaSettingsApi();
      setEnabled(response.mfa.enabled);
      setRecoveryCount(response.mfa.recoveryCodeCount);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load MFA status.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const regenerateCodes = async () => {
    if (!/^\d{6}$/.test(stepUpCode)) {
      setError('Enter the current 6-digit authenticator code.');
      return;
    }
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      const response = await regenerateMfaRecoveryCodesApi(stepUpCode);
      setRecoveryCodes(response.recovery_codes);
      setRecoveryCount(response.recovery_codes.length);
      setStepUpCode('');
      setSuccess(response.message);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to regenerate recovery codes.',
      );
    } finally {
      setWorking(false);
    }
  };

  const revoke = async () => {
    if (!/^\d{6}$/.test(stepUpCode)) {
      setError('Enter the current 6-digit authenticator code.');
      return;
    }
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      const response = await revokeMfaApi(stepUpCode);
      setEnabled(false);
      setRecoveryCount(0);
      setRecoveryCodes([]);
      setShowRevoke(false);
      setStepUpCode('');
      setSuccess(response.message);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to revoke MFA.',
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
        <CardTitle className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <Lock className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
            Security &amp; MFA Settings
          </span>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
              enabled
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            {loading ? 'Checking…' : enabled ? 'MFA enabled' : 'Enrollment required'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button type="button" onClick={() => void loadStatus()} className="ml-auto underline">
              Retry
            </button>
          </div>
        )}
        {success && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-500" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Server-managed authenticator
              </h4>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {userEmail || roleName} · {recoveryCount} unused recovery codes
            </p>
          </div>
          {enabled ? (
            <button
              type="button"
              onClick={() => setShowRevoke(true)}
              disabled={working}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 disabled:opacity-50"
            >
              Revoke MFA
            </button>
          ) : (
            <p className="max-w-xs text-xs text-amber-700 dark:text-amber-400">
              Sign out and sign in again to complete required MFA enrollment.
            </p>
          )}
        </div>

        {enabled && (
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              Current authenticator code
            </label>
            <input
              value={stepUpCode}
              onChange={event => setStepUpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono tracking-widest dark:border-slate-800 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={() => void regenerateCodes()}
              disabled={working || stepUpCode.length !== 6}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {working ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Regenerate recovery codes
            </button>
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
              Save these now. They are shown only in this response.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-2">
              {recoveryCodes.map((code) => (
                <div key={code} className="rounded-lg bg-white px-3 py-2 text-center dark:bg-slate-950">
                  {code}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <Modal isOpen={showRevoke} onClose={() => setShowRevoke(false)} title="Revoke MFA credential">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              The current authenticator and all recovery codes will be revoked.
              MFA enrollment will be required on the next login.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowRevoke(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="button" onClick={() => void revoke()} disabled={working || stepUpCode.length !== 6} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {working ? 'Revoking…' : 'Revoke MFA'}
            </button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
