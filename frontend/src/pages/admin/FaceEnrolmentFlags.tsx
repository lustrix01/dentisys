import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  MoreVertical,
  ScanFace,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import Tabs from '../../components/Tabs';
import { showFeedback } from '../../components/FeedbackCenter';
import {
  ApiError,
  approveFaceRevokeRequestApi,
  dismissFaceFlagApi,
  getAdminFaceFlagsApi,
  getAdminFaceRevokeRequestsApi,
  getAdminPeopleFiltersApi,
  rejectFaceRevokeRequestApi,
  revokeStudentBiometricApi,
} from '../../services/apiClient';
import type { FaceFlag, FaceRevokeRequest, FaceRevokeRequestStatus, PeopleFilterOptions } from '../../services/apiClient';
import { formatManilaWhen } from '../../services/auditService';
import { semesterLabel } from '../../utils/academicTermDefaults';
import { formatSchoolYear } from '../../utils/schoolYear';
import { REVOKE_FACE_BULLETS } from './peopleHelpers';
import {
  FLAG_KIND_LABEL,
  FLAG_STATUS_LABEL,
  REVOKE_STATUS_LABEL,
  flagActions,
  flagClasses,
  flagClosedLine,
  flagDetails,
  requestClasses,
  requestReviewedLine,
  revokeRequestActions,
} from './faceFlagHelpers';
import type { FlagAction, RevokeRequestAction } from './faceFlagHelpers';

// Backlog 12.2 & 12.9 (docs/contracts/face-revoke-approval.md). Page parts copied from PeopleAndAccounts.tsx:
// Tabs section bar, notice banner, filter row, pinned table and phone cards, row menu, reason dialog, paging, empty and error states.
type PageTab = 'requests' | 'flags';
type FlagStatusFilter = 'open' | 'dismissed' | 'revoked' | 'all';
type KindFilter = 'all' | FaceFlag['kind'];
type RequestStatusFilter = FaceRevokeRequestStatus | 'all';

const PAGE_SIZE = 50;
const filterClass = 'min-h-10 w-full min-w-36 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const cancelButton = 'min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer';
const menuItem = 'w-full px-3 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-colors cursor-pointer';

type FlagActionInfo = { label: string; Icon: LucideIcon; destructive?: boolean; title: string; confirm: string; field: string; bullets: string[] };
const FLAG_ACTIONS: Record<FlagAction, FlagActionInfo> = {
  dismiss: { label: 'Dismiss', Icon: CheckCircle2, title: 'Dismiss Flag', confirm: 'Dismiss flag', field: 'Note (8 to 240 characters)', bullets: ['The flag is closed. Nothing changes for the Student, who is never told about flags.'] },
  'revoke-face': { label: 'Revoke face enrollment', Icon: ScanFace, destructive: true, title: 'Revoke Face Enrollment', confirm: 'Revoke enrollment', field: 'Reason (8 to 240 characters)', bullets: REVOKE_FACE_BULLETS },
  'open-people': { label: 'Open in People & Accounts', Icon: UsersRound, title: '', confirm: '', field: '', bullets: [] },
};

type RequestActionInfo = { label: string; Icon: LucideIcon; destructive?: boolean };
const REQUEST_ACTIONS: Record<RevokeRequestAction, RequestActionInfo> = {
  approve: { label: 'Approve & delete face', Icon: CheckCircle2 },
  reject: { label: 'Reject', Icon: XCircle, destructive: true },
  'open-people': { label: 'Open in People & Accounts', Icon: UsersRound },
};

export const FaceEnrolmentFlags: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: PageTab = searchParams.get('tab') === 'flags' ? 'flags' : 'requests';

  const [options, setOptions] = useState<PeopleFilterOptions>({ courses: [], classes: [] });
  useEffect(() => { getAdminPeopleFiltersApi().then(setOptions).catch(() => undefined); }, []);

  // Shared badge counts across both tabs
  const [pendingCount, setPendingCount] = useState(0);
  const [openFlagsCount, setOpenFlagsCount] = useState(0);

  // --- REVOKE REQUESTS STATE ---
  const [reqSearch, setReqSearch] = useState('');
  const [reqQ, setReqQ] = useState('');
  const [reqStatus, setReqStatus] = useState<RequestStatusFilter>('pending');
  const [reqCourseId, setReqCourseId] = useState(0);
  const [reqClassId, setReqClassId] = useState(0);
  const [reqPage, setReqPage] = useState(1);
  const [requests, setRequests] = useState<FaceRevokeRequest[]>([]);
  const [reqTotal, setReqTotal] = useState(0);
  const [reqLoading, setReqLoading] = useState(true);
  const [reqError, setReqError] = useState('');
  const [reqTarget, setReqTarget] = useState<FaceRevokeRequest | null>(null);
  const [reqModalAction, setReqModalAction] = useState<'approve' | 'reject'>('approve');
  const [reqNote, setReqNote] = useState('');
  const [reqNoteError, setReqNoteError] = useState('');
  const [reqBusy, setReqBusy] = useState(false);
  const reqLatest = useRef(0);

  // --- FLAGS STATE ---
  const [flagSearch, setFlagSearch] = useState('');
  const [flagQ, setFlagQ] = useState('');
  const [flagStatus, setFlagStatus] = useState<FlagStatusFilter>('open');
  const [flagKind, setFlagKind] = useState<KindFilter>('all');
  const [flagCourseId, setFlagCourseId] = useState(0);
  const [flagClassId, setFlagClassId] = useState(0);
  const [flagPage, setFlagPage] = useState(1);
  const [flags, setFlags] = useState<FaceFlag[]>([]);
  const [flagTotal, setFlagTotal] = useState(0);
  const [flagLoading, setFlagLoading] = useState(true);
  const [flagError, setFlagError] = useState('');
  const [flagTarget, setFlagTarget] = useState<FaceFlag | null>(null);
  const [flagAction, setFlagAction] = useState<FlagAction>('dismiss');
  const [flagNote, setFlagNote] = useState('');
  const [flagNoteError, setFlagNoteError] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);
  const flagLatest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setReqQ(reqSearch.trim()); setReqPage(1); }, 300);
    return () => clearTimeout(t);
  }, [reqSearch]);

  useEffect(() => {
    const t = setTimeout(() => { setFlagQ(flagSearch.trim()); setFlagPage(1); }, 300);
    return () => clearTimeout(t);
  }, [flagSearch]);

  const refreshOpenFlagsCount = () => {
    getAdminFaceFlagsApi({ status: 'open', page: 1 })
      .then(r => setOpenFlagsCount(r.openCount ?? r.total))
      .catch(() => undefined);
  };

  const refreshPendingRequestsCount = () => {
    getAdminFaceRevokeRequestsApi({ status: 'pending', page: 1 })
      .then(r => setPendingCount(r.pendingCount))
      .catch(() => undefined);
  };

  // Seed badge counts on initial mount for the inactive tab
  useEffect(() => {
    if (activeTab === 'requests') refreshOpenFlagsCount();
    else refreshPendingRequestsCount();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRequests = () => {
    const ticket = ++reqLatest.current;
    setReqLoading(true);
    setReqError('');
    getAdminFaceRevokeRequestsApi({
      status: reqStatus,
      q: reqQ || undefined,
      courseId: reqCourseId || undefined,
      classId: reqClassId || undefined,
      page: reqPage,
    })
      .then(r => {
        if (ticket !== reqLatest.current) return;
        setRequests(r.requests);
        setReqTotal(r.total);
        setPendingCount(r.pendingCount);
      })
      .catch(err => {
        if (ticket === reqLatest.current) {
          setReqError(err instanceof Error ? err.message : 'Could not load face revocation requests. Select Retry.');
        }
      })
      .finally(() => {
        if (ticket === reqLatest.current) setReqLoading(false);
      });
  };

  const loadFlags = () => {
    const ticket = ++flagLatest.current;
    setFlagLoading(true);
    setFlagError('');
    getAdminFaceFlagsApi({
      status: flagStatus,
      kind: flagKind === 'all' ? undefined : flagKind,
      q: flagQ || undefined,
      courseId: flagCourseId || undefined,
      classId: flagClassId || undefined,
      page: flagPage,
    })
      .then(r => {
        if (ticket !== flagLatest.current) return;
        setFlags(r.flags);
        setFlagTotal(r.total);
        if (typeof r.openCount === 'number') setOpenFlagsCount(r.openCount);
        else if (flagStatus === 'open') setOpenFlagsCount(r.total);
      })
      .catch(err => {
        if (ticket === flagLatest.current) {
          setFlagError(err instanceof Error ? err.message : 'Could not load face enrolment flags. Select Retry.');
        }
      })
      .finally(() => {
        if (ticket === flagLatest.current) setFlagLoading(false);
      });
  };

  useEffect(() => {
    if (activeTab === 'requests') loadRequests();
  }, [activeTab, reqStatus, reqQ, reqPage, reqCourseId, reqClassId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'flags') loadFlags();
  }, [activeTab, flagStatus, flagKind, flagQ, flagPage, flagCourseId, flagClassId]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (next: PageTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  // --- REVOKE REQUEST HANDLERS ---
  const clearRequestFilters = () => {
    setReqSearch(''); setReqQ(''); setReqStatus('pending'); setReqCourseId(0); setReqClassId(0); setReqPage(1);
  };
  const reqTotalPages = Math.max(1, Math.ceil(reqTotal / PAGE_SIZE));
  const reqClassOptions = options.classes.filter(c => !reqCourseId || c.courseId === reqCourseId);

  const selectRequestAction = (req: FaceRevokeRequest, next: RevokeRequestAction) => {
    if (next === 'open-people') { navigate('/superadmin/people?kind=student'); return; }
    setReqNote('');
    setReqNoteError('');
    setReqModalAction(next);
    setReqTarget(req);
  };

  const closeRequestModal = () => { if (!reqBusy) setReqTarget(null); };

  const confirmRequestAction = async () => {
    if (!reqTarget) return;
    const text = reqNote.trim();
    if (reqModalAction === 'reject') {
      if (text.length < 8 || text.length > 240) {
        setReqNoteError('Enter a reason of 8 to 240 characters.');
        return;
      }
    } else if (text.length > 0 && (text.length < 8 || text.length > 240)) {
      setReqNoteError('Enter a note of 8 to 240 characters, or leave blank.');
      return;
    }

    setReqBusy(true);
    try {
      if (reqModalAction === 'approve') {
        const res = await approveFaceRevokeRequestApi(reqTarget.requestId, text || undefined);
        showFeedback(
          res.flagged
            ? `${reqTarget.student.name}: face revocation approved and face deleted. Repeated-revocations flag (F3) raised.`
            : `${reqTarget.student.name}: face revocation approved and face deleted.`,
          'success'
        );
        refreshOpenFlagsCount();
      } else {
        await rejectFaceRevokeRequestApi(reqTarget.requestId, text);
        showFeedback(`${reqTarget.student.name}: revocation request rejected.`, 'success');
      }
      setReqTarget(null);
      loadRequests();
    } catch (err) {
      const list = err instanceof ApiError && Array.isArray(err.errors)
        ? (err.errors as Array<{ field: string; message: string }>)
        : [];
      if (err instanceof ApiError && err.status === 422 && list.length > 0) {
        setReqNoteError(list[0].message);
      } else {
        setReqTarget(null);
        showFeedback(err instanceof Error ? err.message : 'Could not update the revocation request. Try again.', 'error');
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) loadRequests();
      }
    } finally {
      setReqBusy(false);
    }
  };

  // --- FLAGS HANDLERS ---
  const clearFlagFilters = () => {
    setFlagSearch(''); setFlagQ(''); setFlagStatus('open'); setFlagKind('all'); setFlagCourseId(0); setFlagClassId(0); setFlagPage(1);
  };
  const flagTotalPages = Math.max(1, Math.ceil(flagTotal / PAGE_SIZE));
  const flagClassOptions = options.classes.filter(c => !flagCourseId || c.courseId === flagCourseId);

  const selectFlagAction = (flag: FaceFlag, next: FlagAction) => {
    if (next === 'open-people') { navigate('/superadmin/people?kind=student'); return; }
    setFlagNote('');
    setFlagNoteError('');
    setFlagAction(next);
    setFlagTarget(flag);
  };

  const closeFlagModal = () => { if (!flagBusy) setFlagTarget(null); };

  const confirmFlagAction = async () => {
    if (!flagTarget) return;
    const text = flagNote.trim();
    if (text.length < 8 || text.length > 240) { setFlagNoteError('Enter a note of 8 to 240 characters.'); return; }
    setFlagBusy(true);
    try {
      if (flagAction === 'dismiss') {
        await dismissFaceFlagApi(flagTarget.flagId, text);
      } else {
        await revokeStudentBiometricApi(String(flagTarget.student.studentId), text);
        refreshPendingRequestsCount();
      }
      showFeedback(`${flagTarget.student.name}: ${flagAction === 'dismiss' ? 'flag dismissed' : 'face enrollment revoked'}.`, 'success');
      setFlagTarget(null);
      loadFlags();
    } catch (err) {
      const list = err instanceof ApiError && Array.isArray(err.errors) ? (err.errors as Array<{ field: string; message: string }>) : [];
      if (err instanceof ApiError && err.status === 422 && list.length > 0) setFlagNoteError(list[0].message);
      else {
        setFlagTarget(null);
        showFeedback(err instanceof Error ? err.message : 'Could not update the flag. Try again.', 'error');
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) loadFlags();
      }
    } finally {
      setFlagBusy(false);
    }
  };

  const flagInfo = FLAG_ACTIONS[flagAction];

  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <Tabs
        variant="section"
        color="accent"
        label="Face Enrolments sections"
        value={activeTab}
        onChange={switchTab}
        tabs={[
          {
            id: 'requests',
            label: 'Revoke Requests',
            shortLabel: 'Requests',
            count: pendingCount,
            countTone: pendingCount > 0 ? 'amber' : undefined,
          },
          {
            id: 'flags',
            label: 'Flags',
            shortLabel: 'Flags',
            count: openFlagsCount,
            countTone: openFlagsCount > 0 ? 'amber' : undefined,
          },
        ]}
      />

      {activeTab === 'requests' ? (
        <div className="space-y-6">
          <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
            Showing <b className="text-slate-800 dark:text-slate-100">{requests.length}</b> of {reqTotal} {reqTotal === 1 ? 'request' : 'requests'}
          </p>

          <ListToolbar
            left={(
              <>
                <SearchField value={reqSearch} onChange={setReqSearch} placeholder="Search Students…" ariaLabel="Search name or Student number" color="accent" />
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Status</span>
                  <select aria-label="Status" value={reqStatus} onChange={event => { setReqStatus(event.target.value as RequestStatusFilter); setReqPage(1); }} className={filterClass}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="all">All</option>
                  </select>
                </label>
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Course</span>
                  <select aria-label="Course" value={reqCourseId} onChange={event => {
                    const next = Number(event.target.value);
                    setReqCourseId(next);
                    if (next && reqClassId && !options.classes.some(c => c.csId === reqClassId && c.courseId === next)) setReqClassId(0);
                    setReqPage(1);
                  }} className={filterClass}>
                    <option value={0}>All courses</option>
                    {options.courses.map(c => <option key={c.id} value={c.id}>{c.courseCode} · {c.name}</option>)}
                  </select>
                </label>
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Class section</span>
                  <select aria-label="Class section" value={reqClassId} onChange={event => { setReqClassId(Number(event.target.value)); setReqPage(1); }} className={filterClass}>
                    <option value={0}>All class sections</option>
                    {reqClassOptions.map(c => <option key={c.csId} value={c.csId}>{c.label}</option>)}
                  </select>
                </label>
                <button type="button" onClick={clearRequestFilters} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40 cursor-pointer">Clear filters</button>
              </>
            )}
          />

          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
            <p>Students submit a revocation request with a reason for Superadmin review. Their existing face stays active for check-in until you approve and permanently delete it.</p>
          </div>

          {reqError && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
              <span className="break-words">{reqError}</span>
              <button type="button" onClick={loadRequests} className="min-h-[44px] font-bold underline cursor-pointer">Retry</button>
            </div>
          )}

          <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {reqLoading ? (
              <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading face revocation requests…</div>
            ) : requests.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No face revocation requests.</h3>
                {(reqSearch || reqStatus !== 'pending' || reqCourseId !== 0 || reqClassId !== 0) && (
                  <button type="button" onClick={clearRequestFilters} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40 cursor-pointer"><X className="h-3.5 w-3.5" /> Clear filters</button>
                )}
              </div>
            ) : (
              <>
                <div className="table-pin table-pin-first max-sm:hidden">
                  <table className="w-full min-w-[920px] text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                      <tr>
                        <th scope="col" className="px-5 py-3.5">Student</th>
                        <th scope="col" className="px-4 py-3.5">Reason</th>
                        <th scope="col" className="px-4 py-3.5">Approved This Term</th>
                        <th scope="col" className="px-4 py-3.5">Classes</th>
                        <th scope="col" className="px-4 py-3.5">Status</th>
                        <th scope="col" className="px-4 py-3.5">Requested</th>
                        <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {requests.map(req => {
                        const items = revokeRequestActions(req).map(key => ({ key, ...REQUEST_ACTIONS[key] }));
                        return (
                          <tr key={req.requestId} className="align-middle hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="px-5 py-4">
                              <div className="font-bold text-slate-800 dark:text-slate-100">{req.student.name}</div>
                              <div className="text-slate-500 dark:text-slate-400">{req.student.studentNo}</div>
                            </td>
                            <td className="max-w-xs px-4 py-4 break-words text-slate-700 dark:text-slate-200">{req.reason}</td>
                            <td className="whitespace-nowrap px-4 py-4 text-slate-600 dark:text-slate-300">
                              <span className={req.approvedThisTermCount >= 2 ? 'font-bold text-amber-700 dark:text-amber-300' : ''}>
                                {req.approvedThisTermCount} this term
                              </span>
                            </td>
                            <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{requestClasses(req)}</td>
                            <td className="px-4 py-4">
                              <RequestStatusPill req={req} />
                              <RequestReviewedLine req={req} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-slate-500 dark:text-slate-400">{formatManilaWhen(req.createdAt)}</td>
                            <td className="px-4 py-4 text-right">
                              <RowMenu studentName={req.student.name} items={items} onSelect={next => selectRequestAction(req, next)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 p-3 sm:hidden">
                  {requests.map(req => {
                    const items = revokeRequestActions(req).map(key => ({ key, ...REQUEST_ACTIONS[key] }));
                    return (
                      <article key={req.requestId} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300">
                              <UserRound className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <h3 className="break-words text-sm font-bold text-slate-800 dark:text-slate-100">{req.student.name}</h3>
                              <p className="break-words text-xs text-slate-500 dark:text-slate-400">{req.student.studentNo}</p>
                            </div>
                          </div>
                          <RowMenu studentName={req.student.name} items={items} onSelect={next => selectRequestAction(req, next)} />
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <div className="col-span-2">
                            <dt className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Reason</dt>
                            <dd className="mt-1 break-words text-xs text-slate-700 dark:text-slate-300">{req.reason}</dd>
                          </div>
                          <Item label="Approved this term">{req.approvedThisTermCount} this term</Item>
                          <Item label="Status"><RequestStatusPill req={req} /><RequestReviewedLine req={req} /></Item>
                          <Item label="Classes">{requestClasses(req)}</Item>
                          <Item label="Requested">{formatManilaWhen(req.createdAt)}</Item>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {reqTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Page {reqPage} of {reqTotalPages}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setReqPage(p => Math.max(1, p - 1))} disabled={reqPage === 1 || reqLoading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800 cursor-pointer">Previous</button>
                <button type="button" onClick={() => setReqPage(p => Math.min(reqTotalPages, p + 1))} disabled={reqPage >= reqTotalPages || reqLoading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800 cursor-pointer">Next</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
            Showing <b className="text-slate-800 dark:text-slate-100">{flags.length}</b> of {flagTotal} {flagTotal === 1 ? 'flag' : 'flags'}
          </p>

          <ListToolbar
            left={(
              <>
                <SearchField value={flagSearch} onChange={setFlagSearch} placeholder="Search Students…" ariaLabel="Search name or Student number" color="accent" />
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Status</span>
                  <select aria-label="Status" value={flagStatus} onChange={event => { setFlagStatus(event.target.value as FlagStatusFilter); setFlagPage(1); }} className={filterClass}>
                    <option value="open">Open</option>
                    <option value="dismissed">Dismissed</option>
                    <option value="revoked">Revoked</option>
                    <option value="all">All</option>
                  </select>
                </label>
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Flag</span>
                  <select aria-label="Flag" value={flagKind} onChange={event => { setFlagKind(event.target.value as KindFilter); setFlagPage(1); }} className={filterClass}>
                    <option value="all">All flags</option>
                    <option value="F3">{FLAG_KIND_LABEL.F3}</option>
                    <option value="F2">{FLAG_KIND_LABEL.F2}</option>
                    <option value="F1">{FLAG_KIND_LABEL.F1}</option>
                  </select>
                </label>
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Course</span>
                  <select aria-label="Course" value={flagCourseId} onChange={event => {
                    const next = Number(event.target.value);
                    setFlagCourseId(next);
                    if (next && flagClassId && !options.classes.some(c => c.csId === flagClassId && c.courseId === next)) setFlagClassId(0);
                    setFlagPage(1);
                  }} className={filterClass}>
                    <option value={0}>All courses</option>
                    {options.courses.map(c => <option key={c.id} value={c.id}>{c.courseCode} · {c.name}</option>)}
                  </select>
                </label>
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Class section</span>
                  <select aria-label="Class section" value={flagClassId} onChange={event => { setFlagClassId(Number(event.target.value)); setFlagPage(1); }} className={filterClass}>
                    <option value={0}>All class sections</option>
                    {flagClassOptions.map(c => <option key={c.csId} value={c.csId}>{c.label}</option>)}
                  </select>
                </label>
                <button type="button" onClick={clearFlagFilters} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40 cursor-pointer">Clear filters</button>
              </>
            )}
          />

          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
            <p>Non-matching face updates are automatically blocked and flagged, and 3 or more approved Student revocations in a term are flagged. You decide whether to act; Students are never told about flags.</p>
          </div>

          {flagError && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
              <span className="break-words">{flagError}</span>
              <button type="button" onClick={loadFlags} className="min-h-[44px] font-bold underline cursor-pointer">Retry</button>
            </div>
          )}

          <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {flagLoading ? (
              <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading face enrolment flags…</div>
            ) : flags.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No face enrolment flags.</h3>
                {(flagSearch || flagStatus !== 'open' || flagKind !== 'all' || flagCourseId !== 0 || flagClassId !== 0) && (
                  <button type="button" onClick={clearFlagFilters} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40 cursor-pointer"><X className="h-3.5 w-3.5" /> Clear filters</button>
                )}
              </div>
            ) : (
              <>
                <div className="table-pin table-pin-first max-sm:hidden">
                  <table className="w-full min-w-[880px] text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                      <tr>
                        <th scope="col" className="px-5 py-3.5">Student</th>
                        <th scope="col" className="px-4 py-3.5">Flag</th>
                        <th scope="col" className="px-4 py-3.5">Details</th>
                        <th scope="col" className="px-4 py-3.5">Classes</th>
                        <th scope="col" className="px-4 py-3.5">Status</th>
                        <th scope="col" className="px-4 py-3.5">Flagged</th>
                        <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {flags.map(flag => {
                        const items = flagActions(flag).map(key => ({ key, ...FLAG_ACTIONS[key] }));
                        return (
                          <tr key={flag.flagId} className="align-middle hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="px-5 py-4"><div className="font-bold text-slate-800 dark:text-slate-100">{flag.student.name}</div><div className="text-slate-500 dark:text-slate-400">{flag.student.studentNo}</div></td>
                            <td className="px-4 py-4 text-slate-700 dark:text-slate-200">{FLAG_KIND_LABEL[flag.kind]}</td>
                            <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{flagDetails(flag)}</td>
                            <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{flagClasses(flag)}</td>
                            <td className="px-4 py-4"><FlagStatusPill flag={flag} /><FlagClosedLine flag={flag} /></td>
                            <td className="whitespace-nowrap px-4 py-4 text-slate-500 dark:text-slate-400">{formatManilaWhen(flag.updatedAt)}</td>
                            <td className="px-4 py-4 text-right"><RowMenu studentName={flag.student.name} items={items} onSelect={next => selectFlagAction(flag, next)} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 p-3 sm:hidden">
                  {flags.map(flag => {
                    const items = flagActions(flag).map(key => ({ key, ...FLAG_ACTIONS[key] }));
                    return (
                      <article key={flag.flagId} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><h3 className="break-words text-sm font-bold text-slate-800 dark:text-slate-100">{flag.student.name}</h3><p className="break-words text-xs text-slate-500 dark:text-slate-400">{flag.student.studentNo}</p></div></div>
                          <RowMenu studentName={flag.student.name} items={items} onSelect={next => selectFlagAction(flag, next)} />
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <Item label="Flag">{FLAG_KIND_LABEL[flag.kind]}</Item>
                          <Item label="Status"><FlagStatusPill flag={flag} /><FlagClosedLine flag={flag} /></Item>
                          <Item label="Details">{flagDetails(flag)}</Item>
                          <Item label="Classes">{flagClasses(flag)}</Item>
                          <Item label="Flagged">{formatManilaWhen(flag.updatedAt)}</Item>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {flagTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Page {flagPage} of {flagTotalPages}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setFlagPage(p => Math.max(1, p - 1))} disabled={flagPage === 1 || flagLoading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800 cursor-pointer">Previous</button>
                <button type="button" onClick={() => setFlagPage(p => Math.min(flagTotalPages, p + 1))} disabled={flagPage >= flagTotalPages || flagLoading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800 cursor-pointer">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REVOKE REQUEST APPROVE / REJECT MODAL */}
      <Modal
        isOpen={Boolean(reqTarget)}
        onClose={closeRequestModal}
        title={reqModalAction === 'approve' ? 'Approve Face Revocation' : 'Reject Revocation Request'}
        size="sm"
      >
        {reqTarget && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{reqTarget.student.name}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {reqTarget.student.studentNo} · {semesterLabel(reqTarget.semester)} · {formatSchoolYear(reqTarget.schoolYear)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Student Reason</span>
              <p className="mt-1 break-words leading-relaxed">{reqTarget.reason}</p>
            </div>

            {reqModalAction === 'approve' ? (
              <>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Approved revocations this term: <b className="text-slate-800 dark:text-slate-100">{reqTarget.approvedThisTermCount}</b>
                </div>
                {reqTarget.approvedThisTermCount >= 2 && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Approving this request makes {reqTarget.approvedThisTermCount + 1} approved revocations this term and will raise a repeated-revocations flag (F3).</p>
                  </div>
                )}
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>Their encrypted face reference is permanently deleted; they must re-enroll to use face check-in.</li>
                  <li>Manual attendance stays available.</li>
                  <li>They receive an in-app notification confirming deletion.</li>
                </ul>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Note (optional, 8 to 240 characters)
                  <textarea
                    rows={3}
                    maxLength={240}
                    value={reqNote}
                    onChange={event => { setReqNote(event.target.value); setReqNoteError(''); }}
                    aria-invalid={reqNoteError ? true : undefined}
                    className={inputClass}
                  />
                  {reqNoteError && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">{reqNoteError}</span>}
                </label>
              </>
            ) : (
              <>
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>Their face registration stays active for attendance check-in.</li>
                  <li>They receive an in-app notification with your reason and may submit a new request.</li>
                </ul>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Reason (at least 8 characters)
                  <textarea
                    rows={3}
                    maxLength={240}
                    value={reqNote}
                    onChange={event => { setReqNote(event.target.value); setReqNoteError(''); }}
                    aria-invalid={reqNoteError ? true : undefined}
                    className={inputClass}
                  />
                  {reqNoteError && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">{reqNoteError}</span>}
                </label>
              </>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" disabled={reqBusy} onClick={closeRequestModal} className={cancelButton}>Cancel</button>
              <button
                type="button"
                disabled={reqBusy}
                onClick={() => void confirmRequestAction()}
                className={`min-h-11 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50 cursor-pointer ${reqModalAction === 'approve' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-accent-600 hover:bg-accent-700'}`}
              >
                {reqModalAction === 'approve' ? 'Approve & delete face' : 'Reject request'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* FLAG DISMISS / REVOKE MODAL */}
      <Modal isOpen={Boolean(flagTarget)} onClose={closeFlagModal} title={flagInfo.title} size="sm">
        {flagTarget && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{flagTarget.student.name}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{flagTarget.student.studentNo} · {FLAG_KIND_LABEL[flagTarget.kind]}</p>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{flagInfo.bullets.map(b => <li key={b}>{b}</li>)}</ul>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">{flagInfo.field}
              <input maxLength={240} value={flagNote} onChange={event => { setFlagNote(event.target.value); setFlagNoteError(''); }} className={inputClass} />
              {flagNoteError && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">{flagNoteError}</span>}
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" disabled={flagBusy} onClick={closeFlagModal} className={cancelButton}>Cancel</button>
              <button type="button" disabled={flagBusy} onClick={() => void confirmFlagAction()} className={`min-h-11 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50 cursor-pointer ${flagInfo.destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-accent-600 hover:bg-accent-700'}`}>{flagInfo.confirm}</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};

function RequestStatusPill({ req }: { req: FaceRevokeRequest }) {
  const Icon = req.status === 'pending' ? CircleAlert : req.status === 'rejected' ? XCircle : CheckCircle2;
  const tone = req.status === 'pending'
    ? 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20'
    : req.status === 'approved'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20'
      : req.status === 'rejected'
        ? 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-400/20'
        : 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${tone}`}>
      <Icon className="h-3 w-3" />
      {REVOKE_STATUS_LABEL[req.status]}
    </span>
  );
}

function RequestReviewedLine({ req }: { req: FaceRevokeRequest }) {
  const line = requestReviewedLine(req);
  return line ? <p className="mt-1 max-w-56 break-words text-[11px] text-slate-500 dark:text-slate-400">{line}</p> : null;
}

function FlagStatusPill({ flag }: { flag: FaceFlag }) {
  const Icon = flag.status === 'open' ? CircleAlert : CheckCircle2;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${flag.status === 'open'
    ? 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20'
    : flag.status === 'revoked'
      ? 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-400/20'
      : 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20'}`}><Icon className="h-3 w-3" />{FLAG_STATUS_LABEL[flag.status]}</span>;
}

function FlagClosedLine({ flag }: { flag: FaceFlag }) {
  const line = flagClosedLine(flag);
  return line ? <p className="mt-1 max-w-56 break-words text-[11px] text-slate-500 dark:text-slate-400">{line}</p> : null;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{children}</dd></div>;
}

/** Row menu copied from RowMenu in PeopleAndAccounts.tsx. */
function RowMenu<TAction extends string>({
  studentName,
  items,
  onSelect,
}: {
  studentName: string;
  items: Array<{ key: TAction; label: string; Icon: LucideIcon; destructive?: boolean }>;
  onSelect: (action: TAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // the document listener added on open must not see this click
          if (open) { setOpen(false); return; }
          const r = e.currentTarget.getBoundingClientRect();
          const right = window.innerWidth - r.right;
          setPos(window.innerHeight - r.bottom < 250 && r.top > window.innerHeight - r.bottom
            ? { bottom: window.innerHeight - r.top + 6, right }
            : { top: r.bottom + 6, right });
          setOpen(true);
        }}
        className={`inline-flex min-h-10 items-center justify-center rounded-lg border p-2 transition-all cursor-pointer ${open
          ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white'
          : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
        title="Actions"
        aria-label={`Actions for ${studentName}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && pos && createPortal(
        <div role="menu" style={pos} onClick={(e) => e.stopPropagation()} className="fixed w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 py-1.5 z-[60] text-xs text-left">
          {items.map(({ key, Icon, label, destructive }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSelect(key); }}
              className={destructive ? menuItem.replace('text-slate-700 dark:text-slate-200', 'text-rose-600 dark:text-rose-400') : menuItem}
            >
              <Icon className={`h-3.5 w-3.5 ${destructive ? '' : 'text-accent-500'}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
