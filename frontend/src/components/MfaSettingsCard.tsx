import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, RefreshCw, Smartphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Modal } from './Modal';
import {
  ApiError,
  confirmEnrollment,
  forgetTrustedDevicesApi,
  getMfaSettingsApi,
  regenerateMfaRecoveryCodesApi,
  revokeMfaApi,
  startEnrollment,
} from '../services/apiClient';

const SETUP_EXPIRED = 'This setup expired. Click Set up again to get a new QR code.';

interface Enrollment {
  confirmationToken: string;
  provisioningUri: string;
  qrDataUri: string;
  secret: string;
}

export const MfaSettingsCard: React.FC<{
  userEmail?: string;
  roleName?: string;
  onAuthenticatorStatusChange?: (enabled: boolean) => void;
  required?: boolean; // 13.9 D6: the Superadmin's 2FA cannot be turned off
}> = ({ onAuthenticatorStatusChange, required = false }) => {
  const [authenticatorEnabled, setAuthenticatorEnabled] = useState(false);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [trustedCount, setTrustedCount] = useState(0);
  const [forgetOpen, setForgetOpen] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusAvailable, setStatusAvailable] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const startingRef = useRef(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getMfaSettingsApi();
      const twoFactor = response?.two_factor;
      if (!twoFactor
        || typeof twoFactor.authenticator_enabled !== 'boolean'
        || !Number.isInteger(twoFactor.recovery_code_count)
        || twoFactor.recovery_code_count < 0) {
        throw new Error('Could not read the current 2FA settings. Reload the page.');
      }
      setAuthenticatorEnabled(twoFactor.authenticator_enabled);
      onAuthenticatorStatusChange?.(twoFactor.authenticator_enabled);
      setRecoveryCount(twoFactor.recovery_code_count);
      setTrustedCount(Number.isInteger(twoFactor.trusted_device_count) && twoFactor.trusted_device_count > 0 ? twoFactor.trusted_device_count : 0);
      setStatusAvailable(true);
    } catch (requestError) {
      setStatusAvailable(false);
      setAuthenticatorEnabled(false);
      onAuthenticatorStatusChange?.(false);
      setRecoveryCount(0);
      setTrustedCount(0);
      setError(requestError instanceof Error ? requestError.message : 'Could not load 2FA settings. Reload the page.');
    } finally {
      setLoading(false);
    }
  }, [onAuthenticatorStatusChange]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const beginAuthenticator = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
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
      setError(requestError instanceof Error ? requestError.message : 'Could not begin authenticator setup. Try again.');
    } finally { startingRef.current = false; setWorking(false); }
  };

  const confirmAuthenticator = async () => {
    if (!enrollment || !/^\d{6}$/.test(code)) return;
    setWorking(true); setError('');
    try {
      const response = await confirmEnrollment(enrollment.confirmationToken, code);
      setAuthenticatorEnabled(true);
      onAuthenticatorStatusChange?.(true);
      setRecoveryCodes(response.recovery_codes);
      setRecoveryCount(response.recovery_codes.length);
      setTrustedCount(0);
      setEnrollment(null); setCode('');
      setSuccess('Authenticator 2FA enabled.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setEnrollment(null); setCode('');
        setError(SETUP_EXPIRED);
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Could not confirm the authenticator. Try again.');
      }
    } finally { setWorking(false); }
  };

  const disableAuthenticator = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Enter the current authenticator code.'); return; }
    setWorking(true); setError('');
    try {
      const response = await revokeMfaApi(code);
      setAuthenticatorEnabled(false); setRecoveryCount(0); setTrustedCount(0); setRecoveryCodes([]); setCode('');
      onAuthenticatorStatusChange?.(false);
      setSuccess(response.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not disable the authenticator. Try again.');
    } finally { setWorking(false); }
  };

  const regenerate = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Enter the current authenticator code.'); return; }
    setWorking(true); setError('');
    try {
      const response = await regenerateMfaRecoveryCodesApi(code);
      setRecoveryCodes(response.recovery_codes);
      setRecoveryCount(response.recovery_codes.length);
      setTrustedCount(0);
      setCode(''); setSuccess(response.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not regenerate recovery codes. Try again.');
    } finally { setWorking(false); }
  };

  const forgetTrustedDevices = async () => {
    setWorking(true); setError('');
    try {
      await forgetTrustedDevicesApi();
      setForgetOpen(false); setTrustedCount(0); setSuccess('Remembered devices forgotten.');
    } catch (requestError) {
      setForgetOpen(false);
      setError(requestError instanceof Error ? requestError.message : 'Could not forget remembered devices. Try again.');
    } finally { setWorking(false); }
  };

  return (
    <Card className="p-0 max-md:!p-4 overflow-hidden">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800">
        <CardTitle className="text-sm">Two-Factor Authentication</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5 max-md:p-0">
        {loading && <p className="text-xs text-slate-500">Loading security settings…</p>}
        {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4" />{error}</div>}
        {success && <div className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{success}</div>}

        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex max-[374px]:flex-wrap items-center justify-between gap-4 max-[389px]:gap-3">
            <div><p className="flex items-center gap-2 text-sm font-bold"><Smartphone className="h-4 w-4" />Authenticator app</p><p className="mt-1 text-xs text-slate-500">Google Authenticator compatible · {recoveryCount} recovery codes</p></div>
            {statusAvailable && !authenticatorEnabled && <button type="button" disabled={working} onClick={() => void beginAuthenticator()} className="shrink-0 whitespace-nowrap rounded-xl bg-indigo-600 px-4 max-[389px]:px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Set up</button>}
          </div>
          {authenticatorEnabled && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold">Current Code<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 block rounded-xl border px-3 py-2 font-mono tracking-widest dark:bg-slate-950" placeholder="000000" /></label>
              <button type="button" onClick={() => void regenerate()} disabled={working || code.length !== 6} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" />New recovery codes</button>
              {!required && <button type="button" onClick={() => void disableAuthenticator()} disabled={working || code.length !== 6} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Disable</button>}
            </div>
          )}
          {authenticatorEnabled && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Remembered devices: {trustedCount}</p>
              <button type="button" onClick={() => setForgetOpen(true)} disabled={working || trustedCount === 0} className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Forget my trusted devices</button>
            </div>
          )}
          {required && <p className="text-xs text-slate-500 dark:text-slate-400">2FA is required for the Superadmin and cannot be turned off.</p>}
        </div>

        {recoveryCodes.length > 0 && <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-bold text-amber-800">Save these recovery codes now.</p><div className="mt-2 grid gap-2 font-mono text-xs sm:grid-cols-2">{recoveryCodes.map(item => <span key={item}>{item}</span>)}</div></div>}
      </CardContent>

      <Modal isOpen={enrollment !== null} onClose={() => setEnrollment(null)} title="Set Up Authenticator">
        {enrollment && <div className="space-y-4 text-center">
          <img src={enrollment.qrDataUri} alt="Authenticator provisioning QR code" className="mx-auto h-60 w-60 rounded-xl bg-white p-2" />
          <p className="text-xs text-slate-500">Scan this QR code in Google Authenticator, then enter its six-digit code.</p>
          <details className="text-left text-xs"><summary className="cursor-pointer font-bold">Manual setup</summary><p className="mt-2 break-all font-mono">{enrollment.secret}</p><p className="mt-1 break-all text-slate-500">{enrollment.provisioningUri}</p></details>
          <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl border px-3 py-2 text-center font-mono tracking-widest dark:bg-slate-950" placeholder="000000" />
          <button type="button" onClick={() => void confirmAuthenticator()} disabled={working || code.length !== 6} className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><KeyRound className="mr-2 inline h-4 w-4" />Confirm</button>
        </div>}
      </Modal>

      <Modal isOpen={forgetOpen} onClose={() => setForgetOpen(false)} title="Forget Trusted Devices" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">Forget all remembered devices? You'll enter your code at the next sign-in on each one.</p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => setForgetOpen(false)} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            <button type="button" onClick={() => void forgetTrustedDevices()} disabled={working} className="min-h-11 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50 bg-rose-600 hover:bg-rose-700">Forget devices</button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
