import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Check, Copy, ExternalLink } from 'lucide-react';
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
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [useFallbackSvg, setUseFallbackSvg] = useState(false);

  const handleCopy = () => {
    if (devResetLink) {
      navigator.clipboard.writeText(devResetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const completedEmail = completeInstitutionalEmail(email);
    const res = await requestPasswordReset(completedEmail);
    setLoading(false);
    if (res.success) {
      setEmail(completedEmail);
      setDevResetLink(res.resetLink || null);
      setSubmitted(true);
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
            {!submitted ? (
              <>
                <div className="mb-6">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-100/80 dark:bg-accent-950/50 text-accent-800 dark:text-accent-300 text-[10px] font-bold uppercase tracking-wider mb-2">
                    <Mail className="w-3.5 h-3.5" /> Password Recovery
                  </div>
                  <h2 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 tracking-tight">
                    Reset your password
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                </div>

                {error && (
                  <div role="alert" className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-400 flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                    <span>{error}</span>
                  </div>
                )}

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="email" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Email address
                    </label>
                    <div className="relative rounded-xl shadow-xs group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-accent-600 dark:group-focus-within:text-accent-400 transition-colors z-10">
                        <Mail className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="flex">
                        <input
                          id="email"
                          name="email"
                          type="text"
                          inputMode="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`min-w-0 flex-1 pl-10 pr-3 py-2.5 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 ${email.includes('@') ? 'rounded-xl' : 'rounded-l-xl'} focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all text-xs outline-none placeholder-slate-400 dark:text-slate-200`}
                          placeholder={email.includes('@') ? `username@${DEFAULT_EMAIL_DOMAIN}` : 'username'}
                        />
                        {!email.includes('@') && (
                          <span className="flex items-center rounded-r-xl border border-l-0 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 text-xs font-bold text-accent-700 dark:text-accent-300">
                            @{DEFAULT_EMAIL_DOMAIN}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-lg shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Send reset link'
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center py-2">
                <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 shadow-sm">
                  <Mail className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-xl font-extrabold font-heading text-slate-900 dark:text-slate-100">
                  Check your email
                </h3>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                  We have sent a password reset link to{' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{email}</span>.
                </p>

                {devResetLink && (
                  <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl text-left space-y-2.5">
                    <div className="flex items-center space-x-2 text-amber-800 dark:text-amber-300 font-semibold text-xs">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>Development Mode Reset Link</span>
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Since email delivery is in local development mode, use the link below to set your new password:
                    </p>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        value={devResetLink}
                        className="block w-full text-xs bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 font-mono truncate focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 text-xs font-semibold rounded-lg transition-colors flex items-center shrink-0 cursor-pointer"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <a
                      href={devResetLink}
                      className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 focus:outline-none transition-all"
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Reset Password Now
                    </a>
                  </div>
                )}

                <div className="mt-6">
                  <Link
                    to="/login"
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-accent-600/20 text-xs font-bold text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 transition-all"
                  >
                    Return to login
                  </Link>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-center">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 hover:underline transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
