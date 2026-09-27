import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { ApiError, changePasswordApi } from '../services/apiClient';
import { validatePasswordRequirements } from '../services/authService';
import { useAuth } from '../context/AuthContext';

// Mirrors the server policy (backend/app/validation.php validate_password_policy).
const PASSWORD_REQUIREMENTS = [
  { key: 'hasMinLength', label: 'At least 8 characters' },
  { key: 'hasUppercase', label: 'An uppercase letter (A-Z)' },
  { key: 'hasLowercase', label: 'A lowercase letter (a-z)' },
  { key: 'hasNumber', label: 'A number (0-9)' },
  { key: 'hasSpecial', label: 'A special character, e.g. ! @ # $ % & * ?' },
] as const;

function serverErrorMessages(err: unknown): string[] {
  if (err instanceof ApiError && Array.isArray(err.errors)) {
    const messages = err.errors
      .map(item => (item && typeof item === 'object' && 'message' in item ? String((item as { message: unknown }).message) : ''))
      .filter(message => message !== '');
    if (messages.length > 0) return Array.from(new Set(messages));
  }
  return [err instanceof Error && err.message ? err.message : 'Failed to update password.'];
}

interface PasswordChangeCardProps {
  onSuccess?: () => void;
}

export const PasswordChangeCard: React.FC<PasswordChangeCardProps> = ({ onSuccess }) => {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

  const criteria = validatePasswordRequirements(newPassword);
  const confirmationMismatch = confirmPassword !== '' && newPassword !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorDetails([]);
    setSuccess(null);

    if (!currentPassword) {
      setError('Current password is required.');
      return;
    }
    if (!newPassword) {
      setError('New password is required.');
      return;
    }
    if (!criteria.isValid) {
      setError('New password does not meet all of the requirements listed below it.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password cannot be the same as current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await changePasswordApi({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setSuccess(res.message || 'Password changed successfully. Please log in again with your new credentials.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          void logout();
        }
      }, 2000);
    } catch (err: unknown) {
      const messages = serverErrorMessages(err);
      setError(messages.length > 1 ? 'Password was not changed:' : messages[0]);
      setErrorDetails(messages.length > 1 ? messages : []);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
        <CardTitle className="flex items-center gap-2 text-sm">
          <KeyRound className="w-4.5 h-4.5 text-accent-500" />
          <span>Security: Change Password</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 flex items-start gap-2 animate-fade-in"
            >
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <span>{error}</span>
                {errorDetails.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 font-medium">
                    {errorDetails.map(message => <li key={message}>{message}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}

          {success && (
            <div
              role="status"
              className="p-3.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-start gap-2 animate-fade-in"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Current Password */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Current Password *
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                name="current-password"
                id="current-password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              New Password *
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                name="new-password"
                id="new-password"
                autoComplete="new-password"
                required
                minLength={8}
                aria-describedby="new-password-requirements"
                aria-invalid={newPassword !== '' && !criteria.isValid}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div id="new-password-requirements" aria-live="polite" className="mt-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-3">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Your new password must have:</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                {PASSWORD_REQUIREMENTS.map(requirement => {
                  const met = criteria[requirement.key];
                  return (
                    <li key={requirement.key} className={met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                      {met ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> : <XCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                      {requirement.label}
                      <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[10px] text-slate-400">It must also be different from your current password.</p>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Confirm New Password *
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                name="confirm-password"
                id="confirm-password"
                autoComplete="new-password"
                required
                aria-invalid={confirmationMismatch}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmationMismatch && <p className="mt-1 text-xs font-medium text-rose-600">Passwords do not match.</p>}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting || !criteria.isValid || newPassword !== confirmPassword || !currentPassword}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password…</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
