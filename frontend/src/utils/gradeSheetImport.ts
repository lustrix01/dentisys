// Official grade sheet (.xlsx) import: pure parser, matching and plan building (contract docs/contracts/official-imports.md, section 2).
// Everything here works on plain rows (one array per sheet row), so tests use made-up rows and the panel does the file reading.

export type Cell = string | number | boolean | Date | null | undefined;
export type Period = 'Midterm' | 'Final';
export type Component = 'Lecture' | 'Laboratory';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const OUT = 'out'; // pick value meaning "leave this row out"

// ---------- file checks (G17) ----------

/** Returns the message to show, or null when the file may be read. head = first bytes of the file. */
export function checkWorkbookFile(file: { name: string; size: number }, head: ArrayLike<number>): string | null {
  if (!/\.xlsx$/i.test(file.name)) {
    return /\.xls$/i.test(file.name)
      ? 'This is an old .xls file. Open it in Excel, choose Save As > Excel Workbook (.xlsx), then upload again.'
      : 'Only .xlsx workbooks can be imported.';
  }
  if (file.size > MAX_FILE_BYTES) return 'The file is larger than 10 MB.';
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    return 'Remove the password in Excel, then upload again.';
  }
  if (head[0] !== 0x50 || head[1] !== 0x4b) return 'This file is not a valid .xlsx workbook.';
  return null;
}

// ---------- parsing ----------

export type CellRead = { kind: 'blank' } | { kind: 'number'; value: number } | { kind: 'invalid'; raw: string };

export interface SheetItem {
  key: string;
  sheetIndex: number;
  period: Period;
  col: number;
  title: string;
  kind: 'points' | 'percent';
  maxScore: number; // 100 for percent items
  categoryName: string;
}

export interface SheetStudentRow {
  rowNo: number; // 1-based row in the sheet
  no: string;
  name: string;
  cells: Record<string, CellRead>; // by item key, used items only
}

export interface SheetCategoryWeight { period: Period; name: string; weight: number | null } // weight in percent

export interface ParsedSheet {
  index: number;
  name: string;
  component: Component | null;
  courseTitle: string;
  semester: string | null; // '1ST' | '2ND' | 'SUMMER'
  schoolYear: string | null; // 'YYYY-YYYY'
  categories: SheetCategoryWeight[];
  items: SheetItem[]; // includes unused (max 0) items; use isUsed()
  periods: Period[]; // halves that hold at least one item column
  rows: SheetStudentRow[];
}

export const isUsed = (item: SheetItem) => item.maxScore > 0;

const text = (v: Cell): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: Cell): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isTotalHeader = (s: string) => /^total$/i.test(s) || /\bave(rage)?\.?$/i.test(s);

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

export function readCell(v: Cell): CellRead {
  if (v === null || v === undefined) return { kind: 'blank' };
  if (typeof v === 'number') return Number.isFinite(v) ? { kind: 'number', value: v } : { kind: 'invalid', raw: String(v) };
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return { kind: 'blank' };
    return /^-?\d+(\.\d+)?$/.test(t) ? { kind: 'number', value: Number(t) } : { kind: 'invalid', raw: t };
  }
  return { kind: 'invalid', raw: String(v) };
}

export function parseSemester(text: string): string | null {
  if (/\b(1ST|FIRST)\b/i.test(text)) return '1ST';
  if (/\b(2ND|SECOND)\b/i.test(text)) return '2ND';
  if (/SUMMER|MID-?YEAR/i.test(text)) return 'SUMMER';
  return null;
}

export function parseSchoolYear(text: string): string | null {
  const m = text.match(/(\d{4})\s*[-–/]\s*(\d{4})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Reads one sheet. Returns null when it has no score table (no row-9 "max, %" pairs): summary and grade-table sheets. */
export function parseSheet(name: string, rows: Cell[][], index: number): ParsedSheet | null {
  const row = (n: number): Cell[] => rows[n - 1] ?? [];
  const maxRow = row(9);
  const isPair = (c: number) => num(maxRow[c]) !== null && maxRow[c + 1] === '%';
  if (!maxRow.some((_v, c) => isPair(c))) return null;

  const head = row(7);
  const midEnd = head.findIndex(v => /^midterm\s*grade/i.test(text(v)));
  if (midEnd < 0) return null;
  let finalEnd = head.findIndex(v => /^final\s*grade/i.test(text(v)));
  if (finalEnd < 0) finalEnd = head.length;

  const titleText = row(4).map(text).find(Boolean) ?? '';
  const termText = row(5).map(text).find(Boolean) ?? '';
  const component: Component | null = /\(\s*lec\w*\s*\)/i.test(titleText) ? 'Lecture' : /\(\s*lab\w*\s*\)/i.test(titleText) ? 'Laboratory' : null;
  const courseTitle = titleText.replace(/\(\s*(lec|lab)\w*\s*\)/i, '').trim();

  const noCol = Math.max(0, head.findIndex(v => /^no\.?$/i.test(text(v))));
  const nameCol = (() => { const i = head.findIndex(v => /^names?$/i.test(text(v))); return i < 0 ? 1 : i; })();
  const start = Math.max(noCol, nameCol) + 1;

  const items: SheetItem[] = [];
  const categories: SheetCategoryWeight[] = [];
  const periods: Period[] = [];
  // The Finals half starts at its own first category (same header as the Midterm's), after "EQUIV." / "Midterm 30%".
  const firstHeader = text(head[start]).toLowerCase();
  const finalFrom = (() => {
    const same = head.findIndex((v, i) => i > midEnd && firstHeader && text(v).toLowerCase() === firstHeader);
    if (same >= 0) return same;
    const other = head.findIndex((v, i) => i > midEnd && text(v) && !/equiv|\d+\s*%/i.test(text(v)));
    return other < 0 ? midEnd + 1 : other;
  })();
  const halves: Array<{ period: Period; from: number; to: number }> = [
    { period: 'Midterm', from: start, to: midEnd },
    { period: 'Final', from: finalFrom, to: finalEnd },
  ];
  for (const half of halves) {
    const cols = Array.from({ length: Math.max(0, half.to - half.from) }, (_v, i) => half.from + i);
    const weightCols = cols.filter(c => num(head[c]) !== null);
    // Each weight cell closes the group of columns before it; columns after the last weight form one more group.
    const bounds = weightCols[weightCols.length - 1] === half.to - 1 ? weightCols : [...weightCols, half.to - 1];
    let lower = half.from;
    bounds.forEach(upper => {
      const groupCols = cols.filter(c => c >= lower && c <= upper);
      lower = upper + 1;
      const weightCell = num(head[upper]);
      const weight = weightCell === null ? null : Math.round(weightCell * 10000) / 100;
      const headers = groupCols.filter(c => text(head[c]) && !isTotalHeader(text(head[c]))).map(c => ({ col: c, text: text(head[c]) }));
      const pairs = groupCols.filter(isPair);
      if (!headers.length && !pairs.length) return;
      if (pairs.length && !periods.includes(half.period)) periods.push(half.period);
      if (!pairs.length) {
        // Recitation / Lab Performance: no row-9 max, the value is a direct percentage.
        if (!headers.length) return;
        const title = titleCase(headers[0].text);
        categories.push({ period: half.period, name: title, weight });
        if (!periods.includes(half.period)) periods.push(half.period);
        items.push({ key: `${index}:${half.period}:${headers[0].col}`, sheetIndex: index, period: half.period, col: headers[0].col, title, kind: 'percent', maxScore: 100, categoryName: title });
        return;
      }
      const categoryName = titleCase(headers[0].text.replace(/[\s\d.]+$/, '')) || 'Item';
      categories.push({ period: half.period, name: categoryName, weight });
      const ownerOf = (c: number) => [...headers].reverse().find(h => h.col <= c);
      const ownerPairs = new Map<number, number[]>();
      for (const c of pairs) {
        const o = ownerOf(c)?.col ?? -1;
        ownerPairs.set(o, [...(ownerPairs.get(o) ?? []), c]);
      }
      for (const c of pairs) {
        const owner = ownerOf(c);
        const mine = ownerPairs.get(owner?.col ?? -1)!;
        const base = owner ? (/^lab exercises?$/i.test(owner.text) ? 'Lab Exercise' : titleCase(owner.text)) : 'Item';
        const title = owner && mine.length === 1 ? base : `${base} ${mine.indexOf(c) + 1}`;
        items.push({ key: `${index}:${half.period}:${c}`, sheetIndex: index, period: half.period, col: c, title, kind: 'points', maxScore: num(maxRow[c])!, categoryName });
      }
    });
  }

  const used = items.filter(isUsed);
  const students: SheetStudentRow[] = [];
  for (let r = 10; r <= rows.length; r++) {
    const cells = row(r);
    const no = cells[noCol] === null || cells[noCol] === undefined ? '' : String(cells[noCol]).trim();
    const nm = text(cells[nameCol]);
    if (!no && !nm) break;
    const read: Record<string, CellRead> = {};
    for (const it of used) read[it.key] = readCell(cells[it.col]);
    students.push({ rowNo: r, no, name: nm, cells: read });
  }

  return {
    index, name, component, courseTitle,
    semester: parseSemester(termText), schoolYear: parseSchoolYear(termText),
    categories, items, periods, rows: students,
  };
}

/** Every sheet that has a score table, in workbook order. */
export function parseWorkbook(sheets: Array<{ sheet: string; data: Cell[][] }>): ParsedSheet[] {
  const out: ParsedSheet[] = [];
  sheets.forEach(s => { const p = parseSheet(s.sheet, s.data, out.length); if (p) out.push(p); });
  return out;
}

// ---------- name matching (G5) ----------

const words = (s: string): string[] =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const initials = (w: string[]) => w.map(x => x[0]);
const uniq = <T,>(a: T[]) => [...new Set(a)];

export interface RosterStudent { id: string; name: string; firstName?: string; middleName?: string | null; lastName?: string }

/** All spellings of one student that count as the same name (comma form and space form). */
function studentKeys(s: RosterStudent): string[] {
  const splits: Array<{ last: string[]; given: string[]; firstCount: number }> = [];
  if (s.lastName?.trim() && s.firstName?.trim()) {
    const f = words(s.firstName);
    splits.push({ last: words(s.lastName), given: [...f, ...words(s.middleName ?? '')], firstCount: f.length });
  } else if (s.name.includes(',')) {
    const [l, ...r] = s.name.split(',');
    const given = words(r.join(' '));
    // Without separate fields the first name may be several words ("Mark Anthony"); try each split.
    for (let f = 1; f <= Math.max(1, given.length); f++) splits.push({ last: words(l), given, firstCount: f });
  } else {
    const w = words(s.name);
    for (const n of [1, 2]) if (w.length > n) {
      for (let f = 1; f <= w.length - n; f++) splits.push({ last: w.slice(-n), given: w.slice(0, -n), firstCount: f });
    }
  }
  const keys: string[] = [];
  for (const { last, given, firstCount } of splits) {
    const first = given.slice(0, firstCount);
    const rights = uniq([
      given.join(' '), first.join(' '),
      [...first, ...initials(given.slice(firstCount))].join(' '),
      [given[0], ...initials(given.slice(1))].join(' '), given[0] ?? '',
    ]).filter(Boolean);
    for (const r of rights) keys.push(`c:${last.join(' ')}|${r}`, `s:${r} ${last.join(' ')}`);
  }
  return keys;
}

/** "Last, First M.", "Last, First Middle" or "First Middle Last" in any case, spacing and punctuation. */
export function sheetNameKey(raw: string): string {
  const comma = raw.indexOf(',');
  return comma < 0 ? `s:${words(raw).join(' ')}` : `c:${words(raw.slice(0, comma)).join(' ')}|${words(raw.slice(comma + 1)).join(' ')}`;
}

export function buildNameIndex(students: RosterStudent[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const s of students) for (const k of uniq(studentKeys(s))) index.set(k, [...(index.get(k) ?? []), s.id]);
  return index;
}

/** Student ids whose name fits the sheet's name text (one = matched, none or several = the Faculty decides). */
export function matchStudentName(raw: string, index: Map<string, string[]>): string[] {
  return raw.trim() ? index.get(sheetNameKey(raw)) ?? [] : [];
}

/** Same name text on both sheets shares one decision (G16). */
export const studentDecisionKey = (row: SheetStudentRow, sheetIndex: number) =>
  row.name.trim() ? `n:${words(row.name).join(' ')}` : `r:${sheetIndex}:${row.rowNo}`;

// ---------- header and weight checks (G4, G9) ----------

const normSemester = (s: string) => parseSemester(s) ?? s.trim().toUpperCase();
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function headerWarnings(sheet: ParsedSheet, cls: { courseName: string; semester: string; schoolYear: string }): string[] {
  const out: string[] = [];
  const a = squash(sheet.courseTitle), b = squash(cls.courseName);
  if (a && b && !a.includes(b) && !b.includes(a)) out.push(`Course: sheet "${sheet.courseTitle}", class "${cls.courseName}"`);
  if (sheet.semester && cls.semester && sheet.semester !== normSemester(cls.semester)) out.push(`Semester: sheet ${sheet.semester}, class ${cls.semester}`);
  if (sheet.schoolYear && cls.schoolYear && sheet.schoolYear !== cls.schoolYear.replace(/\s/g, '')) out.push(`School year: sheet ${sheet.schoolYear}, class ${cls.schoolYear}`);
  return out;
}

/** Case-insensitive, plural-insensitive name key (Quiz = Quizzes). */
export function categoryKey(name: string): string {
  const w = name.toLowerCase().replace(/[^a-z]/g, '');
  if (w.endsWith('zzes')) return w.slice(0, -3);
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  return w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
}

// ---------- saved data and decisions ----------

export interface SavedCategory { id: string | number; name: string; weight: number; period: Period; component: Component | null; attendance: boolean }
export interface SavedAssessment { id: string; title: string; maxScore: number; period: Period; component: Component | null; categoryId: string | number | null; attendance: boolean }

export interface ImportContext {
  classId: string;
  categories: SavedCategory[];
  assessments: SavedAssessment[];
  students: RosterStudent[];
  saved: Record<string, number>; // `${assessmentId}|${studentId}` -> saved score
  cls: { courseName: string; semester: string; schoolYear: string };
}

export interface Decisions {
  sheetComponent: Record<number, Component>;
  create: Record<string, boolean>; // item key
  link: Record<string, string>; // item key -> saved assessment id ('Use existing')
  category: Record<string, string>; // item key -> saved category id
  maxChoice: Record<string, 'keep' | 'change'>; // item key
  remove: Record<string, boolean>; // saved assessment id
  pick: Record<string, string>; // studentDecisionKey -> student id or OUT
  replace: Record<string, boolean>; // `${itemKey}|${studentId}`
}

export const emptyDecisions = (): Decisions => ({ sheetComponent: {}, create: {}, link: {}, category: {}, maxChoice: {}, remove: {}, pick: {}, replace: {} });

export interface ItemView {
  item: SheetItem;
  component: Component | null;
  assessment: SavedAssessment | null; // matched by title, or chosen with Use existing
  chosen: boolean; // assessment was chosen by the Faculty
  category: SavedCategory | null; // for a new item
  categoryChoices: SavedCategory[];
  linkChoices: SavedAssessment[];
  maxDiff: { saved: number; sheet: number } | null;
  effMax: number;
  maxError: string | null;
  included: boolean; // scores of this item are imported (matched, linked, or ticked to create)
  noScores: boolean;
  blanks: number;
  blockers: string[];
}

export type CellView =
  | { itemKey: string; kind: 'blank' }
  | { itemKey: string; kind: 'held'; reason: string }
  | { itemKey: string; kind: 'same'; value: number }
  | { itemKey: string; kind: 'new'; value: number }
  | { itemKey: string; kind: 'changed'; value: number; old: number; replace: boolean }
  | { itemKey: string; kind: 'skipped'; value: number }; // item not created / not included

export interface RowView {
  sheetIndex: number;
  row: SheetStudentRow;
  decisionKey: string;
  candidates: string[]; // student ids matching the name
  studentId: string | null;
  state: 'matched' | 'pick' | 'out' | 'empty' | 'duplicate';
  cells: CellView[];
}

export interface SheetView {
  sheet: ParsedSheet;
  component: Component | null;
  needsComponent: boolean;
  items: ItemView[];
  rows: RowView[];
  headerWarnings: string[];
}

export interface NotInSheet { assessment: SavedAssessment; component: Component | null; savedScores: number; removing: boolean }

export interface Preview {
  sheets: SheetView[];
  notInSheet: NotInSheet[];
  weightWarnings: string[];
  blockers: string[];
  counts: { toSave: number; blanks: number; held: number; changedUnticked: number; itemsToCreate: number; toRemove: number };
}

const compMatches = (a: Component | null, comp: Component | null) => a === null || comp === null || a === comp;

/** Combines the parsed sheets, the saved data and the Faculty's choices into what the preview shows. */
export function buildPreview(sheets: ParsedSheet[], ctx: ImportContext, dec: Decisions): Preview {
  const index = buildNameIndex(ctx.students);
  const byId = new Map(ctx.assessments.map(a => [a.id, a]));
  const savedCount = new Map<string, number>();
  const savedMax = new Map<string, number>();
  for (const [k, v] of Object.entries(ctx.saved)) {
    const id = k.split('|')[0];
    savedCount.set(id, (savedCount.get(id) ?? 0) + 1);
    savedMax.set(id, Math.max(savedMax.get(id) ?? 0, v));
  }
  const blockers: string[] = [];
  const views: SheetView[] = [];
  const claimed = new Set<string>();

  const compOf = (s: ParsedSheet): Component | null => dec.sheetComponent[s.index] ?? s.component;
  // Explicit "Use existing" choices claim their assessment first so a title match cannot take it.
  for (const s of sheets) for (const it of s.items) if (isUsed(it) && dec.link[it.key] && byId.has(dec.link[it.key])) claimed.add(dec.link[it.key]);
  const comps = sheets.map(compOf).filter((c): c is Component => !!c);
  for (const c of new Set(comps)) if (comps.filter(x => x === c).length > 1) blockers.push(`Two sheets are set to ${c}. Each sheet needs its own component.`);

  const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const s of sheets) {
    const comp = compOf(s);
    const itemViews: ItemView[] = [];
    const pool = (period: Period) => ctx.assessments.filter(a => a.period === period && !a.attendance && comp !== null && compMatches(a.component, comp));
    for (const it of s.items.filter(isUsed)) {
      let assessment: SavedAssessment | null = null;
      let chosen = false;
      if (comp) {
        const linkId = dec.link[it.key];
        if (linkId && byId.has(linkId)) { assessment = byId.get(linkId)!; chosen = true; }
        else {
          assessment = pool(it.period).find(a => !claimed.has(a.id) && titleKey(a.title) === titleKey(it.title)) ?? null;
          if (assessment) claimed.add(assessment.id);
        }
      }
      const choices = comp ? ctx.categories.filter(c => c.period === it.period && !c.attendance && compMatches(c.component, comp)) : [];
      const category = assessment ? null
        : choices.find(c => String(c.id) === dec.category[it.key]) ?? choices.find(c => categoryKey(c.name) === categoryKey(it.categoryName)) ?? null;
      const maxDiff = assessment && assessment.maxScore !== it.maxScore ? { saved: assessment.maxScore, sheet: it.maxScore } : null;
      const maxChoice = dec.maxChoice[it.key];
      const effMax = assessment ? (maxDiff && maxChoice === 'change' ? it.maxScore : assessment.maxScore) : it.maxScore;
      const above = assessment ? savedMax.get(assessment.id) ?? 0 : 0;
      const maxError = maxDiff && maxChoice === 'change' && it.maxScore < above
        ? `Maximum score cannot be lower than a score already saved (${above}). Keep ${assessment!.maxScore} or fix the score first.` : null;
      const included = !!assessment || (!!dec.create[it.key] && !!comp);
      const itemBlockers: string[] = [];
      if (!assessment && dec.create[it.key] && !category) itemBlockers.push(`Choose a category for ${it.title}.`);
      if (maxDiff && !maxChoice) itemBlockers.push(`Choose a max for ${it.title}.`);
      if (maxError) itemBlockers.push(maxError);
      const blank = s.rows.filter(r => r.cells[it.key]?.kind === 'blank').length;
      itemViews.push({
        item: it, component: comp, assessment, chosen, category, categoryChoices: choices, linkChoices: [],
        maxDiff, effMax, maxError, included, noScores: blank === s.rows.length, blanks: blank, blockers: itemBlockers,
      });
    }
    for (const v of itemViews) {
      if (!v.assessment && comp) v.linkChoices = pool(v.item.period).filter(a => !claimed.has(a.id));
    }
    const needsComponent = !comp;
    if (needsComponent) blockers.push(`Choose Lecture or Laboratory for the sheet "${s.name}".`);
    for (const v of itemViews) blockers.push(...v.blockers);

    // Students
    const itemByKey = new Map(itemViews.map(v => [v.item.key, v]));
    const rowViews: RowView[] = s.rows.map(r => {
      const candidates = matchStudentName(r.name, index);
      const decisionKey = studentDecisionKey(r, s.index);
      const hasScores = Object.values(r.cells).some(c => c.kind !== 'blank');
      const pick = dec.pick[decisionKey];
      let state: RowView['state'];
      let studentId: string | null = null;
      if (!hasScores) state = 'empty';
      else if (pick === OUT) state = 'out';
      else if (pick && ctx.students.some(x => x.id === pick)) { state = 'matched'; studentId = pick; }
      else if (candidates.length === 1) { state = 'matched'; studentId = candidates[0]; }
      else state = 'pick';
      return { sheetIndex: s.index, row: r, decisionKey, candidates, studentId, state, cells: [] };
    });
    const seen = new Map<string, number>();
    rowViews.forEach(r => { if (r.studentId) seen.set(r.studentId, (seen.get(r.studentId) ?? 0) + 1); });
    rowViews.forEach(r => { if (r.studentId && seen.get(r.studentId)! > 1) r.state = 'duplicate'; });
    for (const r of rowViews) {
      if (r.state === 'pick') blockers.push(`Row ${r.row.rowNo} of "${s.name}": choose a student or leave the row out.`);
      if (r.state === 'duplicate') blockers.push(`Row ${r.row.rowNo} of "${s.name}": the same student is on another row. Leave one out.`);
      r.cells = Object.entries(r.row.cells).map(([itemKey, c]): CellView => {
        const v = itemByKey.get(itemKey)!;
        if (c.kind === 'blank') return { itemKey, kind: 'blank' };
        if (c.kind === 'invalid') return { itemKey, kind: 'held', reason: `"${c.raw}" is not a number` };
        if (c.value < 0 || c.value > v.effMax) return { itemKey, kind: 'held', reason: `${c.value} is outside 0–${v.effMax}` };
        if (!v.included) return { itemKey, kind: 'skipped', value: c.value };
        const old = v.assessment && r.studentId ? ctx.saved[`${v.assessment.id}|${r.studentId}`] : undefined;
        if (old === undefined) return { itemKey, kind: 'new', value: c.value };
        if (old === c.value) return { itemKey, kind: 'same', value: c.value };
        return { itemKey, kind: 'changed', value: c.value, old, replace: !!(r.studentId && dec.replace[`${itemKey}|${r.studentId}`]) };
      });
    }
    views.push({ sheet: s, component: comp, needsComponent, items: itemViews, rows: rowViews, headerWarnings: headerWarnings(s, ctx.cls) });
  }

  // Saved assessments the sheet does not have
  const notInSheet: NotInSheet[] = [];
  const listed = new Set<string>();
  for (const v of views) {
    if (!v.component) continue;
    for (const a of ctx.assessments) {
      if (a.attendance || listed.has(a.id) || claimed.has(a.id) || !v.sheet.periods.includes(a.period) || !compMatches(a.component, v.component)) continue;
      listed.add(a.id);
      notInSheet.push({ assessment: a, component: v.component, savedScores: savedCount.get(a.id) ?? 0, removing: !!dec.remove[a.id] });
    }
  }

  // Weights (G4): the import never changes them, it only warns
  const weightWarnings: string[] = [];
  for (const v of views) {
    if (!v.component) continue;
    for (const c of v.sheet.categories) {
      if (c.weight === null) continue;
      const saved = ctx.categories.find(x => x.period === c.period && !x.attendance && compMatches(x.component, v.component) && categoryKey(x.name) === categoryKey(c.name));
      if (saved && Math.abs(Number(saved.weight) - c.weight) > 0.005) {
        weightWarnings.push(`${c.period === 'Final' ? 'Finals' : c.period} ${v.component} · ${c.name}: sheet ${c.weight}%, saved ${Number(saved.weight)}%`);
      }
    }
  }

  let toSave = 0, blanks = 0, held = 0, changedUnticked = 0;
  for (const v of views) {
    for (const r of v.rows) {
      if (r.state === 'out' || r.state === 'empty') continue;
      for (const c of r.cells) {
        if (c.kind === 'blank') blanks++;
        else if (c.kind === 'held') held++;
        else if (c.kind === 'new') toSave++;
        else if (c.kind === 'changed') { if (c.replace) toSave++; else changedUnticked++; }
      }
    }
  }
  const itemsToCreate = views.reduce((n, v) => n + v.items.filter(i => !i.assessment && i.included).length, 0);
  return { sheets: views, notInSheet, weightWarnings, blockers, counts: { toSave, blanks, held, changedUnticked, itemsToCreate, toRemove: notInSheet.filter(n => n.removing).length } };
}

// ---------- the plan handed to the save endpoint (G13) ----------

export interface GradeSheetImportPlan {
  classId: string;
  items: Array<{
    key: string;
    period: Period;
    component: Component;
    categoryId: string | number;
    title: string;
    maxScore: number;
    transmutationEnabled: boolean;
    action: 'create' | 'link';
    assessmentId?: string; // link
    newMaxScore?: number; // link: update the saved max
  }>;
  removeAssessmentIds: string[];
  scores: Array<{ itemKey: string; studentId: string; score: number }>;
}

export function buildPlan(preview: Preview, ctx: ImportContext, dec: Decisions): GradeSheetImportPlan {
  const plan: GradeSheetImportPlan = { classId: ctx.classId, items: [], removeAssessmentIds: [], scores: [] };
  for (const v of preview.sheets) {
    for (const r of v.rows) {
      if (!r.studentId || r.state !== 'matched') continue;
      for (const c of r.cells) {
        if (c.kind === 'new' || (c.kind === 'changed' && c.replace)) plan.scores.push({ itemKey: c.itemKey, studentId: r.studentId, score: c.value });
      }
    }
    for (const i of v.items) {
      if (!i.included || !v.component) continue;
      const hasScores = plan.scores.some(s => s.itemKey === i.item.key);
      if (i.assessment) {
        const change = i.maxDiff && dec.maxChoice[i.item.key] === 'change';
        if (!hasScores && !change) continue;
        plan.items.push({
          key: i.item.key, period: i.item.period, component: v.component, categoryId: i.assessment.categoryId ?? '',
          title: i.assessment.title, maxScore: i.effMax, transmutationEnabled: i.item.kind === 'points',
          action: 'link', assessmentId: i.assessment.id, ...(change ? { newMaxScore: i.item.maxScore } : {}),
        });
      } else if (i.category) {
        plan.items.push({
          key: i.item.key, period: i.item.period, component: v.component, categoryId: i.category.id,
          title: i.item.title, maxScore: i.item.maxScore, transmutationEnabled: i.item.kind === 'points', action: 'create',
        });
      }
    }
  }
  plan.removeAssessmentIds = preview.notInSheet.filter(n => n.removing).map(n => n.assessment.id);
  return plan;
}
