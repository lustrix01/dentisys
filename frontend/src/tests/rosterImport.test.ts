import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSVText, parsePDFRosterPages, validateRosterStudents, type RosterPDFPage } from '../utils/rosterImportHelper.ts';

const domains = ['bicol-u.edu.ph', 'example.edu'];

test('structured CSV preserves complete identifiers, Unicode names, contact and individual years', () => {
  const rows = validateRosterStudents(parseCSVText('\uFEFFStudent No.,Last Name,First Name,Middle Name,Email,Gender,Year Level,Contact #,Unrelated\r\n2099-1234-56789,Peña,José,Reyes,actual@example.edu,Male,3rd Year,001234,ignored\r\n2099-01-12345,Dela Cruz,Ana,,other@bicol-u.edu.ph,Female,2,009876,ignored'), domains);
  assert.deepEqual(rows.map(row => row.studentId), ['2099-1234-56789', '2099-01-12345']);
  assert.equal(rows[0].lastName, 'Peña');
  assert.equal(rows[0].firstName, 'José');
  assert.equal(rows[0].contact, '001234');
  assert.deepEqual(rows.map(row => row.yearLevel), [3, 2]);
  assert.deepEqual(rows.map(row => row.sex), ['M', 'F']);
  assert.ok(rows.every(row => row.status === 'valid' && row.included));
  assert.equal(rows[0].email, 'actual@example.edu');
});

test('quoted full names and multiline fields stay intact and need explicit name review', () => {
  const rows = parseCSVText('Student ID,Name,Email\n2099-1234-56789,"Dela Cruz, Ana\nMaria Reyes",actual@example.edu');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lastName, 'Dela Cruz');
  assert.equal(rows[0].firstName, 'Ana Maria Reyes');
  assert.equal(rows[0].middleName, '');
  assert.equal(rows[0].included, false);
  assert.equal(validateRosterStudents(rows, domains)[0].status, 'warning');
  assert.throws(() => parseCSVText('Student ID,Name\n2099,"unfinished'), /Unclosed/);
});

test('TSV, semicolon and headerless full-name inputs retain preview support', () => {
  for (const delimiter of ['\t', ';']) {
    const row = parseCSVText(['Student ID', 'First Name', 'Last Name', 'Email'].join(delimiter) + '\n' + ['2099-1234-56789', 'Ana', 'Reyes', 'ana@example.edu'].join(delimiter))[0];
    assert.equal(row.studentId, '2099-1234-56789');
    assert.equal(row.included, true);
    for (const blankPrefix of ['\n \t \r\n', '""\r\n', delimiter.repeat(2) + '\n']) {
      const text = blankPrefix + ['Student ID', 'First Name', 'Last Name', 'Email'].join(delimiter) + '\n' + ['2099-1234-56789', 'Ana', 'Reyes', 'ana@example.edu'].join(delimiter);
      assert.equal(parseCSVText(text)[0].studentId, row.studentId);
      assert.equal(validateRosterStudents(parseCSVText(text), domains)[0].status, 'valid');
    }
  }
  assert.equal(parseCSVText('2099-1234-56789,"Reyes, Ana",actual@example.edu')[0].included, false);
  const positional = parseCSVText('2099-1234-56789,Reyes,Ana,M,actual@example.edu,3')[0];
  assert.equal(positional.firstName, 'Ana');
  assert.equal(positional.lastName, 'Reyes');
  assert.equal(positional.middleName, 'M');
  assert.equal(positional.included, false);
});

test('missing optional values stay absent; malformed and duplicate rows are blocked', () => {
  const absent = validateRosterStudents(parseCSVText('Student ID,First Name,Last Name\n2099-1234-56789,Ana,Reyes'), domains)[0];
  assert.equal(absent.email, '');
  assert.equal(absent.yearLevel, null);
  assert.equal(absent.status, 'error');
  assert.match(absent.validationMessage!, /Institutional email is required/);
  const withEmail = validateRosterStudents([{ ...absent, email: 'ana@example.edu' }], domains)[0];
  assert.equal(withEmail.status, 'valid');
  assert.equal(withEmail.yearLevel, null);
  assert.equal(withEmail.contact, undefined);
  const duplicate = validateRosterStudents(parseCSVText('Student ID,First Name,Last Name,Email,Year Level\nABC-123,Ana,Reyes,wrong@outside.edu,4foo\nabc-123,Bea,Santos,,4'), domains);
  assert.ok(duplicate.every(row => row.status === 'error'));
  assert.match(duplicate[0].validationMessage!, /Duplicate.*domain.*Year/);
});

test('institutional email headers are parsed and blank or invalid email blocks import', () => {
  for (const header of ['Institutional Email', 'Institutional Email Address', 'BU E-mail', 'Student Email']) {
    const rows = validateRosterStudents(parseCSVText(`Student ID,First Name,Last Name,${header}\nABC-123,Ana,Reyes,ANA@EXAMPLE.EDU`), domains);
    assert.equal(rows[0].email, 'ana@example.edu');
    assert.equal(rows[0].status, 'valid');
  }
  const row = parseCSVText('Student ID,First Name,Last Name,Email\nABC-123,Ana,Reyes,ana@example.edu')[0];
  for (const email of ['', '   ', 'ana', 'ana@outside.edu']) {
    assert.equal(validateRosterStudents([{ ...row, email }], domains)[0].status, 'error');
  }
});

function samplePage(page: number): RosterPDFPage {
  const item = (text: string, x: number, y: number, width = 20) => ({ text, x, y, width, height: 9 });
  return {
    page, width: 595, height: 842, redMarkBands: page === 1 ? [{ top: 121, bottom: 123 }] : [],
    items: [
      item('#', 31, 100, 5), item('Student No.', 60, 100, 40), item('Name', 178, 100, 22),
      item('Gender', 272, 100, 24), item('Year Level', 305, 100, 31), item('Contact #', 350, 100, 38),
      item('1', 31, 123), item(page === 1 ? '2099-1234-56789' : '2099-01-12345', 43, 123, 64),
      item('Peña, José Miguel Reyes', 111, 116, 140), item('actual@example.edu', 111, 126, 110),
      item('Male', 270, 123), item('3rd Year', 303, 123), item('00123456789', 343, 123, 48),
    ],
  };
}

test('multi-page PDF geometry separates identity/email and flags marks without importing them', () => {
  const rows = validateRosterStudents(parsePDFRosterPages([samplePage(1), samplePage(2)]), domains);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.studentId), ['2099-1234-56789', '2099-01-12345']);
  assert.equal(rows[0].originalName, 'Peña, José Miguel Reyes');
  assert.equal(rows[0].firstName, 'José Miguel Reyes');
  assert.equal(rows[0].email, 'actual@example.edu');
  assert.equal(rows[0].contact, '00123456789');
  assert.equal(rows[0].yearLevel, 3);
  assert.equal(rows[0].sex, 'M');
  assert.equal(rows[0].possibleCrossedOut, true);
  assert.equal(rows[1].possibleCrossedOut, false);
  assert.ok(rows.every(row => !row.included && !row.reviewed));
  assert.equal(validateRosterStudents([{ ...rows[0], reviewed: true, included: true }], domains)[0].status, 'valid');
});

test('PDF without an institutional email stays blank and is blocked until corrected', () => {
  const page = samplePage(1);
  const rows = validateRosterStudents(parsePDFRosterPages([{ ...page, items: page.items.filter(item => item.text !== 'actual@example.edu') }]), domains);
  assert.equal(rows[0].email, '');
  assert.equal(rows[0].status, 'error');
  assert.match(rows[0].validationMessage!, /Institutional email is required/);
  assert.equal(rows[0].included, false);
  assert.equal(validateRosterStudents([{ ...rows[0], email: 'actual@example.edu', reviewed: true, included: true }], domains)[0].status, 'valid');
});

test('database field limits block unsupported values without truncating the source', () => {
  const row = parseCSVText('Student ID,First Name,Last Name,Email\nABC-123,Ana,Reyes,ana@example.edu')[0];
  const oversized = { ...row, studentId: 'A'.repeat(51), contact: '1'.repeat(51), email: 'a'.repeat(250) + '@example.edu', sex: 'Unspecified' };
  const validated = validateRosterStudents([oversized], domains)[0];
  assert.equal(validated.status, 'error');
  assert.match(validated.validationMessage!, /Student number.*50.*Contact.*50.*Gender.*Email.*254/);
  assert.equal(validated.studentId, oversized.studentId);
  assert.equal(validated.contact, oversized.contact);
  assert.equal(validateRosterStudents([{ ...row, sex: ' male ' }], domains)[0].sex, 'M');
  assert.equal(validateRosterStudents([{ ...row, sex: '' }], domains)[0].sex, '');
});

test('preview applies server name-byte limits without truncating names', () => {
  const row = parseCSVText('Student ID,First Name,Last Name,Email\nABC-123,Ana,Reyes,ana@example.edu')[0];
  for (const field of ['firstName', 'middleName', 'lastName', 'prefix', 'suffix'] as const) {
    const max = field === 'prefix' || field === 'suffix' ? 50 : 100;
    const value = 'Ñ'.repeat(max / 2);
    assert.equal(validateRosterStudents([{ ...row, [field]: value }], domains)[0].status, 'valid');
    const invalid = validateRosterStudents([{ ...row, [field]: value + 'a' }], domains)[0];
    assert.equal(invalid.status, 'error');
    assert.match(invalid.validationMessage!, new RegExp(`${max} UTF-8 bytes`));
    assert.equal(invalid[field], value + 'a');
  }
  assert.equal(validateRosterStudents([{ ...row, firstName: 'Ana' + ' '.repeat(150) + 'Maria' }], domains)[0].status, 'valid');
  assert.equal(validateRosterStudents([{ ...row, firstName: 'A'.repeat(97) + ' jr' }], domains)[0].status, 'error');
  assert.equal(validateRosterStudents([{ ...row, firstName: 'A'.repeat(96) + ' jr.' }], domains)[0].status, 'valid');
});

test('unsupported PDF layouts fail instead of guessing student fields', () => {
  assert.throws(() => parsePDFRosterPages([{ page: 1, width: 595, height: 842, items: [], redMarkBands: [] }]), /unsupported PDF table layout/);
});

test('PDF rows follow visual coordinates even when stream objects are reversed', () => {
  const page = samplePage(1);
  page.redMarkBands = [];
  const secondRow = samplePage(2).items.filter(item => item.y > 100).map(item => ({ ...item, y: item.y + 26 }));
  const ordered = parsePDFRosterPages([{ ...page, items: [...page.items, ...secondRow] }]);
  const reversed = parsePDFRosterPages([{ ...page, items: [...page.items, ...secondRow].reverse() }]);
  assert.equal(ordered.length, 2);
  assert.deepEqual(reversed, ordered);
  assert.deepEqual(reversed.map(row => row.studentId), ['2099-1234-56789', '2099-01-12345']);
});

test('PDF student-number fragments form one complete row without inserted spaces', () => {
  const page = samplePage(1);
  page.items = page.items.flatMap(item => item.text === '2099-1234-56789'
    ? [{ ...item, text: '2099-', width: 23 }, { ...item, text: '1234-', x: item.x + 23, width: 23 }, { ...item, text: '56789', x: item.x + 46, width: 18 }]
    : item.text === 'actual@example.edu'
      ? [{ ...item, text: 'actual@', width: 30 }, { ...item, text: 'example.edu', x: item.x + 30, width: 80 }]
      : item.text === '00123456789'
        ? [{ ...item, text: '001234', width: 26 }, { ...item, text: '56789', x: item.x + 26, width: 22 }]
    : [item]);
  const rows = parsePDFRosterPages([{ ...page, items: page.items.reverse() }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentId, '2099-1234-56789');
  assert.equal(rows[0].email, 'actual@example.edu');
  assert.equal(rows[0].contact, '00123456789');
  assert.equal(rows[0].possibleCrossedOut, true);
  const spaced = page.items.map(item => item.text === '56789' && item.x > 300 ? { ...item, x: item.x + 6 } : item);
  assert.equal(parsePDFRosterPages([{ ...page, items: spaced }])[0].contact, '001234 56789');
});
