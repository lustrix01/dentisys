import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Briefcase,
  ArrowRight,
  AlertCircle,
  Clock,
  Building2,
} from 'lucide-react';
import {
  fetchSecretaryInvitationByToken,
  activateSecretaryAccount,
  validatePasswordRequirements,
  SecretaryInvitation,
} from '../../services/authService';

export function ActivateSecretary() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [invitation, setInvitation] = useState<SecretaryInvitation | null>(null);
  const [invitationError, setInvitationError] = useState('');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  
  const [useFallbackSvg, setUseFallbackSvg] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvitationError('No invitation token provided. Please use the complete activation link provided in your invitation email.');
      return;
    }

    fetchSecretaryInvitationByToken(token).then((inv) => {
      if (!inv) {
        setInvitationError('Invalid or expired invitation token. The link may be invalid or corrupted.');
        return;
      }

      if (inv.status === 'Revoked') {
        setInvitationError('This Class Secretary invitation has been revoked by the faculty member.');
        return;
      }

      if (inv.status === 'Expired') {
        setInvitationError('This Class Secretary invitation link has expired. Please contact your faculty member to request a new invitation.');
        return;
      }

      if (inv.status === 'Accepted') {
        setInvitationError('This Class Secretary invitation has already been accepted and activated. You can proceed directly to sign in.');
        return;
      }

      setInvitation(inv);
    });
  }, [token]);

  const passwordCriteria = useMemo(() => {
    return validatePasswordRequirements(password);
  }, [password]);

  const isPasswordMatch = useMemo(() => {
    if (!confirmPassword) return true;
    return password === confirmPassword;
  }, [password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setConfirmTouched(true);

    if (!passwordCriteria.isValid) {
      setErrorMessage('Password does not meet all security requirements.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await activateSecretaryAccount(token, password);
      setIsLoading(false);

      if (res.success) {
        setSuccessMessage(res.message);
        setRedirectCountdown(3);

        let count = 3;
        const interval = setInterval(() => {
          count -= 1;
          setRedirectCountdown(count);
          if (count <= 0) {
            clearInterval(interval);
            navigate('/login');
          }
        }, 1000);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMessage('An unexpected error occurred during account activation.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-hidden transition-colors duration-300">
      <style>{`
        @keyframes float-orb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-10px, 15px) scale(1.03); }
        }
        .floating-orb-1 {
          animation: float-orb 18s ease-in-out infinite;
        }
        .floating-orb-2 {
          animation: float-orb 22s ease-in-out infinite;
        }
      `}</style>

      {/* Formal Technical Grid Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-75 pointer-events-none -z-10" />

      {/* Background Decorative Blur Blobs (Blue Accent for Class Secretary) */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-blue-150/20 dark:bg-blue-950/10 rounded-full blur-[120px] floating-orb-1 pointer-events-none -z-20" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-sky-150/15 dark:bg-sky-950/5 rounded-full blur-[120px] floating-orb-2 pointer-events-none -z-20" />

      {/* Main Activation Card */}
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-[32px] shadow-xl shadow-slate-100 dark:shadow-none border border-slate-200/30 dark:border-slate-800/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[600px] transition-all relative z-10 my-6">
        
        {/* Left Side: Blue Branding Sidebar for Class Secretary */}
        <div className="md:col-span-5 bg-gradient-to-br from-blue-100/90 via-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-slate-900 p-8 flex flex-col justify-between items-center text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-slate-100/50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />
          <div className="absolute -left-10 -bottom-10 w-44 h-44 bg-blue-200/30 dark:bg-blue-900/10 rounded-full blur-2xl -z-10" />

          {/* Brand Logo & Info */}
          <div className="flex flex-col items-center my-auto">
            <div className="relative group mb-4">
              <div className="absolute inset-0 bg-blue-300/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative w-24 h-24 flex items-center justify-center">
                {!useFallbackSvg ? (
                  <img
                    src="/tooth-logo.png"
                    alt="DentiSys Tooth"
                    className="max-w-full max-h-full object-contain hover:scale-105 transition-transform duration-300"
                    onError={() => setUseFallbackSvg(true)}
                  />
                ) : (
                  <svg
                    viewBox="0 0 100 100"
                    className="w-20 h-20 text-blue-600 dark:text-blue-400 drop-shadow-sm hover:scale-105 transition-transform duration-300"
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

            <h1 className="text-3xl font-extrabold font-heading text-blue-900 dark:text-blue-300 tracking-tight">
              DentiSYS
            </h1>
            <p className="text-xs font-semibold text-blue-700/80 dark:text-blue-400/80 uppercase tracking-widest text-center mt-2 max-w-[220px] leading-relaxed">
              BU Dental Medicine Information System
            </p>

            <div className="mt-6 p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-blue-200/60 dark:border-blue-900/40 backdrop-blur-sm text-left max-w-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300 border-b border-blue-100 dark:border-blue-900/50 pb-2">
                <Briefcase className="w-4 h-4 text-blue-600" />
                <span>Class Secretary Appointment</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>Official appointment by faculty</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>Attendance monitoring & override access</span>
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center gap-1.5 text-[10px] font-bold text-blue-700/70 dark:text-blue-500/70 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Secure Access Portal v1.0</span>
          </div>
        </div>

        {/* Right Side: Activation Form or Error State */}
        <div className="md:col-span-7 p-6 sm:p-8 md:p-10 flex flex-col justify-center bg-white dark:bg-slate-900 transition-colors">
          <div className="max-w-lg w-full mx-auto">
            {/* Error View if Token is Invalid / Expired / Revoked */}
            {invitationError ? (
              <div className="p-8 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 rounded-3xl text-center space-y-4 my-4 animate-in fade-in zoom-in-95">
                <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 flex items-center justify-center mx-auto shadow-md">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-extrabold text-rose-900 dark:text-rose-200 font-heading">
                  Invitation Issue
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
                  {invitationError}
                </p>
                <div className="pt-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md gap-2"
                  >
                    Proceed to Sign In <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ) : successMessage ? (
              /* Success View */
              <div className="p-8 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 rounded-3xl text-center space-y-4 my-4 animate-in fade-in zoom-in-95">
                <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto shadow-md">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-extrabold text-emerald-900 dark:text-emerald-200 font-heading">
                  Account Activated!
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
                  {successMessage}
                </p>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Redirecting to Sign In in{' '}
                  <span className="text-blue-600 dark:text-blue-400 font-extrabold text-sm">
                    {redirectCountdown ?? 3}s
                  </span>
                  ...
                </div>
                <div className="pt-2">
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md gap-2"
                  >
                    Sign In Now <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ) : invitation ? (
              /* Form View */
              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                <div className="mb-4">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-100/80 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wider mb-2">
                    <Briefcase className="w-3.5 h-3.5" /> Class Secretary Activation
                  </div>
                  <h2 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 tracking-tight">
                    Activate Your Account
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Complete your registration by setting a password for your Class Secretary account.
                  </p>
                </div>

                {/* Appointment Detail Summary Card */}
                <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/40 text-xs space-y-1.5 mb-2">
                  <div className="flex items-center justify-between text-blue-900 dark:text-blue-200 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      Assigned Class: {invitation.className}
                    </span>
                    <span className="text-[10px] text-blue-700 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/60 px-2 py-0.5 rounded-full font-semibold">
                      Role: Class Secretary
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Appointed by: <strong>{invitation.facultyName}</strong> (Dental Faculty Member)
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Link expires: {new Date(invitation.expiresAt).toLocaleDateString('en-PH')}
                  </p>
                </div>

                {/* General Error Message */}
                {errorMessage && (
                  <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Pre-filled Full Name (Disabled) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Full Name (Pre-filled)
                  </label>
                  <div className="relative rounded-xl shadow-sm bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      disabled
                      value={invitation.studentName}
                      className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-transparent cursor-not-allowed outline-none"
                    />
                  </div>
                </div>

                {/* Pre-filled BU Email (Disabled) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Official BU Email Address (Pre-filled)
                  </label>
                  <div className="relative rounded-xl shadow-sm bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      disabled
                      value={invitation.email}
                      className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-transparent cursor-not-allowed outline-none"
                    />
                  </div>
                </div>

                {/* Create Password */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Create Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative rounded-xl shadow-sm group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-xs outline-none placeholder-slate-400 dark:text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Password Checklist */}
                  {password.length > 0 && (
                    <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-[11px] space-y-1.5">
                      <div className="font-semibold text-slate-600 dark:text-slate-400 text-[10px] uppercase tracking-wider mb-1">
                        Password Requirements:
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        <div className={`flex items-center gap-1.5 ${passwordCriteria.hasMinLength ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                          {passwordCriteria.hasMinLength ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                          <span>At least 8 characters</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordCriteria.hasUppercase ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                          {passwordCriteria.hasUppercase ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                          <span>1+ Uppercase letter</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordCriteria.hasLowercase ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                          {passwordCriteria.hasLowercase ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                          <span>1+ Lowercase letter</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordCriteria.hasNumber ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                          {passwordCriteria.hasNumber ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                          <span>1+ Number (0-9)</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${passwordCriteria.hasSpecial ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'} col-span-2`}>
                          {passwordCriteria.hasSpecial ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-60" />}
                          <span>1+ Special character (!@#$%^&*)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Confirm Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative rounded-xl shadow-sm group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onBlur={() => setConfirmTouched(true)}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-10 py-2.5 bg-slate-50/50 dark:bg-slate-800/40 border ${
                        confirmTouched && confirmPassword && !isPasswordMatch
                          ? 'border-rose-400 focus:ring-rose-500 focus:border-rose-500'
                          : confirmTouched && confirmPassword && isPasswordMatch
                          ? 'border-emerald-400 focus:ring-emerald-500 focus:border-emerald-500'
                          : 'border-slate-200 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500'
                      } rounded-xl focus:bg-white dark:focus:bg-slate-900 transition-all text-xs outline-none placeholder-slate-400 dark:text-slate-200`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmTouched && confirmPassword && !isPasswordMatch && (
                    <p className="mt-1 text-[11px] font-medium text-rose-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      Passwords do not match.
                    </p>
                  )}
                </div>

                {/* Submit Activation */}
                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Accept Invitation & Activate Account'
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
              Already have an active account?{' '}
              <Link
                to="/login"
                className="text-blue-600 dark:text-blue-400 hover:underline font-bold transition-all"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
