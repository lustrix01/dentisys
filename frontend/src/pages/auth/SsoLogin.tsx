import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import {
  login as apiLogin,
  getMe,
  createDevelopmentMockStudentSession,
  loginWithGoogle,
  linkGoogleAccount,
  setAccessToken as setApiAccessToken,
  ApiError,
} from '../../services/apiClient';

const DEFAULT_EMAIL_DOMAIN = 'bicol-u.edu.ph';

function completeInstitutionalEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('@')) return trimmed;
  return `${trimmed}@${DEFAULT_EMAIL_DOMAIN}`;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; ux_mode?: 'popup'; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function SsoLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') || '';
  const { beginLogin, storeTwoFactorChallenge, setAccessToken, setUser, setAuthenticated } = useAuth();
  const runtimeConfig = useRuntimeConfig();
  const mockIdentityEnabled = runtimeConfig.features.student_auth_enabled
    && runtimeConfig.providers.identity.development_mock.enabled;
  const googleEnabled = runtimeConfig.providers.identity.google.enabled
    && Boolean(runtimeConfig.providers.identity.google.client_id);
  const activated = searchParams.get('activated') === '1';
  const invitationRequired = searchParams.get('invitationRequired') === '1';

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [linkChallengeToken, setLinkChallengeToken] = useState<string | null>(null);
  const [linkPassword, setLinkPassword] = useState('');
  const [googleLoadState, setGoogleLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const completeServerAuthentication = async (accessToken: string) => {
    setApiAccessToken(accessToken);
    setAccessToken(accessToken);
    const user = await getMe();
    setUser(user);
    setAuthenticated();
    navigate(user.role === 'student' ? '/student/dashboard' : '/', { replace: true });
  };

  const googleCredentialHandlerRef = useRef<(credential: string) => Promise<void>>(async () => undefined);

  const handleGoogleCredential = async (credential: string) => {
    beginLogin();
    setIsLoading(true);
    setError('');
    try {
      const result = await loginWithGoogle(credential);
      if (result.type === 'direct_login' && result.access_token) {
        await completeServerAuthentication(result.access_token);
      } else if (result.type === 'two_factor_required' && result.two_factor_challenge_token) {
        storeTwoFactorChallenge(result.two_factor_challenge_token);
        navigate('/2fa/verify');
      } else if (result.type === 'account_link_required' && result.link_challenge_token) {
        setEmail(result.email ?? email);
        setLinkChallengeToken(result.link_challenge_token);
      } else {
        setError('Unexpected authentication response.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    googleCredentialHandlerRef.current = handleGoogleCredential;
  });

  useEffect(() => {
    const clientId = runtimeConfig.providers.identity.google.client_id;
    if (!googleEnabled || !clientId || linkChallengeToken || !googleButtonRef.current) return;
    setGoogleLoadState('loading');
    let cancelled = false;
    const render = () => {
      if (cancelled) return;
      try {
        const container = googleButtonRef.current;
        if (!window.google || !container) {
          setGoogleLoadState('error');
          return;
        }
        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: ({ credential }) => { void googleCredentialHandlerRef.current(credential); },
        });
        container.innerHTML = '';
        const availableWidth = container.parentElement?.clientWidth ?? 360;
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          width: Math.max(200, Math.min(360, Math.floor(availableWidth))),
          text: 'signin_with',
          locale: 'en',
        });
        setGoogleLoadState('ready');
      } catch {
        setGoogleLoadState('error');
      }
    };
    const handleScriptError = () => { if (!cancelled) setGoogleLoadState('error'); };
    if (window.google) {
      render();
      return () => { cancelled = true; };
    }
    const existing = document.getElementById('google-gis-client');
    const script = existing instanceof HTMLScriptElement ? existing : document.createElement('script');
    script.addEventListener('load', render);
    script.addEventListener('error', handleScriptError);
    if (!existing) {
      script.id = 'google-gis-client';
      script.src = 'https://accounts.google.com/gsi/client?hl=en'; // Google picks the button language when the script loads
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      script.removeEventListener('load', render);
      script.removeEventListener('error', handleScriptError);
    };
  }, [googleEnabled, runtimeConfig.providers.identity.google.client_id, linkChallengeToken]);

  const handleGoogleLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!linkChallengeToken || !linkPassword) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await linkGoogleAccount(linkChallengeToken, linkPassword);
      if (result.type === 'direct_login' && result.access_token) {
        await completeServerAuthentication(result.access_token);
      } else if (result.type === 'two_factor_required' && result.two_factor_challenge_token) {
        storeTwoFactorChallenge(result.two_factor_challenge_token);
        navigate('/2fa/verify');
      } else {
        setError('Unexpected linking response.');
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && (err.code === 'INVALID_LINK_CHALLENGE' || err.code === 'GOOGLE_LINK_CHALLENGE_EXPIRED')) {
        setLinkChallengeToken(null);
        setLinkPassword('');
        setError('The Google linking session expired. Choose Google again and retry.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Account linking failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevelopmentMockSignIn = async () => {
    if (!mockIdentityEnabled) return;
    beginLogin();
    setIsLoading(true);
    setError('');
    try {
      const result = await createDevelopmentMockStudentSession();
      if (result.type !== 'direct_login' || !result.access_token) {
        throw new Error('Unexpected authentication response.');
      }
      await completeServerAuthentication(result.access_token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const loginEmail = completeInstitutionalEmail(email);
    if (!loginEmail || !password) {
      setError('Please fill in all fields.');
      return;
    }

    beginLogin();
    setIsLoading(true);
    setError('');

    try {
      const result = await apiLogin(loginEmail, password);

      if (result.type === 'direct_login' && result.access_token) {
        await completeServerAuthentication(result.access_token);
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
    <div className="min-h-screen min-h-[100dvh] w-full md:h-screen md:overflow-hidden flex flex-col md:flex-row bg-white font-sans text-slate-800 select-none">

      {/* LEFT PANE: Full-Height Clean White Authentication Panel */}
      <div className="w-full md:w-1/2 lg:w-5/12 min-h-[100dvh] md:min-h-0 md:h-full bg-slate-50 md:bg-white flex flex-col justify-between p-5 sm:p-8 lg:p-12 overflow-y-auto">
        
        {/* Top: Logo & Back Link - Connected directly to Landing Page */}
        <div className="-mx-5 -mt-5 mb-2 border-b border-slate-200 bg-white px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-5 text-slate-800 shadow-sm sm:-mx-8 sm:-mt-8 sm:px-8 md:mx-0 md:mt-0 md:mb-0 md:border-0 md:bg-none md:p-0 md:shadow-none">
          <div className="flex items-center justify-between gap-3">
          <div
            className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer group min-w-0"
            onClick={() => navigate('/')}
          >
            <img
              src="/bu-cdm-logo.png"
              alt="BU CDM Seal"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shadow-sm group-hover:scale-105 transition-transform flex-shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                  <span className="font-heading font-extrabold text-sm sm:text-base lg:text-lg text-slate-900 tracking-tight">
                  BUCDM
                </span>
                  <span className="font-heading font-extrabold text-sm sm:text-base lg:text-lg text-purple-600 tracking-tight">
                  DentiSYS
                </span>
              </div>
              <span className="hidden sm:block text-[10px] sm:text-[11px] font-semibold text-slate-500 font-heading tracking-wide">
                Bicol University College of Dental Medicine
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="whitespace-nowrap text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex-shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to site</span>
          </button>
          </div>
        </div>

        {/* Center: Main Form Block */}
        <div className="max-w-md w-full mx-auto my-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-lg shadow-slate-900/5 space-y-5 sm:p-6 md:my-auto md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:space-y-6">

          {/* Heading with Clean, Natural Typography */}
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 font-heading">
              Login
            </h1>
            <p className="text-sm text-slate-500">
              Enter your account details to continue
            </p>
          </div>

          {/* Status & Banner Alerts */}
          {activated && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
              Account activated. Sign in with your new password.
            </div>
          )}

          {invitationRequired && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-semibold text-blue-800">
              DentiSys accounts are created through invitations. Open the invitation link sent to your university email.
            </div>
          )}

          {mockIdentityEnabled && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="flex-1 basis-64">Development mock Student sign-in is enabled. Authentication is issued by the development backend.</span>
              <button
                type="button"
                onClick={handleDevelopmentMockSignIn}
                disabled={isLoading}
                className="underline hover:text-amber-950 font-bold cursor-pointer whitespace-nowrap"
              >
                Development mock Student sign-in
              </button>
            </div>
          )}

          {linkChallengeToken && (
            <form onSubmit={handleGoogleLink} className="rounded-xl border border-purple-200 bg-purple-50 p-4">
              <p className="text-xs font-semibold text-purple-900">
                Confirm your DentiSys password to link this Google account.
              </p>
              <input
                type="password"
                required
                value={linkPassword}
                onChange={(event) => setLinkPassword(event.target.value)}
                placeholder="DentiSys password"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-purple-600"
              />
              <button type="submit" disabled={isLoading} className="mt-3 w-full rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 hover:bg-purple-700 transition-all cursor-pointer">
                Confirm and link Google
              </button>
            </form>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-700 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. TOP: Credentials Form */}
          <form className="space-y-4" onSubmit={handleLogin}>
            {/* Username / Email */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative rounded-xl">
                <div className="flex">
                  <input
                    type="text"
                    id="login-email"
                    autoComplete="username"
                    inputMode="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={email.includes('@') ? `username@${DEFAULT_EMAIL_DOMAIN}` : 'username'}
                    className={`min-w-0 flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 ${email.includes('@') ? 'rounded-xl' : 'rounded-l-xl'} focus:bg-white focus:ring-2 focus:ring-purple-600/10 focus:border-purple-600 transition-all text-sm outline-none text-slate-900 placeholder-slate-400`}
                  />
                  {!email.includes('@') && (
                    <span className="flex items-center rounded-r-xl border border-l-0 border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-purple-700">
                      @{DEFAULT_EMAIL_DOMAIN}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative rounded-xl">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-600/10 focus:border-purple-600 transition-all text-sm outline-none text-slate-900 placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="whitespace-nowrap w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.99] transition-all shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Login'
              )}
            </button>
          </form>

          {/* 2. NEXT: Google Sign In */}
          {!linkChallengeToken && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  or
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div className="flex min-h-11 flex-col items-center justify-center" aria-live="polite">
                {googleEnabled ? (
                  <>
                    <div
                      ref={googleButtonRef}
                      className={googleLoadState === 'ready' ? 'w-full flex justify-center' : 'hidden'}
                      aria-label="Sign in with Google"
                    />
                    {googleLoadState === 'loading' && (
                      <div role="status" className="text-xs text-slate-500">
                        Loading Google Sign-In…
                      </div>
                    )}
                    {googleLoadState === 'error' && (
                      <div role="alert" className="text-center text-xs text-rose-600">
                        Google Sign-In could not be loaded. Use credentials above.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Google Sign-In is not configured in this environment.</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 3. NEXT: Forgot Password */}
          <div className="pt-1 text-center">
            <Link
              to="/forgot-password"
              className="whitespace-nowrap text-xs font-semibold text-purple-600 hover:text-purple-700 hover:underline transition-colors"
            >
              Forgot Password?
            </Link>
          </div>

        </div>

        {/* Bottom institutional mark */}
        <div className="text-center text-xs text-slate-500 dark:text-slate-400">
          <span>© 2026 Bicol University College of Dental Medicine</span>
        </div>

      </div>

      {/* RIGHT PANE: Full-Height Vibrant Purple Hero Section */}
      <div className="hidden md:flex md:w-1/2 lg:w-7/12 h-full bg-[#8B5CF6] p-8 sm:p-12 lg:p-16 flex-col justify-between relative overflow-hidden text-white select-none">

        {/* Soft Organic Background Accents */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-900/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-purple-400/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Text (Professional Single Line, Academic Account) */}
        <div className="relative z-10 space-y-2">
          <h2 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-extrabold tracking-tight text-white whitespace-nowrap font-heading">
            Bicol University College of Dental Medicine
          </h2>
          <p className="text-sm sm:text-base text-purple-100/90 font-normal">
            Login to access your academic account
          </p>
        </div>

        {/* Center: Original clinic checklist and student illustration */}
        <div className="relative z-10 flex items-center justify-center my-auto py-8">
          <svg viewBox="0 0 500 420" className="w-full max-w-[440px] h-auto drop-shadow-xl" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M440 220C440 310 360 380 260 380C160 380 90 320 90 220C90 120 170 60 270 60C370 60 440 130 440 220Z" fill="white" fillOpacity="0.12" />
            <rect x="180" y="140" width="160" height="200" rx="14" fill="white" stroke="#1E1B4B" strokeWidth="3" />
            <rect x="200" y="165" width="80" height="8" rx="4" fill="#8B5CF6" />
            <rect x="200" y="185" width="120" height="6" rx="3" fill="#E2E8F0" />
            <rect x="200" y="200" width="105" height="6" rx="3" fill="#E2E8F0" />
            <rect x="200" y="215" width="90" height="6" rx="3" fill="#E2E8F0" />
            <circle cx="210" cy="270" r="32" fill="white" stroke="#1E1B4B" strokeWidth="4" />
            <path d="M234 294 L255 315" stroke="#1E1B4B" strokeWidth="5" strokeLinecap="round" />
            <path d="M202 262 C198 254 206 250 210 254 C214 250 222 254 218 262 C217 272 220 280 216 284 C214 286 211 285 210 280 C209 285 206 286 204 284 C200 280 203 272 202 262 Z" fill="#8B5CF6" />
            <g id="left-student">
              <circle cx="150" cy="180" r="14" fill="#1E1B4B" />
              <circle cx="151" cy="183" r="12" fill="#FEF08A" />
              <path d="M140 178 C140 168 158 168 162 178 C160 182 145 184 140 178 Z" fill="#1E1B4B" />
              <path d="M140 196 L162 196 L168 260 L136 260 Z" fill="white" stroke="#1E1B4B" strokeWidth="3" strokeLinejoin="round" />
              <path d="M151 196 L151 224" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" />
              <path d="M142 205 L125 228 L142 232" fill="none" stroke="#1E1B4B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="138" y="222" width="10" height="16" rx="2" fill="#1E1B4B" />
              <path d="M142 260 L135 340 L125 340" fill="none" stroke="#1E1B4B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M162 260 L172 336 L184 336" fill="none" stroke="#1E1B4B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <g id="right-student">
              <circle cx="340" cy="115" r="13" fill="#1E1B4B" />
              <circle cx="339" cy="118" r="11" fill="#FEF08A" />
              <path d="M330 114 C330 104 348 104 352 114 C348 118 335 120 330 114 Z" fill="#1E1B4B" />
              <path d="M328 130 C328 130 354 130 358 165 C345 170 330 170 322 165 Z" fill="white" stroke="#1E1B4B" strokeWidth="3" strokeLinejoin="round" />
              <rect x="350" y="148" width="28" height="18" rx="2" transform="rotate(-15 350 148)" fill="#1E1B4B" />
              <line x1="346" y1="165" x2="378" y2="165" stroke="#1E1B4B" strokeWidth="3" strokeLinecap="round" />
              <path d="M324 165 L315 185 L352 185 L360 230 L372 230" fill="none" stroke="#1E1B4B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <path d="M380 340 C380 290 415 270 415 270 C415 270 425 310 405 340 Z" fill="#22C55E" />
            <path d="M395 340 C395 305 435 295 435 295 C435 295 438 325 418 340 Z" fill="#16A34A" />
            <rect x="375" y="340" width="55" height="24" rx="4" fill="#1E1B4B" />
          </svg>
        </div>

        {/* Bottom Subtitle / Info */}
        <div className="relative z-10 flex items-center justify-between text-xs text-purple-100/80 pt-4 border-t border-white/15">
          <span>DentiSYS Academic System</span>
          <span>Bicol University</span>
        </div>

      </div>

    </div>
  );
}


