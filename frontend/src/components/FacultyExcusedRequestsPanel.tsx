import React, { useEffect, useState } from 'react';
import { Filter as FilterIcon, Search } from 'lucide-react';
import { Card } from './Card';
import { Modal } from './Modal';
import { formatManilaWhen } from '../services/auditService';
import { formatSessionDate } from '../utils/sessionDate';
import { formatTime12 } from '../utils/sessionTimes';
import { AttendanceExcusedRequest, FacultyClassItem, decideFacultyExcusedRequestApi, getFacultyExcusedRequestsApi } from '../services/apiClient';

type Filter = 'pending' | 'approved' | 'rejected';
const word = (status?: string | null) => status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Not recorded';
const time12 = (value?: string | null) => value ? formatTime12(value) : '—';
const count = (n: number) => `${n} request${n === 1 ? '' : 's'}`;

const OPEN_EVENT = 'open-secretary-request';
/** Roll call chip target: the requests tab opens filtered to the request's class, then scrolls to the row and focuses it. */
export const openSecretaryRequest = (id: string) => {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id } }));
};
/** Class page chip target: the requests tab opens filtered to that class. */
export const openRequestsForClass = (classId: string) => {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { classId } }));
};

/** Count of requests waiting for this Faculty member (Faculty Dashboard / page headers). */
export const PendingRequestsBadge: React.FC<{ count: number; className?: string; onClick?: () => void }> = ({ count, className = '', onClick }) => {
  if (count <= 0) return null;
  const classes = `inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 ${className}`;
  const text = `${count} pending Secretary request${count === 1 ? '' : 's'}`;
  return onClick
    ? <button type="button" data-testid="pending-requests-badge" onClick={onClick} className={`${classes} cursor-pointer`}>{text}</button>
    : <span data-testid="pending-requests-badge" className={classes}>{text}</span>;
};

/**
 * ATT-006: attendance change requests from class Secretaries. Approving applies the
 * requested status; rejecting leaves the record unchanged. Nothing is ever approved automatically.
 */
export const FacultyExcusedRequestsPanel: React.FC<{
  onDecided?: () => void;
  onLoaded?: (requests: AttendanceExcusedRequest[]) => void;
  /** The Faculty's current school-year classes, for the Class filter. */
  classes?: FacultyClassItem[];
  /** True while the Secretary requests tab is showing (the panel stays mounted so roll-call chips keep their data). */
  active?: boolean;
  /** Asks the page to switch to the requests tab. */
  onOpenTab?: () => void;
  /** From the URL: ?class=<classId>&request=<requestId>. */
  initial?: { classId?: string; requestId?: string };
}> = ({ onDecided, onLoaded, classes = [], active = true, onOpenTab, initial }) => {
  const [requests, setRequests] = useState<AttendanceExcusedRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [reloadKey, setReloadKey] = useState(0);
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ ids: string[]; decision: 'approve' | 'reject'; label: string } | null>(null);
  const [target, setTarget] = useState<string | null>(initial?.requestId ?? null);
  // Filters are not remembered between visits.
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState(initial?.classId ?? '');
  const [change, setChange] = useState('');

  useEffect(() => {
    const onOpen = (event: Event) => {
      const { id, classId: forClass } = (event as CustomEvent<{ id?: string; classId?: string }>).detail;
      setFilter('pending'); setQuery(''); setChange('');
      setClassId(forClass ?? requests.find(request => request.id === id)?.classId ?? '');
      setTarget(id ?? null);
      onOpenTab?.();
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [requests, onOpenTab]);

  // Runs after the tab has rendered, so the row exists.
  useEffect(() => {
    if (!target || !active) return;
    const row = document.getElementById(`secretary-request-${target}`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.focus();
    setTarget(null);
  }, [target, active, requests, filter, classId]);

  useEffect(() => {
    let active = true;
    getFacultyExcusedRequestsApi()
      .then(response => {
        if (!active) return;
        const rows = response.requests ?? [];
        setRequests(rows);
        onLoaded?.(rows);
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load Secretary requests.'); });
    return () => { active = false; };
  }, [reloadKey]);

  const pending = requests.filter(request => request.status === 'pending');
  const hasHistory = requests.some(request => request.status !== 'pending');
  const needle = query.trim().toLowerCase();
  const matching = requests.filter(request =>
    (!classId || request.classId === classId)
    && (!change || (request.requestedStatus ?? 'excused') === change)
    && (!needle || request.studentName.toLowerCase().includes(needle) || (request.studentNumber ?? '').toLowerCase().includes(needle)));
  const countOf = (status: Filter) => matching.filter(request => request.status === status).length;
  const shown = matching.filter(request => request.status === filter);
  const pendingShown = filter === 'pending' ? shown : [];

  // withNote: only a single-row Reject sends its optional note; bulk calls never do.
  const decide = async (ids: string[], decision: 'approve' | 'reject', withNote = false) => {
    setBusy(true);
    setError(null);
    try {
      const note = decision === 'reject' && withNote ? notes[ids[0]]?.trim() || undefined : undefined;
      if (decision === 'reject' && ids.length > 1) {
        // The server refuses a bulk reject, so send one request at a time.
        try {
          for (const id of ids) await decideFacultyExcusedRequestApi({ requestId: id, decision });
        } catch (err) {
          setSelected([]);
          setReloadKey(key => key + 1); // already-rejected ones disappear
          onDecided?.();
          throw err;
        }
        setMessage(`Rejected ${ids.length} requests.`);
      } else {
        const response = await decideFacultyExcusedRequestApi(ids.length === 1
          ? { requestId: ids[0], decision, note }
          : { requestIds: ids, decision });
        setMessage(response.message);
      }
      setSelected([]);
      setReloadKey(key => key + 1);
      onDecided?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the decision.');
    } finally {
      setBusy(false);
    }
  };

  const chosen = selected.filter(id => pendingShown.some(request => request.id === id));
  const groups: { key: string; rows: AttendanceExcusedRequest[] }[] = [];
  for (const request of shown) {
    const key = request.sessionId ?? `${request.classId}:${request.sessionDate}`;
    const group = groups.find(g => g.key === key);
    if (group) group.rows.push(request); else groups.push({ key, rows: [request] });
  }
  const fieldBase = 'h-9 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs leading-4 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500';
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed';
  const approveBtn = `${btn} bg-emerald-600 text-white disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:bg-slate-700 dark:disabled:text-slate-400`;
  const rejectBtn = `${btn} border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300`;
  const plainBtn = `${btn} border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200`;

  return (
    <section aria-label="Secretary requests" className={active ? '' : 'hidden'}>
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Secretary Requests · {pending.length} waiting</h2>
      </div>
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>}
      <>
          <p className="text-[11px] text-slate-500">Sent by class Secretaries. Approving applies the requested status; rejecting leaves the record unchanged.</p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
            <div className="relative flex-1 sm:min-w-48">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Search students"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search student name or ID..."
                className={`w-full pl-9 pr-3 py-2 ${fieldBase}`}
              />
            </div>
            <div className={`sm:flex-1 px-3 py-2 flex items-center gap-2 ${fieldBase} focus-within:border-emerald-500`}>
              <FilterIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <select
                value={classId}
                onChange={event => setClassId(event.target.value)}
                aria-label="Class"
                className="min-w-0 flex-1 pr-6 bg-transparent text-xs leading-4 font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="">All classes</option>
                {classes.map(item => <option key={item.csId} value={String(item.csId)}>{item.courseCode} {item.csName}</option>)}
              </select>
            </div>
            <select
              aria-label="Show requests"
              value={filter}
              onChange={event => setFilter(event.target.value as Filter)}
              className={`px-3 py-2 ${fieldBase}`}
            >
              <option value="pending">Pending ({countOf('pending')})</option>
              <option value="approved">Approved ({countOf('approved')})</option>
              <option value="rejected">Rejected ({countOf('rejected')})</option>
            </select>
            <select
              aria-label="Requested change"
              value={change}
              onChange={event => setChange(event.target.value)}
              className={`px-3 py-2 ${fieldBase}`}
            >
              <option value="">All requested changes</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="excused">Excused</option>
            </select>
            {(query || classId || change) && (
              <button type="button" onClick={() => { setQuery(''); setClassId(''); setChange(''); }} className={plainBtn}>Clear filters</button>
            )}
          </div>
          {pendingShown.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={pendingShown.every(request => selected.includes(request.id))}
                  onChange={event => setSelected(event.target.checked ? [...new Set([...selected, ...pendingShown.map(request => request.id)])] : selected.filter(id => !pendingShown.some(request => request.id === id)))}
                />
                Select all shown ({pendingShown.length})
              </label>
              <button
                type="button"
                disabled={busy || chosen.length === 0}
                onClick={() => chosen.length > 1 ? setConfirm({ ids: chosen, decision: 'approve', label: 'Selected requests' }) : void decide(chosen, 'approve')}
                className={approveBtn}
              >Approve selected</button>
            </div>
          )}
          {filter === 'pending' && shown.length === 0 && <p className="text-xs text-slate-500">{pending.length === 0 ? 'Nothing waiting for you.' : 'No pending requests match the filters.'}</p>}
          {filter !== 'pending' && !hasHistory && <p className="text-xs text-slate-500">History not available.</p>}
          {filter !== 'pending' && hasHistory && shown.length === 0 && <p className="text-xs text-slate-500">No {filter} requests.</p>}
          <div className="space-y-3">
            {groups.map(({ key, rows }) => {
              const first = rows[0];
              const label = `${first.courseCode} ${first.className} · ${formatSessionDate(first.sessionDate)}`;
              const ids = rows.map(row => row.id);
              return (
                <div key={key} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 bg-slate-50 px-3 py-2 sm:flex sm:flex-wrap sm:gap-2 dark:bg-slate-800/60">
                    {filter === 'pending' && (
                      <input
                        type="checkbox"
                        aria-label={`Select all in ${label}`}
                        checked={ids.every(id => selected.includes(id))}
                        onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)))}
                      />
                    )}
                    <span className={`text-xs font-bold text-slate-800 dark:text-slate-100 ${filter === 'pending' ? '' : 'col-span-2'}`}>{label}</span>
                    <span className={`text-xs text-slate-500 ${filter === 'pending' ? 'hidden sm:inline' : 'col-span-2 sm:col-span-1'}`}><span className="hidden sm:inline">· </span>{count(rows.length)}</span>
                    <span className="hidden flex-1 sm:block" />
                    {filter === 'pending' && (
                      <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:contents">
                        <span className="mr-auto text-xs text-slate-500 sm:hidden">{count(rows.length)}</span>
                        <button type="button" disabled={busy} onClick={() => setConfirm({ ids, decision: 'approve', label })} className={approveBtn}>Approve all</button>
                        <button type="button" disabled={busy} onClick={() => setConfirm({ ids, decision: 'reject', label })} className={rejectBtn}>Reject all</button>
                      </div>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map(request => (
                      <li key={request.id} id={`secretary-request-${request.id}`} tabIndex={-1} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 px-3 py-2 text-xs outline-none focus:bg-sky-50 sm:grid-cols-[auto_minmax(0,1fr)_7.5rem_minmax(0,1.6fr)_auto] dark:focus:bg-sky-950/30">
                        {filter === 'pending' ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${request.studentName}`}
                            checked={selected.includes(request.id)}
                            onChange={event => setSelected(current => event.target.checked ? [...current, request.id] : current.filter(id => id !== request.id))}
                          />
                        ) : <span />}
                        <span className="min-w-0"><strong>{request.studentName}</strong><span className="block text-[11px] text-slate-500 dark:text-slate-400">{request.studentNumber}</span></span>
                        <span className="col-start-2 font-bold text-slate-800 sm:col-start-auto dark:text-slate-100">
                          {word(request.currentStatus)} → {word(request.requestedStatus ?? 'excused')}
                          {request.currentMethod === 'biometric' && <span className="ml-1 font-normal text-slate-500 sm:ml-0 sm:block dark:text-slate-400">(face check-in)</span>}
                        </span>
                        <span className="col-start-2 min-w-0 text-slate-700 sm:col-start-auto dark:text-slate-200">
                          Reason: {request.reason || 'None given'}
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                            by {request.requestedBy ?? 'Secretary'}{request.requestedAt ? ` · sent ${formatManilaWhen(request.requestedAt)}` : ''}
                            {(request.presentCutoff || request.lateCutoff) && ` · Present until ${time12(request.presentCutoff)} · Late until ${time12(request.lateCutoff)}`}
                          </span>
                        </span>
                        <span className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-auto sm:justify-end">
                          {request.status === 'pending' ? (
                            <>
                              <button type="button" aria-expanded={!!noteOpen[request.id]} onClick={() => setNoteOpen(current => ({ ...current, [request.id]: !current[request.id] }))} className={plainBtn}>Note</button>
                              <button type="button" disabled={busy} onClick={() => void decide([request.id], 'approve')} className={approveBtn}>Approve</button>
                              <button type="button" disabled={busy} onClick={() => void decide([request.id], 'reject', true)} className={rejectBtn}>Reject</button>
                            </>
                          ) : (
                            <span className="text-slate-500">{word(request.status)}{request.decidedBy ? ` by ${request.decidedBy}` : ''}{request.decidedAt ? ` · ${request.decidedAt}` : ''}{request.decisionNote ? ` · ${request.decisionNote}` : ''}</span>
                          )}
                        </span>
                        {request.status === 'pending' && noteOpen[request.id] && (
                          <input
                            aria-label={`Decision note for ${request.studentName}`}
                            value={notes[request.id] ?? ''}
                            onChange={event => setNotes(current => ({ ...current, [request.id]: event.target.value }))}
                            maxLength={500}
                            placeholder="Optional note (for reject)"
                            className="col-start-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 sm:col-span-4 dark:border-slate-700 dark:bg-slate-900"
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
      </>
    </Card>
    <Modal isOpen={!!confirm} onClose={() => setConfirm(null)} title={confirm ? `${confirm.decision === 'approve' ? 'Approve' : 'Reject'} all ${count(confirm.ids.length)}?` : ''} size="sm">
      {confirm && (
        <div className="space-y-4">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {confirm.label}: {confirm.decision === 'approve' ? 'every student gets the status that was requested.' : 'the attendance records stay as they are. No note is sent.'}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700">Cancel</button>
            <button
              type="button"
              onClick={() => { const { ids, decision } = confirm; setConfirm(null); void decide(ids, decision); }}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${confirm.decision === 'approve' ? 'bg-emerald-600' : 'bg-rose-600'}`}
            >{confirm.decision === 'approve' ? 'Approve' : 'Reject'} {confirm.ids.length}</button>
          </div>
        </div>
      )}
    </Modal>
    </section>
  );
};
