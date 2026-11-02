import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, CheckCircle2, RefreshCw } from 'lucide-react';
import { requestPasswordReset } from '../../services/authService';

const DEFAULT_EMAIL_DOMAIN = 'bicol-u.edu.ph';

function completeInstitutionalEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('@')) return trimmed;
  return `${trimmed}@${DEFAULT_EMAIL_DOMAIN}`;
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const completedEmail = completeInstitutionalEmail(email);
    const res = await requestPasswordReset(completedEmail);
    setLoading(false);
    if (res.success) {
      setEmail(completedEmail);
      setSubmitted(true);
      setResendCooldown(60);
      setResendMessage('');
    } else {
      setError(res.message);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setResendMessage('');
    const res = await requestPasswordReset(email);
    setResendLoading(false);
    if (res.success) {
      setResendCooldown(60);
      setResendMessage('A new reset link has been sent to your email.');
      setTimeout(() => setResendMessage(''), 5000);
    } else {
      setError(res.message || 'Failed to resend reset link.');
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

          {!submitted ? (
            <div className="w-full max-w-sm mx-auto my-auto py-6 space-y-6">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading">
                  Reset password
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Enter your institutional email address to receive a secure password reset link.
                </p>
              </div>

              {error && (
                <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    University email
                  </label>
                  <div className="relative rounded-xl">
                    <div className="flex">
                      <input
                        type="text"
                        id="email"
                        name="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={email.includes('@') ? `username@${DEFAULT_EMAIL_DOMAIN}` : 'username'}
                        className={`min-w-0 flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 ${
                          email.includes('@') ? 'rounded-xl' : 'rounded-l-xl'
                        } focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-purple-600/10 focus:border-purple-600 transition-all text-sm outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500`}
                      />
                      {!email.includes('@') && (
                        <span className="flex items-center rounded-r-xl border border-l-0 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 text-xs font-semibold text-purple-700 dark:text-purple-300">
                          @{DEFAULT_EMAIL_DOMAIN}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="whitespace-nowrap w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.99] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div className="w-full max-w-sm mx-auto my-auto py-6 space-y-5 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300">
                <Mail className="h-6 w-6" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading">
                  Check your email
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  We sent a password reset link to <span className="font-semibold text-slate-800 dark:text-slate-100">{email}</span>.
                </p>
              </div>

              {resendMessage && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{resendMessage}</span>
                </div>
              )}

              {error && (
                <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-400 flex items-center gap-2 text-left">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-left space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Didn't receive the email? Check your spam folder or request a new one:
                </p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resendLoading}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resendLoading ? 'animate-spin' : ''}`} />
                  <span>
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : 'Resend email'}
                  </span>
                </button>
              </div>

              <Link
                to="/login"
                className="whitespace-nowrap w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.99] transition-all shadow-sm flex items-center justify-center gap-2"
              >
                Return to login
              </Link>
            </div>
          )}

          {/* Bottom institutional mark */}
          <div className="text-center text-xs text-slate-400 dark:text-slate-500 pt-2">
            <span>&copy; 2026 Bicol University College of Dental Medicine</span>
          </div>
        </main>

      </div>
    </div>
  );
}
