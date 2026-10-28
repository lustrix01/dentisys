import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { formatManilaWhen } from '../services/auditService';
import { AttendanceExcusedRequest, decideFacultyExcusedRequestApi, getFacultyExcusedRequestsApi } from '../services/apiClient';

type Filter = 'pending' | 'approved' | 'rejected';
const word = (status?: string | null) => status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Not recorded';

/** Roll call chip target: scroll to the request row in the panel and focus it. */
export const openSecretaryRequest = (id: string) => {
  const row = document.getElementById(`secretary-request-${id}`);
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row?.focus();
};

/** Count of requests waiting for this Faculty member (Faculty Dashboard / page headers). */
export const PendingRequestsBadge: React.FC<{ count: number; className?: string }> = ({ count, className = '' }) => count > 0 ? (
  <span data-testid="pending-requests-badge" className={`inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 ${className}`}>
    {count} pending Secretary request{count === 1 ? '' : 's'}
  </span>
) : null;

/**
 * ATT-006: attendance change requests from class Secretaries. Approving applies the
 * requested status; rejecting leaves the record unchanged.
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

  const decide = async (ids: string[], decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      const note = decision === 'reject' ? notes[ids[0]]?.trim() || undefined : undefined;
      const response = await decideFacultyExcusedRequestApi(ids.length === 1
        ? { requestId: ids[0], decision, note }
        : { requestIds: ids, decision });
      setMessage(response.message);
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

  return (
    <section aria-label="Secretary requests">
    <Card className="p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Secretary requests ({pending.length})</h2>
          <p className="text-[11px] text-slate-500">Sent by class Secretaries. Approving applies the requested status; rejecting leaves the record unchanged.</p>
        </div>
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
            <button type="button" disabled={busy || chosen.length === 0} onClick={() => void decide(chosen, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Approve selected</button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>}
      {filter !== 'pending' && !hasHistory && <p className="text-xs text-slate-500">History not available.</p>}
      {filter !== 'pending' && hasHistory && shown.length === 0 && <p className="text-xs text-slate-500">No {filter} requests.</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {shown.map(request => (
          <li key={request.id} id={`secretary-request-${request.id}`} tabIndex={-1} className="py-3 text-xs space-y-2 outline-none focus:bg-sky-50 dark:focus:bg-sky-950/30">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="flex items-start gap-2">
                {filter === 'pending' && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${request.studentName}`}
                    checked={selected.includes(request.id)}
                    onChange={event => setSelected(current => event.target.checked ? [...current, request.id] : current.filter(id => id !== request.id))}
                    className="mt-0.5"
                  />
                )}
                <span><strong>{request.studentName}</strong> <span className="text-slate-500 dark:text-slate-400">{request.studentNumber}</span> · {request.courseCode} {request.className} · {request.sessionDate}{request.sessionCode ? ` (${request.sessionCode})` : ''}</span>
              </span>
              <span className="text-slate-500">by {request.requestedBy ?? 'Secretary'}{request.requestedAt ? ` · sent ${formatManilaWhen(request.requestedAt)}` : ''}</span>
            </div>
            <p className="text-slate-700 dark:text-slate-200">
              Requested: <strong>{word(request.requestedStatus ?? 'excused')}</strong> · Now: {request.currentStatus ? word(request.currentStatus) : 'Not recorded'}{request.currentMethod === 'biometric' ? ' (face check-in)' : ''}
              {(request.presentCutoff || request.lateCutoff) && <span className="text-slate-500"> · Present until {request.presentCutoff || '—'} · Late until {request.lateCutoff || '—'}</span>}
            </p>
            <p className="text-slate-600 dark:text-slate-300">Reason: {request.reason || 'None given'}</p>
            {request.status !== 'pending' && (
              <p className="text-slate-500">{word(request.status)}{request.decidedBy ? ` by ${request.decidedBy}` : ''}{request.decidedAt ? ` · ${request.decidedAt}` : ''}{request.decisionNote ? ` · ${request.decisionNote}` : ''}</p>
            )}
            {request.status === 'pending' && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  aria-label={`Decision note for ${request.studentName}`}
                  value={notes[request.id] ?? ''}
                  onChange={event => setNotes(current => ({ ...current, [request.id]: event.target.value }))}
                  maxLength={500}
                  placeholder="Optional note (for Reject)"
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                />
                <button type="button" disabled={busy} onClick={() => void decide([request.id], 'approve')} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">Approve</button>
                <button type="button" disabled={busy} onClick={() => void decide([request.id], 'reject')} className="rounded-lg border border-rose-300 px-3 py-1.5 font-bold text-rose-700 disabled:opacity-50">Reject</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
    </section>
  );
};
