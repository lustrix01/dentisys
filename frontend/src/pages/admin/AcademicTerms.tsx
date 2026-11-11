import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CalendarPlus,
  Copy,
  Pencil,
  Plus,
  Trash2,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '../../components/Modal';
import { newTermDefaults, semesterLabel } from '../../utils/academicTermDefaults';
import {
  getAcademicTermsApi,
  saveAcademicTermApi,
  deleteAcademicTermApi,
  copyAcademicTermsApi,
  ApiError,
  type AcademicTerm,
  type AcademicTermInput,
} from '../../services/apiClient';

const termInputClass =
  'mt-1.5 min-w-0 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all';
const termButtonClass =
  'rounded-xl px-4 py-2 text-xs font-bold bg-accent-600 hover:bg-accent-700 text-white shadow-xs hover:shadow-md transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';
const SEMESTER_ORDER = ['1ST', '2ND', 'Summer'] as const;
const cancelButtonClass =
  'px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer';

export const AcademicTermsSettings: React.FC = () => {
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [currentYear, setCurrentYear] = useState('');
  const [today, setToday] = useState('');
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
    setToday(result.today);
  };

  useEffect(() => {
    let ignore = false;
    getAcademicTermsApi()
      .then((result) => {
        if (ignore) return;
        setTerms(result.terms);
        setCurrentYear(result.currentSchoolYear);
        setToday(result.today);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Unable to load academic terms.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const reportError = (err: unknown) => {
    setError(err instanceof Error ? err.message : 'Unable to save academic terms.');
    if (err instanceof ApiError && Array.isArray(err.errors)) {
      setFields(
        Object.fromEntries(
          err.errors.map((field: { field: string; message: string }) => [field.field, field.message]),
        ),
      );
    }
  };

  const open = (term?: AcademicTerm) => {
    setError('');
    setFields({});
    setConfirmation(null);
    if (term) setExpanded((open) => ({ ...open, [term.schoolYear]: true })); // stay open after saving
    const defaults = newTermDefaults(
      currentYear,
      terms.filter((t) => t.id !== null && t.schoolYear === currentYear).map((t) => t.semester),
    );
    setDraft({
      ...(term?.id ? { id: term.id } : {}),
      schoolYear: term?.schoolYear ?? defaults.schoolYear,
      semester: term?.semester ?? defaults.semester,
      startDate: term?.startDate ?? '',
      endDate: term?.endDate ?? '',
    });
  };

  const saveTerm = async (confirmed = false) => {
    if (!draft) return;
    setBusy(true);
    setError('');
    setFields({});
    try {
      if (!confirmed) {
        const preview = await saveAcademicTermApi(draft, true);
        if (preview.confirmationRequired) {
          setConfirmation(preview.expiringEnrollments ?? 0);
          return;
        }
      }
      const result = await saveAcademicTermApi({
        ...draft,
        ...(confirmed ? { confirmedExpiringEnrollments: confirmation ?? 0 } : {}),
      });
      if (result.confirmationRequired) {
        setConfirmation(result.expiringEnrollments ?? 0);
        return;
      }
      setDraft(null);
      setConfirmation(null);
      setMessage('Academic term saved.');
      await load();
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const definedTerms = terms.filter((term) => term.id !== null);
  const years = [...new Set(terms.map((term) => term.schoolYear))].sort().reverse();
  const latestYear = definedTerms.map((term) => term.schoolYear).sort().pop();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // A school year earlier than the current one starts collapsed.
  const yearPast = (year: string) => !!currentYear && year < currentYear;

  const formatDates = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return 'Dates not set';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [startYear, startMonth, startDay] = startDate.split('-');
    const [endYear, endMonth, endDay] = endDate.split('-');
    const start = months[Number(startMonth) - 1] + ' ' + Number(startDay);
    const end = months[Number(endMonth) - 1] + ' ' + Number(endDay) + ', ' + endYear;
    return start + (startYear === endYear ? '' : ', ' + startYear) + ' – ' + end;
  };

  const termStatus = (term: Pick<AcademicTerm, 'startDate' | 'endDate'>) => {
    if (!term.startDate || !term.endDate)
      return {
        label: 'Not set',
        className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/50',
        dotClass: 'bg-amber-500',
      };
    if (!today) return null;
    if (today < term.startDate)
      return {
        label: 'Upcoming',
        className: 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-200/50',
        dotClass: 'bg-accent-500',
      };
    if (today > term.endDate)
      return {
        label: 'Ended',
        className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/60',
        dotClass: 'bg-slate-400',
      };
    return {
      label: 'Current',
      className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/50',
      dotClass: 'bg-emerald-500',
    };
  };

  const currentTermObj = terms.find((t) => {
    if (!today || !t.startDate || !t.endDate) return false;
    return today >= t.startDate && today <= t.endDate;
  });
  const totalClassesCount = definedTerms.reduce((acc, t) => acc + (t.classCount || 0), 0);

  return (
    <section id="academic-terms" className="mx-auto max-w-7xl scroll-mt-6 space-y-6 animate-fade-in">
      <div className="space-y-3 px-1.5">
        <p className="max-w-3xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Set the dates Faculty use for classes and Student face enrollment. Dates use Asia/Manila; each term ends at the end of its end date.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>Current School Year <b className="text-slate-800 dark:text-slate-100">{currentYear || 'Not configured'}</b></span>
            <span>{currentTermObj ? `${semesterLabel(currentTermObj.semester)} active` : 'No active semester today'}</span>
            <span><b className="text-slate-800 dark:text-slate-100">{years.length}</b> {years.length === 1 ? 'school year' : 'school years'} · {definedTerms.length} {definedTerms.length === 1 ? 'term' : 'terms'}</span>
            <span><b className="text-slate-800 dark:text-slate-100">{totalClassesCount}</b> {totalClassesCount === 1 ? 'class' : 'classes'} linked</span>
          </p>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:shrink-0">
            <button
              type="button"
              disabled={loading || busy || !latestYear}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 text-slate-700 dark:text-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              onClick={() => {
                setError('');
                setCopying(true);
              }}
            >
              <Copy className="w-4 h-4" />
              Add next school year
            </button>
            <button
              type="button"
              disabled={loading || busy || !currentYear}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-accent-600 hover:bg-accent-700 active:scale-95 text-white shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => open()}
            >
              <Plus className="w-4 h-4" />
              Add term
            </button>
          </div>
        </div>
      </div>

      {/* Notifications & Status Alerts */}
      {error && !draft && (
        <div role="alert" className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div role="status" className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* 3. One card per school year */}
      {loading ? (
        <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">
          Loading academic terms…
        </div>
      ) : years.length === 0 ? (
        <div className="p-12 text-center text-sm font-medium text-slate-500 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
          No academic terms defined. Add the terms for {currentYear}.
        </div>
      ) : (
        <div className="space-y-4">
          {years.map((year) => {
            const isCurrentYear = year === currentYear;
            const yearSet = definedTerms.filter((term) => term.schoolYear === year);
            const past = yearPast(year);
            const isOpen = expanded[year] ?? !past;

            return (
              <div
                key={year}
                className={`min-w-0 overflow-hidden rounded-3xl border ${
                  isCurrentYear
                    ? 'border-accent-300/80 dark:border-accent-800/80 bg-white dark:bg-slate-900 shadow-sm'
                    : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs'
                }`}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  data-testid={`year-${year}`}
                  className="flex w-full items-center gap-3 bg-slate-50/70 px-4 py-3.5 text-left cursor-pointer dark:bg-slate-950/30 sm:px-5"
                  onClick={() => setExpanded({ ...expanded, [year]: !isOpen })}
                >
                  <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                  <span className="text-sm font-extrabold tracking-tight text-slate-800 dark:text-slate-100">{year}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700">
                    {yearSet.length === 0 && past
                      ? 'No dates set'
                      : `${yearSet.length} ${yearSet.length === 1 ? 'term' : 'terms'}${past ? ' · ended' : ' set'}`}
                  </span>
                  {isCurrentYear && (
                    <span className="ml-auto whitespace-nowrap rounded-full border border-accent-200/60 bg-white px-2.5 py-1 text-[10px] font-extrabold text-accent-700 dark:border-accent-900/60 dark:bg-slate-900 dark:text-accent-300">
                      Current S.Y.
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-950/20 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
                    {SEMESTER_ORDER.map((semester) => {
                      const term = yearSet.find((t) => t.semester === semester);
                      const slot = !term;
                      const placeholder = terms.find((t) => t.schoolYear === year && t.semester === semester);
                      const status = termStatus(term ?? { startDate: null, endDate: null });
                      const classCount = (term ?? placeholder)?.classCount ?? 0;
                      return (
                        <article
                          key={semester}
                          data-testid={`${year}-${semester}`}
                          className="flex min-h-40 min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-colors hover:border-accent-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-900"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h3 className={`text-sm font-extrabold ${slot ? 'text-slate-600 dark:text-slate-300' : 'text-slate-900 dark:text-slate-100'}`}>
                              {semesterLabel(semester)}
                            </h3>
                            {status && (
                              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${status.className}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                                {status.label}
                              </span>
                            )}
                          </div>
                          <p className={`mt-4 text-sm ${slot ? 'italic text-slate-400 dark:text-slate-500' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>
                            {formatDates(term?.startDate ?? null, term?.endDate ?? null)}
                          </p>
                          <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              <strong className="text-slate-800 dark:text-slate-200">{classCount}</strong> {classCount === 1 ? 'class' : 'classes'}
                            </span>
                            <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`${slot ? 'Add dates for' : 'Edit'} ${semesterLabel(semester)} ${year}`}
                              title={`${slot ? 'Add dates for' : 'Edit'} ${semesterLabel(semester)} ${year}`}
                              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition-all disabled:opacity-40 ${slot ? 'bg-accent-600 text-white shadow-xs hover:bg-accent-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                              disabled={busy}
                              onClick={() => open(term ?? { id: null, schoolYear: year, semester, startDate: null, endDate: null, classCount: 0 })}
                            >
                              {slot ? <CalendarPlus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                            </button>
                            {term && (
                              <button
                                type="button"
                                aria-label={`Delete ${semesterLabel(semester)} ${year} term`}
                                className="flex h-10 w-10 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                disabled={busy || term.classCount > 0}
                                title={
                                  term.classCount > 0
                                  ? 'A term used by a class cannot be deleted.'
                                    : `Delete unused ${semesterLabel(semester)} ${year} term`
                                }
                                onClick={() => {
                                  setError('');
                                  setDeleteTerm(term);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}


      {/* Set / Edit Academic Term Modal */}
      <Modal
        isOpen={draft !== null}
        onClose={() => {
          if (!busy) {
            setDraft(null);
            setConfirmation(null);
          }
        }}
        title={draft?.id ? 'Edit Academic Term' : 'Set Academic Term Dates'}
      >
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveTerm(confirmation !== null);
            }}
          >
            {error && Object.keys(fields).length === 0 && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
            {confirmation !== null ? (
              <div className="space-y-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl">
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  {confirmation} unexpired biometric {confirmation === 1 ? 'enrollment will' : 'enrollments will'} expire with this change. A term ending today remains valid through today; past dates expire at the next expiry run. Biometric material is removed by the expiry run.
                </p>
                <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  Save end date {draft.endDate} for the {semesterLabel(draft.semester)} of {draft.schoolYear}?
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    School Year
                    <input
                      required
                      pattern="[0-9]{4}-[0-9]{4}"
                      placeholder="2026-2027"
                      readOnly={draft.id !== undefined}
                      className={termInputClass}
                      value={draft.schoolYear}
                      onChange={(event) => setDraft({ ...draft, schoolYear: event.target.value })}
                      aria-invalid={!!fields.schoolYear}
                    />
                    {fields.schoolYear && <span className="text-xs text-rose-600 dark:text-rose-400 mt-1 block">{fields.schoolYear}</span>}
                  </label>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Semester
                    <select
                      disabled={draft.id !== undefined}
                      className={termInputClass}
                      value={draft.semester}
                      onChange={(event) =>
                        setDraft({ ...draft, semester: event.target.value as AcademicTerm['semester'] })
                      }
                      aria-invalid={!!fields.semester}
                    >
                      <option value="1ST">1st Semester</option>
                      <option value="2ND">2nd Semester</option>
                      <option value="Summer">Summer</option>
                    </select>
                    {fields.semester && <span className="text-xs text-rose-600 dark:text-rose-400 mt-1 block">{fields.semester}</span>}
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['startDate', 'endDate'] as const).map((field) => (
                    <label key={field} className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      {field === 'startDate' ? 'Start Date' : 'End Date'}
                      <input
                        type="date"
                        required
                        className={termInputClass}
                        value={draft[field]}
                        onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                        aria-invalid={!!fields[field]}
                      />
                      {fields[field] && <span className="text-xs text-rose-600 dark:text-rose-400 mt-1 block">{fields[field]}</span>}
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={busy}
                className={cancelButtonClass}
                onClick={() => {
                  if (confirmation !== null) setConfirmation(null);
                  else setDraft(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={busy} className={termButtonClass}>
                {busy ? 'Saving…' : confirmation !== null ? 'Confirm and save' : 'Save term'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Unused Academic Term Modal */}
      <Modal
        isOpen={deleteTerm !== null}
        onClose={() => {
          if (!busy) setDeleteTerm(null);
        }}
        title="Delete Unused Academic Term"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Delete the {deleteTerm ? semesterLabel(deleteTerm.semester) : ''} of {deleteTerm?.schoolYear}?
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={busy}
              className={cancelButtonClass}
              onClick={() => setDeleteTerm(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all disabled:opacity-40 cursor-pointer"
              onClick={async () => {
                if (!deleteTerm?.id) return;
                setBusy(true);
                try {
                  await deleteAcademicTermApi(deleteTerm.id);
                  setDeleteTerm(null);
                  setMessage('Unused academic term deleted.');
                  await load();
                } catch (err) {
                  reportError(err);
                  setDeleteTerm(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete term
            </button>
          </div>
        </div>
      </Modal>

      {/* Copy Previous School Year Modal */}
      <Modal
        isOpen={copying}
        onClose={() => {
          if (!busy) setCopying(false);
        }}
        title="Add Next School Year"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            Copy the latest defined school year ({latestYear}) into the next school year, shifting dates by one year? February 29 becomes February 28. Existing terms are kept. Review and adjust the copied dates afterwards.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={busy}
              className={cancelButtonClass}
              onClick={() => setCopying(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              className={termButtonClass}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await copyAcademicTermsApi();
                  setCopying(false);
                  setMessage('Created ' + result.created + ' terms for ' + result.schoolYear + '. Review and adjust their dates.');
                  await load();
                } catch (err) {
                  reportError(err);
                  setCopying(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Copy terms
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
};

export const AcademicTerms: React.FC = () => {
  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <AcademicTermsSettings />
    </div>
  );
};

export default AcademicTerms;
