// Same rules as the server (backend/app/validation.php).
const NAME_PATTERN = /^[\p{L}\s'’\-.]+$/u;
const AFFIX_PATTERN = /^(?=.*\p{L})[\p{L}\s.,'’\-]+$/u;

export type PersonNamePartKey = 'prefix' | 'firstName' | 'middleName' | 'lastName' | 'suffix';

/** Input filtering follows the same character set as validation, without
 * rejecting unfinished names while a user is still typing. */
export function filterPersonNameInput(key: PersonNamePartKey, value: string, isComposing = false): string {
  if (isComposing) return value;
  const pattern = key === 'prefix' || key === 'suffix'
    ? /[^\p{L}\p{M}\s.,'’\-]/gu
    : /[^\p{L}\p{M}\s'’\-.]/gu;
  return value.normalize('NFC').replace(pattern, '');
}

export function preventInvalidPersonNameKey(key: PersonNamePartKey, event: {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean;
  nativeEvent: { isComposing: boolean }; preventDefault(): void;
}): void {
  if (!event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey
    && event.key.length === 1 && filterPersonNameInput(key, event.key) === '') event.preventDefault();
}

/** Error message for one name part, or null when it is valid. */
export function personNameFieldError(key: PersonNamePartKey, rawValue: string): string | null {
  const value = rawValue.trim();
  if (key === 'prefix' || key === 'suffix') {
    if (value === '') return null;
    return AFFIX_PATTERN.test(value)
      ? null
      : `${key === 'prefix' ? 'Prefix' : 'Suffix'} can only contain letters, periods, commas, apostrophes, and hyphens.`;
  }
  const label = key === 'firstName' ? 'First name' : key === 'lastName' ? 'Last name' : 'Middle name';
  if (value === '') return key === 'middleName' ? null : `${label} is required.`;
  if (!NAME_PATTERN.test(value)) return `${label} can only contain letters, spaces, hyphens, apostrophes, and periods.`;
  // A middle name may be a single initial ("M" or "M.").
  if (key !== 'middleName' && value.length < 2) return `${label} must be at least 2 characters.`;
  return null;
}

/** True when every part of the name passes personNameFieldError. */
export const isPersonNameValid = (parts: Record<PersonNamePartKey, string>) =>
  (Object.keys(parts) as PersonNamePartKey[]).every(key => personNameFieldError(key, parts[key]) === null);
