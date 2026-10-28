import { personNameFieldError } from './personNameValidation.ts';
import { normalizeNameAffix } from './nameNormalization.ts';
import { normalizePhMobile, PH_MOBILE_MESSAGE } from './phMobile.ts';

/** Provisional roster data only; no official Registrar format is confirmed. */
export interface ParsedRosterStudent {
  tempKey: string;
  studentId: string;
  prefix?: string;
  suffix?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  contact?: string;
  yearLevel: number | null;
  sex?: string;
  originalName?: string;
  sourcePage?: number;
  sourceRow?: string;
  possibleCrossedOut?: boolean;
  requiresNameReview: boolean;
  reviewed: boolean;
  included: boolean;
  status: 'valid' | 'warning' | 'error';
  validationMessage?: string;
}

const NAME_SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const SURNAME_PARTICLE = /^(de|del|dela|delos|delas|dos|san|santa|sta\.?|sto\.?|van|von|da|di|du|la|los|las)$/i;

/** Last, First Middle: last given token (with surname particles) is the middle name; the Faculty still reviews every split. */
export function splitFullName(rawName: string) {
  const cleaned = rawName.normalize('NFC').trim().replace(/\s+/g, ' ');
  const comma = cleaned.indexOf(',');
  if (comma < 0) return { firstName: cleaned, middleName: '', lastName: '' };
  const lastName = cleaned.slice(0, comma).trim();
  const tokens = cleaned.slice(comma + 1).trim().split(' ').filter(Boolean);
  let suffix: string | undefined;
  if (tokens.length > 1 && NAME_SUFFIX.test(tokens[tokens.length - 1])) suffix = tokens.pop();
  let at = tokens.length;
  if (tokens.length > 1) {
    at = tokens.length - 1;
    while (at > 1 && SURNAME_PARTICLE.test(tokens[at - 1])) at--;
  }
  return { firstName: tokens.slice(0, at).join(' '), middleName: tokens.slice(at).join(' '), lastName, suffix };
}

export function parseRosterYear(value: string): number | null {
  if (!value.trim()) return null;
  const match = value.trim().match(/^([1-6])(?:st|nd|rd|th)?(?:\s*year)?$/i);
  return match ? Number(match[1]) : Number.NaN;
}

// The existing Student API stores sex as a single-character code.
function normalizeRosterSex(value: string): string {
  const trimmed = value.trim();
  if (/^(female|f)$/i.test(trimmed)) return 'F';
  if (/^(male|m)$/i.test(trimmed)) return 'M';
  return '';
}

export function validateRosterStudents(rows: ParsedRosterStudent[], allowedDomains: string[]): ParsedRosterStudent[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.studentId.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map(row => {
    const errors: string[] = [];
    if (row.studentId.trim().length < 3) errors.push('Student number must contain at least 3 characters.');
    if (row.studentId.trim().length > 50) errors.push('Student number must contain at most 50 characters.');
    const contact = normalizePhMobile(row.contact ?? '');
    if (contact === null) errors.push(PH_MOBILE_MESSAGE);
    const sex = normalizeRosterSex(row.sex ?? '');
    if ((counts.get(row.studentId.trim().toLowerCase()) ?? 0) > 1) errors.push('Duplicate student number in this file.');
    for (const key of ['prefix', 'firstName', 'middleName', 'lastName', 'suffix'] as const) {
      const raw = row[key] ?? '';
      const error = personNameFieldError(key, raw);
      if (error) errors.push(error);
      const affix = key === 'prefix' || key === 'suffix';
      const normalized = affix ? normalizeNameAffix(raw.trim(), key === 'prefix' ? 'prefix' : 'suffix') : raw.trim().replace(/\s+/g, ' ').replace(/(^| )(jr|sr)\.?(?= |$)/gi, '$1$2.');
      const maxBytes = affix ? 50 : 100;
      const label = { prefix: 'Prefix', firstName: 'First name', middleName: 'Middle name', lastName: 'Last name', suffix: 'Suffix' }[key];
      if (new TextEncoder().encode(normalized).length > maxBytes) errors.push(`${label} must contain at most ${maxBytes} UTF-8 bytes.`);
    }
    if (!row.email.trim()) errors.push('Institutional email is required before this row can be imported.');
    else {
      const email = row.email.trim();
      if (new TextEncoder().encode(email).length > 254) errors.push('Email must contain at most 254 UTF-8 bytes.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Provide a complete institutional email address.');
      else if (!allowedDomains.some(domain => domain.toLowerCase() === email.split('@')[1].toLowerCase())) errors.push('Email domain is not allowed by the server configuration.');
    }
    if (row.yearLevel !== null && (!Number.isInteger(row.yearLevel) || row.yearLevel < 1 || row.yearLevel > 6)) errors.push('Year level must be between 1 and 6, or blank.');
    const needsReview = !row.reviewed && (row.requiresNameReview || row.possibleCrossedOut);
    return { ...row, sex, ...(contact !== null && row.contact !== undefined ? { contact } : {}), status: errors.length ? 'error' : needsReview ? 'warning' : 'valid', validationMessage: errors.length ? errors.join(' ') : needsReview ? 'Review the source and name fields before selecting this row.' : undefined };
  });
}

/** Quoted fields, escaped quotes and embedded newlines stay in their cells. */
function delimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const pushRow = () => { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ''; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || !field.trim()) quoted = !quoted;
      else field += char;
    } else if (char === delimiter && !quoted) { row.push(field.trim()); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else field += char;
  }
  if (quoted) throw new Error('Unclosed quoted field in the roster file.');
  pushRow();
  return rows;
}

const aliases: Record<string, string[]> = {
  studentId: ['studentid', 'studentnumber', 'studentno', 'studentnum', 'id', 'idnumber'],
  firstName: ['firstname', 'givenname'], lastName: ['lastname', 'surname', 'familyname'],
  middleName: ['middlename', 'middleinitial'], originalName: ['name', 'fullname', 'studentname'],
  email: ['email', 'emailaddress', 'institutionalemail', 'institutionalemailaddress', 'buemail', 'buemailaddress', 'studentemail', 'studentemailaddress'],
  yearLevel: ['year', 'yearlevel', 'level'], sex: ['sex', 'gender'],
  contact: ['contact', 'contactnumber', 'contactno', 'phone', 'phonenumber', 'mobile'],
  prefix: ['prefix', 'nameprefix'], suffix: ['suffix', 'namesuffix'],
};

export function parseCSVText(text: string): ParsedRosterStudent[] {
  const clean = text.replace(/^\uFEFF/, '');
  // Detect separators outside quotes in the first non-empty logical row.
  let quoted = false;
  let hasValue = false;
  const counts = new Map([ [',', 0], ['\t', 0], [';', 0] ]);
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '"') { if (quoted && clean[i + 1] === '"') { i++; hasValue = true; } else quoted = !quoted; }
    else if (!quoted && /[\r\n]/.test(clean[i])) {
      if (hasValue) break;
      for (const separator of counts.keys()) counts.set(separator, 0);
    }
    else if (!quoted && counts.has(clean[i])) counts.set(clean[i], counts.get(clean[i])! + 1);
    else if (/\S/.test(clean[i])) hasValue = true;
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows = delimitedRows(clean, delimiter);
  if (!rows.length) return [];
  const headers = rows[0].map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex(header => names.includes(header))]));
  const hasHeader = columns.studentId >= 0 || columns.firstName >= 0 || columns.originalName >= 0;
  if (hasHeader && columns.studentId < 0) throw new Error('The roster needs a Student ID or Student No. column.');
  return (hasHeader ? rows.slice(1) : rows).map((values, index) => {
    const get = (field: string) => columns[field] >= 0 ? values[columns[field]] ?? '' : '';
    const originalName = hasHeader ? get('originalName') : values[1] ?? '';
    const structured = hasHeader && columns.firstName >= 0 && columns.lastName >= 0;
    const positionalNames = !hasHeader && values.length >= 3 && !values[1]?.includes(',') && !values[2]?.includes('@') && !/^\d/.test(values[2] ?? '');
    const names = structured
      ? { firstName: get('firstName'), middleName: get('middleName'), lastName: get('lastName') }
      : positionalNames
        ? { firstName: values[2] ?? '', lastName: values[1] ?? '', middleName: values[3] && !values[3].includes('@') && !/^\d/.test(values[3]) ? values[3] : '' }
        : splitFullName(originalName);
    return {
      tempKey: `csv-${index}`, studentId: (hasHeader ? get('studentId') : values[0] ?? '').trim(), ...names,
      prefix: get('prefix') || undefined, suffix: get('suffix') || ('suffix' in names ? names.suffix : undefined),
      email: (hasHeader ? get('email') : values.find(value => value.includes('@')) ?? '').trim().toLowerCase(),
      contact: get('contact') || undefined, sex: get('sex') || undefined,
      yearLevel: parseRosterYear(hasHeader ? get('yearLevel') : values.find(value => /^[1-6]$/.test(value)) ?? ''),
      originalName: structured ? undefined : positionalNames ? [names.firstName, names.middleName, names.lastName].filter(Boolean).join(' ') : originalName,
      sourceRow: String(index + (hasHeader ? 2 : 1)), requiresNameReview: !structured,
      reviewed: structured, included: structured, status: 'valid' as const,
    };
  });
}

export interface RosterPDFTextItem { text: string; x: number; y: number; width: number; height: number }
export interface RosterPDFPage { page: number; width: number; height: number; items: RosterPDFTextItem[]; redMarkBands: Array<{ top: number; bottom: number }> }

/** One meeting per day; times are 24-hour HH:MM and an empty room means the file said "---". */
export interface RosterPDFMeeting { component: 'Lecture' | 'Laboratory'; day: string; startTime: string; endTime: string; room: string }
export interface RosterPDFHeader {
  courseCode?: string; section?: string; schoolYear?: string; semester?: '1ST' | '2ND' | 'SUMMER';
  courseTitle?: string; yearLevel?: number; lectureUnits?: number; labUnits?: number;
  meetings?: RosterPDFMeeting[]; notRead?: string[];
}
export interface RosterPDFResult { students: ParsedRosterStudent[]; total: number | null; header: RosterPDFHeader; official: boolean }

const headerStop = String.raw`(?=\s+(?:Course\s*(?:Code|Title)|Class\s*Section|Year\s*Level|Faculty|Schedules?|Academic|Lab|Credit|Units?)\b|$)`;
const field = (text: string, label: string) => text.match(new RegExp(String.raw`${label}\s*:\s*(.+?)${headerStop}`, 'i'))?.[1].trim();
const titleStop = String.raw`(?=\s+(?:Year\s*Level|Academic\s*Units|Lab\s*Units|Credit\s*Units|Faculty\s*:|Schedules?\s*:|#\s|Student\s*No)|$)`;
const unitsField = (text: string, label: string) => { const value = text.match(new RegExp(String.raw`${label}\s*:\s*(\d+(?:\.\d+)?)`, 'i'))?.[1]; return value === undefined ? undefined : Number(value); };

const DAY = 'Mon|Tue|Wed|Thu|Fri|Sat|Sun';
const scheduleLine = new RegExp(String.raw`^((?:${DAY})(?:\s*,\s*(?:${DAY}))*)\s*\(\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*\)\s*\|\s*(Lecture|Laboratory)\s*\|\s*(.*)$`, 'i');
const clock24 = (hour: string, minute: string, meridiem: string) => `${String(Number(hour) % 12 + (/pm/i.test(meridiem) ? 12 : 0)).padStart(2, '0')}:${minute}`;
const cap = (word: string) => word[0].toUpperCase() + word.slice(1).toLowerCase();

/** "Thu, Fri (12:00 PM - 05:00 PM) | Laboratory | CDM2" becomes one meeting per day; lines that do not fit go to notRead. */
export function parseScheduleLines(lines: string[]): { meetings: RosterPDFMeeting[]; notRead: string[] } {
  const meetings: RosterPDFMeeting[] = [], notRead: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(scheduleLine);
    const startTime = m && clock24(m[2], m[3], m[4]), endTime = m && clock24(m[5], m[6], m[7]);
    if (!m || Number(m[2]) > 12 || Number(m[5]) > 12 || startTime! >= endTime!) { if (line) notRead.push(line); continue; }
    const room = /^-*$/.test(m[9].trim()) ? '' : m[9].trim();
    for (const day of m[1].split(',')) meetings.push({ component: cap(m[8]) as 'Lecture' | 'Laboratory', day: cap(day.trim()), startTime: startTime!, endTime: endTime!, room });
  }
  return { meetings, notRead };
}

/** Header facts warn for an existing class and prefill a new one. The Faculty name is ignored. */
function parsePDFHeader(rawText: string, rawLines: string[]): RosterPDFHeader {
  const text = rawText.replace(/\s+/g, ' '), lines = rawLines.map(line => line.replace(/\s+/g, ' '));
  const ay = text.match(/AY\s*(\d{4})\s*-\s*(\d{4})\s*(1st|2nd|summer)/i);
  const sem = ay?.[3].toLowerCase();
  const title = text.match(new RegExp(String.raw`Course\s*Title\s*:\s*(.+?)${titleStop}`, 'i'))?.[1].trim();
  const year = parseRosterYear(field(text, String.raw`Year\s*Level`) ?? '');
  const start = lines.findIndex(line => /^\s*Schedules?\s*:/i.test(line));
  const rest: string[] = [];
  if (start >= 0) {
    rest.push(lines[start].replace(/^\s*Schedules?\s*:/i, ''));
    for (const line of lines.slice(start + 1)) { if (/TO\s+FACULTY|Student\s*(?:No|Number|ID)|^\s*#|Total\s+Number/i.test(line)) break; rest.push(line); }
  }
  const lectureUnits = unitsField(text, String.raw`Academic\s*Units`), labUnits = unitsField(text, String.raw`Lab\s*Units`);
  return {
    courseCode: field(text, String.raw`Course\s*Code`), section: field(text, String.raw`Class\s*Section`),
    schoolYear: ay ? `${ay[1]}-${ay[2]}` : undefined,
    semester: sem === '1st' ? '1ST' : sem === '2nd' ? '2ND' : sem ? 'SUMMER' : undefined,
    ...(title ? { courseTitle: title } : {}),
    ...(year !== null && Number.isFinite(year) ? { yearLevel: year } : {}),
    ...(lectureUnits !== undefined ? { lectureUnits } : {}), ...(labUnits !== undefined ? { labUnits } : {}),
    ...(start >= 0 ? (({ meetings, notRead }) => ({ meetings, notRead }))(parseScheduleLines(rest)) : {}),
  };
}

const squash = (value: string) => value.toLowerCase().replace(/[\s-]+/g, '');
const semesterCode = (value: string) => /2nd|second/i.test(value) ? '2ND' : /summer/i.test(value) ? 'SUMMER' : '1ST';
const semesterName = { '1ST': '1st Semester', '2ND': '2nd Semester', SUMMER: 'Summer' };

/** One entry per differing field, e.g. "Course code: file DM 102, class DM 100". Empty = same or unreadable. */
export function compareRosterHeader(header: RosterPDFHeader, cls: { courseCode: string; csName?: string; block: string; schoolYear: string; semester: string }): string[] {
  const diffs: string[] = [];
  const check = (label: string, file: string | undefined, className: string, same: boolean) => { if (file && !same) diffs.push(`${label}: file ${file}, class ${className}`); };
  check('Course code', header.courseCode, cls.courseCode, squash(header.courseCode ?? '') === squash(cls.courseCode));
  const section = cls.csName || cls.block;
  // A class made by Create Class is named "<course code>-<section>" and keeps the section in block.
  const names = [section, cls.block, section.slice(0, cls.courseCode.length + 1).toLowerCase() === `${cls.courseCode}-`.toLowerCase() ? section.slice(cls.courseCode.length + 1) : ''].filter(Boolean);
  check('Section', header.section, section, names.some(name => squash(header.section ?? '') === squash(name)));
  check('School year', header.schoolYear, cls.schoolYear, header.schoolYear === cls.schoolYear.replace(/\s/g, ''));
  check('Semester', header.semester && semesterName[header.semester], semesterName[semesterCode(cls.semester)], header.semester === semesterCode(cls.semester));
  return diffs;
}

type ClassLike = { courseCode: string; csName?: string; block: string; schoolYear: string; semester: string };

/** N2: the first class (the list holds only the signed-in Faculty's own) with the file's course code, section, school year and semester. */
export function findClassMatchingHeader<T extends ClassLike>(header: RosterPDFHeader, classes: T[]): T | undefined {
  if (!header.courseCode || !header.section || !header.schoolYear || !header.semester) return undefined;
  return classes.find(cls => compareRosterHeader(header, cls).length === 0);
}

/** N5: default to the Dean term matching the file header; creating a class requires the Faculty's selected term to be current-year. */
export function termForHeader(header: RosterPDFHeader, currentSchoolYear: string, terms: Array<{ id: number | null; schoolYear: string; semester: string }>): { termId: string; noTerm?: string } {
  const fileYear = header.schoolYear?.replace(/\s/g, '') ?? '';
  if (fileYear && fileYear !== currentSchoolYear.replace(/\s/g, '')) return { termId: '', noTerm: `This file is for AY ${fileYear}. Choose a ${currentSchoolYear} term to create the class here.` };
  const term = header.semester && fileYear && terms.find(item => item.id !== null && item.schoolYear.replace(/\s/g, '') === fileYear && semesterCode(item.semester) === header.semester);
  return term ? { termId: String(term.id) } : { termId: '', noTerm: `No Dean-defined term matches AY ${fileYear} ${header.semester ? semesterName[header.semester] : ''}. Choose a term from the list or ask the Dean to add it.`.replace(/\s+/g, ' ').trim() };
}

/** N3a: DentiSys keeps the units it has recorded for a course; say so when the file disagrees. */
export function catalogUnitsNote(code: string, file: { lectureUnits?: number; labUnits?: number }, catalog?: { lectureUnits?: number | null; labUnits?: number | null }): string | null {
  const lecture = Number(catalog?.lectureUnits ?? 0), lab = Number(catalog?.labUnits ?? 0);
  if (!catalog || !(lecture > 0 || lab > 0) || file.lectureUnits === undefined || file.labUnits === undefined) return null;
  if (file.lectureUnits === lecture && file.labUnits === lab) return null;
  return `This file says Lecture ${file.lectureUnits} · Laboratory ${file.labUnits}; DentiSys has Lecture ${lecture} · Laboratory ${lab} for ${code}. Ask the course's creator to change them in Classes & Rosters.`;
}

const unitsValid = (value: string) => { const n = Number(value); return value.trim() !== '' && Number.isFinite(n) && (n === 0 || (n >= 0.5 && n <= 20)); };

/** Why "Create class and add N students" is blocked; empty = the class form is acceptable (Create Class's checks). */
export function newClassBlockers(input: {
  code: string; title: string; section: string; lectureUnits: string; labUnits: string; termId: string;
  pastYear?: string; noTerm?: string; rooms: string[]; scheduleError: string | null;
}): string[] {
  const out: string[] = [];
  if (input.pastYear) out.push(input.pastYear);
  else if (!input.termId) out.push(input.noTerm ?? 'Choose an academic term.');
  if (!input.code.trim()) out.push('Enter a course code.');
  if (!input.title.trim()) out.push('Enter the course title.');
  if (!unitsValid(input.lectureUnits) || !unitsValid(input.labUnits) || !(Number(input.lectureUnits) > 0 || Number(input.labUnits) > 0)) out.push('Enter units between 0.5 and 20.');
  if (!input.section.trim()) out.push('Enter the section or block.');
  if (input.rooms.some(room => !room.trim())) out.push('Every meeting needs a room.');
  else if (input.scheduleError) out.push(input.scheduleError);
  return out;
}

/** Read the table by geometry, never by student-ID regex. */
export function parsePDFRosterPages(pages: RosterPDFPage[]): ParsedRosterStudent[] {
  return parsePDFRoster(pages).students;
}

export function parsePDFRoster(pages: RosterPDFPage[]): RosterPDFResult {
  const students: ParsedRosterStudent[] = [];
  let total: number | null = null;
  let headerText = '';
  let headerLines: string[] = [];
  let hasProgram = false;
  for (const page of pages) {
    const pageText = [...page.items].sort((a, b) => a.y - b.y || a.x - b.x).map(item => item.text.trim()).join(' ');
    const totalMatch = pageText.match(/Total\s+Number\s+of\s+Students\s*:?\s*(\d+)/i);
    if (totalMatch) total = Number(totalMatch[1]);
    const lines: Array<{ y: number; items: RosterPDFTextItem[] }> = [];
    for (const item of [...page.items].sort((a, b) => a.y - b.y || a.x - b.x)) {
      let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= 3);
      if (!line) { line = { y: item.y, items: [] }; lines.push(line); }
      line.items.push(item);
    }
    if (!headerText && /Course\s*Code\s*:/i.test(pageText)) {
      headerText = pageText;
      headerLines = lines.map(line => line.items.sort((a, b) => a.x - b.x).map(item => item.text.trim()).filter(Boolean).join(' '));
    }
    const header = lines.find(line => {
      const text = line.items.map(item => item.text).join(' ');
      return /Student\s*(?:No\.?|Number|ID)/i.test(text) && /Name/i.test(text) && /Year\s*Level/i.test(text);
    });
    if (!header && /Total\s+Number\s+of\s+Students|NOTHING\s+FOLLOWS/i.test(pageText)) continue;
    if (!header) throw new Error(`Page ${page.page}: unsupported PDF table layout. Use the provisional CSV template instead.`);
    const headerItems = header.items.filter(item => item.text.trim());
    const programItem = headerItems.find(entry => entry.text.trim().toLowerCase() === 'program');
    // The official Program column is read only to keep it out of the name.
    const roles = programItem ? ['#', 'id', 'program', 'name', 'sex', 'year', 'contact'] : ['#', 'id', 'name', 'sex', 'year', 'contact'];
    if (programItem) hasProgram = true;
    const labels = ['#', 'Student No.', ...(programItem ? ['Program'] : []), 'Name', 'Gender', 'Year Level', 'Contact #'];
    const headers = labels.map(label => {
      const item = headerItems.find(entry => entry.text.trim().toLowerCase() === label.toLowerCase());
      if (!item) throw new Error(`Page ${page.page}: expected ${label} table header.`);
      return item;
    });
    // Headers are centered in unequal-width cells. Use left text positions,
    // rather than text centers (long names extend into the name column).
    const boundaries = headers.slice(0, -1).map(item => item.x + item.width + 1);
    const column = (item: RosterPDFTextItem) => { const idx = boundaries.findIndex(boundary => item.x < boundary); return roles[idx < 0 ? roles.length - 1 : idx]; };
    const below = page.items.filter(item => item.y > header.y + 3);
    // A single visible identifier can arrive as several PDF.js text items.
    // Join its same-line fragments before deriving one row anchor.
    const numberLines: Array<{ y: number; items: RosterPDFTextItem[] }> = [];
    for (const item of below.filter(item => column(item) === 'id' && item.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
      let line = numberLines.find(candidate => Math.abs(candidate.y - item.y) <= 3);
      if (!line) { line = { y: item.y, items: [] }; numberLines.push(line); }
      line.items.push(item);
    }
    const ids = numberLines.map(line => ({ y: line.y, studentId: line.items.sort((a, b) => a.x - b.x).map(item => item.text.trim()).join('') }))
      .filter(row => /^[A-Za-z0-9][A-Za-z0-9._/-]{2,}$/.test(row.studentId) && /\d/.test(row.studentId));
    for (let i = 0; i < ids.length; i++) {
      const anchor = ids[i];
      const top = i ? (ids[i - 1].y + anchor.y) / 2 : header.y + 5;
      const bottom = i + 1 < ids.length ? (anchor.y + ids[i + 1].y) / 2 : anchor.y + 16;
      const rowItems = below.filter(item => item.y >= top && item.y < bottom).sort((a, b) => a.y - b.y || a.x - b.x);
      const cell = (col: string) => {
        const cellLines: Array<{ y: number; items: RosterPDFTextItem[] }> = [];
        for (const item of rowItems.filter(item => column(item) === col)) {
          let line = cellLines.find(candidate => Math.abs(candidate.y - item.y) <= 3);
          if (!line) { line = { y: item.y, items: [] }; cellLines.push(line); }
          line.items.push(item);
        }
        return cellLines.map(line => {
          const fragments = line.items.sort((a, b) => a.x - b.x);
          return fragments.map((item, index) => {
            const previous = fragments[index - 1];
            // Retain literal spaces; otherwise infer a space only from a
            // visible gap, allowing one point for PDF coordinate rounding.
            const gap = previous && item.x - (previous.x + previous.width) > 1;
            return `${gap && !/\s$/.test(previous.text) && !/^\s/.test(item.text) ? ' ' : ''}${item.text}`;
          }).join('');
        }).join(' ').trim();
      };
      const nameCell = cell('name').replace(/No\s+University\s+Email/i, '');
      const email = nameCell.match(/[^\s@]+@[^\s@]+\.[^\s@]+/u)?.[0] ?? '';
      const originalName = nameCell.replace(email, '').trim();
      const possibleCrossedOut = page.redMarkBands.some(band => band.bottom >= top - 8 && band.top < bottom - 8);
      students.push({
        tempKey: `pdf-${page.page}-${i}`, studentId: anchor.studentId, ...splitFullName(originalName),
        email: email.toLowerCase(), contact: cell('contact') || undefined, sex: cell('sex') || undefined,
        yearLevel: parseRosterYear(cell('year')), originalName, sourcePage: page.page, sourceRow: cell('#'),
        possibleCrossedOut, requiresNameReview: true, reviewed: false, included: false, status: 'warning',
      });
    }
  }
  const header = parsePDFHeader(headerText, headerLines);
  return { students, total, header, official: hasProgram || Boolean(header.courseCode) };
}

export function getSampleRegistrarCSV(): string {
  return 'Student ID,Last Name,First Name,Middle Name,Email,Year Level,Sex,Contact #\n2099-1234-56789,Dela Cruz,Ana,Reyes,ana.fixture@bicol-u.edu.ph,4,Female,\n2099-01-12345,Peña,José,,jose.fixture@bicol-u.edu.ph,3,Male,';
}
