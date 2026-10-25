import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GradeValue from '../components/GradeValue.ts';

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
