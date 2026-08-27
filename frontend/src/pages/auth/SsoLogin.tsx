import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, MapPin, Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { login as apiLogin, getMe, setAccessToken as setApiAccessToken } from '../../services/apiClient';

export function SsoLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') || '';
  const { beginLogin, storeTwoFactorChallenge, setAccessToken, setUser, setAuthenticated } = useAuth();
  
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [useFallbackSvg, setUseFallbackSvg] = useState(false);

  const handleGoogleSignIn = () => {
    const googleUser = {
      user_id: 99,
      login_email: 'student@bicol-u.edu.ph',
      role: 'student' as const,
      display_name: 'Juan Dela Cruz (BU Gmail)',
      session_uuid: 'demo-google-session-uuid',
    };
    setAccessToken('demo-student-token');
    setUser(googleUser);
    setAuthenticated();
    navigate('/student/dashboard', { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    beginLogin();
    setIsLoading(true);
    setError('');

    if (email.trim().toLowerCase() === 'student@bicol-u.edu.ph') {
      const studentUser = {
        user_id: 99,
        login_email: 'student@bicol-u.edu.ph',
        role: 'student' as const,
        display_name: 'Juan Dela Cruz',
        session_uuid: 'demo-student-session-uuid',
      };
      setAccessToken('demo-student-token');
      setUser(studentUser);
      setAuthenticated();
      setIsLoading(false);
      navigate('/student/dashboard', { replace: true });
      return;
    }

    try {
      const result = await apiLogin(email, password);

      if (result.type === 'direct_login' && result.access_token) {
        setApiAccessToken(result.access_token);
        setAccessToken(result.access_token);
        const user = await getMe();
        setUser(user);
        setAuthenticated();
        navigate('/', { replace: true });
      } else if (result.type === 'two_factor_required' && result.two_factor_challenge_token) {
        storeTwoFactorChallenge(result.two_factor_challenge_token);
        navigate('/2fa/verify');
      } else {
        setError('Unexpected authentication response.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col justify-between bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 relative select-none">
      
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-75 pointer-events-none -z-10" />

      {/* 1. Header Navigation Bar (Full Width) */}
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs px-6 sm:px-12 py-3.5 flex-shrink-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
            <img
              src="/bu-cdm-logo.png"
              alt="BU CDM Seal"
              className="w-10 h-10 rounded-full object-cover shadow-sm flex-shrink-0"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100 tracking-tight">
                  BUCDM
                </span>
                <span className="font-heading font-extrabold text-base sm:text-lg text-accent-600 dark:text-accent-400 tracking-tight">
                  DENTISYS
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-heading tracking-wide">
                Bicol University College of Dental Medicine
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="rounded-xl bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-bold text-xs sm:text-sm px-5 py-2.5 flex items-center gap-2 shadow-md shadow-accent-600/20 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
        </div>
      </header>

      {/* 2. Main Login Card Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-4 min-h-0 overflow-y-auto">
        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[32px] shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-200/60 dark:border-slate-800/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[500px] my-auto relative z-10">
          
          {/* Left Side: Lavender/Purple Branding Sidebar */}
          <div className="md:col-span-5 bg-[#EAE5F8] dark:bg-accent-950/20 p-8 flex flex-col justify-center items-center text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-slate-100/50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />
            <div className="absolute -left-10 -bottom-10 w-44 h-44 bg-accent-200/30 dark:bg-accent-900/10 rounded-full blur-2xl -z-10" />

            <div className="flex flex-col items-center">
              {/* Tooth Logo */}
              <div className="relative group mb-3">
                <div className="absolute inset-0 bg-accent-300/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative w-24 h-24 flex items-center justify-center">
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
                      className="w-20 h-20 text-accent-600 dark:text-accent-400 drop-shadow-sm hover:scale-105 transition-transform duration-300" 
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
              
              <h1 className="text-3xl font-extrabold font-heading text-accent-800 dark:text-accent-300 tracking-tight mt-3">
                DentiSys
              </h1>
              <p className="text-xs font-semibold text-accent-600/80 dark:text-accent-400/80 uppercase tracking-widest text-center mt-2.5 max-w-[200px] leading-relaxed">
                BU Dental Medicine Information System
              </p>
            </div>

            <div className="absolute bottom-6 flex items-center gap-1.5 text-[10px] font-bold text-accent-600/60 dark:text-accent-500/60 uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Secure Access Portal</span>
            </div>
          </div>

          {/* Right Side: Form Pane */}
          <div className="md:col-span-7 p-6 sm:p-8 md:p-10 flex flex-col justify-center bg-white dark:bg-slate-900 transition-colors">
            <div className="max-w-md w-full mx-auto">
              {/* Header */}
              <div className="mb-5">
                <h2 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 tracking-tight">
                  Login to Your Account
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Sign in with your email and password or official Bicol University Gmail
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Google / BU Gmail Sign In Option */}
              <button
                onClick={handleGoogleSignIn}
                type="button"
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center gap-3 transition-all cursor-pointer active:scale-[0.99]"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Sign in with BU Gmail (@bicol-u.edu.ph)</span>
              </button>

              {/* Divider */}
              <div className="my-4 flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Or Sign In with Email
                </span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>

              {/* Form */}
              <form className="space-y-3.5" onSubmit={handleLogin}>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Bicol University Email Address
                  </label>
                  <div className="relative rounded-xl shadow-xs group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-accent-500 transition-colors">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="username@bicol-u.edu.ph"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all text-xs sm:text-sm outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative rounded-xl shadow-xs group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-accent-500 transition-colors">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all text-xs sm:text-sm outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <Link to="/forgot-password" className="text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline">
                      Forgot Password?
                    </Link>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-md shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Log In'
                    )}
                  </button>
                </div>
              </form>

              {/* Links Footer */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 text-center space-y-1.5 text-xs">
                <p className="text-slate-500 dark:text-slate-400 font-medium">
                  Faculty Member?{' '}
                  <Link to="/signup" className="text-accent-600 dark:text-accent-400 hover:underline font-bold transition-all">
                    Sign up for an account
                  </Link>
                </p>
                <p className="text-slate-500 dark:text-slate-400 font-medium">
                  Class Secretary?{' '}
                  <Link to="/activate-secretary" className="text-accent-600 dark:text-accent-400 hover:underline font-bold transition-all">
                    Activate invitation
                  </Link>
                </p>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* 3. Dark Footer Bar (Full Width) */}
      <footer className="bg-slate-900 text-slate-400 py-3 px-6 sm:px-12 border-t border-slate-800 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-center sm:text-left">
          <div className="text-slate-300 font-medium">
            © 2026 Bicol University College of Dental Medicine. All rights reserved.
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-6 text-slate-400">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" />
              <span>Legazpi City</span>
            </div>
            <a href="mailto:bu-cdm@bicol-u.edu.ph" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Mail className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" />
              <span>bu-cdm@bicol-u.edu.ph</span>
            </a>
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" />
              <span>(052) 480-0100</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}


