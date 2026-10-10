import React, { useState } from 'react';
import { sessionTimingSegmentWidths, changeSessionDuration, changeSessionTime, timeMinutes, type SessionTiming, type TimingField } from '../utils/sessionTiming';

type Props = { value: SessionTiming; onChange: (value: SessionTiming) => void; role: 'faculty' | 'secretary' };
const inputStyle = 'mt-1 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const fields: TimingField[] = ['openingTime', 'presentCutoff', 'lateCutoff', 'classEndTime'];

export const SessionTimingFields: React.FC<Props> = ({ value, onChange, role }) => {
  const [error, setError] = useState('');
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const apply = (result: ReturnType<typeof changeSessionTime>) => {
    setError(result.error ?? '');
    if (!result.error) onChange(result.timing);
  };
  const durations = fields.slice(1).map((field, i) => timeMinutes(value[field]) - timeMinutes(value[fields[i]]));
  const segmentWidths = sessionTimingSegmentWidths(value);
  const labels = role === 'faculty' ? ['Opening', 'Present cutoff', 'Late cutoff', 'Class end time'] : ['Opening Time', 'Present Cutoff', 'Late Cutoff', 'Class End Time'];
  const groups = [
    { field: 'openingTime' as const, label: 'Opens at', choices: ['07:00', '08:00', '10:00', '13:00'] },
    { field: 'presentCutoff' as const, label: 'Present for', choices: ['15m', '30m', '1h'], minutes: [15, 30, 60] },
    { field: 'lateCutoff' as const, label: 'Late until', choices: ['+1h', '+2h', '+3h'], minutes: [60, 120, 180] },
    { field: 'classEndTime' as const, label: 'Class ends', choices: ['+0', '+1h'], minutes: [0, 60] },
  ];
  return <section aria-label="Session timing" className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {groups.map((group, index) => <fieldset key={group.field} className="min-w-0">
        <legend className="mb-1 text-xs font-bold text-slate-700 dark:text-slate-300">{group.label}</legend>
        <div className="flex flex-wrap gap-1">
          {group.choices.map((choice, i) => {
            const selected = !custom[group.field] && (index === 0 ? value.openingTime === choice : durations[index - 1] === group.minutes?.[i]);
            return <button key={choice} type="button" aria-pressed={selected} onClick={() => {
              setCustom(current => ({ ...current, [group.field]: false }));
              apply(group.field === 'openingTime' ? changeSessionTime(value, group.field, choice) : changeSessionDuration(value, group.field, group.minutes![i]));
            }} className={`rounded-lg border px-2.5 py-2 text-xs font-bold ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{choice}</button>;
          })}
          <button type="button" aria-pressed={Boolean(custom[group.field])} onClick={() => setCustom(current => ({ ...current, [group.field]: true }))} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold dark:border-slate-700">Custom</button>
        </div>
        {custom[group.field] && (group.field === 'openingTime'
          ? <label className="text-xs">Custom opening time<input aria-label="Custom opening time" type="time" value={value.openingTime} onChange={event => apply(changeSessionTime(value, 'openingTime', event.target.value))} className={inputStyle} /></label>
          : <label className="text-xs">Minutes<input aria-label={`${group.label} minutes`} type="number" min={index === 3 ? 0 : 1} value={durations[index - 1]} onChange={event => apply(changeSessionDuration(value, group.field as Exclude<TimingField, 'openingTime'>, Number(event.target.value)))} className={inputStyle} /></label>)}
      </fieldset>)}
    </div>
    {error && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-300">{error}</p>}
    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{fields.map(field => value[field]).join(' · ')}</p>
    <div className="flex overflow-hidden rounded-lg text-center text-[10px] font-bold" aria-label="Present, Late, then Closed">
      <span style={{ width: `${segmentWidths[0]}%` }} className="bg-emerald-100 py-1 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Present</span>
      <span style={{ width: `${segmentWidths[1]}%` }} className="bg-amber-100 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Late</span>
      <span style={{ width: `${segmentWidths[2]}%` }} className="bg-slate-100 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Closed</span>
    </div>
    <details open>
      <summary className="cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-300">Exact times</summary>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field, index) => <label key={field} className="text-xs font-bold text-slate-700 dark:text-slate-300">{labels[index]}
          <input type="time" required aria-label={labels[index]} value={value[field]} onChange={event => apply(changeSessionTime(value, field, event.target.value))} className={inputStyle} />
        </label>)}
      </div>
      <small className="mt-2 block text-slate-400">The session ends automatically at this time; students without a record are marked Absent.</small>
    </details>
  </section>;
};
