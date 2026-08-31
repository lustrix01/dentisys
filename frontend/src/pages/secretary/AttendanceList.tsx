import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/Card';
import { getSecretaryAttendanceApi, getSecretaryProfileApi } from '../../services/apiClient';

type AttendanceItem = Awaited<ReturnType<typeof getSecretaryAttendanceApi>>['records'][number];

const statusClass: Record<string, string> = {
  present: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  late: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  absent: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  excused: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
};

export const AttendanceList: React.FC = () => {
  const [records, setRecords] = useState<AttendanceItem[]>([]);
  const [className, setClassName] = useState('');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [attendance, profile] = await Promise.all([
        getSecretaryAttendanceApi(),
        getSecretaryProfileApi(),
      ]);
      setRecords(attendance.records);
      setClassName(profile.profile.assignedClassName);
    } catch (requestError) {
      setRecords([]);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load attendance.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dates = useMemo(
    () => Array.from(new Set(records.map((record) => record.date))).sort().reverse(),
    [records],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (date && record.date !== date) return false;
      if (!needle) return true;
      return (
        record.studentName.toLocaleLowerCase().includes(needle) ||
        record.studentNumber.toLocaleLowerCase().includes(needle)
      );
    });
  }, [date, query, records]);
  const attended = filtered.filter((record) => record.status === 'present' || record.status === 'late').length;
  const rate = filtered.length ? Math.round((attended / filtered.length) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">Attendance List</h1>
          <p className="text-xs text-slate-400">{className || 'No section assigned'}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ['Records', filtered.length],
          ['Present', filtered.filter((record) => record.status === 'present').length],
          ['Late', filtered.filter((record) => record.status === 'late').length],
          ['Attendance', `${rate}%`],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-800 dark:text-slate-100">{value}</p></Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student name or number" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" />
          </label>
          <label className="relative">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
              <option value="">All dates</option>
              {dates.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-900">
              <tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Override</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">Loading persisted records…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">No attendance records match this filter.</td></tr>
              ) : filtered.map((record) => (
                <tr key={record.id}>
                  <td className="px-5 py-4"><p className="font-bold text-slate-800 dark:text-slate-100">{record.studentName}</p><p className="text-xs text-slate-400">{record.studentNumber}</p></td>
                  <td className="px-5 py-4">{record.date}</td>
                  <td className="px-5 py-4">{record.subjectCode}</td>
                  <td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1 text-xs font-bold capitalize ${statusClass[record.status] || ''}`}>{record.status}</span></td>
                  <td className="px-5 py-4 text-xs text-slate-500">{record.overrideReason ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />{record.overrideReason}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
