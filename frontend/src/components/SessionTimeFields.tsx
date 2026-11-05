import React from 'react';
import { applyTimeChange, checkTimes, formatDayLabel, formatDuration, formatTime12, isNextDay, sessionMinutes, type TimeField, type TimeSet } from '../utils/sessionTimes';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const labelClass = 'mb-1 block font-bold text-slate-700 dark:text-slate-300';

interface SessionTimeFieldsProps {
  times: TimeSet;
  onChange: (times: TimeSet) => void;
  /** YYYY-MM-DD; gives the day names under the times. */
  sessionDate: string;
  openingLabel?: string;
  endHint: string;
}

/** The four session times with auto-shift, "(next day)" captions and the length line (ATT-001). */
export const SessionTimeFields: React.FC<SessionTimeFieldsProps> = ({ times, onChange, sessionDate, openingLabel = 'Opening', endHint }) => {
  const set = (field: TimeField) => (event: React.ChangeEvent<HTMLInputElement>) => onChange(applyTimeChange(times, field, event.target.value));
  const caption = (field: TimeField) => {
    const value = times[field];
    if (!value) return null;
    if (field === 'openingTime') return <>{formatTime12(value)} · {formatDayLabel(sessionDate)}</>;
    if (isNextDay(times.openingTime, value)) {
      return <>{formatTime12(value)} <span className="whitespace-nowrap rounded-full bg-blue-100 px-2 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">(next day)</span></>;
    }
    return <>{formatTime12(value)} · same day</>;
  };
  const captionClass = (field: TimeField) => `mt-1 block min-h-[1.1rem] text-[11px] font-semibold ${field !== 'openingTime' && isNextDay(times.openingTime, times[field]) ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`;
  const problem = checkTimes(times);
  const minutes = sessionMinutes(times);
  const endNext = isNextDay(times.openingTime, times.classEndTime);
  const field = (key: TimeField, label: string, extra?: { required?: boolean; ariaLabel?: string }) => (
    <div>
      <label className="block">
        <span className={labelClass}>{label}</span>
        <input type="time" value={times[key]} onChange={set(key)} required={extra?.required} aria-label={extra?.ariaLabel} className={inputClass} />
      </label>
      <span data-testid={`caption-${key}`} className={captionClass(key)}>{caption(key)}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {field('openingTime', openingLabel)}
        {field('presentCutoff', 'Present cutoff')}
        {field('lateCutoff', 'Late cutoff')}
      </div>
      <div>
        {field('classEndTime', 'Class end time', { required: true, ariaLabel: 'Class end time' })}
        <small className="block text-slate-500 dark:text-slate-400">{endHint}</small>
      </div>
      {problem && times.openingTime && times.presentCutoff && times.lateCutoff && times.classEndTime && (
        <div data-testid="time-summary" className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{problem.includes('12 hours') ? problem : <>Times are not in order yet. <span className="font-medium">{problem}</span></>}</div>
      )}
      {!problem && minutes !== null && (
        <div data-testid="time-summary" className="rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          Session lasts {formatDuration(minutes)}
          <span className="block font-medium">Auto-ends {formatDayLabel(sessionDate, endNext ? 1 : 0)} at {formatTime12(times.classEndTime)}{endNext ? ' (next day)' : ''}.</span>
        </div>
      )}
    </div>
  );
};
