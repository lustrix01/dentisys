import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// docs/frontend.md "Page patterns" (Table header cells): small capitals, text kept in Title Case in code.
const here = path.dirname(fileURLToPath(import.meta.url));
const roots = ['../pages', '../components'].map(r => path.join(here, r));
const standard = ['text-[10px]', 'font-bold', 'uppercase', 'tracking-wider'];

// Printed/exported report tables are styled by the print stylesheet (PrintSheet), not by Tailwind classes.
const printExempt: Record<string, number> = {
  'admin/SystemAudit.tsx': 2,
  'faculty/ClassesAndRosters.tsx': 1,
  'faculty/GradeComputation.tsx': 1,
  'faculty/Reports.tsx': 3,
  'components/AuditTrailPage.tsx': 1,
};

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

test('every table header uses the small-capitals standard', () => {
  for (const file of roots.flatMap(walk)) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(path.join(here, '..'), file).split(path.sep).join('/');
    const key = rel.replace(/^pages\//, '');
    const bad: string[] = [];
    for (const m of src.matchAll(/<thead\b([\s\S]*?)<\/thead>/g)) {
      const block = m[0];
      const theadTag = /^<thead\b[^>]*>/.exec(block)?.[0] ?? '';
      const trTag = /<tr\b[^>]*>/.exec(block)?.[0] ?? '';
      const ok = standard.every(c => theadTag.includes(c) || trTag.includes(c));
      if (!ok) bad.push(`line ${src.slice(0, m.index).split('\n').length}`);
    }
    assert.equal(bad.length, printExempt[key] ?? 0, `${rel}: thead without the standard classes at ${bad.join(', ')}`);
  }
});
