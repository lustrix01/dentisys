import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanRadiusText, parseRadius } from '../utils/geofenceRadius.ts';

test('radius text drops leading zeros and keeps empty', () => {
  assert.equal(cleanRadiusText('01000'), '1000');
  assert.equal(cleanRadiusText('0'), '0');
  assert.equal(cleanRadiusText('00'), '0');
  assert.equal(cleanRadiusText(''), '');
});
test('radius must be a whole number from 50 to 2000', () => {
  assert.equal(parseRadius(''), null);
  assert.equal(parseRadius('49'), null);
  assert.equal(parseRadius('2001'), null);
  assert.equal(parseRadius('50.5'), null);
  assert.equal(parseRadius('50'), 50);
  assert.equal(parseRadius('2000'), 2000);
});

const card = readFileSync(new URL('../components/MfaSettingsCard.tsx', import.meta.url), 'utf8');
test('MFA card closes setup on 401 with the expired message', () => {
  assert.match(card, /requestError instanceof ApiError && requestError\.status === 401/);
  assert.match(card, /This setup expired\. Click Set up again to get a new QR code\./);
});
test('MFA card ignores a second start while one is running', () => {
  assert.match(card, /if \(startingRef\.current\) return;\s*startingRef\.current = true;/);
});
