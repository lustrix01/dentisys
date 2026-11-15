/** Calendar dates are parsed as parts and read in UTC, never as local timestamps. */
export function formatSessionDate(value?: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return value;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${weekdays[date.getUTCDay()]}, ${months[month - 1]} ${day}, ${year}`;
}

/** Short-month calendar date for tables ("Nov 15, 2026"); anything that is not YYYY-MM-DD is returned as is. */
export const formatShortDate = (value?: string): string => formatSessionDate(value).replace(/^\w{3}, (?=\w{3} \d)/, '');
