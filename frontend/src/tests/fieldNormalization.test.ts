import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNameAffix } from '../utils/nameNormalization.ts';
import { normalizePhMobile } from '../utils/phMobile.ts';

test('affix casing is fixed for known words only', () => {
  assert.equal(normalizeNameAffix('dr', 'prefix'), 'Dr.');
  assert.equal(normalizeNameAffix('MS.', 'prefix'), 'Ms.');
  assert.equal(normalizeNameAffix('jr', 'suffix'), 'Jr.');
  assert.equal(normalizeNameAffix('dmd, phd', 'suffix'), 'DMD, PhD');
  assert.equal(normalizeNameAffix('dmd, ms', 'suffix'), 'DMD, MS');
  for (const same of ['DMD', 'DMD, MS', 'DMD, MSc', 'DMD, MPH', 'DMD, PhD', 'Esq']) {
    assert.equal(normalizeNameAffix(same, 'suffix'), same);
  }
  assert.equal(normalizeNameAffix('Dr.', 'prefix'), 'Dr.');
});

test('Philippine mobile numbers normalise to 09XXXXXXXXX', () => {
  assert.equal(normalizePhMobile(''), '');
  assert.equal(normalizePhMobile('  '), '');
  assert.equal(normalizePhMobile('0917 123 4567'), '09171234567');
  assert.equal(normalizePhMobile('+63-917-123-4567'), '09171234567');
  assert.equal(normalizePhMobile('639171234567'), '09171234567');
  assert.equal(normalizePhMobile('09171234'), null);
  assert.equal(normalizePhMobile('02 8123 4567'), null);
});
