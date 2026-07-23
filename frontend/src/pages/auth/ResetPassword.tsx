import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
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
            {success && (
              <div className="bg-emerald-50 border-l-4 border-emerald-400 p-4 rounded-r-xl">
                <p className="text-sm text-emerald-700 font-medium">{success}</p>
              </div>
            )}

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
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500 block w-full pl-10 pr-10 sm:text-sm border-slate-300 rounded-xl py-2.5 border transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Real-time Password Requirements Checklist */}
              {password.length > 0 && (
                <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1.5">
                  <div className="font-semibold text-slate-600 text-[10px] uppercase tracking-wider mb-1">
                    Password Security Requirements:
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasMinLength ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      {passwordCriteria.hasMinLength ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                      <span>At least 8 characters</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasUppercase ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      {passwordCriteria.hasUppercase ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                      <span>1+ Uppercase letter</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasLowercase ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      {passwordCriteria.hasLowercase ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                      <span>1+ Lowercase letter</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasNumber ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                      {passwordCriteria.hasNumber ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                      <span>1+ Number (0-9)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${passwordCriteria.hasSpecial ? 'text-emerald-600 font-semibold' : 'text-slate-400'} col-span-2`}>
                      {passwordCriteria.hasSpecial ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                      <span>1+ Special character (!@#$%^&*)</span>
                    </div>
                  </div>
                </div>
              )}
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
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500 block w-full pl-10 pr-10 sm:text-sm border-slate-300 rounded-xl py-2.5 border transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || (password.length > 0 && !passwordCriteria.isValid)}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-lg shadow-clinical-500/20 text-sm font-bold text-white bg-gradient-to-r from-clinical-600 to-clinical-500 hover:from-clinical-700 hover:to-clinical-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Reset password'
                )}
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
