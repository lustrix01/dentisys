/**
 * Roster Import Helper
 * Parses CSV, TSV, text, and PDF registrar roster exports for student enrollment.
 */

export interface ParsedRosterStudent {
  tempKey: string;
  studentId: string;
  prefix?: string;
  suffix?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  yearLevel: number;
  sex?: string;
  status: 'valid' | 'warning' | 'error';
  validationMessage?: string;
  isExistingInDirectory?: boolean;
}

/**
 * Normalizes full name into split names (First, Middle, Last, Suffix)
 * Handles "LASTNAME, FIRSTNAME MIDDLE" or "FIRSTNAME MIDDLE LASTNAME"
 */
export function splitFullName(rawName: string): {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix?: string;
} {
  const cleaned = rawName.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return { firstName: '', middleName: '', lastName: '' };
  }

  // Common suffixes
  const suffixes = ['JR', 'JR.', 'SR', 'SR.', 'II', 'III', 'IV', 'V'];
  let detectedSuffix = '';

  // Format 1: "Dela Cruz, Juan Pedro M." or "Santos, Maria Clara Jr."
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map(p => p.trim());
    const lastNamePart = parts[0] || '';
    let rest = parts.slice(1).join(' ').trim();

    // Check for suffix in rest or lastName
    for (const suf of suffixes) {
      const regex = new RegExp(`\\b${suf}\\b`, 'i');
      if (regex.test(rest)) {
        detectedSuffix = suf.replace('.', '');
        rest = rest.replace(regex, '').trim().replace(/\s+/g, ' ');
      }
    }

    const restWords = rest.split(' ').filter(Boolean);
    let firstName = '';
    let middleName = '';

    if (restWords.length === 1) {
      firstName = restWords[0];
    } else if (restWords.length > 1) {
      const lastToken = restWords[restWords.length - 1];
      // If last token is 1-2 chars or has a dot (e.g. "M." or "M"), treat as middle name/initial
      if (lastToken.length <= 2 || lastToken.endsWith('.')) {
        middleName = lastToken.replace('.', '');
        firstName = restWords.slice(0, -1).join(' ');
      } else {
        firstName = restWords.join(' ');
      }
    }

    return {
      lastName: lastNamePart,
      firstName,
      middleName,
      suffix: detectedSuffix || undefined,
    };
  }

  // Format 2: "Juan Pedro M. Dela Cruz"
  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens.length === 1) {
    return { firstName: tokens[0], middleName: '', lastName: '' };
  }

  // Check if last token is a suffix
  if (suffixes.map(s => s.toLowerCase()).includes(tokens[tokens.length - 1].toLowerCase())) {
    detectedSuffix = tokens.pop()!.replace('.', '');
  }

  if (tokens.length === 2) {
    return {
      firstName: tokens[0],
      middleName: '',
      lastName: tokens[1],
      suffix: detectedSuffix || undefined,
    };
  }

  // If 3 or more tokens, check if middle token is middle initial (e.g., "M.")
  const middleCandidate = tokens[tokens.length - 2];
  if (middleCandidate.length <= 2 || middleCandidate.endsWith('.')) {
    return {
      firstName: tokens.slice(0, tokens.length - 2).join(' '),
      middleName: middleCandidate.replace('.', ''),
      lastName: tokens[tokens.length - 1],
      suffix: detectedSuffix || undefined,
    };
  }

  return {
    firstName: tokens.slice(0, -1).join(' '),
    middleName: '',
    lastName: tokens[tokens.length - 1],
    suffix: detectedSuffix || undefined,
  };
}

/**
 * Generate default institutional email if missing
 */
export function generateInstitutionalEmail(studentId: string, firstName: string, lastName: string): string {
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanFirst && cleanLast) {
    return `${cleanFirst}.${cleanLast}@bicol-u.edu.ph`;
  }
  const cleanId = studentId.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanId || 'student'}@bicol-u.edu.ph`;
}

/**
 * Parse CSV or TSV string into student records
 */
export function parseCSVText(
  text: string,
  existingStudentIds: Set<string> = new Set()
): ParsedRosterStudent[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return [];

  // Detect delimiter
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter = tabCount > commaCount && tabCount > semiCount ? '\t' : (semiCount > commaCount ? ';' : ',');

  const splitLine = (line: string): string[] => {
    // Regex for CSV with quoted strings
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(s => s.replace(/^"|"$/g, '').trim());
  };

  const headerTokens = splitLine(firstLine).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  let hasHeader = false;
  let idCol = -1;
  let nameCol = -1;
  let firstCol = -1;
  let lastCol = -1;
  let middleCol = -1;
  let emailCol = -1;
  let yearCol = -1;
  let sexCol = -1;

  headerTokens.forEach((tok, idx) => {
    if (tok.includes('id') || tok.includes('number') || tok.includes('studentno')) {
      idCol = idx;
      hasHeader = true;
    } else if (tok.includes('first')) {
      firstCol = idx;
      hasHeader = true;
    } else if (tok.includes('last') || tok.includes('surname')) {
      lastCol = idx;
      hasHeader = true;
    } else if (tok.includes('middle')) {
      middleCol = idx;
      hasHeader = true;
    } else if (tok.includes('name') && firstCol === -1 && lastCol === -1) {
      nameCol = idx;
      hasHeader = true;
    } else if (tok.includes('email') || tok.includes('mail')) {
      emailCol = idx;
      hasHeader = true;
    } else if (tok.includes('year') || tok.includes('level')) {
      yearCol = idx;
      hasHeader = true;
    } else if (tok.includes('sex') || tok.includes('gender')) {
      sexCol = idx;
      hasHeader = true;
    }
  });

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const results: ParsedRosterStudent[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const rawTokens = splitLine(dataLines[i]);
    if (rawTokens.length < 2) continue;

    let studentId = '';
    let firstName = '';
    let middleName = '';
    let lastName = '';
    let suffix = '';
    let email = '';
    let yearLevel = 4;
    let sex = '';

    if (hasHeader) {
      studentId = idCol >= 0 ? rawTokens[idCol] || '' : '';
      email = emailCol >= 0 ? rawTokens[emailCol] || '' : '';
      if (yearCol >= 0) {
        const parsedYear = parseInt(rawTokens[yearCol] || '4', 10);
        if (!isNaN(parsedYear) && parsedYear >= 1 && parsedYear <= 6) {
          yearLevel = parsedYear;
        }
      }
      sex = sexCol >= 0 ? rawTokens[sexCol] || '' : '';

      if (firstCol >= 0 && lastCol >= 0) {
        firstName = rawTokens[firstCol] || '';
        lastName = rawTokens[lastCol] || '';
        middleName = middleCol >= 0 ? rawTokens[middleCol] || '' : '';
      } else if (nameCol >= 0) {
        const splitted = splitFullName(rawTokens[nameCol] || '');
        firstName = splitted.firstName;
        middleName = splitted.middleName;
        lastName = splitted.lastName;
        suffix = splitted.suffix || '';
      }
    } else {
      // Guess columns without headers:
      // Typically: [Student ID, Last, First, Middle, Email, Year] or [Student ID, Full Name, Email]
      for (const token of rawTokens) {
        if (!studentId && /^\d{4}[-\s]?\d{4,6}$/.test(token)) {
          studentId = token;
        } else if (!email && token.includes('@')) {
          email = token;
        } else if (/^[1-4]$/.test(token)) {
          yearLevel = parseInt(token, 10);
        } else if (!lastName && !firstName) {
          if (token.includes(',')) {
            const splitted = splitFullName(token);
            firstName = splitted.firstName;
            middleName = splitted.middleName;
            lastName = splitted.lastName;
          } else {
            lastName = token;
          }
        } else if (lastName && !firstName) {
          firstName = token;
        } else if (lastName && firstName && !middleName) {
          middleName = token;
        }
      }
    }

    if (!studentId && rawTokens[0]) {
      studentId = rawTokens[0];
    }
    if (!lastName && rawTokens[1]) {
      const splitted = splitFullName(rawTokens[1]);
      firstName = splitted.firstName || 'Student';
      lastName = splitted.lastName || rawTokens[1];
    }

    studentId = studentId.trim();
    firstName = firstName.trim();
    lastName = lastName.trim();

    if (!email) {
      email = generateInstitutionalEmail(studentId, firstName, lastName);
    } else if (!email.includes('@')) {
      email = `${email.trim()}@bicol-u.edu.ph`;
    }

    let status: 'valid' | 'warning' | 'error' = 'valid';
    let validationMessage = '';

    if (!studentId) {
      status = 'error';
      validationMessage = 'Missing student number.';
    } else if (!firstName || !lastName) {
      status = 'error';
      validationMessage = 'First and last name are required.';
    } else if (!email.includes('@')) {
      status = 'warning';
      validationMessage = 'Invalid institutional email format.';
    }

    const isExisting = existingStudentIds.has(studentId);

    results.push({
      tempKey: `row-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId,
      prefix: undefined,
      suffix: suffix || undefined,
      firstName,
      middleName: middleName || undefined,
      lastName,
      email: email.toLowerCase(),
      yearLevel,
      sex: sex || undefined,
      status,
      validationMessage,
      isExistingInDirectory: isExisting,
    });
  }

  return results;
}

/**
 * Attempts to decompress flate stream bytes from PDF
 */
async function decompressFlateBytes(bytes: Uint8Array): Promise<string> {
  const DS = (globalThis as any).DecompressionStream;
  if (DS) {
    // Attempt standard deflate
    try {
      const stream = new Response(bytes as any).body?.pipeThrough(new DS('deflate'));
      if (stream) {
        const decompressed = await new Response(stream).arrayBuffer();
        return new TextDecoder('utf-8', { fatal: false }).decode(decompressed);
      }
    } catch {
      // Try raw deflate by slicing zlib 2-byte header and 4-byte checksum
      try {
        if (bytes.length > 6) {
          const raw = bytes.slice(2, bytes.length - 4);
          const stream = new Response(raw as any).body?.pipeThrough(new DS('deflate-raw'));
          if (stream) {
            const decompressed = await new Response(stream).arrayBuffer();
            return new TextDecoder('utf-8', { fatal: false }).decode(decompressed);
          }
        }
      } catch {
        // Fallback
      }
    }
  }
  return new TextDecoder('latin1').decode(bytes);
}

/**
 * Extracts raw textual lines from PDF ArrayBuffer
 */
export async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string[]> {
  const uint8 = new Uint8Array(buffer);
  const rawText = new TextDecoder('latin1').decode(uint8);
  const extractedLines: string[] = [];

  // Match streams in the PDF
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(rawText)) !== null) {
    const streamContent = match[1];
    const streamStartIndex = match.index + match[0].indexOf(streamContent);
    const streamBytes = uint8.slice(streamStartIndex, streamStartIndex + streamContent.length);

    let decoded = '';
    // If stream looks compressed or has non-ascii
    if (match[0].includes('/FlateDecode') || rawText.slice(Math.max(0, match.index - 150), match.index).includes('/FlateDecode')) {
      decoded = await decompressFlateBytes(streamBytes);
    } else {
      decoded = streamContent;
    }

    // Extract text operators in PDF: (string) Tj or [(arr)] TJ
    const tjRegex = /\((.*?)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    let currentLineTokens: string[] = [];

    while ((tjMatch = tjRegex.exec(decoded)) !== null) {
      const cleanStr = tjMatch[1]
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ')
        .trim();
      if (cleanStr) currentLineTokens.push(cleanStr);
    }

    // Match array-based TJ operators: [ (str) 10 (str2) ] TJ
    const arrayTjRegex = /\[(.*?)\]\s*TJ/g;
    let arrMatch: RegExpExecArray | null;
    while ((arrMatch = arrayTjRegex.exec(decoded)) !== null) {
      const inner = arrMatch[1];
      const strParts = inner.match(/\((.*?)\)/g);
      if (strParts) {
        const combined = strParts
          .map(p => p.slice(1, -1).replace(/\\([()\\])/g, '$1'))
          .join('')
          .trim();
        if (combined) currentLineTokens.push(combined);
      }
    }

    if (currentLineTokens.length > 0) {
      extractedLines.push(currentLineTokens.join(' '));
    } else {
      // Also look for plain text lines if uncompressed
      const lines = decoded.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        if (/^\d{4}[-\s]?\d{4,6}/.test(line) || line.includes('@bicol-u.edu.ph')) {
          extractedLines.push(line);
        }
      }
    }
  }

  // If no streams matched (some PDF generators store uncompressed text blocks)
  if (extractedLines.length === 0) {
    const fallbackLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const l of fallbackLines) {
      if (/\b\d{4}[-\s]?\d{4,6}\b/.test(l)) {
        extractedLines.push(l);
      }
    }
  }

  return extractedLines;
}

/**
 * Parses lines extracted from a registrar PDF into student records
 */
export function parsePDFRosterLines(
  lines: string[],
  existingStudentIds: Set<string> = new Set()
): ParsedRosterStudent[] {
  const results: ParsedRosterStudent[] = [];
  const studentIdRegex = /\b(\d{4}[-\s]?\d{4,6})\b/;
  const emailRegex = /\b([A-Za-z0-9._%+-]+@bicol-u\.edu\.ph)\b/i;

  lines.forEach((line, idx) => {
    const idMatch = line.match(studentIdRegex);
    if (!idMatch) return;

    const studentId = idMatch[1].replace(/\s+/g, '-').trim();
    let remaining = line.replace(idMatch[0], '').trim();

    // Check for email
    let email = '';
    const emailMatch = remaining.match(emailRegex);
    if (emailMatch) {
      email = emailMatch[1].toLowerCase();
      remaining = remaining.replace(emailMatch[0], '').trim();
    }

    // Check for year level (1 to 4)
    let yearLevel = 4;
    const yearMatch = remaining.match(/\b([1-4])\b/);
    if (yearMatch) {
      yearLevel = parseInt(yearMatch[1], 10);
      remaining = remaining.replace(yearMatch[0], '').trim();
    }

    // Remaining text is student name (e.g. "Dela Cruz, Juan M." or "SANTOS, MARIA CLARA")
    const cleanName = remaining.replace(/[^A-Za-z,\s.-]/g, '').trim();
    const splitted = splitFullName(cleanName);

    const firstName = splitted.firstName || 'Student';
    const lastName = splitted.lastName || (cleanName || 'Registrar-Record');
    const middleName = splitted.middleName;
    const suffix = splitted.suffix;

    if (!email) {
      email = generateInstitutionalEmail(studentId, firstName, lastName);
    }

    const isExisting = existingStudentIds.has(studentId);

    results.push({
      tempKey: `pdf-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId,
      prefix: undefined,
      suffix: suffix || undefined,
      firstName,
      middleName: middleName || undefined,
      lastName,
      email,
      yearLevel,
      status: 'valid',
      isExistingInDirectory: isExisting,
    });
  });

  return results;
}

/**
 * Generates sample CSV template content for professors
 */
export function getSampleRegistrarCSV(): string {
  return `Student ID,Last Name,First Name,Middle Name,Email,Year Level
2021-00123,Santos,Maria,Clara,maria.santos@bicol-u.edu.ph,4
2021-00124,Dela Cruz,Juan Pedro,M,juan.delacruz@bicol-u.edu.ph,4
2021-00125,Reyes,Jose,P,jose.reyes@bicol-u.edu.ph,4
2021-00126,Aquino,Benigno,S,benigno.aquino@bicol-u.edu.ph,4`;
}
