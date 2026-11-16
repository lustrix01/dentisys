import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJoinCode, joinCodeFromSearch, normalizeJoinCode, typedJoinCode } from '../utils/classJoinCode.ts';

test('normalizes case, spaces and dashes', () => {
  for (const input of ['K7M-4QX', 'k7m4qx', ' k7m 4qx ']) assert.equal(normalizeJoinCode(input), 'K7M4QX');
});
test('rejects look-alikes and wrong lengths', () => {
  for (const input of ['', 'K7M4Q', 'K7M4QXX', 'K7M4Q0', 'K7M4QO', 'K7M4Q1', 'K7M4QI', 'K7M4QL']) assert.equal(normalizeJoinCode(input), '');
});
test('shows a code as XXX-XXX', () => {
  assert.equal(formatJoinCode('K7M4QX'), 'K7M-4QX');
});
test('cleans what is typed', () => {
  assert.equal(typedJoinCode('k7m-4qx99'), 'K7M4QX');
});
test('reads the join link prefill', () => {
  assert.equal(joinCodeFromSearch('?join=k7m4qx'), 'K7M4QX');
  assert.equal(joinCodeFromSearch(''), '');
});
