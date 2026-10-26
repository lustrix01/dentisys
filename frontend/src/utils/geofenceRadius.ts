export const RADIUS_RANGE_ERROR = 'Allowed radius must be between 50 and 2000 meters.';
// Keep the typed text, dropping leading zeros ("01000" -> "1000"; a lone "0" stays).
export const cleanRadiusText = (raw: string): string => raw.replace(/^0+(?=\d)/, '');
// The saved number, or null when empty / not a whole number / outside 50-2000.
export const parseRadius = (text: string): number | null => {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= 50 && n <= 2000 ? n : null;
};
