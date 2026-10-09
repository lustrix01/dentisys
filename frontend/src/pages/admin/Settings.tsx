import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Moon,
  Percent,
  RotateCcw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/Card";
import { Modal } from "../../components/Modal";
import { useThemePreference } from "../../hooks/useThemePreference";
import {
  getAdminSettingsApi,
  updateAdminSettingsApi,
  ApiError,
  getAcademicTermsApi,
  saveAcademicTermApi,
  deleteAcademicTermApi,
  copyAcademicTermsApi,
  type AcademicTerm,
  type AcademicTermInput,
} from "../../services/apiClient";

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  // Appearance applies immediately and saves to the account on its own;
  // the Save button below is for the institution-wide policy only.
  const { theme, changeTheme } = useThemePreference();
  const [themeError, setThemeError] = useState("");
  const [transmutationDefaults, setTransmutationDefaults] = useState(
    settings.transmutationDefaults ?? { minimumPercentage: 50, maximumPercentage: 100 },
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  useEffect(() => {
    getAdminSettingsApi()
      .then((res) => {
        if (res.settings) {
          if (res.settings.transmutationDefaults) setTransmutationDefaults(res.settings.transmutationDefaults);
        }
      })
      .catch(() => {});
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (transmutationDefaults.minimumPercentage < 0
      || transmutationDefaults.maximumPercentage > 100
      || transmutationDefaults.minimumPercentage > transmutationDefaults.maximumPercentage) {
      setError('Transmutation bounds must be between 0% and 100%, with minimum not exceeding maximum.');
      return;
    }
    try {
      await updateAdminSettingsApi({ theme, transmutationDefaults });
      updateSettings({ ...settings, theme, transmutationDefaults });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to sync settings with backend", err);
      setError(
        err instanceof Error ? err.message : "Failed to save system settings.",
      );
    }
  };
  const reset = () => {
    ["dentisys_students", "dentisys_attendance", "dentisys_settings"].forEach(
      (key) => localStorage.removeItem(key),
    );
    setShowResetConfirmation(false);
    window.location.reload();
  };
  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Settings
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Appearance, assessment transmutation defaults, and local cache controls.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/30 px-3 py-2 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5" />
          System administration
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {error}
        </div>
      )}
      <AcademicTermsSettings />
      <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="w-4.5 h-4.5 text-accent-500" />
                Interface appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {(["light", "dark"] as const).map((mode) => (
                <button
                  type="button"
                  onClick={() => {
                    setThemeError("");
                    changeTheme(mode).catch((err) =>
                      setThemeError(
                        err instanceof Error
                          ? `Appearance applied on this device but not saved to your account: ${err.message}`
                          : "Appearance could not be saved to your account.",
                      ),
                    );
                  }}
                  aria-pressed={theme === mode}
                  key={mode}
                  className={`rounded-xl p-3 text-center border text-[10px] font-bold transition-all ${theme === mode ? "border-accent-500 bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-400" : "border-slate-200 dark:border-slate-800 text-slate-400"}`}
                >
                  {mode === "light" ? (
                    <Sun className="w-4.5 h-4.5 mx-auto mb-1.5" />
                  ) : (
                    <Moon className="w-4.5 h-4.5 mx-auto mb-1.5" />
                  )}
                  {mode === "light" ? "Light mode" : "Dark mode"}
                </button>
              ))}
              <p role="status" className="col-span-2 text-[10px] text-slate-400">
                {themeError || "Applies immediately and is saved to your account."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="w-4.5 h-4.5 text-rose-500" />
                Grading policy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <div data-testid="grading-policy-card" className="space-y-3">
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Retention trigger: GWA 2.5.</strong>{" "}
                A final course grade of 2.5 or worse (1.0 is highest, 5.0 is failing) places the
                Student under retention monitoring and makes the course eligible for a remedial
                attempt. This is fixed college policy and applies to every course.
              </p>
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Grade weights</strong> are set
                for each course by its Faculty in Grade Computation. A class cannot be graded until
                its course has saved grade weights.
              </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <RotateCcw className="w-4.5 h-4.5 text-rose-500" />
                Compatibility cache
              </CardTitle>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                onClick={() => setShowResetConfirmation(true)}
                className="w-full flex justify-center gap-2 text-xs font-bold text-rose-600 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Clear local cache
              </button>
              <p className="mt-2 text-[10px] text-center text-slate-400">
                The database remains unchanged.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card className="lg:col-span-8 p-0 overflow-hidden">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Percent className="w-4.5 h-4.5 text-accent-500" />
              Assessment transmutation defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div>
              <p className="text-[10px] text-slate-400 mb-4">New assessments start with these bounded transformation values.</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {([
                  ['minimumPercentage', 'Minimum percentage'],
                  ['maximumPercentage', 'Maximum percentage'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {label}
                    <div className="relative mt-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={transmutationDefaults[key]}
                        onChange={(event) => setTransmutationDefaults({ ...transmutationDefaults, [key]: Number(event.target.value) || 0 })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs text-slate-400">%</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {saved ? "Settings saved" : "Save system settings"}
              </button>
            </div>
          </CardContent>
        </Card>
      </form>
      <Modal
        isOpen={showResetConfirmation}
        onClose={() => setShowResetConfirmation(false)}
        title="Clear compatibility cache"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Clear locally cached compatibility data? Persisted database records
          will not be changed.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowResetConfirmation(false)}
            className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
          >
            Clear cache
          </button>
        </div>
      </Modal>
    </div>
  );
};

const termInputClass = "mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-800 dark:text-slate-100";
const termButtonClass = "rounded-xl px-4 py-2 text-xs font-bold bg-accent-600 hover:bg-accent-700 text-white disabled:opacity-40";

function AcademicTermsSettings() {
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [currentYear, setCurrentYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<AcademicTermInput | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const [deleteTerm, setDeleteTerm] = useState<AcademicTerm | null>(null);
  const [copying, setCopying] = useState(false);
  const load = async () => {
    const result = await getAcademicTermsApi();
    setTerms(result.terms);
    setCurrentYear(result.currentSchoolYear);
  };
  useEffect(() => {
    let ignore = false;
    getAcademicTermsApi().then(result => {
      if (ignore) return;
      setTerms(result.terms);
      setCurrentYear(result.currentSchoolYear);
    }).catch(err => { if (!ignore) setError(err instanceof Error ? err.message : 'Unable to load academic terms.'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);
  const reportError = (err: unknown) => {
    setError(err instanceof Error ? err.message : 'Unable to save academic terms.');
    if (err instanceof ApiError && Array.isArray(err.errors)) {
      setFields(Object.fromEntries(err.errors.map((field: { field: string; message: string }) => [field.field, field.message])));
    }
  };
  const open = (term?: AcademicTerm) => {
    setError(''); setFields({}); setConfirmation(null);
    setDraft({ ...(term?.id ? { id: term.id } : {}), schoolYear: term?.schoolYear ?? currentYear,
      semester: term?.semester ?? '1ST', startDate: term?.startDate ?? '', endDate: term?.endDate ?? '' });
  };
  const saveTerm = async (confirmed = false) => {
    if (!draft) return;
    setBusy(true); setError(''); setFields({});
    try {
      if (!confirmed) {
        const preview = await saveAcademicTermApi(draft, true);
        if (preview.confirmationRequired) { setConfirmation(preview.expiringEnrollments ?? 0); return; }
      }
      const result = await saveAcademicTermApi({ ...draft, ...(confirmed ? { confirmedExpiringEnrollments: confirmation ?? 0 } : {}) });
      if (result.confirmationRequired) { setConfirmation(result.expiringEnrollments ?? 0); return; }
      setDraft(null); setConfirmation(null);
      setMessage('Academic term saved.');
      await load();
    } catch (err) { reportError(err); } finally { setBusy(false); }
  };
  const years = [...new Set(terms.map(term => term.schoolYear))];
  const latestYear = terms.find(term => term.id !== null)?.schoolYear;
  return <section id="academic-terms" className="scroll-mt-6">
    <Card>
      <CardHeader><CardTitle>Academic terms</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">Set the dates Faculty use for classes and Student face enrollment. Dates use Asia/Manila; each term ends at the end of its end date.</p>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={loading || busy || !currentYear} className={termButtonClass} onClick={() => open()}>Add term</button>
          <button type="button" disabled={loading || busy || !latestYear} className={termButtonClass} onClick={() => { setError(''); setCopying(true); }}>Copy previous school year</button>
        </div>
        {loading ? <p role="status" className="text-sm text-slate-500">Loading academic terms…</p> : years.length === 0 ? <p className="text-sm text-slate-500">No academic terms defined. Add the terms for {currentYear}.</p> : years.map(year => <div key={year} className="space-y-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{year}</h3>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {terms.filter(term => term.schoolYear === year).map(term => <li key={term.semester} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={year + '-' + term.semester}>
              <div className="text-sm text-slate-700 dark:text-slate-200"><strong>{term.semester}</strong> <span className="ml-2">{term.startDate ? term.startDate + ' – ' + term.endDate : 'Dates not set'}</span><span className="ml-2 text-xs text-slate-500">{term.classCount} {term.classCount === 1 ? 'class' : 'classes'}</span></div>
              <div className="flex gap-2">
                <button type="button" className={termButtonClass} disabled={busy} onClick={() => open(term)}>{term.id === null ? 'Set dates' : 'Edit dates'}</button>
                {term.id !== null && <button type="button" className="rounded-xl px-3 py-2 text-xs font-bold text-rose-600 disabled:opacity-40" disabled={busy || term.classCount > 0} title={term.classCount > 0 ? 'A term used by a class cannot be deleted.' : 'Delete unused term'} onClick={() => { setError(''); setDeleteTerm(term); }}>Delete</button>}
              </div>
            </li>)}
          </ul>
        </div>)}
      </CardContent>
    </Card>
    <Modal isOpen={draft !== null} onClose={() => { if (!busy) { setDraft(null); setConfirmation(null); } }} title={draft?.id ? 'Edit academic term' : 'Set academic term dates'}>
      {draft && <form role="dialog" aria-modal="true" aria-label={draft.id ? "Edit academic term" : "Set academic term dates"} className="space-y-4" onSubmit={event => { event.preventDefault(); void saveTerm(confirmation !== null); }}>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {confirmation !== null ? <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">{confirmation} unexpired biometric {confirmation === 1 ? 'enrollment will' : 'enrollments will'} expire with this change. A term ending today remains valid through today; past dates expire at the next expiry run. Biometric material is removed by the expiry run.</p>
          <p className="text-sm font-bold">Save end date {draft.endDate} for {draft.semester} {draft.schoolYear}?</p>
        </div> : <>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">School year
            <input required pattern="[0-9]{4}-[0-9]{4}" placeholder="2026-2027" readOnly={draft.id !== undefined} className={termInputClass} value={draft.schoolYear} onChange={event => setDraft({ ...draft, schoolYear: event.target.value })} aria-invalid={!!fields.schoolYear} />
            {fields.schoolYear && <span className="text-rose-600">{fields.schoolYear}</span>}
          </label>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Semester
            <select disabled={draft.id !== undefined} className={termInputClass} value={draft.semester} onChange={event => setDraft({ ...draft, semester: event.target.value as AcademicTerm['semester'] })} aria-invalid={!!fields.semester}>
              <option value="1ST">1ST</option><option value="2ND">2ND</option><option value="Summer">Summer</option>
            </select>{fields.semester && <span className="text-rose-600">{fields.semester}</span>}
          </label>
          {(['startDate', 'endDate'] as const).map(field => <label key={field} className="block text-xs font-bold text-slate-600 dark:text-slate-300">{field === 'startDate' ? 'Start date' : 'End date'}
            <input type="date" required className={termInputClass} value={draft[field]} onChange={event => setDraft({ ...draft, [field]: event.target.value })} aria-invalid={!!fields[field]} />
            {fields[field] && <span className="text-rose-600">{fields[field]}</span>}
          </label>)}
        </>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} className="px-4 py-2 text-xs font-bold text-slate-500" onClick={() => { if (confirmation !== null) setConfirmation(null); else setDraft(null); }}>Cancel</button>
          <button type="submit" disabled={busy} className={termButtonClass}>{busy ? 'Saving…' : confirmation !== null ? 'Confirm and save' : 'Save term'}</button>
        </div>
      </form>}
    </Modal>
    <Modal isOpen={deleteTerm !== null} onClose={() => { if (!busy) setDeleteTerm(null); }} title="Delete unused academic term">
      <div role="dialog" aria-modal="true" aria-label="Delete unused academic term">
      <p className="text-sm text-slate-700 dark:text-slate-200">Delete {deleteTerm?.semester} {deleteTerm?.schoolYear}?</p>
      <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setDeleteTerm(null)}>Cancel</button><button type="button" disabled={busy} className={termButtonClass} onClick={async () => {
        if (!deleteTerm?.id) return;
        setBusy(true);
        try { await deleteAcademicTermApi(deleteTerm.id); setDeleteTerm(null); setMessage('Unused academic term deleted.'); await load(); }
        catch (err) { reportError(err); setDeleteTerm(null); } finally { setBusy(false); }
      }}>Delete term</button></div>
      </div>
    </Modal>
    <Modal isOpen={copying} onClose={() => { if (!busy) setCopying(false); }} title="Copy previous school year">
      <div role="dialog" aria-modal="true" aria-label="Copy previous school year">
      <p className="text-sm text-slate-700 dark:text-slate-200">Copy the latest defined school year ({latestYear}) into the next school year, shifting dates by one year? February 29 becomes February 28. Existing terms are kept. Review and adjust the copied dates afterwards.</p>
      <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setCopying(false)}>Cancel</button><button type="button" disabled={busy} className={termButtonClass} onClick={async () => {
        setBusy(true);
        try { const result = await copyAcademicTermsApi(); setCopying(false); setMessage('Created ' + result.created + ' terms for ' + result.schoolYear + '. Review and adjust their dates.'); await load(); }
        catch (err) { reportError(err); setCopying(false); } finally { setBusy(false); }
      }}>Copy terms</button></div>
      </div>
    </Modal>
  </section>;
}
