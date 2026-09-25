export interface PersonNameParts {
  prefix: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
}

export const emptyNameParts: PersonNameParts = { prefix: '', firstName: '', middleName: '', lastName: '', suffix: '' };
export const composePersonName = (parts: PersonNameParts) => [parts.prefix, parts.firstName, parts.middleName, parts.lastName, parts.suffix].map(value => value.trim()).filter(Boolean).join(' ');

export function PersonNameFields({ value, onChange }: { value: PersonNameParts; onChange: (value: PersonNameParts) => void }) {
  return <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <legend className="mb-3 text-xs font-bold text-slate-700 dark:text-slate-300">Name</legend>
    {([['prefix', 'Prefix'], ['firstName', 'First name'], ['middleName', 'Middle name'], ['lastName', 'Last name'], ['suffix', 'Suffix']] as const).map(([key, label]) => (
      <label key={key} className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}{(key === 'firstName' || key === 'lastName') && ' *'}
        <input value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })} required={key === 'firstName' || key === 'lastName'} maxLength={key === 'prefix' || key === 'suffix' ? 50 : 100}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-normal normal-case text-slate-800 outline-none focus:ring-2 focus:ring-clinical-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
      </label>
    ))}
  </fieldset>;
}
