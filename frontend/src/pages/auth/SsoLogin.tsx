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
    <div className="min-h-screen min-h-[100dvh] w-full bg-slate-100 flex items-center justify-center px-4 py-8 font-sans text-slate-800">
      <div className="w-full max-w-4xl min-h-[500px] md:h-[min(580px,calc(100dvh-3rem))] md:min-h-0 md:flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">

      <main className="w-full md:order-2 md:w-1/2 min-h-0 bg-white p-5 sm:p-7 lg:p-8 flex flex-col justify-between overflow-y-auto">
        
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="whitespace-nowrap text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer px-2 py-1.5 rounded-md hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to site</span>
          </button>
        </div>

        {/* Center: Main Form Block */}
        <div className="w-full max-w-sm mx-auto my-auto py-5 space-y-5">

          {/* Login heading */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">
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
              className="whitespace-nowrap w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.99] transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
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
                      className="flex min-h-11 w-full justify-center"
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
          <span>&copy; 2026 Bicol University College of Dental Medicine</span>
        </div>

      </main>

      {/* RIGHT PANE: Full-Height Vibrant Purple Hero Section */}
      <div className="hidden md:order-1 md:flex md:w-1/2 h-full bg-[#8B5CF6] p-6 lg:p-8 flex-col justify-between relative overflow-hidden text-white select-none">

        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] bg-purple-300/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center">
          <div className="flex h-44 w-44 items-center justify-center">
            <img src="/bu-cdm-logo.png" alt="Bicol University College of Dental Medicine seal" className="h-40 w-40 object-contain drop-shadow-sm" />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-white font-heading">DentiSYS</h2>
          <p className="mt-2 max-w-xs text-sm leading-6 text-purple-100">
            Bicol University College of Dental Medicine
          </p>
        </div>
      </div>


      </div>
    </div>
  );
}


