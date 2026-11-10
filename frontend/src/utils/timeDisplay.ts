/** Format a stored clock value or timestamp for people in the application's Manila time zone. */
export const formatVisibleTime = (value?: string | null): string => {
  if (!value) return '—';

  const clockMatch = value.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(AM|PM)?\s*$/i);
  if (clockMatch) {
    let hour = Number(clockMatch[1]);
    const minute = clockMatch[2];
    const meridiem = clockMatch[3]?.toUpperCase();
    if (meridiem) {
      if (hour < 1 || hour > 12) return value;
      hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
    } else if (hour < 0 || hour > 23) {
      return value;
    }
    return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).format(date);
};
