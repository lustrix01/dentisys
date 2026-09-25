import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
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
  const [useFallbackSvg, setUseFallbackSvg] = useState(false);

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
    if (password !== confirmPassword) {
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-hidden transition-colors duration-300 font-sans text-slate-800 dark:text-slate-100">
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-75 pointer-events-none -z-10" />

      {/* Main Card Container */}
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[32px] shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-200/60 dark:border-slate-800/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[500px] my-auto relative z-10">

        {/* Left Branding Sidebar */}
        <div className="md:col-span-5 bg-[#EAE5F8] dark:bg-accent-950/20 p-6 md:p-8 flex flex-col justify-center items-center text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-slate-100/50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />

          <div className="flex flex-col items-center">
            {/* Tooth Logo */}
            <div className="relative group mb-2 md:mb-3">
              <div className="relative w-16 h-16 md:w-24 md:h-24 flex items-center justify-center">
                {!useFallbackSvg ? (
                  <img
                    src="/tooth-logo.png"
                    alt="DentiSys Logo"
                    className="max-w-full max-h-full object-contain hover:scale-105 transition-transform duration-300"
                    onError={() => setUseFallbackSvg(true)}
                  />
                ) : (
                  <svg
                    viewBox="0 0 100 100"
                    className="w-16 h-16 md:w-20 md:h-20 text-accent-600 dark:text-accent-400 drop-shadow-sm hover:scale-105 transition-transform duration-300"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M 30,40 C 25,25 40,20 50,28 C 60,20 75,25 70,40 C 68,60 72,75 66,85 C 63,90 56,90 54,82 C 52,74 51,64 50,64 C 49,64 48,74 46,82 C 44,90 37,90 34,85 C 28,75 32,60 30,40 Z" />
                  </svg>
                )}
              </div>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold font-heading text-accent-800 dark:text-accent-300 tracking-tight mt-1 md:mt-2">
              DentiSYS
            </h1>
            <p className="text-[10px] md:text-xs font-semibold text-accent-600/80 dark:text-accent-400/80 uppercase tracking-widest text-center mt-1.5 md:mt-2 max-w-[200px] leading-relaxed">
              BU Dental Medicine Information System
            </p>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="md:col-span-7 p-6 sm:p-8 md:p-10 flex flex-col justify-center bg-white dark:bg-slate-900 transition-colors">
          <div className="max-w-md w-full mx-auto">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-100/80 dark:bg-accent-950/50 text-accent-800 dark:text-accent-300 text-[10px] font-bold uppercase tracking-wider mb-2">
                <Lock className="w-3.5 h-3.5" /> Password Reset
              </div>
              <h2 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 tracking-tight">
                Create new password
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Your new password must be different from previous used passwords.
              </p>
            </div>

            {success && (
              <div role="alert" className="mb-4 p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            {error && (
              <div role="alert" className="mb-4 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-400 flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                <span>{error}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="password" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative rounded-xl shadow-xs group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-accent-600 dark:group-focus-within:text-accent-400 transition-colors">
                    <Lock className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all text-xs outline-none placeholder-slate-400 dark:text-slate-200"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Real-time Password Requirements Checklist */}
                {password.length > 0 && (
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-[11px] space-y-1.5">
                    <div className="font-semibold text-slate-600 dark:text-slate-400 text-[10px] uppercase tracking-wider mb-1">
                      Password Security Requirements:
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasMinLength ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                        {passwordCriteria.hasMinLength ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                        <span>At least 8 characters</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasUppercase ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                        {passwordCriteria.hasUppercase ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                        <span>1+ Uppercase letter</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasLowercase ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                        {passwordCriteria.hasLowercase ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                        <span>1+ Lowercase letter</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasNumber ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
                        {passwordCriteria.hasNumber ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                        <span>1+ Number (0-9)</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasSpecial ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400 dark:text-slate-500'} col-span-2`}>
                        {passwordCriteria.hasSpecial ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                        <span>1+ Special character (!@#$%^&*)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative rounded-xl shadow-xs group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-accent-600 dark:group-focus-within:text-accent-400 transition-colors">
                    <Lock className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all text-xs outline-none placeholder-slate-400 dark:text-slate-200"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || (password.length > 0 && !passwordCriteria.isValid)}
                  className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-lg shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Reset password'
                  )}
                </button>
              </div>
            </form>

            <div className="mt-6 flex items-center justify-center">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 hover:underline transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
