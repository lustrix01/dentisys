import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CircleAlert, MoreVertical, ScanFace, Search, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { ApiError, dismissFaceFlagApi, getAdminFaceFlagsApi, getAdminPeopleFiltersApi, revokeStudentBiometricApi } from '../../services/apiClient';
import type { FaceFlag, PeopleFilterOptions } from '../../services/apiClient';
import { formatManilaWhen } from '../../services/auditService';
import { REVOKE_FACE_BULLETS } from './peopleHelpers';
import { FLAG_KIND_LABEL, FLAG_STATUS_LABEL, flagActions, flagClasses, flagClosedLine, flagDetails } from './faceFlagHelpers';
import type { FlagAction } from './faceFlagHelpers';

// Backlog 12.2 (docs/contracts/face-reenrolment.md section 4). Page parts copied from PeopleAndAccounts.tsx:
// notice banner, filter row, pinned table and phone cards, row menu, reason dialog, paging, empty and error states.
type StatusFilter = 'open' | 'dismissed' | 'all';
type KindFilter = 'all' | FaceFlag['kind'];

const PAGE_SIZE = 50;
const filterClass = 'min-h-10 w-full min-w-36 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const cancelButton = 'min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
const menuItem = 'w-full px-3 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-colors cursor-pointer';

type ActionInfo = { label: string; Icon: LucideIcon; destructive?: boolean; title: string; confirm: string; field: string; bullets: string[] };
const ACTIONS: Record<FlagAction, ActionInfo> = {
  dismiss: { label: 'Dismiss', Icon: CheckCircle2, title: 'Dismiss Flag', confirm: 'Dismiss flag', field: 'Note (8 to 240 characters)', bullets: ['The flag is closed. Nothing changes for the Student, who is never told about flags.'] },
  'revoke-face': { label: 'Revoke face enrollment', Icon: ScanFace, destructive: true, title: 'Revoke Face Enrollment', confirm: 'Revoke enrollment', field: 'Reason (8 to 240 characters)', bullets: REVOKE_FACE_BULLETS },
  'open-people': { label: 'Open in People & Accounts', Icon: UsersRound, title: '', confirm: '', field: '', bullets: [] },
};

export const FaceEnrolmentFlags: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [kind, setKind] = useState<KindFilter>('all');
  const [courseId, setCourseId] = useState(0);
  const [classId, setClassId] = useState(0);
  const [options, setOptions] = useState<PeopleFilterOptions>({ courses: [], classes: [] });
  const [page, setPage] = useState(1);
  const [flags, setFlags] = useState<FaceFlag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<FaceFlag | null>(null);
  const [action, setAction] = useState<FlagAction>('dismiss');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { getAdminPeopleFiltersApi().then(setOptions).catch(() => undefined); }, []);

  const load = () => {
    const ticket = ++latest.current;
    setLoading(true);
    setError('');
    getAdminFaceFlagsApi({ status, kind: kind === 'all' ? undefined : kind, q, courseId: courseId || undefined, classId: classId || undefined, page })
      .then(r => { if (ticket === latest.current) { setFlags(r.flags); setTotal(r.total); } })
      .catch(err => { if (ticket === latest.current) setError(err instanceof Error ? err.message : 'Could not load face enrolment flags. Select Retry.'); })
      .finally(() => { if (ticket === latest.current) setLoading(false); });
  };
  useEffect(load, [status, kind, q, page, courseId, classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFilters = () => { setSearch(''); setQ(''); setStatus('open'); setKind('all'); setCourseId(0); setClassId(0); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const classOptions = options.classes.filter(c => !courseId || c.courseId === courseId);

  const select = (flag: FaceFlag, next: FlagAction) => {
    if (next === 'open-people') { navigate('/superadmin/people?kind=student'); return; }
    setNote('');
    setNoteError('');
    setAction(next);
    setTarget(flag);
  };
  const close = () => { if (!busy) setTarget(null); };
  const confirm = async () => {
    if (!target) return;
    const text = note.trim();
    if (text.length < 8 || text.length > 240) { setNoteError('Enter a note of 8 to 240 characters.'); return; }
    setBusy(true);
    try {
      if (action === 'dismiss') await dismissFaceFlagApi(target.flagId, text);
      else await revokeStudentBiometricApi(String(target.student.studentId), text);
      showFeedback(`${target.student.name}: ${action === 'dismiss' ? 'flag dismissed' : 'face enrollment revoked'}.`, 'success');
      setTarget(null);
      load();
    } catch (err) {
      const list = err instanceof ApiError && Array.isArray(err.errors) ? (err.errors as Array<{ field: string; message: string }>) : [];
      if (err instanceof ApiError && err.status === 422 && list.length > 0) setNoteError(list[0].message);
      else {
        setTarget(null);
        showFeedback(err instanceof Error ? err.message : 'Could not update the flag. Try again.', 'error');
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) load(); // the flag changed or closed meanwhile
      }
    } finally {
      setBusy(false);
    }
  };

  const info = ACTIONS[action];
  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
        Showing <b className="text-slate-800 dark:text-slate-100">{flags.length}</b> of {total} {total === 1 ? 'flag' : 'flags'}
      </p>

      <ListToolbar
        left={(
          <>
            <SearchField value={search} onChange={setSearch} placeholder="Search Students…" ariaLabel="Search name or Student number" color="accent" />
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Status</span>
              <select aria-label="Status" value={status} onChange={event => { setStatus(event.target.value as StatusFilter); setPage(1); }} className={filterClass}>
                <option value="open">Open</option><option value="dismissed">Dismissed</option><option value="all">All</option>
              </select>
            </label>
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Flag</span>
              <select aria-label="Flag" value={kind} onChange={event => { setKind(event.target.value as KindFilter); setPage(1); }} className={filterClass}>
                <option value="all">All flags</option><option value="F1">{FLAG_KIND_LABEL.F1}</option><option value="F2">{FLAG_KIND_LABEL.F2}</option>
              </select>
            </label>
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
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Class section</span>
              <select aria-label="Class section" value={classId} onChange={event => { setClassId(Number(event.target.value)); setPage(1); }} className={filterClass}>
                <option value={0}>All class sections</option>
                {classOptions.map(c => <option key={c.csId} value={c.csId}>{c.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={clearFilters} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40">Clear filters</button>
          </>
        )}
      />

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
        <p>Flags show possible face-enrolment abuse. Nothing is blocked; you decide whether to act. Students are not told they were flagged.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
          <span className="break-words">{error}</span>
          <button type="button" onClick={load} className="min-h-[44px] font-bold underline">Retry</button>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading face enrolment flags…</div>
        ) : flags.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No face enrolment flags.</h3>
            {search && <button type="button" onClick={() => setSearch('')} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40"><X className="h-3.5 w-3.5" /> Clear search</button>}
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
                  {flags.map(flag => (
                    <tr key={flag.flagId} className="align-middle hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-4"><div className="font-bold text-slate-800 dark:text-slate-100">{flag.student.name}</div><div className="text-slate-500 dark:text-slate-400">{flag.student.studentNo}</div></td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-200">{FLAG_KIND_LABEL[flag.kind]}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{flagDetails(flag)}</td>
                      <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{flagClasses(flag)}</td>
                      <td className="px-4 py-4"><StatusPill flag={flag} /><ClosedLine flag={flag} /></td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500 dark:text-slate-400">{formatManilaWhen(flag.updatedAt)}</td>
                      <td className="px-4 py-4 text-right"><RowMenu flag={flag} onSelect={next => select(flag, next)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 sm:hidden">
              {flags.map(flag => (
                <article key={flag.flagId} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><h3 className="break-words text-sm font-bold text-slate-800 dark:text-slate-100">{flag.student.name}</h3><p className="break-words text-xs text-slate-500 dark:text-slate-400">{flag.student.studentNo}</p></div></div>
                    <RowMenu flag={flag} onSelect={next => select(flag, next)} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Item label="Flag">{FLAG_KIND_LABEL[flag.kind]}</Item>
                    <Item label="Status"><StatusPill flag={flag} /><ClosedLine flag={flag} /></Item>
                    <Item label="Details">{flagDetails(flag)}</Item>
                    <Item label="Classes">{flagClasses(flag)}</Item>
                    <Item label="Flagged">{formatManilaWhen(flag.updatedAt)}</Item>
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

      <Modal isOpen={Boolean(target)} onClose={close} title={info.title} size="sm">
        {target && (
          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{target.student.name}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{target.student.studentNo} · {FLAG_KIND_LABEL[target.kind]}</p>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{info.bullets.map(b => <li key={b}>{b}</li>)}</ul>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">{info.field}
              <input maxLength={240} value={note} onChange={event => { setNote(event.target.value); setNoteError(''); }} className={inputClass} />
              {noteError && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">{noteError}</span>}
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" disabled={busy} onClick={close} className={cancelButton}>Cancel</button>
              <button type="button" disabled={busy} onClick={() => void confirm()} className={`min-h-11 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50 ${info.destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-accent-600 hover:bg-accent-700'}`}>{info.confirm}</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};

function StatusPill({ flag }: { flag: FaceFlag }) {
  const Icon = flag.status === 'open' ? CircleAlert : CheckCircle2;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${flag.status === 'open'
    ? 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20'
    : flag.status === 'revoked'
      ? 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-400/20'
      : 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20'}`}><Icon className="h-3 w-3" />{FLAG_STATUS_LABEL[flag.status]}</span>;
}

function ClosedLine({ flag }: { flag: FaceFlag }) {
  const line = flagClosedLine(flag);
  return line ? <p className="mt-1 max-w-56 break-words text-[11px] text-slate-500 dark:text-slate-400">{line}</p> : null;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[10px] font-semibold text-slate-400">{label}</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{children}</dd></div>;
}

/** Row menu copied from RowMenu in PeopleAndAccounts.tsx. */
function RowMenu({ flag, onSelect }: { flag: FaceFlag; onSelect: (action: FlagAction) => void }) {
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
        aria-label={`Actions for ${flag.student.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && pos && createPortal(
        <div role="menu" style={pos} onClick={(e) => e.stopPropagation()} className="fixed w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/10 py-1.5 z-[60] text-xs text-left">
          {flagActions(flag).map(key => {
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
