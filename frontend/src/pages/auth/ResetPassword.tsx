import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { confirmPasswordReset, validatePasswordRequirements } from '../../services/authService';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const passwordCriteria = useMemo(() => {
    return validatePasswordRequirements(password);
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Missing or invalid password reset token.');
      return;
    }
    if (!passwordCriteria.isValid) {
      setError('Password does not meet all security requirements.');
      return;
    }
    if (password.normalize('NFC') !== confirmPassword.normalize('NFC')) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await confirmPasswordReset(token, password);
    setLoading(false);
    if (res.success) {
      setSuccess('Password reset successfully! Redirecting to sign in...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center px-4 py-8 font-sans text-slate-800 dark:text-slate-100">
      <div className="w-full max-w-4xl md:min-h-[480px] md:flex overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg dark:shadow-none">

        {/* LEFT PANE: Full-Height Vibrant Purple Hero Section matching Login */}
        <div className="hidden md:order-1 md:flex md:w-1/2 bg-[#8B5CF6] p-8 lg:p-10 flex-col justify-between relative overflow-hidden text-white select-none">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] bg-purple-300/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center my-auto">
            <div className="flex h-40 w-40 items-center justify-center">
              <img
                src="/bu-cdm-logo.png"
                alt="Bicol University College of Dental Medicine seal"
                className="h-36 w-36 object-contain drop-shadow-sm"
              />
            </div>
            <h2 className="mt-5 text-2xl font-bold tracking-tight text-white font-heading">
              DentiSYS
            </h2>
            <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100">
              Bicol University College of Dental Medicine
            </p>
          </div>
        </div>

        {/* RIGHT PANE: Main Content matching Login */}
        <main className="w-full md:order-2 md:w-1/2 min-h-0 bg-white dark:bg-slate-900 p-7 sm:p-8 lg:p-9 flex flex-col justify-between">
          <div className="flex justify-start">
            <Link
              to="/login"
              className="whitespace-nowrap text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to login</span>
            </Link>
          </div>

          <div className="w-full max-w-sm mx-auto my-auto py-5 space-y-4">
            {!token ? (
              <>
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading">
                    Reset link needed
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    This page only works from the reset link in your email. Request a new link to continue.
                  </p>
                </div>
                <Link
                  to="/forgot-password"
                  className="whitespace-nowrap w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.99] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  Send a new link
                </Link>
              </>
            ) : (
              <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading">
                Create New Password
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Choose a strong password for your account
              </p>
            </div>

            {success && (
              <div role="alert" className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            {error && (
              <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form className="space-y-3.5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  New Password
                </label>
                <div className="relative rounded-xl">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    maxLength={256}
                    aria-invalid={Boolean(password && !passwordCriteria.hasMaxLength)}
                    aria-describedby="password-length-error"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 pr-12 py-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-purple-600/10 focus:border-purple-600 transition-all text-sm outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    aria-controls="password"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password && !passwordCriteria.hasMaxLength && (
                  <p id="password-length-error" role="alert" className="mt-1 text-xs font-medium text-rose-600">
                    Use at most 32 characters.
                  </p>
                )}

                {/* Password Criteria Checklist */}
                {password.length > 0 && (
                  <div className="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                    <div className="font-semibold text-slate-600 dark:text-slate-300 text-[11px] mb-1">
                      Password requirements:
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasMinLength && passwordCriteria.hasMaxLength ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
                        {passwordCriteria.hasMinLength && passwordCriteria.hasMaxLength ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>8–32 characters</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasUppercase ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
                        {passwordCriteria.hasUppercase ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>1+ uppercase</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasLowercase ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
                        {passwordCriteria.hasLowercase ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>1+ lowercase</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasNumber ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
                        {passwordCriteria.hasNumber ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>1+ number</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasSpecial ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-400 dark:text-slate-500'} col-span-2`}>
                        {passwordCriteria.hasSpecial ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>1+ special character (!@#$%^&*)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative rounded-xl">
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    maxLength={256}
                    aria-invalid={Boolean(confirmPassword && password.normalize('NFC') !== confirmPassword.normalize('NFC'))}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 pr-12 py-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-purple-600/10 focus:border-purple-600 transition-all text-sm outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                    aria-pressed={showConfirmPassword}
                    aria-controls="confirm-password"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password.normalize('NFC') !== confirmPassword.normalize('NFC') && (
                  <p className="mt-1 text-xs font-medium text-rose-600">Passwords do not match.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || (password.length > 0 && !passwordCriteria.isValid)}
                className="whitespace-nowrap w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.99] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Reset password'
                )}
              </button>
            </form>
              </>
            )}
          </div>

          {/* Bottom institutional mark */}
          <div className="text-center text-xs text-slate-500 dark:text-slate-400">
            <span>&copy; 2026 Bicol University College of Dental Medicine</span>
          </div>
        </main>

      </div>
    </div>
  );
}
