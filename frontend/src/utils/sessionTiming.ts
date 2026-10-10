export type SessionTiming = { openingTime: string; presentCutoff: string; lateCutoff: string; classEndTime: string };
export type TimingField = keyof SessionTiming;
const fields: TimingField[] = ['openingTime', 'presentCutoff', 'lateCutoff', 'classEndTime'];
export const timeMinutes = (time: string): number => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
export const minutesTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Opening moves the whole window; later times only push cutoffs that need it. */
export function changeSessionTime(timing: SessionTiming, field: TimingField, time: string): { timing: SessionTiming; error?: string } {
  const values = fields.map(key => timeMinutes(timing[key]));
  const next = timeMinutes(time);
  if (!Number.isFinite(next) || values.some(value => !Number.isFinite(value))) return { timing, error: 'Enter valid times.' };
  const index = fields.indexOf(field);
  if (index === 0) {
    const delta = next - values[0];
    for (let i = 0; i < values.length; i++) values[i] += delta;
  } else {
    values[index] = Math.max(next, values[index - 1] + (index === 3 ? 0 : 1));
    for (let i = index + 1; i < values.length; i++) values[i] = Math.max(values[i], values[i - 1] + (i === 3 ? 0 : 1));
  }
  if (values.some(value => value < 0 || value > 1439)) return { timing, error: 'Times must stay within the same day.' };
  return { timing: Object.fromEntries(fields.map((key, i) => [key, minutesTime(values[i])])) as SessionTiming };
}

export function changeSessionDuration(timing: SessionTiming, field: Exclude<TimingField, 'openingTime'>, minutes: number) {
  const index = fields.indexOf(field);
  if (!Number.isInteger(minutes) || minutes < (field === 'classEndTime' ? 0 : 1)) return { timing, error: 'Enter a valid duration in minutes.' };
  const next = timeMinutes(timing[fields[index - 1]]) + minutes;
  if (next > 1439) return { timing, error: 'Times must stay within the same day.' };
  return changeSessionTime(timing, field, minutesTime(next));
}

/** Five percent reserves space for tiny windows; remaining widths keep their ratio. */
export function sessionTimingSegmentWidths(timing: SessionTiming): number[] {
  const times = fields.map(field => timeMinutes(timing[field]));
  const durations = times.slice(1).map((time, index) => Math.max(0, time - times[index]));
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  if (!Number.isFinite(total) || total === 0) return [100 / 3, 100 / 3, 100 / 3];
  const small = durations.map(duration => duration / total * 100 < 5);
  const reserved = small.filter(Boolean).length * 5;
  const remaining = durations.reduce((sum, duration, index) => sum + (small[index] ? 0 : duration), 0);
  return durations.map((duration, index) => small[index] ? 5 : duration / remaining * (100 - reserved));
}
