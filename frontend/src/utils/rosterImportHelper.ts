import { personNameFieldError } from './personNameValidation.ts';

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

/** Keep ambiguous given names together for explicit preview reconciliation. */
export function splitFullName(rawName: string) {
  const cleaned = rawName.normalize('NFC').trim().replace(/\s+/g, ' ');
  const comma = cleaned.indexOf(',');
  return comma < 0
    ? { firstName: cleaned, middleName: '', lastName: '' }
    : { firstName: cleaned.slice(comma + 1).trim(), middleName: '', lastName: cleaned.slice(0, comma).trim() };
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
  return trimmed;
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
    if ((row.contact?.trim().length ?? 0) > 50) errors.push('Contact must contain at most 50 characters.');
    const sex = normalizeRosterSex(row.sex ?? '');
    if (sex.length > 1) errors.push('Gender must be Male, Female, a one-character code, or blank. Review the source value.');
    if ((counts.get(row.studentId.trim().toLowerCase()) ?? 0) > 1) errors.push('Duplicate student number in this file.');
    for (const key of ['prefix', 'firstName', 'middleName', 'lastName', 'suffix'] as const) {
      const raw = row[key] ?? '';
      const error = personNameFieldError(key, raw);
      if (error) errors.push(error);
      const affix = key === 'prefix' || key === 'suffix';
      const normalized = affix ? raw.trim() : raw.trim().replace(/\s+/g, ' ').replace(/(^| )(jr|sr)\.?(?= |$)/gi, '$1$2.');
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
    return { ...row, sex, status: errors.length ? 'error' : needsReview ? 'warning' : 'valid', validationMessage: errors.length ? errors.join(' ') : needsReview ? 'Review the source and name fields before selecting this row.' : undefined };
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
      prefix: get('prefix') || undefined, suffix: get('suffix') || undefined,
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

/** Read the provisional sample table by geometry, never by student-ID regex. */
export function parsePDFRosterPages(pages: RosterPDFPage[]): ParsedRosterStudent[] {
  const students: ParsedRosterStudent[] = [];
  for (const page of pages) {
    const lines: Array<{ y: number; items: RosterPDFTextItem[] }> = [];
    for (const item of [...page.items].sort((a, b) => a.y - b.y || a.x - b.x)) {
      let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= 3);
      if (!line) { line = { y: item.y, items: [] }; lines.push(line); }
      line.items.push(item);
    }
    const header = lines.find(line => {
      const text = line.items.map(item => item.text).join(' ');
      return /Student\s*(?:No\.?|Number|ID)/i.test(text) && /Name/i.test(text) && /Year\s*Level/i.test(text);
    });
    if (!header) throw new Error(`Page ${page.page}: unsupported PDF table layout. Use the provisional CSV template instead.`);
    const labels = ['#', 'Student No.', 'Name', 'Gender', 'Year Level', 'Contact #'];
    const headerItems = header.items.filter(item => item.text.trim());
    const headers = labels.map(label => {
      const item = headerItems.find(entry => entry.text.trim().toLowerCase() === label.toLowerCase());
      if (!item) throw new Error(`Page ${page.page}: expected ${label} table header.`);
      return item;
    });
    // Headers are centered in unequal-width cells. Use left text positions,
    // rather than text centers (long names extend into the name column).
    const boundaries = headers.slice(0, -1).map(item => item.x + item.width + 1);
    const column = (item: RosterPDFTextItem) => { const idx = boundaries.findIndex(boundary => item.x < boundary); return idx < 0 ? 5 : idx; };
    const below = page.items.filter(item => item.y > header.y + 3);
    // A single visible identifier can arrive as several PDF.js text items.
    // Join its same-line fragments before deriving one row anchor.
    const numberLines: Array<{ y: number; items: RosterPDFTextItem[] }> = [];
    for (const item of below.filter(item => column(item) === 1 && item.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
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
      const cell = (col: number) => {
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
      const nameCell = cell(2);
      const email = nameCell.match(/[^\s@]+@[^\s@]+\.[^\s@]+/u)?.[0] ?? '';
      const originalName = nameCell.replace(email, '').trim();
      const possibleCrossedOut = page.redMarkBands.some(band => band.bottom >= top - 8 && band.top < bottom - 8);
      students.push({
        tempKey: `pdf-${page.page}-${i}`, studentId: anchor.studentId, ...splitFullName(originalName),
        email: email.toLowerCase(), contact: cell(5) || undefined, sex: cell(3) || undefined,
        yearLevel: parseRosterYear(cell(4)), originalName, sourcePage: page.page, sourceRow: cell(0),
        possibleCrossedOut, requiresNameReview: true, reviewed: false, included: false, status: 'warning',
      });
    }
  }
  return students;
}

export function getSampleRegistrarCSV(): string {
  return 'Student ID,Last Name,First Name,Middle Name,Email,Year Level,Gender,Contact #\n2099-1234-56789,Dela Cruz,Ana,Reyes,ana.fixture@bicol-u.edu.ph,4,Female,\n2099-01-12345,Peña,José,,jose.fixture@bicol-u.edu.ph,3,Male,';
}
