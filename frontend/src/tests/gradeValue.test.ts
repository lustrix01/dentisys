import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GradeValue, { lectureHoverSteps } from '../components/GradeValue.ts';

test('GradeValue keeps the rounded text and exposes the steps as an accessible tooltip', () => {
  const html = renderToStaticMarkup(React.createElement(GradeValue, { percentage: 84, raw: 83.77, className: 'font-mono' }, '2.5'));
  assert.match(html, />2\.5<span/);
  assert.match(html, /83\.77% → 84% → 2\.5/);
  assert.match(html, /tabindex="0"/i);
  const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(describedBy);
  assert.match(html, new RegExp(`id="${describedBy}"`));
  assert.match(html, /font-mono/);
});

test('GradeValue leaves the text unwrapped without a percentage', () => {
  assert.equal(renderToStaticMarkup(React.createElement(GradeValue, { percentage: null }, '2.50')), '2.50');
});

test('GradeValue tooltip shows the saved grade instead of recomputing it', () => {
  const html = renderToStaticMarkup(React.createElement(GradeValue, { percentage: 81, grade: 2.5 }, '2.5'));
  assert.match(html, /81% → 2\.5/);
  assert.doesNotMatch(html, /81\.00%/);
});

test('GradeValue steps: a below-75 Midterm is 5.0 and a half percent rounds up', () => {
  const low = renderToStaticMarkup(React.createElement(GradeValue, { percentage: 70, period: 'Midterm' }, '5.0'));
  assert.match(low, /70% → 5/);
  const half = renderToStaticMarkup(React.createElement(GradeValue, { percentage: 74.5 }, '3.0'));
  assert.match(half, /74\.50% → 75% → 3/);
});

test('GradeValue lecture-only hover shows the single-rounding formula', () => {
  const lecture = { midterm: 84, final: 92, midtermShare: 30, finalShare: 70 };
  const html = renderToStaticMarkup(React.createElement(GradeValue, { percentage: 90, grade: 1.9, lecture }, '1.9'));
  assert.match(html, /84% × 30% \+ 92% × 70% = 89\.6% → 90% → 1\.9/);
  // A period hover without the lecture prop is unchanged.
  assert.match(renderToStaticMarkup(React.createElement(GradeValue, { percentage: 84, raw: 83.77 }, '2.5')), /83\.77% → 84% → 2\.5/);
  // A whole result drops the repeated step.
  assert.match(renderToStaticMarkup(React.createElement(GradeValue, { percentage: 90, grade: 1.9, lecture: { midterm: 90, final: 90, midtermShare: 30, finalShare: 70 } }, '1.9')), /90% × 30% \+ 90% × 70% = 90% → 1\.9/);
});

test('lectureHoverSteps reads the saved breakdown and needs every number', () => {
  const comps = { periods: { midterm: { percentage: 84 }, final: { percentage: 92 } }, termRatio: { midterm: 30, final: 70 } };
  assert.deepEqual(lectureHoverSteps(comps), { midterm: 84, final: 92, midtermShare: 30, finalShare: 70 });
  assert.equal(lectureHoverSteps({ periods: comps.periods }), null);
  assert.deepEqual(lectureHoverSteps({ periods: comps.periods }, { midterm: 30, final: 70 }), { midterm: 84, final: 92, midtermShare: 30, finalShare: 70 });
});
