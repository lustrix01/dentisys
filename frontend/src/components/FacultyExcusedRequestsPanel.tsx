import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { AttendanceExcusedRequest, decideFacultyExcusedRequestApi, getFacultyExcusedRequestsApi } from '../services/apiClient';

/**
 * ATT-006: pending Excused requests from class Secretaries. Approving sets the
 * student's attendance for that day to Excused; rejecting leaves it unchanged.
 */
export const FacultyExcusedRequestsPanel: React.FC<{ onDecided?: () => void }> = ({ onDecided }) => {
  const [requests, setRequests] = useState<AttendanceExcusedRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getFacultyExcusedRequestsApi()
      .then(response => { if (active) setRequests(response.requests ?? []); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load Excused requests.'); });
    return () => { active = false; };
  }, [reloadKey]);

  const pending = requests.filter(request => request.status === 'pending');

  const decide = async (request: AttendanceExcusedRequest, decision: 'approve' | 'reject') => {
    setBusyId(request.id);
    setError(null);
    try {
      const response = await decideFacultyExcusedRequestApi({ requestId: request.id, decision, note: notes[request.id]?.trim() || undefined });
      setMessage(response.message);
      setReloadKey(key => key + 1);
      onDecided?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the decision.');
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0 && !error && !message) return null;

  return (
    <section aria-label="Excused requests">
    <Card className="p-5 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Excused requests ({pending.length})</h2>
        <p className="text-[11px] text-slate-500">Sent by class Secretaries. Approving sets the attendance to Excused; rejecting leaves it unchanged.</p>
      </div>
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {pending.map(request => (
          <li key={request.id} className="py-3 text-xs space-y-2">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span><strong>{request.studentName}</strong> <span className="text-slate-400">{request.studentNumber}</span> · {request.courseCode} {request.className} · {request.sessionDate}{request.sessionCode ? ` (${request.sessionCode})` : ''}</span>
              <span className="text-slate-500">Now: {request.currentStatus ?? 'not recorded'} · by {request.requestedBy ?? 'Secretary'}</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">Reason: {request.reason}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                aria-label={`Decision note for ${request.studentName}`}
                value={notes[request.id] ?? ''}
                onChange={event => setNotes(current => ({ ...current, [request.id]: event.target.value }))}
                maxLength={500}
                placeholder="Optional note"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              />
              <button type="button" disabled={busyId !== null} onClick={() => void decide(request, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">Approve</button>
              <button type="button" disabled={busyId !== null} onClick={() => void decide(request, 'reject')} className="rounded-lg border border-rose-300 px-3 py-1.5 font-bold text-rose-700 disabled:opacity-50">Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
    </section>
  );
};
