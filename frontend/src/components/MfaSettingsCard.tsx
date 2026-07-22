import React, { useState, useEffect } from 'react';
import { ShieldCheck, Smartphone, CheckCircle2, AlertCircle, KeyRound, Lock, RefreshCw, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Modal } from './Modal';
import { generateBase32Secret, verifyTotpCode } from '../services/apiClient';
import { generateQrCodeSvg } from '../utils/qrCode';

interface MfaSettingsCardProps {
  userEmail?: string;
  roleName?: string;
}

export const MfaSettingsCard: React.FC<MfaSettingsCardProps> = ({
  userEmail = 'user@bicol-u.edu.ph',
  roleName = 'User',
}) => {
  const userKeySanitized = userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const storageKey = `dentisys_mfa_enabled_${userKeySanitized}`;
  const secretStorageKey = `dentisys_mfa_secret_${userKeySanitized}`;
  
  const [mfaEnabled, setMfaEnabled] = useState<boolean>(() => {
    return localStorage.getItem(storageKey) === 'true';
  });

  const [secretKey, setSecretKey] = useState<string>(() => {
    const existing = localStorage.getItem(secretStorageKey);
    if (existing && existing.length >= 32) return existing;
    const generated = generateBase32Secret(32);
    localStorage.setItem(secretStorageKey, generated);
    return generated;
  });

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

  const mockRecoveryCodes = [
    '8F2A-9K1M',
    '3L7P-4W9Q',
    '5V2X-8N0R',
    '1K6Y-7T3U',
  ];

  useEffect(() => {
    localStorage.setItem(storageKey, mfaEnabled ? 'true' : 'false');
  }, [mfaEnabled, storageKey]);

  const handleToggleMfa = () => {
    setMfaError('');
    setMfaSuccess('');
    if (mfaEnabled) {
      // Confirm disable
      const confirmDisable = window.confirm(
        `Are you sure you want to disable Multi-Factor Authentication (MFA) for your ${roleName} account?`
      );
      if (confirmDisable) {
        setMfaEnabled(false);
        setMfaSuccess('Multi-Factor Authentication disabled successfully.');
        setTimeout(() => setMfaSuccess(''), 4000);
      }
    } else {
      // Ensure per-user 32-character secret exists when opening setup
      const existing = localStorage.getItem(secretStorageKey);
      if (!existing || existing.length < 32) {
        const newSecret = generateBase32Secret(32);
        localStorage.setItem(secretStorageKey, newSecret);
        setSecretKey(newSecret);
      }
      setVerificationCode('');
      setShowSetupModal(true);
    }
  };

  const handleConfirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError('');
    setIsVerifying(true);

    try {
      const cleanCode = verificationCode.replace(/\D/g, '');
      if (!/^\d{6}$/.test(cleanCode)) {
        setMfaError('Please enter a valid 6-digit authenticator code (e.g. 123456).');
        setIsVerifying(false);
        return;
      }


      const isValid = await verifyTotpCode(secretKey, cleanCode);
      if (!isValid) {
        setMfaError('Invalid authenticator code. Please enter the current 6-digit code from your authenticator app.');
        setIsVerifying(false);
        return;
      }

      setMfaEnabled(true);
      setShowSetupModal(false);
      setVerificationCode('');
      setMfaSuccess('Multi-Factor Authentication (MFA) enabled successfully.');
      setTimeout(() => setMfaSuccess(''), 4000);
    } catch (err) {
      setMfaError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Lock className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
            Security & MFA Settings
          </span>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
              mfaEnabled
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {mfaEnabled ? 'MFA Enabled' : 'MFA Disabled'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {mfaSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{mfaSuccess}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-500" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Two-Factor Authenticator (TOTP)
              </h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg">
              Secure your {roleName} account using an authenticator app (Google Authenticator, Authy, or Microsoft Authenticator).
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleMfa}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex-shrink-0 ${
              mfaEnabled
                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
            }`}
          >
            {mfaEnabled ? 'Disable MFA' : 'Enable MFA'}
          </button>
        </div>

        {mfaEnabled && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowRecoveryCodes(!showRecoveryCodes)}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {showRecoveryCodes ? 'Hide Backup Recovery Codes' : 'View Backup Recovery Codes'}
            </button>

            {showRecoveryCodes && (
              <div className="mt-3 p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Store these one-time recovery codes in a safe place. You can use them if you lose access to your device.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                  {mockRecoveryCodes.map(code => (
                    <div key={code} className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center tracking-wider">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Modal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        title="Enable Multi-Factor Authentication (MFA)"
        size="lg"
      >
        <form onSubmit={handleConfirmSetup} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            To enable MFA, scan the QR Code or enter the secret key into your authenticator app (e.g. Google Authenticator, Authy), then enter the generated 6-digit code below.
          </p>

          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scan QR Code</span>
            <div
              data-testid="mfa-qr-code"
              className="w-44 h-44 flex items-center justify-center"
              dangerouslySetInnerHTML={{
                __html: generateQrCodeSvg(
                  `otpauth://totp/DentiSys:${encodeURIComponent(userEmail)}?secret=${secretKey}&issuer=DentiSys`,
                  176
                ),
              }}
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Authenticator Secret Key</span>
            <div className="font-mono text-sm font-extrabold text-indigo-600 dark:text-indigo-400 tracking-wider">
              {secretKey}
            </div>
            <p className="text-[11px] text-slate-400">Account: {userEmail}</p>
          </div>

          {mfaError && (
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{mfaError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              6-Digit Authenticator Code
            </label>
            <input
              type="text"
              maxLength={6}
              value={verificationCode}
              onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 123456"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowSetupModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifying || verificationCode.length < 6}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md disabled:opacity-50"
            >
              {isVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {isVerifying ? 'Verifying...' : 'Verify & Enable MFA'}
            </button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};
