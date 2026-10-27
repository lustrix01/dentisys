import test from 'node:test';
import assert from 'node:assert/strict';
import { classStanding, pageStanding } from '../pages/admin/deanStanding.ts';

test('Good Standing needs a final grade; Remedial and Cleared keep precedence', () => {
  assert.equal(classStanding({ status: 'active', classGraded: true }), 'active');
  assert.equal(classStanding({ status: 'active', classGraded: false }), 'noGrade');
  assert.equal(classStanding({ status: 'active' }), 'noGrade');
  assert.equal(classStanding({ status: 'remedial', classGraded: false }), 'remedial');
  assert.equal(classStanding({ status: 'cleared', classGraded: true }), 'cleared');
});

test('page-wide standing counts any final grade in the year', () => {
  assert.equal(pageStanding({ status: 'noGrade', overallGWA: 1.75 }), 'active');
  assert.equal(pageStanding({ status: 'noGrade', overallGWA: null }), 'noGrade');
  assert.equal(pageStanding({ status: 'remedial', overallGWA: 2 }), 'remedial');
});
