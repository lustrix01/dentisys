import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Plus,
  Trash2,
  Clock,
  BookOpen,
  Calendar,
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
const outlineButtonClass =
  'rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';
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

  const years = [...new Set(terms.map((term) => term.schoolYear))];
  const latestYear = terms.find((term) => term.id !== null)?.schoolYear;

  const formatDates = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return 'Dates not set';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [startYear, startMonth, startDay] = startDate.split('-');
    const [endYear, endMonth, endDay] = endDate.split('-');
    const start = months[Number(startMonth) - 1] + ' ' + Number(startDay);
    const end = months[Number(endMonth) - 1] + ' ' + Number(endDay) + ', ' + endYear;
    return start + (startYear === endYear ? '' : ', ' + startYear) + ' – ' + end;
  };

  const termStatus = (term: AcademicTerm) => {
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
  const totalClassesCount = terms.reduce((acc, t) => acc + (t.classCount || 0), 0);

  return (
    <section id="academic-terms" className="scroll-mt-6 space-y-6">
      {/* 1. Hero Toolbar Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-500/10 to-accent-600/20 text-accent-600 dark:text-accent-400 border border-accent-200/60 dark:border-accent-900/60 flex items-center justify-center shrink-0 shadow-sm">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Academic terms
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Set the dates Faculty use for classes and Student face enrollment. Dates use Asia/Manila; each term ends at the end of its end date.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
            <button
              type="button"
              disabled={loading || busy || !currentYear}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-accent-600 hover:bg-accent-700 active:scale-95 text-white shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => open()}
            >
              <Plus className="w-4 h-4" />
              Add term
            </button>
            <button
              type="button"
              disabled={loading || busy || !latestYear}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 text-slate-700 dark:text-slate-200 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              onClick={() => {
                setError('');
                setCopying(true);
              }}
            >
              <Copy className="w-4 h-4" />
              Copy to next school year
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:shadow-sm transition-all flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Current School Year</span>
            <span className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {currentYear || 'Not configured'}
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {currentTermObj ? `${semesterLabel(currentTermObj.semester)} Active` : 'No active semester today'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:shadow-sm transition-all flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">School Years Defined</span>
            <span className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {years.length} {years.length === 1 ? 'Year' : 'Years'}
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {terms.length} total semester periods
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:shadow-sm transition-all flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Class Sections</span>
            <span className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5 block">
              {totalClassesCount} {totalClassesCount === 1 ? 'Class' : 'Classes'}
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Linked across all terms
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
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

      {/* 3. Academic Year Cards Grid */}
      {loading ? (
        <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">
          Loading academic terms…
        </div>
      ) : years.length === 0 ? (
        <div className="p-12 text-center text-sm font-medium text-slate-500 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
          No academic terms defined. Add the terms for {currentYear}.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {years.map((year) => {
            const yearTerms = terms.filter((term) => term.schoolYear === year);
            const isCurrentYear = year === currentYear;

            return (
              <div
                key={year}
                className={`min-w-0 rounded-3xl border ${
                  isCurrentYear
                    ? 'border-accent-300/80 dark:border-accent-800/80 bg-accent-50/15 dark:bg-accent-950/10 shadow-sm'
                    : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs'
                } p-5 sm:p-6 space-y-4 hover:border-accent-400/80 transition-all`}
              >
                {/* Year Card Header */}
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                        {year}
                      </h3>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                        {yearTerms.length} {yearTerms.length === 1 ? 'Term' : 'Terms'} configured
                      </span>
                    </div>
                  </div>

                  {isCurrentYear && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-accent-50 text-accent-700 dark:bg-accent-950/60 dark:text-accent-300 border border-accent-200/60 inline-flex items-center gap-1.5 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-600 animate-pulse" />
                      Current S.Y.
                    </span>
                  )}
                </div>

                {/* Semesters List (Tiles) */}
                <div className="space-y-3">
                  {yearTerms.map((term) => {
                    const status = termStatus(term);
                    return (
                      <div
                        key={term.semester}
                        data-testid={`${year}-${term.semester}`}
                        className="rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 p-4 space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm"
                      >
                        {/* Semester Title & Status */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {semesterLabel(term.semester)}
                          </span>
                          {status && (
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide inline-flex items-center gap-1.5 ${status.className}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`} />
                              {status.label}
                            </span>
                          )}
                        </div>

                        {/* Metadata Rows: Dates & Class Counts */}
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{formatDates(term.startDate, term.endDate)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>
                              {term.classCount} {term.classCount === 1 ? 'class' : 'classes'}
                            </span>
                          </div>
                        </div>

                        {/* Actions Row */}
                        <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
                          <button
                            type="button"
                            className={
                              term.id === null
                                ? 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-accent-600 hover:bg-accent-700 text-white shadow-xs hover:shadow-sm transition-all cursor-pointer'
                                : 'px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all cursor-pointer'
                            }
                            disabled={busy}
                            onClick={() => open(term)}
                          >
                            {term.id === null ? 'Set dates' : 'Edit dates'}
                          </button>
                          {term.id !== null && (
                            <button
                              type="button"
                              aria-label="Delete"
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              disabled={busy || term.classCount > 0}
                              title={
                                term.classCount > 0
                                  ? 'A term used by a class cannot be deleted.'
                                  : 'Delete unused term'
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
                    );
                  })}
                </div>
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
        title={draft?.id ? 'Edit academic term' : 'Set academic term dates'}
      >
        {draft && (
          <form
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? 'Edit academic term' : 'Set academic term dates'}
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
                    School year
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
                      {field === 'startDate' ? 'Start date' : 'End date'}
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
        title="Delete unused academic term"
      >
        <div role="dialog" aria-modal="true" aria-label="Delete unused academic term" className="space-y-4">
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
        title="Copy to next school year"
      >
        <div role="dialog" aria-modal="true" aria-label="Copy to next school year" className="space-y-4">
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
