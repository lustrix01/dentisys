import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { Modal } from './Modal';
import { formatManilaWhen } from '../services/auditService';
import { AttendanceExcusedRequest, decideFacultyExcusedRequestApi, getFacultyExcusedRequestsApi } from '../services/apiClient';

type Filter = 'pending' | 'approved' | 'rejected';
const word = (status?: string | null) => status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Not recorded';
const count = (n: number) => `${n} request${n === 1 ? '' : 's'}`;

const OPEN_EVENT = 'open-secretary-request';
/** Roll call chip target: the panel opens first, then scrolls to the request row and focuses it. */
export const openSecretaryRequest = (id: string) => {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
};

/** Count of requests waiting for this Faculty member (Faculty Dashboard / page headers). */
export const PendingRequestsBadge: React.FC<{ count: number; className?: string }> = ({ count, className = '' }) => count > 0 ? (
  <span data-testid="pending-requests-badge" className={`inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 ${className}`}>
    {count} pending Secretary request{count === 1 ? '' : 's'}
  </span>
) : null;

/**
 * ATT-006: attendance change requests from class Secretaries. Approving applies the
 * requested status; rejecting leaves the record unchanged. Nothing is ever approved automatically.
 */
export const FacultyExcusedRequestsPanel: React.FC<{
  onDecided?: () => void;
  onLoaded?: (requests: AttendanceExcusedRequest[]) => void;
}> = ({ onDecided, onLoaded }) => {
  const [requests, setRequests] = useState<AttendanceExcusedRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false); // collapsed on every visit, not remembered
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ ids: string[]; decision: 'approve' | 'reject'; label: string } | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => { setFilter('pending'); setOpen(true); setTarget((event as CustomEvent<string>).detail); };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Runs after the panel has rendered open, so the row exists.
  useEffect(() => {
    if (!target || !open) return;
    const row = document.getElementById(`secretary-request-${target}`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.focus();
    setTarget(null);
  }, [target, open, requests, filter]);

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
  const shown = requests.filter(request => request.status === filter);

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

  if (requests.length === 0 && !error && !message) return null;

  const chosen = selected.filter(id => pending.some(request => request.id === id));
  const groups: { key: string; rows: AttendanceExcusedRequest[] }[] = [];
  for (const request of shown) {
    const key = request.sessionId ?? `${request.classId}:${request.sessionDate}`;
    const group = groups.find(g => g.key === key);
    if (group) group.rows.push(request); else groups.push({ key, rows: [request] });
  }
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-bold disabled:opacity-50';
  const approveBtn = `${btn} bg-emerald-600 text-white`;
  const rejectBtn = `${btn} border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300`;
  const plainBtn = `${btn} border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200`;

  return (
    <section aria-label="Secretary requests">
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Secretary requests · {pending.length} waiting</h2>
        <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className={plainBtn}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>}
      {open && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <p className="text-[11px] text-slate-500">Sent by class Secretaries. Approving applies the requested status; rejecting leaves the record unchanged.</p>
            <div className="flex items-center gap-2">
              <select
                aria-label="Show requests"
                value={filter}
                onChange={event => setFilter(event.target.value as Filter)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              {filter === 'pending' && pending.length > 0 && (
                <button type="button" disabled={busy || chosen.length === 0} onClick={() => void decide(chosen, 'approve')} className={approveBtn}>Approve selected</button>
              )}
            </div>
          </div>
          {filter === 'pending' && pending.length === 0 && <p className="text-xs text-slate-500">Nothing waiting for you.</p>}
          {filter !== 'pending' && !hasHistory && <p className="text-xs text-slate-500">History not available.</p>}
          {filter !== 'pending' && hasHistory && shown.length === 0 && <p className="text-xs text-slate-500">No {filter} requests.</p>}
          <div className="space-y-3">
            {groups.map(({ key, rows }) => {
              const first = rows[0];
              const label = `${first.courseCode} ${first.className} · ${first.sessionDate}`;
              const ids = rows.map(row => row.id);
              return (
                <div key={key} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    {filter === 'pending' && (
                      <input
                        type="checkbox"
                        aria-label={`Select all in ${label}`}
                        checked={ids.every(id => selected.includes(id))}
                        onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)))}
                      />
                    )}
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{label}</span>
                    <span className="text-xs text-slate-500">· {count(rows.length)}</span>
                    <span className="flex-1" />
                    {filter === 'pending' && (
                      <>
                        <button type="button" disabled={busy} onClick={() => setConfirm({ ids, decision: 'approve', label })} className={approveBtn}>Approve all</button>
                        <button type="button" disabled={busy} onClick={() => setConfirm({ ids, decision: 'reject', label })} className={rejectBtn}>Reject all</button>
                      </>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map(request => (
                      <li key={request.id} id={`secretary-request-${request.id}`} tabIndex={-1} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 px-3 py-2 text-xs outline-none focus:bg-sky-50 sm:grid-cols-[auto_minmax(0,1.1fr)_auto_minmax(0,1.3fr)_auto] dark:focus:bg-sky-950/30">
                        {filter === 'pending' ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${request.studentName}`}
                            checked={selected.includes(request.id)}
                            onChange={event => setSelected(current => event.target.checked ? [...current, request.id] : current.filter(id => id !== request.id))}
                          />
                        ) : <span />}
                        <span className="min-w-0"><strong>{request.studentName}</strong><span className="block text-[11px] text-slate-500 dark:text-slate-400">{request.studentNumber}</span></span>
                        <span className="col-start-2 whitespace-nowrap font-bold text-slate-800 sm:col-start-auto dark:text-slate-100">
                          {word(request.currentStatus)} → {word(request.requestedStatus ?? 'excused')}
                          {request.currentMethod === 'biometric' && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">(face check-in)</span>}
                        </span>
                        <span className="col-start-2 min-w-0 text-slate-700 sm:col-start-auto dark:text-slate-200">
                          Reason: {request.reason || 'None given'}
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                            by {request.requestedBy ?? 'Secretary'}{request.requestedAt ? ` · sent ${formatManilaWhen(request.requestedAt)}` : ''}
                            {(request.presentCutoff || request.lateCutoff) && ` · Present until ${request.presentCutoff || '—'} · Late until ${request.lateCutoff || '—'}`}
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
                            placeholder="Optional note (for Reject)"
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
      )}
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
