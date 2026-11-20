// 12.8: the Superadmin signs in at its own page. This tab remembers which sign-in page it uses, so
// sign-out, the idle sign-out and the 2FA "Back" buttons return there. Unknown means the shared /login.
const KEY = 'dentisys.signInPage';

export const SUPERADMIN_SIGN_IN_PATH = '/superadmin/sign-in';

export function rememberSignInPage(superadmin: boolean): void {
  try {
    if (superadmin) sessionStorage.setItem(KEY, 'superadmin');
    else sessionStorage.removeItem(KEY);
  } catch { /* Falls back to /login. */ }
}

export function signInPath(): string {
  try {
    return sessionStorage.getItem(KEY) === 'superadmin' ? SUPERADMIN_SIGN_IN_PATH : '/login';
  } catch {
    return '/login';
  }
}
