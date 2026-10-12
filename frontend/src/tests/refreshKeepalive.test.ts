import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { refreshSession, getMe, logoutSession } from '../services/apiClient.ts';

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

afterEach(() => {
  globalThis.fetch = originalFetch;
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
