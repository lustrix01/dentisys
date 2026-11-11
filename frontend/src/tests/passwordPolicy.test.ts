import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePasswordRequirements } from '../services/authService.ts';

test('password policy keeps the existing minimum and adds the 32-character maximum', () => {
  const belowMinimum = validatePasswordRequirements('Aa1!aaa');
  assert.equal(belowMinimum.hasMinLength, false);
  assert.equal(belowMinimum.hasMaxLength, true);
  assert.equal(belowMinimum.isValid, false);

  const atMinimum = validatePasswordRequirements('Aa1!aaaa');
  assert.equal(atMinimum.hasMinLength, true);
  assert.equal(atMinimum.isValid, true);
});

test('32 characters pass and 33 characters fail on every setting flow', () => {
  const atMaximum = 'Aa1!' + 'a'.repeat(28);
  assert.equal(Array.from(atMaximum).length, 32);
  const accepted = validatePasswordRequirements(atMaximum);
  assert.equal(accepted.hasMaxLength, true);
  assert.equal(accepted.isValid, true);

  const overMaximum = 'Aa1!' + 'a'.repeat(29);
  assert.equal(Array.from(overMaximum).length, 33);
  const rejected = validatePasswordRequirements(overMaximum);
  assert.equal(rejected.hasMaxLength, false);
  assert.equal(rejected.isValid, false);
});

test('the maximum counts Unicode characters, not UTF-16 code units or UTF-8 bytes', () => {
  const unicodeAtMaximum = 'Aa1!' + 'é'.repeat(28);
  assert.equal(Array.from(unicodeAtMaximum).length, 32);
  assert.equal(new TextEncoder().encode(unicodeAtMaximum).length, 60);
  assert.equal(validatePasswordRequirements(unicodeAtMaximum).hasMaxLength, true);
  assert.equal(validatePasswordRequirements(unicodeAtMaximum).isValid, true);

  const unicodeOverMaximum = 'Aa1!' + 'é'.repeat(29);
  assert.equal(validatePasswordRequirements(unicodeOverMaximum).hasMaxLength, false);
  assert.equal(validatePasswordRequirements(unicodeOverMaximum).isValid, false);
});
