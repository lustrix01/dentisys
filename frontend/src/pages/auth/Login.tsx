import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { login as apiLogin, getMe, setAccessToken as setApiAccessToken } from '../../services/apiClient';

export function Login() {
  const navigate = useNavigate();
  const { beginLogin, storeMfaSelection, setAccessToken, setUser, setAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [useFallbackSvg, setUseFallbackSvg] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    beginLogin();
    setIsLoading(true);
    setError('');

    try {
      const result = await apiLogin(email, password);

      if (result.type === 'direct_login' && result.access_token) {
        setApiAccessToken(result.access_token);
        setAccessToken(result.access_token);
        const user = await getMe();
        setUser(user);
        setAuthenticated();
        navigate('/', { replace: true });
      } else if (result.type === 'mfa_method_selection' && result.mfa_selection_token && result.methods?.length) {
        storeMfaSelection(result.mfa_selection_token, result.methods);
        navigate('/mfa/select');
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

      {/* Background Decorative Blur Blobs */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-accent-150/20 dark:bg-accent-950/10 rounded-full blur-[120px] floating-orb-1 pointer-events-none -z-20" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-clinical-150/15 dark:bg-clinical-950/5 rounded-full blur-[120px] floating-orb-2 pointer-events-none -z-20" />

      {/* Main Login Card */}
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[32px] shadow-xl shadow-slate-100 dark:shadow-none border border-slate-200/30 dark:border-slate-800/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[520px] transition-all relative z-10">
        
        {/* Left Side: Lavender/Purple Branding Sidebar */}
        <div className="md:col-span-5 bg-[#EAE5F8] dark:bg-accent-950/20 p-8 flex flex-col justify-center items-center text-center relative overflow-hidden">
          {/* Subtle grid layout decoration */}
          <div className="absolute inset-0 bg-grid-slate-100/50 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />
          <div className="absolute -left-10 -bottom-10 w-44 h-44 bg-accent-200/30 dark:bg-accent-900/10 rounded-full blur-2xl -z-10" />

          {/* Center: DentiSys Brand and Main Tooth Logo */}
          <div className="flex flex-col items-center">
            {/* Tooth Logo (with image fallback) */}
            <div className="relative group mb-3">
              <div className="absolute inset-0 bg-accent-300/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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

          {/* Bottom: Version & Security Tag */}
          <div className="absolute bottom-6 flex items-center gap-1.5 text-[10px] font-bold text-accent-600/60 dark:text-accent-500/60 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Secure Access Portal v1.0</span>
          </div>
        </div>

        {/* Right Side: Form Pane */}
        <div className="md:col-span-7 p-8 sm:p-10 md:p-12 flex flex-col justify-center bg-white dark:bg-slate-900 transition-colors">
          <div className="max-w-md w-full mx-auto">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 tracking-tight">
                Login to Your Account
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                Sign in with your official Bicol University email to continue
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                {error}
              </div>
            )}

            {/* Form */}
            <form className="space-y-4" onSubmit={handleLogin}>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Bicol University Email Address
                </label>
                <div className="relative rounded-xl shadow-sm group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-accent-500 transition-colors">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="username@bicol-u.edu.ph"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all text-sm outline-none placeholder-slate-400 dark:text-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative rounded-xl shadow-sm group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-accent-500 transition-colors">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-3 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 transition-all text-sm outline-none placeholder-slate-400 dark:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <div className="flex justify-end mt-2">
                  <Link to="/forgot-password" className="text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline">
                    Forgot Password?
                  </Link>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-lg shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Log In'
                  )}
                </button>
              </div>
            </form>

            {/* Links Footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Faculty Member?{' '}
                <Link to="/signup" className="text-accent-600 dark:text-accent-400 hover:underline font-bold transition-all">
                  Sign up for an account
                </Link>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Class Secretary?{' '}
                <Link to="/activate-secretary" className="text-accent-600 dark:text-accent-400 hover:underline font-bold transition-all">
                  Activate invitation
                </Link>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
