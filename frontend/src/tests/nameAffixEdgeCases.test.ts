import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNameAffix } from '../utils/nameNormalization.ts';

test('name affix edge cases', () => {
  assert.equal(normalizeNameAffix('  dr  ', 'prefix'), '  Dr.  ');
  assert.equal(normalizeNameAffix('JR', 'suffix'), 'Jr.');
  assert.equal(normalizeNameAffix('iii', 'suffix'), 'III');
  assert.equal(normalizeNameAffix('', 'suffix'), '');
  assert.equal(normalizeNameAffix('unknownword', 'prefix'), 'unknownword');
});
