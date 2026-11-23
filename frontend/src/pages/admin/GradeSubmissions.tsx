import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, ClipboardCheck, FileClock, Filter as FilterIcon, Inbox, Search } from 'lucide-react';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import Tabs from '../../components/Tabs';
import { requestConfirmation } from '../../components/FeedbackCenter';
import { useAuth } from '../../context/AuthContext';
import { formatManilaWhen } from '../../services/auditService';
import { formatShortDate } from '../../utils/sessionDate';
import { semesterLabel } from '../../utils/academicTermDefaults';
import { formatSchoolYear } from '../../utils/schoolYear';
import { clearSharedFilters, readSharedFilters, writeSharedCourse } from '../../utils/sharedFilters';
import {
  DeanGradeChangeDetail,
  DeanGradeChangeRequest,
  DeanGradeSubmissionRow,
  GradeDeadlineStatus,
  decideDeanGradeChangeApi,
  getDeanGradeChangeDetailApi,
  getDeanGradeChangeRequestsApi,
  getDeanGradeSubmissionsApi,
} from '../../services/apiClient';

type TabId = 'submissions' | 'changes';
type Term = { id: number; schoolYear: string; semester: string } | null;

const STATUS_CHIP: Record<GradeDeadlineStatus, { label: string; tone: string }> = {
  not_submitted: { label: 'Not submitted', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  late: { label: 'Late', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' },
  submitted: { label: 'Submitted', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  submitted_late: { label: 'Submitted late', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
};

const students = (n: number) => `${n} student${n === 1 ? '' : 's'}`;
const shown = (value: string | number | null | undefined) => value ?? '—';

const fieldBase = 'h-9 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs leading-4 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-accent-500';
const btn = 'rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed';
const approveBtn = `${btn} bg-emerald-600 text-white disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:bg-slate-700 dark:disabled:text-slate-400`;
const rejectBtn = `${btn} border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300`;
const plainBtn = `${btn} border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200`;

const EmptyState: React.FC<{ title: string; onClear?: () => void }> = ({ title, onClear }) => (
  <div className="px-6 py-14 text-center">
    <Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
    <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h3>
    {onClear && <button type="button" onClick={onClear} className={`${plainBtn} mt-3`}>Clear filters</button>}
  </div>
);

/** 13.8: the Dean's Grade Submissions page (read-only for the Superadmin). */
export const GradeSubmissions: React.FC = () => {
  const { user } = useAuth();
  const readOnly = user?.role === 'superadmin';
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>(searchParams.get('tab') === 'changes' ? 'changes' : 'submissions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const sharedCourseAppliedRef = useRef(false);

  const [term, setTerm] = useState<Term>(null);
  const [classes, setClasses] = useState<DeanGradeSubmissionRow[]>([]);
  const [lateFromEarlierTerms, setLateFromEarlierTerms] = useState(0);
  const [query, setQuery] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [status, setStatus] = useState('');

  const [requests, setRequests] = useState<DeanGradeChangeRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [state, setState] = useState<'pending' | 'decided'>('pending');
  const [requestQuery, setRequestQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [details, setDetails] = useState<Record<number, DeanGradeChangeDetail>>({});
  const [rejecting, setRejecting] = useState<DeanGradeChangeRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getDeanGradeSubmissionsApi(), getDeanGradeChangeRequestsApi(state)])
      .then(([submissions, changes]) => {
        if (!active) return;
        setTerm(submissions.term);
        setClasses(submissions.classes ?? []);
        if (!sharedCourseAppliedRef.current) {
          // 14.10: start on the course chosen on another page, when this page has it.
          sharedCourseAppliedRef.current = true;
          const sharedCourse = readSharedFilters(user?.user_id).courseCode;
          if (sharedCourse && sharedCourse !== 'all' && (submissions.classes ?? []).some(row => row.courseCode === sharedCourse)) setCourseCode(sharedCourse);
        }
        setLateFromEarlierTerms(submissions.lateFromEarlierTerms ?? 0);
        setRequests(changes.requests ?? []);
        setPendingCount(changes.pendingCount ?? 0);
        setError(null);
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load grade submissions.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [state, reloadKey]);

  const toggle = useCallback((request: DeanGradeChangeRequest) => {
    const open = !expanded[request.batchId];
    setExpanded(current => ({ ...current, [request.batchId]: open }));
    if (open && !details[request.batchId]) {
      getDeanGradeChangeDetailApi(request.batchId)
        .then(detail => setDetails(current => ({ ...current, [request.batchId]: detail })))
        .catch(err => setError(err instanceof Error ? err.message : 'Could not load the changes.'));
    }
  }, [expanded, details]);

  const finishDecision = (text: string) => {
    setMessage(text);
    setDetails({});
    setReloadKey(key => key + 1);
    window.dispatchEvent(new Event('dentisys:grade-changes-decided'));
  };

  const approve = async (request: DeanGradeChangeRequest) => {
    if (!await requestConfirmation(
      `Approve the grade change for ${request.courseCode} ${request.section}? The grades of ${students(request.studentCount)} change as listed.`,
      'Approve Grade Change',
      'Approve',
    )) return;
    setBusy(true);
    setError(null);
    try {
      const response = await decideDeanGradeChangeApi('approve', request.batchId);
      finishDecision(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision.');
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 8) {
      setRejectReasonError('Give a reason of at least 8 characters.');
      return;
    }
    const target = rejecting;
    setBusy(true);
    setError(null);
    setRejectReasonError('');
    try {
      const response = await decideDeanGradeChangeApi('reject', target.batchId, trimmed);
      setRejecting(null);
      setRejectReason('');
      finishDecision(response.message);
    } catch (err) {
      setRejecting(null);
      setError(err instanceof Error ? err.message : 'Could not save the decision.');
    } finally {
      setBusy(false);
    }
  };

  const courseCodes = [...new Set(classes.map(row => row.courseCode))].sort();
  const needle = query.trim().toLowerCase();
  const filtered = classes.filter(row =>
    (!courseCode || row.courseCode === courseCode)
    && (!status || row.deadlineStatus === status)
    && (!needle || `${row.courseCode} ${row.section} ${row.faculty}`.toLowerCase().includes(needle)));
  const filtersSet = Boolean(query || courseCode || status);
  const clearFilters = () => { setQuery(''); setCourseCode(''); setStatus(''); clearSharedFilters(); };

  const requestNeedle = requestQuery.trim().toLowerCase();
  const shownRequests = requests.filter(request =>
    !requestNeedle || `${request.courseCode} ${request.section} ${request.faculty}`.toLowerCase().includes(requestNeedle));

  if (loading) {
    return <div role="status"><Card className="p-12 text-center text-sm font-semibold text-slate-500">Loading …</Card></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <Tabs
        variant="section"
        color="accent"
        label="Grade submission sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'submissions', label: 'Submissions', icon: <ClipboardCheck className="w-4 h-4" />, count: classes.length },
          { id: 'changes', label: 'Change Requests', shortLabel: 'Changes', icon: <FileClock className="w-4 h-4" />, count: pendingCount },
        ]}
      />

      {tab === 'submissions' && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Submissions{term ? ` · ${semesterLabel(term.semester)} ${formatSchoolYear(term.schoolYear)}` : ''}
          </h2>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
          <p className="text-[11px] text-slate-500">Classes of this term and whether their grades are submitted. Cancelled and Created-by-mistake classes are not listed.</p>
          {lateFromEarlierTerms > 0 && (
            <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {lateFromEarlierTerms} {lateFromEarlierTerms === 1 ? 'class' : 'classes'} from earlier terms {lateFromEarlierTerms === 1 ? 'is' : 'are'} still not submitted.
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
            <div className="relative flex-1 sm:min-w-48">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Search classes"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search class, course or Faculty..."
                className={`w-full pl-9 pr-3 py-2 ${fieldBase}`}
              />
            </div>
            <div className={`sm:flex-1 px-3 py-2 flex items-center gap-2 ${fieldBase} focus-within:border-accent-500`}>
              <FilterIcon className="w-3.5 h-3.5 text-accent-600 dark:text-accent-400 shrink-0" aria-hidden="true" />
              <select
                value={courseCode}
                onChange={event => { setCourseCode(event.target.value); writeSharedCourse(user?.user_id, event.target.value); }}
                aria-label="Course"
                className="min-w-0 flex-1 pr-6 bg-transparent text-xs leading-4 font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="">All courses</option>
                {courseCodes.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <select
              aria-label="Status"
              value={status}
              onChange={event => setStatus(event.target.value)}
              className={`px-3 py-2 ${fieldBase}`}
            >
              <option value="">All statuses</option>
              <option value="not_submitted">Not submitted</option>
              <option value="late">Late</option>
              <option value="submitted">Submitted</option>
              <option value="submitted_late">Submitted late</option>
            </select>
            {filtersSet && <button type="button" onClick={clearFilters} className={plainBtn}>Clear filters</button>}
          </div>
          {classes.length === 0 && <EmptyState title="No classes this term." />}
          {classes.length > 0 && filtered.length === 0 && <EmptyState title="No classes match the filters." onClear={clearFilters} />}
          {filtered.length > 0 && (
            <div className="overflow-x-auto table-pin table-pin-first rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[640px] text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Faculty</th>
                    <th className="px-3 py-2">Deadline</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => {
                    const chip = STATUS_CHIP[row.deadlineStatus];
                    return (
                      <tr key={row.csId} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2"><strong className="whitespace-nowrap text-slate-800 dark:text-slate-100">{row.courseCode} {row.section}</strong></td>
                        <td className="px-3 py-2">{row.faculty}</td>
                        <td className="px-3 py-2">{row.deadline ? formatShortDate(row.deadline) : '—'}</td>
                        <td className="px-3 py-2"><span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-md text-[10px] font-bold ${chip.tone}`}>{chip.label}</span></td>
                        <td className="px-3 py-2">{row.submittedAt ? formatManilaWhen(row.submittedAt) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'changes' && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Change Requests · {pendingCount} waiting</h2>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
          {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{message}</p>}
          <p className="text-[11px] text-slate-500">
            {readOnly
              ? 'Read-only: the Dean approves or rejects grade changes.'
              : 'Sent by Faculty after their grades were submitted. Approving applies the changes; rejecting needs a reason and undoes them.'}
          </p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
            <div className="relative flex-1 sm:min-w-48">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Search requests"
                value={requestQuery}
                onChange={event => setRequestQuery(event.target.value)}
                placeholder="Search class, course or Faculty..."
                className={`w-full pl-9 pr-3 py-2 ${fieldBase}`}
              />
            </div>
            <select
              aria-label="Show requests"
              value={state}
              onChange={event => setState(event.target.value as 'pending' | 'decided')}
              className={`px-3 py-2 ${fieldBase}`}
            >
              <option value="pending">Pending ({pendingCount})</option>
              <option value="decided">Decided</option>
            </select>
            {requestQuery && <button type="button" onClick={() => setRequestQuery('')} className={plainBtn}>Clear filters</button>}
          </div>
          {requests.length === 0 && <EmptyState title={state === 'pending' ? 'Nothing waiting for you.' : 'No decided requests.'} />}
          {requests.length > 0 && shownRequests.length === 0 && <EmptyState title="No requests match the filters." onClear={() => setRequestQuery('')} />}
          <div className="space-y-3">
            {shownRequests.map(request => {
              const open = !!expanded[request.batchId];
              const detail = details[request.batchId];
              return (
                <div key={request.batchId} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`Show changes for ${request.courseCode} ${request.section}`}
                      onClick={() => toggle(request)}
                      className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    </button>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{request.courseCode} {request.section} · {request.faculty}</span>
                    <span className="text-xs text-slate-500">· {students(request.studentCount)}{request.sentAt ? ` · sent ${formatManilaWhen(request.sentAt)}` : ''}</span>
                    <span className="hidden flex-1 sm:block" />
                    {request.status === 'pending' && !readOnly && (
                      <>
                        <button type="button" disabled={busy} onClick={() => void approve(request)} className={approveBtn}>Approve</button>
                        <button type="button" disabled={busy} onClick={() => { setRejectReason(''); setRejectReasonError(''); setRejecting(request); }} className={rejectBtn}>Reject</button>
                      </>
                    )}
                    {request.status !== 'pending' && (
                      <span className="text-xs text-slate-500">{request.status === 'approved' ? 'Approved' : 'Rejected'}{request.decidedAt ? ` · ${formatManilaWhen(request.decidedAt)}` : ''}{request.decisionReason ? ` · ${request.decisionReason}` : ''}</span>
                    )}
                  </div>
                  <p className="px-3 py-2 text-xs text-slate-700 dark:text-slate-200">Reason: {request.reason}</p>
                  {open && !detail && <p className="text-xs text-slate-500 px-3 py-2">Loading …</p>}
                  {open && detail && (
                    <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                      {detail.students.map(student => (
                        <li key={student.studentId} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,2fr)]">
                          <span className="min-w-0"><strong>{student.name}</strong><span className="block text-[11px] text-slate-500 dark:text-slate-400">{student.studentNumber}</span></span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">Grade {shown(student.oldGrade)} → {shown(student.newGrade)}</span>
                          <ul className="space-y-0.5 text-slate-700 dark:text-slate-200">
                            {student.changes.map((change, index) => (
                              <li key={index}>{change.label}: {shown(change.old)} → {shown(change.new)}</li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Modal isOpen={!!rejecting} onClose={() => { if (!busy) { setRejecting(null); setRejectReasonError(''); } }} title="Reject Grade Change" size="sm">
        <div className="space-y-4">
          <div>
            <label htmlFor="grade-change-reject-reason" className="block text-xs font-bold text-slate-700 dark:text-slate-200">Reason (at least 8 characters)</label>
            <textarea
              id="grade-change-reject-reason"
              value={rejectReason}
              onChange={event => { setRejectReason(event.target.value); if (rejectReasonError) setRejectReasonError(''); }}
              aria-invalid={rejectReasonError ? true : undefined}
              aria-describedby={rejectReasonError ? 'err-grade-change-reject-reason' : undefined}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-accent-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
            />
            {rejectReasonError && <p id="err-grade-change-reject-reason" role="alert" className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">{rejectReasonError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => { setRejecting(null); setRejectReasonError(''); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void reject()}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white bg-rose-600 disabled:opacity-50"
            >Reject</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
