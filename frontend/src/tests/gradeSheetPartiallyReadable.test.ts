import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUsed, parseWorkbook, type Cell } from '../utils/gradeSheetImport.ts';

// 10.6: official layout (header row 7, "N | %" max pairs in row 9) with synthetic data, but every max is 0,
// so the sheet is found and has zero usable counts.
const colNo = (L: string) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function emptyCountsSheet(): Cell[][] {
  const rows: Cell[][] = Array.from({ length: 12 }, () => []);
  const put = (r: number, L: string, v: Cell) => { rows[r - 1][colNo(L)] = v; };
  put(4, 'M', 'SAMPLE DENTISTRY 1 (LEC)'); put(5, 'M', '2ND SEMESTER, AY 2025-2026');
  for (const [L, v] of Object.entries({ A: 'No.', B: 'Names', C: 'RECITATION', F: 'OUTPUTS', X: 'MIDTERM GRADE', AA: 'RECITATION', AG: 'FINAL GRADE' })) put(7, L, v);
  for (const [L, pct] of [['F', 'G'], ['H', 'I'], ['AD', 'AE']] as const) { put(9, L, 0); put(9, pct, '%'); }
  put(10, 'A', 1); put(10, 'B', 'Cruz, Dana'); put(10, 'F', 25);
  return rows;
}

test('10.6 partially readable workbook: sheet found, zero usable counts, one persistent cause message', () => {
  const parsed = parseWorkbook([{ sheet: 'Sheet2', data: emptyCountsSheet() }]);
  assert.equal(parsed.length, 1); // found
  assert.ok(parsed.every(s => !s.items.some(isUsed))); // zero usable counts

  // The panel shows its own cause for this case, not the "no sheet found" one, and keeps it until the next upload.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const panel = fs.readFileSync(path.join(here, '../components/GradeSheetImportPanel.tsx'), 'utf8');
  assert.match(panel, /parsed\.every\(sheet => sheet\.rows\.length === 0 \|\| !sheet\.items\.some\(isUsed\)\)\) setError\('No student scores were found in this workbook\./);
  assert.match(panel, /if \(!parsed\.length\) setError\('No grade sheet was found/);
});
