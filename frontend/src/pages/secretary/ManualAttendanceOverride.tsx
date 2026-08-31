import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Search,
  ShieldAlert,
  UserX,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { Modal } from '../../components/Modal';
import {
  getSecretaryAttendanceApi,
  getSecretaryProfileApi,
  overrideSecretaryAttendanceApi,
} from '../../services/apiClient';

type EditableStatus = 'present' | 'late' | 'absent';
type ApiRecord = Awaited<ReturnType<typeof getSecretaryAttendanceApi>>['records'][number];

const statusClasses: Record<string, string> = {
  present: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  late: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  absent: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  excused: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
};

export const ManualAttendanceOverride: React.FC = () => {
  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [className, setClassName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selected, setSelected] = useState<ApiRecord | null>(null);
  const [status, setStatus] = useState<EditableStatus>('present');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [attendance, profile] = await Promise.all([
        getSecretaryAttendanceApi(),
        getSecretaryProfileApi(),
      ]);
      setRecords(attendance.records);
      setClassName(profile.profile.assignedClassName);
      const firstDate = attendance.records[0]?.date || '';
      setSelectedDate((current) => current || firstDate);
    } catch (requestError) {
      setMessage({
        type: 'error',
        text: requestError instanceof Error ? requestError.message : 'Unable to load attendance records.',
      });
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
      if (selectedDate && record.date !== selectedDate) return false;
      if (!needle) return true;
      return (
        record.studentName.toLocaleLowerCase().includes(needle) ||
        record.studentNumber.toLocaleLowerCase().includes(needle)
      );
    });
  }, [query, records, selectedDate]);

  const selectRecord = (record: ApiRecord) => {
    setSelected(record);
    setStatus(record.status === 'present' ? 'late' : 'present');
    setReason('');
    setMessage(null);
  };

  const review = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const cleaned = reason.trim().replace(/\s+/g, ' ');
    if (!selected) {
      setMessage({ type: 'error', text: 'Select an attendance record before saving.' });
      return;
    }
    if (cleaned.length < 8 || cleaned.length > 240) {
      setMessage({ type: 'error', text: 'Provide a correction reason between 8 and 240 characters.' });
      return;
    }
    if (selected.status === status) {
      setMessage({ type: 'error', text: 'Choose a different attendance status.' });
      return;
    }
    setReason(cleaned);
    setConfirming(true);
  };

  const save = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const response = await overrideSecretaryAttendanceApi({
        studentId: selected.studentId,
        recordId: selected.id,
        status,
        reason,
      });
      setRecords((current) =>
        current.map((record) =>
          record.id === selected.id
            ? {
                ...record,
                status,
                overrideReason: reason,
                overrideAt: response.record?.overrideAt || new Date().toISOString(),
              }
            : record,
        ),
      );
      setSelected(null);
      setReason('');
      setConfirming(false);
      setMessage({ type: 'success', text: response.message });
    } catch (requestError) {
      setConfirming(false);
      setMessage({
        type: 'error',
        text: requestError instanceof Error ? requestError.message : 'Attendance override was rejected.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">
            Manual Attendance Override
          </h1>
          <p className="text-xs text-slate-400">
            {className || 'Assigned class'} · Every persisted change is timestamped and audited.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-500/20">
          <ShieldAlert className="w-4 h-4" />
          Assigned-section access
        </div>
      </div>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`rounded-xl p-4 text-xs font-semibold ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
          }`}
        >
          {message.text}
          {message.type === 'error' && (
            <button type="button" onClick={() => void load()} className="ml-3 underline">
              Retry
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student name or ID" className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-slate-100" />
              </label>
              <label className="relative block">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-slate-100">
                  <option value="">All dates</option>
                  {dates.map((date) => <option key={date} value={date}>{date}</option>)}
                </select>
              </label>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">Loading attendance…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">No persisted attendance records match this filter.</td></tr>
                  ) : filtered.map((record) => (
                    <tr key={record.id} className={selected?.id === record.id ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''}>
                      <td className="px-5 py-4"><p className="font-bold text-slate-800 dark:text-slate-100">{record.studentName}</p><p className="text-xs text-slate-400">{record.studentNumber}</p></td>
                      <td className="px-5 py-4">{record.date}</td>
                      <td className="px-5 py-4">{record.subjectCode}</td>
                      <td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1 text-xs font-bold capitalize ${statusClasses[record.status] || ''}`}>{record.status}</span></td>
                      <td className="px-5 py-4 text-right"><button type="button" onClick={() => selectRecord(record)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-300">Select</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Correction Details</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={review} className="space-y-4">
              {selected ? (
                <div className="rounded-2xl border border-slate-200/50 bg-slate-50 p-4 text-xs dark:border-slate-800/50 dark:bg-slate-900">
                  <p className="font-bold text-slate-800 dark:text-slate-100">{selected.studentName}</p>
                  <p className="mt-1 text-slate-400">{selected.studentNumber} · {selected.subjectCode} · {selected.date}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400 dark:border-slate-800">Select a record to correct.</div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {(['present', 'late', 'absent'] as EditableStatus[]).map((nextStatus) => {
                  const Icon = nextStatus === 'present' ? CheckCircle2 : nextStatus === 'late' ? Clock : UserX;
                  return <button key={nextStatus} type="button" onClick={() => setStatus(nextStatus)} disabled={!selected} className={`min-h-20 rounded-xl border text-xs font-bold capitalize flex flex-col items-center justify-center gap-1.5 disabled:opacity-40 ${status === nextStatus ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'border-slate-200 text-slate-500 dark:border-slate-800'}`}><Icon className="w-4 h-4" />{nextStatus}</button>;
                })}
              </div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">
                Required correction reason
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={240} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal normal-case tracking-normal text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" />
              </label>
              <button type="submit" disabled={!selected || submitting} className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Review and Apply Override</button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Modal isOpen={confirming} onClose={() => setConfirming(false)} title="Confirm attendance override">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>Change {selected?.studentName} from <strong>{selected?.status}</strong> to <strong>{status}</strong>? This creates a permanent audit event.</p>
          </div>
          <p className="text-xs text-slate-500">Reason: {reason}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={submitting} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{submitting ? 'Saving…' : 'Confirm override'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
