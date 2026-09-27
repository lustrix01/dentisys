import React from 'react';

interface SchoolYearFilterProps {
  value: string;
  currentSchoolYear?: string | null;
  availableSchoolYears?: string[];
  onChange: (value: string) => void;
}

/** Dashboard scope selector: current school year (default), a past school year, or all years. */
export const SchoolYearFilter: React.FC<SchoolYearFilterProps> = ({
  value,
  currentSchoolYear,
  availableSchoolYears = [],
  onChange,
}) => {
  const otherYears = availableSchoolYears.filter(year => year !== currentSchoolYear);
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
      <span>School year</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        aria-label="Dashboard school year"
      >
        <option value="current">Current ({currentSchoolYear ?? '…'})</option>
        {otherYears.map(year => (
          <option key={year} value={year}>{year}</option>
        ))}
        <option value="all">All school years</option>
      </select>
    </label>
  );
};
