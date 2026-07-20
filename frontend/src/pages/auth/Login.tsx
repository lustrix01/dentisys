import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { recordAudit } from '../../services/auditService';
import { authenticateUser } from '../../services/authService';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [useFallbackSvg, setUseFallbackSvg] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    setTimeout(() => {
      const authResult = authenticateUser(email, password);
      
      if (authResult.success && authResult.user) {
        localStorage.setItem('dentisys_user', JSON.stringify(authResult.user));
        recordAudit({
          userName: authResult.user.name,
          userRole: authResult.user.role,
          action: 'Logged in',
          module: 'Authentication',
          description: 'User signed in with portal credentials.',
          status: 'Success',
        });
        setIsLoading(false);
        navigate('/');
      } else {
        recordAudit({
          userName: email,
          userRole: 'admin',
          action: 'Failed login attempt',
          module: 'Authentication',
          description: authResult.message || 'Invalid portal credentials were submitted.',
          status: 'Failed',
        });
        setIsLoading(false);
        setError(authResult.message || 'Invalid email or password. Please check your credentials and try again.');
      }
    }, 800);
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      const user = {
        email: 'faculty@bicol-u.edu.ph',
        role: 'faculty',
        name: 'Dr. Eleanor Vance',
        title: 'Dental Faculty Member',
        assignedSubjects: ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'],
        assignedClasses: ['CLINIC-A', 'CLINIC-B'],
      };
      localStorage.setItem('dentisys_user', JSON.stringify(user));
      recordAudit({
        userName: user.name,
        userRole: user.role,
        action: 'Logged in',
        module: 'Authentication',
        description: 'User signed in using Google Workspace.',
        status: 'Success',
      });
      setIsLoading(false);
      navigate('/');
    }, 1000);
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
              </div>

              <div className="flex items-center pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-slate-300 dark:border-slate-700 rounded cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                    Remember me
                  </span>
                </label>
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

            {/* University-specific Single Sign-On */}
            <div className="flex items-center my-5">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800/80" />
              <span className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                or
              </span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800/80" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] cursor-pointer disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Sign in with Google Workspace
            </button>

            {/* Footer Support & Registration Navigation */}
            <p className="text-center mt-6 text-xs text-slate-500 dark:text-slate-400 font-medium">
              Faculty member?{' '}
              <Link to="/signup" className="text-accent-600 dark:text-accent-400 hover:underline font-bold transition-all">
                Register for an account
              </Link>
            </p>
            <p className="text-center mt-2 text-xs text-slate-450 dark:text-slate-500 font-medium">
              Forgot your BU email password?{' '}
              <a href="mailto:support@bicol-u.edu.ph" className="text-accent-600 dark:text-accent-400 hover:underline font-bold transition-all">
                Contact support
              </a>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
