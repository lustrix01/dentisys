export interface InvalidScoreEntry {
  key: string; // matches the input's data-score-key
  name: string;
  value: string;
  max: number;
}

const describe = ({ name, value, max }: InvalidScoreEntry): string =>
  `${name} ${value} (${parseFloat(value) < 0 ? 'cannot be negative' : `max ${max}`})`;

export function invalidScoresMessage(entries: InvalidScoreEntry[]): string {
  const shown = entries.slice(0, 3).map(describe).join(', ');
  const more = entries.length > 3 ? `, …and ${entries.length - 3} more` : '';
  return `${entries.length} ${entries.length === 1 ? 'score needs' : 'scores need'} fixing: ${shown}${more}.`;
}

// Scrolls the first invalid score box to the middle of the screen and focuses it.
export function focusInvalidScore(key: string): void {
  if (typeof document === 'undefined') return;
  const input = document.querySelector<HTMLInputElement>(`[data-score-key="${key}"]`);
  input?.scrollIntoView({ block: 'center' });
  input?.focus();
}
