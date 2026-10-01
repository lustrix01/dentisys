import { meetingDayKey, SCHEDULE_TIME_SLOTS } from '../utils/scheduleHelper';

export type DayTimes = Record<string, { startTime: string; endTime: string; room?: string }>;

export function MeetingTimes({ component, days, value, defaultStart, defaultEnd, onChange }: {
  component: string; days: string[]; value: DayTimes; defaultStart: string; defaultEnd: string;
  onChange: (value: DayTimes) => void;
}) {
  return <div className="space-y-2">
    {days.length === 0 && <p className="text-[11px] text-slate-500">Choose days to set a separate time for each day.</p>}
    {days.map((day, index) => <div key={meetingDayKey(days, index)} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-3">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{day}</span>
      {(['startTime', 'endTime'] as const).map(field => {
        const key = meetingDayKey(days, index);
        const current = value[key] ?? { startTime: defaultStart, endTime: defaultEnd };
        return <label key={field} className="text-[10px] font-semibold text-slate-500">
          {field === 'startTime' ? 'Start time' : 'End time'}
          <select aria-label={`${component} ${day}${key === day ? '' : ` meeting ${Number(key.split(':')[1]) + 1}`} ${field === 'startTime' ? 'start' : 'end'} time`} value={current[field]}
            onChange={event => onChange({ ...value, [key]: { ...current, [field]: event.target.value } })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {Array.from(new Set([...SCHEDULE_TIME_SLOTS, current[field]])).map(time => <option key={time} value={time}>{time}</option>)}
          </select>
        </label>;
      })}
    </div>)}
  </div>;
}
