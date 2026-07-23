const LOWERCASE_PARTICLES = new Set([
  'da',
  'de',
  'del',
  'di',
  'dos',
  'du',
  'la',
  'las',
  'le',
  'los',
  'van',
  'von',
  'y',
]);

const SUFFIXES: Record<string, string> = {
  jr: 'Jr.',
  'jr.': 'Jr.',
  sr: 'Sr.',
  'sr.': 'Sr.',
  ii: 'II',
  iii: 'III',
  iv: 'IV',
  v: 'V',
};

const capitalizeSegment = (segment: string): string => {
  if (!segment) return segment;
  const lower = segment.toLocaleLowerCase('en-PH');
  const chars = Array.from(lower);
  let normalized = chars[0].toLocaleUpperCase('en-PH') + chars.slice(1).join('');

  if (/^mc\p{L}/u.test(lower)) {
    const mcChars = Array.from(lower);
    normalized = `Mc${mcChars[2].toLocaleUpperCase('en-PH')}${mcChars.slice(3).join('')}`;
  }

  return normalized;
};

const capitalizeCompound = (word: string): string =>
  word
    .split(/([-'’])/u)
    .map((part) => (/^[-'’]$/u.test(part) ? part : capitalizeSegment(part)))
    .join('');

/**
 * Canonicalizes a person's name without changing non-name fields.
 * The backend repeats this operation before persistence and remains authoritative.
 */
export const normalizePersonName = (value: string): string => {
  const collapsed = value.trim().replace(/\s+/gu, ' ');
  if (!collapsed) return '';

  const words = collapsed.split(' ');
  return words
    .map((word, index) => {
      const suffix = SUFFIXES[word.toLocaleLowerCase('en-PH')];
      if (suffix) return suffix;

      const lower = word.toLocaleLowerCase('en-PH');
      if (index > 0 && LOWERCASE_PARTICLES.has(lower)) return lower;

      return capitalizeCompound(word);
    })
    .join(' ');
};

export const normalizeOptionalPersonName = (value: string): string =>
  value.trim() ? normalizePersonName(value) : '';
