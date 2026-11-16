import React from 'react';
import { applyTimeChange, checkTimes, formatDayLabel, formatDuration, formatTime12, isNextDay, sessionMinutes, type TimeField, type TimeSet } from '../utils/sessionTimes';
import { TimePicker, type PickerAccent } from './TimePicker';

const labelClass = 'mb-1 block font-bold text-slate-700 dark:text-slate-300';

interface SessionTimeFieldsProps {
  times: TimeSet;
  onChange: (times: TimeSet) => void;
  /** YYYY-MM-DD; gives the day names under the times. */
  sessionDate: string;
  openingLabel?: string;
  endHint: string;
  accent?: PickerAccent;
  /** 'main' = Opening, Class end and the summary; 'cutoffs' = the two cutoffs (kept under More settings). */
  part?: 'all' | 'main' | 'cutoffs';
}

/** The four session times with auto-shift, "(next day)" captions and the length line (ATT-001). */
export const SessionTimeFields: React.FC<SessionTimeFieldsProps> = ({ times, onChange, sessionDate, openingLabel = 'Opening', endHint, accent = 'emerald', part = 'all' }) => {
  const set = (field: TimeField) => (value: string) => onChange(applyTimeChange(times, field, value));
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
  // Cancel puts back all four times as they were when the picker opened, including ones the opening pushed along.
  const opened = React.useRef(times);
  const problem = checkTimes(times);
  const minutes = sessionMinutes(times);
  const endNext = isNextDay(times.openingTime, times.classEndTime);
  const field = (key: TimeField, label: string, picker: React.ReactNode) => (
    <div>
      <span className={labelClass}>{label}</span>
      {picker}
      <span data-testid={`caption-${key}`} className={captionClass(key)}>{caption(key)}</span>
    </div>
  );
  const picker = (key: TimeField, label: string, name = label) =>
    field(key, label, <TimePicker value={times[key]} onChange={set(key)} name={name} accent={accent}
      onOpen={() => { opened.current = times; }} onCancel={() => onChange(opened.current)} />);

  return (
    <div className="space-y-3">
      {part !== 'cutoffs' && picker('openingTime', openingLabel, openingLabel.replace(/ Time$/, ''))}
      {part !== 'main' && picker('presentCutoff', 'Present Cutoff')}
      {part !== 'main' && picker('lateCutoff', 'Late Cutoff')}
      {part !== 'cutoffs' && (
        <div>
          {picker('classEndTime', 'Class End Time')}
          <small className="block text-slate-500 dark:text-slate-400">{endHint}</small>
        </div>
      )}
      {part !== 'cutoffs' && problem && times.openingTime && times.presentCutoff && times.lateCutoff && times.classEndTime && (
        <div data-testid="time-summary" className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{problem.includes('12 hours') ? problem : <>Times are not in order yet. <span className="font-medium">{problem}</span></>}</div>
      )}
      {part !== 'cutoffs' && !problem && minutes !== null && (
        <div data-testid="time-summary" className="rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          Session lasts {formatDuration(minutes)}
          <span className="block font-medium">Auto-ends {formatDayLabel(sessionDate, endNext ? 1 : 0)} at {formatTime12(times.classEndTime)}{endNext ? ' (next day)' : ''}.</span>
        </div>
      )}
    </div>
  );
};
