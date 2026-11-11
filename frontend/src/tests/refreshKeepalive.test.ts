import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  clearAccessToken,
  getAccessToken,
  getMe,
  logoutSession,
  refreshSession,
  setAccessToken,
  setRecentUserActivity,
} from '../services/apiClient.ts';

type RecordedCall = { url: string; init: RequestInit & { keepalive?: boolean } };

const originalFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(responses: Response[]): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: (init ?? {}) as RecordedCall['init'] });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected extra fetch call');
    return next;
  }) as typeof fetch;
  return calls;
}

// `emitWindowEvent` is a no-op outside a browser, so give the 401-path tests a
// minimal window that records the events the client dispatches.
const expiredEvents = { count: 0 };
const fakeWindow = new EventTarget();
fakeWindow.addEventListener('dentisys:auth-expired', () => {
  expiredEvents.count += 1;
});
const globalWithWindow = globalThis as unknown as { window?: EventTarget };

beforeEach(() => {
  expiredEvents.count = 0;
  globalWithWindow.window = fakeWindow;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalWithWindow.window;
  clearAccessToken();
  setRecentUserActivity(0);
});

test('refreshSession sends POST /auth/refresh with keepalive and credentials include', async () => {
  const calls = stubFetch([
    jsonResponse(200, { access_token: 'token-1', user: { user_id: 7 } }),
  ]);

  const result = await refreshSession();

  assert.equal(result.access_token, 'token-1');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/auth/refresh'), `unexpected url ${calls[0].url}`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.keepalive, true);
  assert.equal(calls[0].init.credentials, 'include');
});

test('refreshSession retry after REFRESH_IN_PROGRESS also uses keepalive', async () => {
  const calls = stubFetch([
    jsonResponse(409, { status: 'error', code: 'REFRESH_IN_PROGRESS', message: 'busy' }),
    jsonResponse(200, { access_token: 'token-2', user: { user_id: 7 } }),
  ]);

  const result = await refreshSession();

  assert.equal(result.access_token, 'token-2');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/auth/refresh'), `unexpected url ${calls[1].url}`);
  assert.equal(calls[1].init.keepalive, true);
  assert.equal(calls[1].init.credentials, 'include');
});

test('non-refresh calls do not set keepalive', async () => {
  const calls = stubFetch([
    jsonResponse(200, { status: 'ok', message: 'logged out' }),
    jsonResponse(200, { user_id: 7 }),
  ]);

  await logoutSession();
  await getMe();

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.ok(!call.init.keepalive, `keepalive must not be set for ${call.url}`);
    assert.equal(call.init.credentials, 'include');
  }
});

const STALE_ACTIVITY_MS = 11 * 60 * 1000;

function requestHeaders(call: RecordedCall): Record<string, string> {
  return (call.init.headers ?? {}) as Record<string, string>;
}

test('a 401 with stale (>10 min) activity still refreshes once and retries the request', async () => {
  setAccessToken('expired-token');
  setRecentUserActivity(Date.now() - STALE_ACTIVITY_MS);
  const calls = stubFetch([
    jsonResponse(401, { status: 'error', message: 'Authentication required.' }),
    jsonResponse(200, { access_token: 'refreshed-token', user: { user_id: 7 } }),
    jsonResponse(200, { user_id: 7 }),
  ]);

  const user = await getMe();

  assert.deepEqual(user, { user_id: 7 });
  assert.equal(calls.length, 3, 'expected the request, one refresh and one retry');
  assert.ok(calls[0].url.endsWith('/auth/me'), `unexpected url ${calls[0].url}`);
  assert.ok(calls[1].url.endsWith('/auth/refresh'), `unexpected url ${calls[1].url}`);
  assert.equal(calls[1].init.method, 'POST');
  assert.ok(calls[2].url.endsWith('/auth/me'), `unexpected url ${calls[2].url}`);
  assert.equal(requestHeaders(calls[2]).Authorization, 'Bearer refreshed-token');
  assert.equal(getAccessToken(), 'refreshed-token');
  assert.equal(expiredEvents.count, 0, 'a successful refresh must not dispatch dentisys:auth-expired');
  for (const call of calls) {
    assert.equal(
      requestHeaders(call)['X-DentiSys-User-Activity'],
      undefined,
      `stale activity must not extend last_seen_at via ${call.url}`,
    );
  }
});

test('a 401 from the refresh clears the access token and dispatches dentisys:auth-expired', async () => {
  setAccessToken('expired-token');
  setRecentUserActivity(Date.now() - STALE_ACTIVITY_MS);
  const calls = stubFetch([
    jsonResponse(401, { status: 'error', message: 'Authentication required.' }),
    jsonResponse(401, { status: 'error', message: 'Authentication required.' }),
  ]);

  await assert.rejects(
    () => getMe(),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );

  assert.equal(calls.length, 2, 'the original request must not be retried after a rejected refresh');
  assert.ok(calls[1].url.endsWith('/auth/refresh'), `unexpected url ${calls[1].url}`);
  assert.equal(getAccessToken(), null);
  assert.equal(expiredEvents.count, 1);
});

test('fresh activity still flags the refresh request so the active session stays alive', async () => {
  setAccessToken('expired-token');
  setRecentUserActivity(Date.now());
  const calls = stubFetch([
    jsonResponse(401, { status: 'error', message: 'Authentication required.' }),
    jsonResponse(200, { access_token: 'refreshed-token', user: { user_id: 7 } }),
    jsonResponse(200, { user_id: 7 }),
  ]);

  await getMe();

  assert.equal(calls.length, 3);
  assert.equal(requestHeaders(calls[1]).Authorization, 'Bearer expired-token');
  assert.equal(requestHeaders(calls[1])['X-DentiSys-User-Activity'], '1');
});
