// Same switch design as the Pin switch in GradebookMatrix.
export function RevokedSessionsSwitch({ showRevoked, revokedCount, onChange, disabled }: {
  showRevoked: boolean;
  revokedCount: number;
  onChange: (show: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Revoked sessions:</span>
      <div role="group" aria-label="Revoked sessions" className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-850 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-755">
        {([['Hide', false], [`Show (${revokedCount})`, true]] as const).map(([label, show]) => (
          <button
            key={label}
            type="button"
            aria-pressed={showRevoked === show}
            disabled={disabled}
            onClick={() => onChange(show)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 ${
              showRevoked === show
                ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
