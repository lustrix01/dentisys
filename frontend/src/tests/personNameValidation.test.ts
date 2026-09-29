import test from 'node:test';
import assert from 'node:assert/strict';
import { personNameFieldError, isPersonNameValid } from '../utils/personNameValidation.ts';

test('prefix and suffix accept titles and reject digits or letterless values', () => {
  for (const value of ['Dr.', 'Prof.', 'Jr.', 'III', 'DMD, PhD', '']) {
    assert.equal(personNameFieldError('suffix', value), null, value);
  }
  for (const value of ['Dr2', '123', '.', '-']) {
    assert.notEqual(personNameFieldError('prefix', value), null, value);
  }
});

test('a middle name may be a single initial', () => {
  assert.equal(personNameFieldError('middleName', 'M'), null);
  assert.equal(personNameFieldError('middleName', 'M.'), null);
  assert.equal(personNameFieldError('middleName', ''), null);
  assert.notEqual(personNameFieldError('middleName', 'M2'), null);
});

test('first and last names are required, at least two characters, and letters only', () => {
  assert.notEqual(personNameFieldError('firstName', ''), null);
  assert.notEqual(personNameFieldError('lastName', 'A'), null);
  assert.notEqual(personNameFieldError('firstName', 'Ana1'), null);
  assert.equal(personNameFieldError('lastName', "Dela Cruz-O'Neil"), null);
  assert.equal(isPersonNameValid({ prefix: 'Dr.', firstName: 'Ana', middleName: 'M', lastName: 'Dela Cruz', suffix: 'III' }), true);
  assert.equal(isPersonNameValid({ prefix: 'Dr2', firstName: 'Ana', middleName: '', lastName: 'Dela Cruz', suffix: '' }), false);
});
