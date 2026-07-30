import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, RefreshCw, Smartphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Modal } from './Modal';
import {
  confirmEnrollment,
  getMfaSettingsApi,
  regenerateMfaRecoveryCodesApi,
  revokeMfaApi,
  startEnrollment,
} from '../services/apiClient';

interface Enrollment {
  confirmationToken: string;
  provisioningUri: string;
  qrDataUri: string;
  secret: string;
}

export const MfaSettingsCard: React.FC<{ userEmail?: string; roleName?: string }> = () => {
  const [authenticatorEnabled, setAuthenticatorEnabled] = useState(false);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusAvailable, setStatusAvailable] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getMfaSettingsApi();
      const twoFactor = response?.two_factor;
      if (!twoFactor
        || typeof twoFactor.authenticator_enabled !== 'boolean'
        || !Number.isInteger(twoFactor.recovery_code_count)
        || twoFactor.recovery_code_count < 0) {
        throw new Error('Unable to read the current 2FA settings.');
      }
      setAuthenticatorEnabled(twoFactor.authenticator_enabled);
      setRecoveryCount(twoFactor.recovery_code_count);
      setStatusAvailable(true);
    } catch (requestError) {
      setStatusAvailable(false);
      setAuthenticatorEnabled(false);
      setRecoveryCount(0);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load 2FA settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStatus(); }, []);

  const beginAuthenticator = async () => {
    setWorking(true); setError(''); setSuccess('');
    try {
      const response = await startEnrollment();
      setEnrollment({
        confirmationToken: response.confirmation_token,
        provisioningUri: response.provisioning_uri,
        qrDataUri: response.qr_code_data_uri,
        secret: response.base32_secret,
      });
      setCode('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to begin authenticator setup.');
    } finally { setWorking(false); }
  };

  const confirmAuthenticator = async () => {
    if (!enrollment || !/^\d{6}$/.test(code)) return;
    setWorking(true); setError('');
    try {
      const response = await confirmEnrollment(enrollment.confirmationToken, code);
      setAuthenticatorEnabled(true);
      setRecoveryCodes(response.recovery_codes);
      setRecoveryCount(response.recovery_codes.length);
      setEnrollment(null); setCode('');
      setSuccess('Authenticator 2FA enabled.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to confirm authenticator.');
    } finally { setWorking(false); }
  };

  const disableAuthenticator = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Enter the current authenticator code.'); return; }
    setWorking(true); setError('');
    try {
      const response = await revokeMfaApi(code);
      setAuthenticatorEnabled(false); setRecoveryCount(0); setRecoveryCodes([]); setCode('');
      setSuccess(response.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to disable authenticator.');
    } finally { setWorking(false); }
  };

  const regenerate = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Enter the current authenticator code.'); return; }
    setWorking(true); setError('');
    try {
      const response = await regenerateMfaRecoveryCodesApi(code);
      setRecoveryCodes(response.recovery_codes);
      setRecoveryCount(response.recovery_codes.length);
      setCode(''); setSuccess(response.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to regenerate recovery codes.');
    } finally { setWorking(false); }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800">
        <CardTitle className="text-sm">Two-factor authentication</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {loading && <p className="text-xs text-slate-500">Loading security settings…</p>}
        {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4" />{error}</div>}
        {success && <div className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{success}</div>}

        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-4">
            <div><p className="flex items-center gap-2 text-sm font-bold"><Smartphone className="h-4 w-4" />Authenticator app</p><p className="mt-1 text-xs text-slate-500">Google Authenticator compatible · {recoveryCount} recovery codes</p></div>
            {statusAvailable && !authenticatorEnabled && <button type="button" disabled={working} onClick={() => void beginAuthenticator()} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Set up</button>}
          </div>
          {authenticatorEnabled && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold">Current code<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 block rounded-xl border px-3 py-2 font-mono tracking-widest dark:bg-slate-950" placeholder="000000" /></label>
              <button type="button" onClick={() => void regenerate()} disabled={working || code.length !== 6} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" />New recovery codes</button>
              <button type="button" onClick={() => void disableAuthenticator()} disabled={working || code.length !== 6} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Disable</button>
            </div>
          )}
        </div>

        {recoveryCodes.length > 0 && <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-bold text-amber-800">Save these recovery codes now.</p><div className="mt-2 grid gap-2 font-mono text-xs sm:grid-cols-2">{recoveryCodes.map(item => <span key={item}>{item}</span>)}</div></div>}
      </CardContent>

      <Modal isOpen={enrollment !== null} onClose={() => setEnrollment(null)} title="Set up authenticator">
        {enrollment && <div className="space-y-4 text-center">
          <img src={enrollment.qrDataUri} alt="Authenticator provisioning QR code" className="mx-auto h-60 w-60 rounded-xl bg-white p-2" />
          <p className="text-xs text-slate-500">Scan this QR code in Google Authenticator, then enter its six-digit code.</p>
          <details className="text-left text-xs"><summary className="cursor-pointer font-bold">Manual setup</summary><p className="mt-2 break-all font-mono">{enrollment.secret}</p><p className="mt-1 break-all text-slate-500">{enrollment.provisioningUri}</p></details>
          <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl border px-3 py-2 text-center font-mono tracking-widest dark:bg-slate-950" placeholder="000000" />
          <button type="button" onClick={() => void confirmAuthenticator()} disabled={working || code.length !== 6} className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><KeyRound className="mr-2 inline h-4 w-4" />Confirm</button>
        </div>}
      </Modal>

    </Card>
  );
};
