import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Check, Copy, ExternalLink } from 'lucide-react';
import { requestPasswordReset } from '../../services/authService';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    const res = await requestPasswordReset(email);
    setLoading(false);
    if (res.success) {
      setDevResetLink(res.resetLink || null);
      setSubmitted(true);
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-clinical-50 via-white to-accent-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/bu-cdm-logo.png" alt="BU College of Dental Medicine" className="w-20 h-20 rounded-full object-cover shadow-xl shadow-clinical-500/15" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold font-heading bg-gradient-to-r from-clinical-700 to-clinical-500 bg-clip-text text-transparent">
          Reset your password
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500 font-medium">
          Enter your email and we'll send you a link to reset your password.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/80 backdrop-blur-lg py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-200/60">
          {!submitted ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                  Email address
                </label>
                <div className="mt-1 relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" aria-hidden="true" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-xl py-2.5 border transition-all"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-lg shadow-clinical-500/20 text-sm font-bold text-white bg-gradient-to-r from-clinical-600 to-clinical-500 hover:from-clinical-700 hover:to-clinical-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 transition-all"
                >
                  Send reset link
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-clinical-100">
                <Mail className="h-6 w-6 text-clinical-600" aria-hidden="true" />
              </div>
              <h3 className="mt-2 text-lg font-bold text-slate-900">Check your email</h3>
              <p className="mt-1 text-sm text-slate-500">
                We have sent a password reset link to <span className="font-semibold text-slate-900">{email}</span>.
              </p>

              {devResetLink && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-left">
                  <div className="flex items-center space-x-2 text-amber-800 font-semibold text-sm mb-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>Development Mode Reset Link</span>
                  </div>
                  <p className="text-xs text-amber-700 mb-3">
                    Since email delivery is in local development mode, use the link below to set your new password:
                  </p>
                  <div className="flex items-center space-x-2 mb-3">
                    <input
                      type="text"
                      readOnly
                      value={devResetLink}
                      className="block w-full text-xs bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-mono truncate focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-semibold rounded-lg transition-colors flex items-center shrink-0"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <a
                    href={devResetLink}
                    className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-md text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 focus:outline-none transition-all"
                  >
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                    Reset Password Now
                  </a>
                </div>
              )}

              <div className="mt-6">
                <Link
                  to="/login"
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-lg shadow-clinical-500/20 text-sm font-bold text-white bg-gradient-to-r from-clinical-600 to-clinical-500 hover:from-clinical-700 hover:to-clinical-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 transition-all"
                >
                  Return to login
                </Link>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center">
            <Link to="/login" className="flex items-center text-sm font-semibold text-clinical-600 hover:text-clinical-500 transition-colors">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
