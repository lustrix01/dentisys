// CLS-004: join codes are 6 characters from letters and digits without look-alikes (no 0, O, 1, I, L).
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** What the server accepts: any case, spaces and dashes are ignored. Returns '' when it cannot be a code. */
export function normalizeJoinCode(raw: string): string {
  const value = raw.replace(/[\s-]+/g, '').toUpperCase();
  return CODE_PATTERN.test(value) ? value : '';
}

/** Keep typing forgiving: strip spaces and dashes, upper-case, cap at 6 characters. */
export function typedJoinCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase().slice(0, 6);
}

/** K7M4QX shown as K7M-4QX. */
export function formatJoinCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** The ?join= value of an address, kept as typed (the form shows what arrived; the server normalizes). */
export function joinCodeFromSearch(search: string): string {
  return typedJoinCode(new URLSearchParams(search).get('join') ?? '');
}

// A join link opened while signed out: remember it across sign-in (and 2FA) in this tab only.
const RETURN_KEY = 'dentisys:joinReturn';
const JOIN_LINK = /^\/student\/classes\?join=[A-Za-z0-9]{1,12}$/;

export function rememberJoinReturn(pathAndSearch: string): void {
  try { if (JOIN_LINK.test(pathAndSearch)) sessionStorage.setItem(RETURN_KEY, pathAndSearch); } catch { /* storage may be blocked */ }
}

export function peekJoinReturn(): string | null {
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    return value !== null && JOIN_LINK.test(value) ? value : null;
  } catch { return null; }
}

export function clearJoinReturn(): void {
  try { sessionStorage.removeItem(RETURN_KEY); } catch { /* storage may be blocked */ }
}
