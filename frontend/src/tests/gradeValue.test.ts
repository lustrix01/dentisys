import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GradeValue from '../components/GradeValue.ts';

test('GradeValue keeps the rounded text and exposes the exact grade as an accessible tooltip', () => {
  const html = renderToStaticMarkup(React.createElement(GradeValue, { percentage: 84.99, className: 'font-mono' }, '2.5'));
  assert.match(html, />2\.5<span/);
  assert.match(html, /Exact: 2\.5 \(84\.99%\)/);
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
  const html = renderToStaticMarkup(React.createElement(GradeValue, { percentage: 81.38, grade: 2.5 }, '2.5'));
  assert.match(html, /Exact: 2\.5 \(81\.38%\)/);
});
