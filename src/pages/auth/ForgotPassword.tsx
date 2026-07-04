import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
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
