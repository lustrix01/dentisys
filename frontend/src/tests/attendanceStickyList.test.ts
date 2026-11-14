import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Backlog 5.6: roll-call tables scroll inside a bounded box with an opaque sticky header.
for (const file of ['../pages/faculty/AttendanceMonitoring.tsx', '../pages/secretary/AttendanceList.tsx']) {
  test(`${file} roll-call table has a bounded scroll box and an opaque sticky header`, () => {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(src, /max-h-\[560px\] overflow-y-auto overflow-x-auto[^"]*">\s*<table/);
    assert.match(src, /<thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 /);
    assert.doesNotMatch(src, /backdrop-blur-xs/);
  });
  test(`${file} scheduled pill detail line is not indented under a dotless title`, () => {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /pl-\[14px\][^"]*text-indigo-700\/90/);
  });
}
