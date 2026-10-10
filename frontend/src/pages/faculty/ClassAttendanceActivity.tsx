import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Card } from '../../components/Card';
import { FacultyAttendanceActivityRow, getFacultyAttendanceActivityApi } from '../../services/apiClient';

const STATUS_LABEL: Record<string, string> = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };
const statusLabel = (status: string | null) => (status ? STATUS_LABEL[status] ?? status : 'Not recorded');

const formatManila = (value: string | null) => value
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
  : '—';

/** Attendance status changes in the Faculty member's classes (server data only). */
export const ClassAttendanceActivity: React.FC<{ classIds?: string[] }> = ({ classIds }) => {
  const [rows, setRows] = useState<FacultyAttendanceActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getFacultyAttendanceActivityApi(200)
      .then(response => { if (active) setRows(response.activity ?? []); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Failed to load class attendance activity.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = classIds ? rows.filter(row => row.classId !== null && classIds.includes(row.classId)) : rows;
    if (!needle) return scoped;
    return scoped.filter(row => [row.studentName, row.studentNumber, row.className, row.courseCode, row.sessionCode, row.actorName, row.reason]
      .some(value => (value ?? '').toLowerCase().includes(needle)));
  }, [rows, query, classIds]);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Class Attendance Activity</h1>
          <p className="text-xs text-slate-400 mt-1">Attendance changes in your classes: manual records and corrections by you or the class Secretary.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input aria-label="Search class attendance activity" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search student, section, session" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800" />
          </div>
          <button type="button" aria-label="Refresh class attendance activity" onClick={() => setReloadKey(key => key + 1)} disabled={loading} className="rounded-xl border border-slate-200 px-3 text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <Card className="p-0 overflow-x-auto">
        {error ? (
          <p role="alert" className="p-6 text-sm text-rose-600">{error}</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Change</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading class attendance activity…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No attendance changes found.</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatManila(row.occurredAt)}</td>
                  <td className="px-4 py-3"><span className="font-semibold">{row.studentName ?? '—'}</span><span className="block text-slate-400">{row.studentNumber ?? ''}</span></td>
                  <td className="px-4 py-3">{row.courseCode ?? ''} {row.className ?? '—'}</td>
                  <td className="px-4 py-3">{row.sessionDate ?? '—'}<span className="block font-mono text-slate-400">{row.sessionCode ?? ''}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap">{statusLabel(row.previousStatus)} → <strong>{statusLabel(row.newStatus)}</strong></td>
                  <td className="px-4 py-3">{row.reason ?? '—'}</td>
                  <td className="px-4 py-3">{row.actorName ?? '—'}<span className="block text-slate-400 capitalize">{row.actorRole}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};
