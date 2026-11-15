import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleAlert, Download, KeyRound, LogOut, Mail, MailPlus, MoreVertical, PenLine, RotateCcw, ScanFace, Search, Send, ShieldCheck, UserRound, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError, deactivatePersonApi, editPersonNameApi, getAdminPeopleApi, getAdminPeopleFiltersApi, movePersonEmailApi, reactivatePersonApi, resendInvitationApi,
  resetPersonTwoFactorApi, revokeInvitationApi, revokeStudentBiometricApi, signOutPersonApi,
} from '../../services/apiClient';
import type { AdminPerson, PeopleFilterOptions, PersonClass } from '../../services/apiClient';
import { formatManilaWhen } from '../../services/auditService';
import { downloadXlsx } from '../../utils/xlsxDownload';
import { buildReportSheet } from '../../utils/reportWorkbook';
import { ATTENTION_OPTIONS, DEFAULT_PEOPLE_SORT, PEOPLE_EXPORT_HEADERS, REVOKE_FACE_BULLETS, attentionFromUrl, attentionParams, classesOf, emailParts, lastActivityText, peopleExportRow, personActions, statusLabel, yearLevelLabel } from './peopleHelpers';
import type { Attention, PeopleSortKey, PersonAction } from './peopleHelpers';
import { PersonNameFields, composePersonName, emptyNameParts } from '../../components/PersonNameFields';
import type { PersonNameParts } from '../../components/PersonNameFields';
import { validateBicolUEmail } from '../../services/authService';
import { SortableHeader, ariaSort } from '../../components/SortableHeader';
import type { SortState } from '../../components/SortableHeader';

// ADM-001 Part C (docs/contracts/superadmin.md): the Dean lists Faculty and Students and manages their accounts
// in Superadmin mode. Page parts copied from the earlier preview (tabs, filter row, table, phone blocks);
// the row menu is copied from the student row menu in pages/faculty/ClassesAndRosters.tsx.
type Kind = 'faculty' | 'student';
type StatusFilter = 'all' | 'active' | 'deactivated' | 'invited';
type Blocked = { message: string; classes: PersonClass[] };

const PAGE_SIZE = 50;
const EXPORT_PAGE_CAP = 200;
const filterClass = 'min-h-10 w-full min-w-36 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const cancelButton = 'min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
const menuItem = 'w-full px-3 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-colors cursor-pointer';
const kindLabel: Record<Kind, string> = { faculty: 'Faculty', student: 'Students' };
const sentence = (name: string, n: number) => `${name} teaches ${n} ${n === 1 ? 'class' : 'classes'} this school year. Reassign or archive them first.`;

type ActionInfo = { label: string; Icon: LucideIcon; destructive?: boolean; title: string; confirm: string; reason: 'none' | 'optional' | 'required'; bullets: (p: AdminPerson) => string[]; done: string };
const EMAIL_DOMAIN = 'bicol-u.edu.ph'; // spec UI-001: email-entry controls default to the college domain
const fullEmail = (value: string) => { const v = value.trim(); return !v || v.includes('@') ? v : `${v}@${EMAIL_DOMAIN}`; };
const ACTIONS: Record<PersonAction, ActionInfo> = {
  'edit-name': { label: 'Edit name', Icon: PenLine, title: 'Edit Name', confirm: 'Save name', reason: 'required', done: 'name updated', bullets: () => [] },
  'move-email': { label: 'Move to new email', Icon: MailPlus, title: 'Move to New Email', confirm: 'Move email', reason: 'required', done: 'moved to a new email', destructive: false,
    bullets: () => ['Signed out on every device now; their password, 2FA and Google link are removed.', 'A link to set a new password goes to the new address only. Nothing is sent to the old address.', 'Records, classes and enrollments are kept.'] },
  'sign-out': { label: 'Sign out everywhere', Icon: LogOut, title: 'Sign Out Everywhere', confirm: 'Sign out everywhere', reason: 'optional', done: 'signed out everywhere',
    bullets: () => ['Signed out on every device now. The account stays active; they can sign in again right away.'] },
  'reset-2fa': { label: 'Reset 2FA', Icon: KeyRound, title: 'Reset 2FA', confirm: 'Reset 2FA', reason: 'optional', done: '2FA reset',
    bullets: () => ['Their authenticator and recovery codes are removed.', 'Signed out on every device now.', 'They get an email; next sign-in is with their password only, and they can set up 2FA again in their profile.'] },
  'revoke-face': { label: 'Revoke face enrollment', Icon: ScanFace, destructive: true, title: 'Revoke Face Enrollment', confirm: 'Revoke enrollment', reason: 'required', done: 'face enrollment revoked',
    bullets: () => REVOKE_FACE_BULLETS },
  deactivate: { label: 'Deactivate', Icon: CircleAlert, destructive: true, title: 'Deactivate Account', confirm: 'Deactivate account', reason: 'optional', done: 'deactivated',
    bullets: p => ['Signed out on every device now, and sign-in is refused until you reactivate.', 'Records, classes and enrollments are kept.', ...(p.kind === 'student' ? ['If this Student is a Class Secretary, the Secretary sign-in is blocked too.'] : [])] },
  reactivate: { label: 'Reactivate', Icon: RotateCcw, title: 'Reactivate Account', confirm: 'Reactivate account', reason: 'none', done: 'reactivated',
    bullets: p => [`The person can sign in again with their existing password and 2FA. ${p.kind === 'student' ? 'A linked Class Secretary sign-in is restored too.' : ''}`.trim()] },
  resend: { label: 'Resend invitation', Icon: Send, title: 'Resend Invitation', confirm: 'Resend invitation', reason: 'none', done: 'invitation resent',
    bullets: p => ['A new invitation email is sent and the old link stops working.', 'The new link expires in 7 days.', ...(p.kind === 'student' ? ['It keeps the original Faculty member and class.'] : [])] },
  'revoke-invite': { label: 'Revoke invitation', Icon: X, destructive: true, title: 'Revoke Invitation', confirm: 'Revoke invitation', reason: 'none', done: 'invitation revoked',
    bullets: () => ['The invitation link stops working. Faculty can be invited again from Faculty Invitations; Students from their class roster.'] },
};

export const PeopleAndAccounts: React.FC = () => {
  const { user } = useAuth();
  const [params] = useSearchParams(); // read once: other pages link here with ?kind=, ?status= or ?twoFactor=
  const [kind, setKind] = useState<Kind>(() => (params.get('kind') === 'student' ? 'student' : 'faculty'));
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [attention, setAttention] = useState<Attention>(() => attentionFromUrl(key => params.get(key)));
  const [status, setStatus] = useState<StatusFilter>(() => (['all', 'active', 'deactivated', 'invited'] as const).find(v => v === params.get('status')) ?? (attention === 'expired' ? 'invited' : 'active'));
  const [classes, setClasses] = useState<'all' | 'current' | 'none'>(() => (['current', 'none'] as const).find(v => v === params.get('classes')) ?? 'all');
  const [secretary, setSecretary] = useState(false);
  const [yearLevel, setYearLevel] = useState(0);
  const [sort, setSort] = useState<SortState<PeopleSortKey>>(DEFAULT_PEOPLE_SORT);
  const [courseId, setCourseId] = useState(0);
  const [classId, setClassId] = useState(0);
  const [options, setOptions] = useState<PeopleFilterOptions>({ courses: [], classes: [] });
  const [page, setPage] = useState(1);
  const [people, setPeople] = useState<AdminPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<AdminPerson | null>(null);
  const [action, setAction] = useState<PersonAction>('deactivate');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [nameParts, setNameParts] = useState<PersonNameParts>(emptyNameParts);
  const [newEmail, setNewEmail] = useState('');
  const [idChecked, setIdChecked] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { getAdminPeopleFiltersApi().then(setOptions).catch(() => undefined); }, []);

  const filterParams = (p: number) => ({
    kind, status, q, page: p,
    ...attentionParams(attention),
    sort: sort.key, dir: sort.dir,
    classes: kind === 'faculty' && classes !== 'all' ? classes : undefined,
    secretary: kind === 'student' && secretary ? true : undefined,
    yearLevel: kind === 'student' ? yearLevel || undefined : undefined,
    courseId: courseId || undefined,
    classId: kind === 'student' ? classId || undefined : undefined,
  });

  const load = () => {
    const ticket = ++latest.current;
    setLoading(true);
    setError('');
    getAdminPeopleApi(filterParams(page))
      .then(r => { if (ticket === latest.current) { setPeople(r.people); setTotal(r.total); } })
      .catch(err => { if (ticket === latest.current) setError(err instanceof Error ? err.message : 'Could not load accounts. Select Retry.'); })
      .finally(() => { if (ticket === latest.current) setLoading(false); });
  };
  useEffect(load, [kind, status, q, page, attention, sort, classes, secretary, yearLevel, courseId, classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFilters = () => { setSearch(''); setQ(''); setStatus('active'); setAttention('all'); setClasses('all'); setSecretary(false); setYearLevel(0); setCourseId(0); setClassId(0); setPage(1); };
  const changeSort = (next: SortState<PeopleSortKey>) => { setSort(next); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const classOptions = options.classes.filter(c => !courseId || c.courseId === courseId);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const all: AdminPerson[] = [];
      for (let p = 1; p <= EXPORT_PAGE_CAP; p++) {
        const r = await getAdminPeopleApi(filterParams(p));
        all.push(...r.people);
        if (p >= Math.ceil(r.total / (r.pageSize || PAGE_SIZE))) break;
      }
      const headers = PEOPLE_EXPORT_HEADERS(kind);
      const widths = kind === 'student' ? [28, 34, 16, 36, 18, 8, 24] : [28, 34, 36, 18, 8, 24];
      await downloadXlsx(`People - ${kindLabel[kind]}.xlsx`, [buildReportSheet({
        sheet: kindLabel[kind], title: `PEOPLE AND ACCOUNTS - ${kindLabel[kind].toUpperCase()}`,
        filter: `Status: ${status === 'all' ? 'All' : status[0].toUpperCase() + status.slice(1)}${q ? ` · Search: ${q}` : ''}`, term: `${all.length} ${all.length === 1 ? 'account' : 'accounts'}`,
        by: user?.display_name ?? "Dean's Office",
        columns: headers.map((header, i) => ({ header, width: widths[i] })),
        rows: all.map(person => peopleExportRow(person, formatManilaWhen)),
      })]);
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const openAction = (person: AdminPerson, next: PersonAction) => {
    setReason('');
    setReasonError('');
    setFieldErrors({});
    setFormError('');
    setNewEmail('');
    setIdChecked(false);
    const np = person.nameParts;
    setNameParts(np ? { prefix: np.prefix ?? '', firstName: np.firstName ?? '', middleName: np.middleName ?? '', lastName: np.lastName ?? '', suffix: np.suffix ?? '' } : emptyNameParts);
    const current = next === 'deactivate' && person.kind === 'faculty' ? classesOf(person).filter(c => c.current) : [];
    setBlocked(current.length > 0 ? { message: sentence(person.name, current.length), classes: current } : null);
    setAction(next);
    setTarget(person);
  };
  const close = () => { if (!busy) { setTarget(null); setBlocked(null); } };
  const confirm = async () => {
    if (!target) return;
    const info = ACTIONS[action];
    const note = reason.trim();
    if (info.reason === 'required' && (note.length < 8 || note.length > 240)) { setReasonError('Enter a reason of 8 to 240 characters.'); return; }
    const form = action === 'edit-name' || action === 'move-email';
    if (action === 'move-email') {
      const check = validateBicolUEmail(fullEmail(newEmail), [EMAIL_DOMAIN]);
      const errors: Record<string, string> = {};
      if (!check.isValid) errors.newEmail = check.message;
      if (!idChecked) errors.idChecked = "Confirm that you checked this person's university ID in person.";
      if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    }
    if (action === 'edit-name' && composePersonName(nameParts) === composePersonName(target.nameParts ? { prefix: target.nameParts.prefix ?? '', firstName: target.nameParts.firstName ?? '', middleName: target.nameParts.middleName ?? '', lastName: target.nameParts.lastName ?? '', suffix: target.nameParts.suffix ?? '' } : emptyNameParts)) { setFormError('The name is unchanged.'); return; }
    setFormError('');
    setBusy(true);
    try {
      if (action === 'edit-name') await editPersonNameApi(target.userId, nameParts, note);
      else if (action === 'move-email') await movePersonEmailApi(target.userId, fullEmail(newEmail), note);
      else if (action === 'deactivate') await deactivatePersonApi(target.userId, note || undefined);
      else if (action === 'reactivate') await reactivatePersonApi(target.userId);
      else if (action === 'sign-out') await signOutPersonApi(target.userId, note || undefined);
      else if (action === 'reset-2fa') await resetPersonTwoFactorApi(target.userId, note || undefined);
      else if (action === 'revoke-face') await revokeStudentBiometricApi(String(target.studentId), note);
      else if (action === 'resend') {
        const sent = await resendInvitationApi(target.userId);
        if (sent.delivery === 'Failed') {
          showFeedback(`${target.name}: a new invitation was created, but the email could not be sent. Try Resend again later.`, 'error');
          setTarget(null);
          load();
          return;
        }
      }
      else await revokeInvitationApi(target.userId);
      showFeedback(`${target.name}: ${info.done}.`, 'success');
      setTarget(null);
      setBlocked(null);
      load();
    } catch (err) {
      if (form && err instanceof ApiError) {
        const list = Array.isArray(err.errors) ? (err.errors as Array<{ field: string; message: string }>) : [];
        if (err.status === 422 && list.length > 0) {
          const next: Record<string, string> = {};
          for (const item of list) { const key = item.field.split('.').pop() ?? item.field; if (key === 'reason') setReasonError(item.message); else next[key] = item.message; }
          setFieldErrors(next);
        } else setFormError(err.message);
        return;
      }
      const classes = err instanceof ApiError ? (err.details?.classes as Array<{ csId: number; label: string }> | undefined) : undefined;
      if (err instanceof ApiError && err.code === 'faculty_has_current_classes' && classes) {
        setBlocked({ message: err.message, classes: classes.map(c => ({ ...c, schoolYear: '', current: true })) });
      } else {
        setTarget(null);
        showFeedback(err instanceof Error ? err.message : 'Could not update the account. Try again.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const info = ACTIONS[action];
  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
        Showing <b className="text-slate-800 dark:text-slate-100">{people.length}</b> of {total} {kind === 'faculty' ? 'Faculty accounts' : 'Student accounts'}
      </p>

      <ListToolbar
        left={(
          <Tabs variant="switch" color="accent" label="Account roles" value={kind}
            onChange={value => { setKind(value); setClasses('all'); setSecretary(false); setYearLevel(0); setCourseId(0); setClassId(0); setPage(1); setSearch(''); setQ(''); setStatus('active'); setAttention('all'); setSort(DEFAULT_PEOPLE_SORT); }}
            tabs={[{ id: 'faculty', label: 'Faculty' }, { id: 'student', label: 'Students' }]} />
        )}
        right={(
          <div className="no-print inline-flex flex-shrink-0 items-center rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              disabled={exporting}
              onClick={() => void exportExcel()}
              className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Export Excel</span>
            </button>
          </div>
        )}
        below={(
          <>
            <SearchField value={search} onChange={setSearch} placeholder={`Search ${kindLabel[kind].toLowerCase()}…`} color="accent" />
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Status</span>
              <select aria-label="Status" value={status} onChange={event => {
                const next = event.target.value as StatusFilter;
                setStatus(next);
                if (attention === 'expired' && next !== 'invited' && next !== 'all') setAttention('all'); // expired invitations exist only among invited accounts
                setPage(1);
              }} className={filterClass}>
                <option value="all">All statuses</option><option value="active">Active</option><option value="deactivated">Deactivated</option><option value="invited">Invited</option>
              </select>
            </label>
            {kind === 'student' && (
              <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Year level</span>
                <select aria-label="Year level" value={yearLevel} onChange={event => { setYearLevel(Number(event.target.value)); setPage(1); }} className={filterClass}>
                  <option value={0}>All year levels</option>
                  {(options.yearLevels ?? []).map(n => <option key={n} value={n}>{yearLevelLabel(n)}</option>)}
                </select>
              </label>
            )}
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Course</span>
              <select aria-label="Course" value={courseId} onChange={event => {
                const next = Number(event.target.value);
                setCourseId(next);
                if (next && classId && !options.classes.some(c => c.csId === classId && c.courseId === next)) setClassId(0);
                setPage(1);
              }} className={filterClass}>
                <option value={0}>All courses</option>
                {options.courses.map(c => <option key={c.id} value={c.id}>{c.courseCode} · {c.name}</option>)}
              </select>
            </label>
            {kind === 'student' && (
              <>
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Class section</span>
                  <select aria-label="Class section" value={classId} onChange={event => { setClassId(Number(event.target.value)); setPage(1); }} className={filterClass}>
                    <option value={0}>All class sections</option>
                    {classOptions.map(c => <option key={c.csId} value={c.csId}>{c.label}</option>)}
                  </select>
                </label>
                <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Show</span>
                  <select aria-label="Show" value={secretary ? 'secretary' : 'all'} onChange={event => { setSecretary(event.target.value === 'secretary'); setPage(1); }} className={filterClass}>
                    <option value="all">All students</option><option value="secretary">Class Secretaries</option>
                  </select>
                </label>
              </>
            )}
            {kind === 'faculty' && (
              <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Teaching this school year</span>
                <select aria-label="Teaching this school year" value={classes} onChange={event => { setClasses(event.target.value as typeof classes); setPage(1); }} className={filterClass}>
                  <option value="all">All Faculty</option><option value="current">Teaching</option><option value="none">Not teaching</option>
                </select>
              </label>
            )}
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Needs attention</span>
              <select aria-label="Needs attention" value={attention} onChange={event => {
                const next = event.target.value as Attention;
                setAttention(next);
                if (next === 'expired' && status !== 'all') setStatus('invited'); // expired invitations exist only among invited accounts
                setPage(1);
              }} className={filterClass}>
                {ATTENTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={clearFilters} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40">Clear filters</button>
          </>
        )}
      />

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
        <p>Deactivating an account signs the person out on every device and blocks sign-in until you reactivate it. Records, classes and enrollments are kept. Faculty are invited from Faculty Invitations; Students are invited from class rosters.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
          <span className="break-words">{error}</span>
          <button type="button" onClick={load} className="min-h-[44px] font-bold underline">Retry</button>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading accounts…</div>
        ) : people.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No matching accounts</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try a different name, email or account status.</p>
            {search && <button type="button" onClick={() => setSearch('')} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40"><X className="h-3.5 w-3.5" /> Clear search</button>}
          </div>
        ) : (
          <>
            <div className="table-pin table-pin-first max-sm:hidden">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                  <tr>
                    <th scope="col" aria-sort={ariaSort(sort, 'name')} className="px-5 py-3.5"><SortableHeader label="Name" sortKey="name" sort={sort} onSort={changeSort} /></th>
                    <th scope="col" className="px-4 py-3.5">Email</th>
                    {kind === 'student' && <th scope="col" aria-sort={ariaSort(sort, 'studentNo')} className="px-4 py-3.5"><SortableHeader label="Student No." sortKey="studentNo" sort={sort} onSort={changeSort} /></th>}
                    <th scope="col" aria-sort={ariaSort(sort, 'classes')} className="px-4 py-3.5"><SortableHeader label="Classes" sortKey="classes" first="desc" sort={sort} onSort={changeSort} /></th>
                    <th scope="col" className="px-4 py-3.5">Status</th>
                    <th scope="col" className="px-4 py-3.5">2FA</th>
                    <th scope="col" aria-sort={ariaSort(sort, 'lastActivity')} className="px-4 py-3.5"><SortableHeader label="Last Activity" sortKey="lastActivity" first="desc" sort={sort} onSort={changeSort} /></th>
                    <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {people.map(person => (
                    <tr key={person.userId} className="align-middle hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-4"><div className="font-bold text-slate-800 dark:text-slate-100">{person.name}</div></td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{person.email}</td>
                      {kind === 'student' && <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{person.studentNo}</td>}
                      <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{classSummary(person)}</td>
                      <td className="px-4 py-4"><StatusPill person={person} /></td>
                      <td className="px-4 py-4">{person.status === 'invited' ? '—' : <TwoFactor on={person.twoFactor} />}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500 dark:text-slate-400">{lastActivityText(person, formatManilaWhen)}</td>
                      <td className="px-4 py-4 text-right"><RowMenu person={person} selfUserId={user?.user_id} onSelect={next => openAction(person, next)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 sm:hidden">
              {people.map(person => (
                <article key={person.userId} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><h3 className="break-words text-sm font-bold text-slate-800 dark:text-slate-100">{person.name}</h3><p className="break-words text-xs text-slate-500 dark:text-slate-400"><Email value={person.email} /></p></div></div>
                    <RowMenu person={person} selfUserId={user?.user_id} onSelect={next => openAction(person, next)} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {kind === 'student' && <Item label="Student Number">{person.studentNo}</Item>}
                    <Item label="Classes">{classSummary(person)}</Item>
                    <Item label="Status"><StatusPill person={person} /></Item>
                    <Item label="2FA">{person.status === 'invited' ? '—' : person.twoFactor ? 'On' : 'Off'}</Item>
                    <Item label="Last Activity">{lastActivityText(person, formatManilaWhen)}</Item>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800">Previous</button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800">Next</button>
          </div>
        </div>
      )}

      <Modal isOpen={Boolean(target)} onClose={close} title={info.title} size={action === 'edit-name' ? 'lg' : 'sm'}>
        {target && (
          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{target.name}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{target.email} · {target.kind === 'faculty' ? 'Faculty' : 'Student'}</p>
            </div>
            {blocked ? (
              <div role="alert" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{blocked.message}</p>
                <ul className="space-y-1 pl-6">{blocked.classes.map(c => <li key={c.csId}><Link to="/admin/classes" className="font-bold underline">{c.label}</Link></li>)}</ul>
              </div>
            ) : (
              <>
                {action === 'move-email' && <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">Use this when the college has given this person a new email, for example because the old one was compromised. The old address will never work in DentiSYS again.</p>}
                {action === 'edit-name' && <PersonNameFields value={nameParts} onChange={value => { setNameParts(value); setFormError(''); setFieldErrors({}); }} />}
                {action === 'edit-name' && <>{(['prefix', 'firstName', 'middleName', 'lastName', 'suffix'] as const).filter(k => fieldErrors[k]).map(k => <span key={k} role="alert" className="block text-xs font-semibold text-rose-600 dark:text-rose-400">{fieldErrors[k]}</span>)}</>}
                {action === 'reactivate'
                  ? <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{info.bullets(target)[0]}</p>
                  : <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{info.bullets(target).map(b => <li key={b}>{b}</li>)}</ul>}
                {action === 'move-email' && (
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">New Email
                    <div className="mt-1.5 flex">
                      <input maxLength={254} type="text" inputMode="email" value={newEmail} onChange={event => { setNewEmail(event.target.value); setFieldErrors(e => ({ ...e, newEmail: '' })); }}
                        placeholder={newEmail.includes('@') ? `name@${EMAIL_DOMAIN}` : 'username'}
                        className={`min-h-11 min-w-0 flex-1 border border-slate-200 bg-white px-3.5 text-sm font-normal text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${newEmail.includes('@') ? 'rounded-xl' : 'rounded-l-xl'}`} />
                      {!newEmail.includes('@') && <span className="flex items-center rounded-r-xl border border-l-0 border-slate-200 bg-slate-100 px-3 text-xs font-bold text-accent-700 dark:border-slate-700 dark:bg-slate-800 dark:text-accent-300">@{EMAIL_DOMAIN}</span>}
                    </div>
                    {fieldErrors.newEmail && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.newEmail}</span>}
                  </label>
                )}
                {info.reason !== 'none' && (
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">{info.reason === 'required' ? 'Reason (8 to 240 characters)' : 'Reason (optional)'}
                    <input maxLength={info.reason === 'required' ? 240 : 500} value={reason} onChange={event => { setReason(event.target.value); setReasonError(''); }} className={inputClass} />
                    {reasonError && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">{reasonError}</span>}
                  </label>
                )}
                {action === 'move-email' && (
                  <div>
                    <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={idChecked} onChange={event => { setIdChecked(event.target.checked); setFieldErrors(e => ({ ...e, idChecked: '' })); }} className="mt-0.5 h-4 w-4 shrink-0 accent-accent-600" />
                      I checked this person's university ID in person.
                    </label>
                    {fieldErrors.idChecked && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.idChecked}</span>}
                  </div>
                )}
                {formError && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-400">{formError}</div>}
              </>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" disabled={busy} onClick={close} className={cancelButton}>{blocked ? 'Close' : 'Cancel'}</button>
              {!blocked && <button type="button" disabled={busy} onClick={() => void confirm()} className={`min-h-11 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50 ${info.destructive || action === 'move-email' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-accent-600 hover:bg-accent-700'}`}>{info.confirm}</button>}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};

/** Faculty: this school year's classes; Student: how many classes they are enrolled in. */
function classSummary(person: AdminPerson): string {
  const all = classesOf(person);
  const current = all.filter(c => c.current);
  if (person.kind === 'faculty') return current.length > 0 ? current.map(c => c.label).join(', ') : 'None this school year';
  return all.length > 0 ? `${all.length} ${all.length === 1 ? 'class' : 'classes'}` : 'None';
}

/** Email that wraps only before "@" and after "." in the name, never mid-word; "@domain" stays on one line. */
function Email({ value }: { value: string }) {
  const parts = emailParts(value);
  return <>{parts.map((part, i) => <React.Fragment key={i}>{i > 0 && <wbr />}{part.startsWith('@') ? <span className="whitespace-nowrap">{part}</span> : part}</React.Fragment>)}</>;
}

function StatusPill({ person }: { person: AdminPerson }) {
  const invited = person.status === 'invited';
  const active = person.status === 'active';
  const Icon = invited ? Mail : active ? CheckCircle2 : CircleAlert;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${invited
    ? 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20'
    : active
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20'
      : 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20'}`}><Icon className="h-3 w-3" />{statusLabel(person)}</span>;
}

function TwoFactor({ on }: { on: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 ${on ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}><KeyRound className="h-3.5 w-3.5" />{on ? 'On' : 'Off'}</span>;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[10px] font-semibold text-slate-400">{label}</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{children}</dd></div>;
}

/** Row menu copied from the student row menu in pages/faculty/ClassesAndRosters.tsx. */
function RowMenu({ person, selfUserId, onSelect }: { person: AdminPerson; selfUserId?: number; onSelect: (action: PersonAction) => void }) {
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
          // Open upward when the menu does not fit below.
          setPos(window.innerHeight - r.bottom < 250 && r.top > window.innerHeight - r.bottom
            ? { bottom: window.innerHeight - r.top + 6, right }
            : { top: r.bottom + 6, right });
          setOpen(true);
        }}
        className={`inline-flex min-h-10 items-center justify-center rounded-lg border p-2 transition-all cursor-pointer ${open
          ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white'
          : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
        title="Actions"
        aria-label={`Actions for ${person.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && pos && createPortal(
        <div role="menu" style={pos} onClick={(e) => e.stopPropagation()} className="fixed w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 py-1.5 z-[60] text-xs text-left">
          {personActions(person, selfUserId).map(key => {
            const { Icon, label, destructive } = ACTIONS[key];
            return (
              <button key={key} type="button" role="menuitem" onClick={() => { setOpen(false); onSelect(key); }}
                className={destructive ? menuItem.replace('text-slate-700 dark:text-slate-200', 'text-rose-600 dark:text-rose-400') : menuItem}>
                <Icon className={`h-3.5 w-3.5 ${destructive ? '' : 'text-accent-500'}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
