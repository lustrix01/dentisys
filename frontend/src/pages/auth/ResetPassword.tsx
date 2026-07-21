import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    // Simulate password reset
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-clinical-50 via-white to-accent-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/bu-cdm-logo.png" alt="BU College of Dental Medicine" className="w-20 h-20 rounded-full object-cover shadow-xl shadow-clinical-500/15" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold font-heading bg-gradient-to-r from-clinical-700 to-clinical-500 bg-clip-text text-transparent">
          Create new password
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500 font-medium">
          Your new password must be different from previous used passwords.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/80 backdrop-blur-lg py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-200/60">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-rose-50 border-l-4 border-rose-400 p-4 rounded-r-xl">
                <div className="flex">
                  <div className="ml-3">
                    <p className="text-sm text-rose-700 font-medium">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                New Password
              </label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" aria-hidden="true" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-xl py-2.5 border transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700">
                Confirm New Password
              </label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" aria-hidden="true" />
                </div>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-xl py-2.5 border transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-lg shadow-clinical-500/20 text-sm font-bold text-white bg-gradient-to-r from-clinical-600 to-clinical-500 hover:from-clinical-700 hover:to-clinical-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 transition-all"
              >
                Reset password
              </button>
            </div>
          </form>
          
          <div className="mt-6 flex items-center justify-center">
            <Link to="/login" className="text-sm font-semibold text-clinical-600 hover:text-clinical-500 transition-colors">
              Return to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
