import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, Camera, CheckCircle2, Clock, Clock3, History, MapPin, Pencil, Play, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import {
  getSecretaryAttendanceApi,
  getSecretaryProfileApi,
  overrideSecretaryAttendanceApi,
  createSecretaryExcusedRequestApi,
} from '../../services/apiClient';

type AttendanceItem = Awaited<ReturnType<typeof getSecretaryAttendanceApi>>['records'][number];
type SessionItem = NonNullable<Awaited<ReturnType<typeof getSecretaryAttendanceApi>>['sessions']>[number];

const statusClass: Record<string, string> = {
  present: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  late: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  absent: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  excused: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
};

const sessionStatusClass: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  ended: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  revoked: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

const formatSessionTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatCheckInTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = value.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = match[2];
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
    }
    return value;
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const attendanceMethodLabel = (method?: string | null, overrideReason?: string | null): string => {
  if (overrideReason) return 'Manual Override';
  switch (method) {
    case 'biometric':
      return 'Face Biometric';
    case 'manual_faculty':
    case 'faculty_manual':
      return 'Faculty Manual Entry';
    case 'manual_secretary':
    case 'secretary_manual':
      return 'Secretary Manual Entry';
    case 'system_resolution':
      return 'System Resolution';
    default:
      return 'Not recorded';
  }
};

export const AttendanceList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<AttendanceItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [className, setClassName] = useState('');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [subject, setSubject] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedRecord, setSelectedRecord] = useState<AttendanceItem | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<'present' | 'late' | 'absent' | 'excused'>('present');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activePanel = searchParams.get('view') === 'history' ? 'history' : 'rollcall';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [attendance, profile] = await Promise.all([
        getSecretaryAttendanceApi(),
        getSecretaryProfileApi(),
      ]);
      setRecords(attendance.records || []);
      setSessions(attendance.sessions || []);
      setClassName(profile.profile.assignedClassName);
      const studentParam = searchParams.get('student');
      if (studentParam) {
        setQuery(studentParam);
      }
    } catch (requestError) {
      setRecords([]);
      setSessions([]);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load attendance.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenOverride = (record: AttendanceItem) => {
    setSelectedRecord(record);
    const validStatuses = ['present', 'late', 'absent', 'excused'];
    setOverrideStatus((validStatuses.includes(record.status) ? record.status : 'present') as 'present' | 'late' | 'absent' | 'excused');
    setReason(record.overrideReason || '');
    setFeedback(null);
  };

  const handleSaveOverride = async () => {
    if (!selectedRecord) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setFeedback({ type: 'error', text: 'A reason is required to submit an attendance override.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const targetSessionId = selectedRecord.attendanceSessionId ? Number(selectedRecord.attendanceSessionId) : undefined;
      if (overrideStatus === 'excused') {
        const response = await createSecretaryExcusedRequestApi({
          studentId: selectedRecord.studentId,
          recordId: selectedRecord.id || undefined,
          sessionId: targetSessionId,
          reason: trimmedReason,
        });
        setFeedback({ type: 'success', text: response.message || 'Excused request sent to Faculty for approval.' });
        setTimeout(() => {
          setSelectedRecord(null);
          setReason('');
          setFeedback(null);
        }, 1500);
        return;
      }

      const response = await overrideSecretaryAttendanceApi({
        studentId: selectedRecord.studentId,
        recordId: selectedRecord.id,
        sessionId: targetSessionId,
        date: selectedRecord.date,
        status: overrideStatus,
        reason: trimmedReason,
      });

      setRecords((current) =>
        current.map((r) =>
          (r.id && r.id === selectedRecord.id) || (!r.id && r.studentId === selectedRecord.studentId && r.date === selectedRecord.date)
            ? {
                ...r,
                id: response.record?.id ?? r.id,
                status: overrideStatus,
                overrideReason: trimmedReason,
                overrideAt: response.record?.overrideAt || new Date().toISOString(),
                verificationMethod: 'manual_secretary',
              }
            : r
        )
      );

      setFeedback({ type: 'success', text: response.message || 'Attendance override applied successfully.' });
      setTimeout(() => {
        setSelectedRecord(null);
        setReason('');
        setFeedback(null);
      }, 1200);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Attendance override was rejected.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dates = useMemo(() => Array.from(new Set([...records.map(record => record.date), ...sessions.map(session => session.date)])).sort().reverse(), [records, sessions]);
  const subjects = useMemo(() => Array.from(new Set([...records.map(record => record.subjectCode), ...sessions.map(session => session.subjectCode)].filter(Boolean))).sort(), [records, sessions]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (date && record.date !== date) return false;
      if (subject !== 'all' && record.subjectCode !== subject) return false;
      if (status !== 'all' && record.status !== status) return false;
      if (!needle) return true;
      return record.studentName.toLocaleLowerCase().includes(needle) || record.studentNumber.toLocaleLowerCase().includes(needle) || record.subjectCode.toLocaleLowerCase().includes(needle);
    });
  }, [date, query, records, status, subject]);

  const filteredSessions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return sessions.filter((session) => {
      if (date && session.date !== date) return false;
      if (subject !== 'all' && session.subjectCode !== subject) return false;
      if (!needle) return true;
      return [session.subjectCode, session.className, session.sessionCode, session.room || ''].join(' ').toLocaleLowerCase().includes(needle);
    });
  }, [date, query, sessions, subject]);

  const attended = filtered.filter((record) => record.status === 'present' || record.status === 'late' || record.status === 'excused').length;
  const present = filtered.filter((record) => record.status === 'present').length;
  const late = filtered.filter((record) => record.status === 'late').length;
  const absent = filtered.filter((record) => record.status === 'absent').length;
  const excused = filtered.filter((record) => record.status === 'excused').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-300"><ShieldCheck className="h-3.5 w-3.5" /> Secretary workspace</div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Attendance Monitoring</h1>
          <p className="mt-1 text-xs text-slate-400">{className || 'No section assigned'} · Review check-ins, session history, and audited attendance actions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/secretary/start-session" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"><Play className="h-4 w-4 fill-white" /> Start Attendance Session</Link>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh attendance" className="inline-flex items-center justify-center rounded-xl bg-slate-100 p-2.5 text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center justify-between rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span><button type="button" onClick={() => void load()} className="font-bold underline">Retry</button></div>}

      <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button type="button" onClick={() => setSearchParams({})} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-extrabold ${activePanel === 'rollcall' ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-400'}`}>Daily Roll Call</button>
          <button type="button" onClick={() => setSearchParams({ view: 'history' })} className={`inline-flex whitespace-nowrap items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-extrabold ${activePanel === 'history' ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-400'}`}><History className="h-3.5 w-3.5" /> Session History</button>
        </div>
      </div>

      <Card className="border border-slate-200 p-4 shadow-xs dark:border-slate-800">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Class section</span><div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">{className || 'No section assigned'}</div></label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Subject</span><select value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"><option value="all">All subjects</option>{subjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Date</span><select value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"><option value="">All dates</option>{dates.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Search</span><div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student name or ID..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 text-xs text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200" /></div></label>
        </div>
        {activePanel === 'rollcall' && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Class Roll Call ({filtered.length} records)</span><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">All: {filtered.length}</span><span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Present: {present}</span><span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">Late: {late}</span><span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:text-rose-300">Absent: {absent}</span><span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:text-sky-300">Excused: {excused}</span><span className="ml-auto text-[10px] font-bold text-slate-400">{filtered.length ? Math.round((attended / filtered.length) * 100) : 0}% attended</span></div>}
      </Card>

      {activePanel === 'rollcall' ? (
        <Card className="overflow-hidden border border-slate-200/80 p-0 shadow-xs dark:border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">STUDENT DETAILS</th>
                  <th className="px-6 py-4">CHECK-IN TIME</th>
                  <th className="px-6 py-4">VERIFICATION METHOD</th>
                  <th className="px-6 py-4">ATTENDANCE STATUS</th>
                  <th className="px-6 py-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      Loading persisted attendance…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      No attendance records match this filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((record) => (
                    <tr
                      key={record.id || `${record.studentId}-${record.date}`}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Column 1: STUDENT DETAILS */}
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs sm:text-sm">
                          {record.studentName}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {record.studentNumber} • Year {record.yearLevel || 1}
                        </span>
                      </td>

                      {/* Column 2: CHECK-IN TIME */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm">
                          <Clock className="w-4 h-4 text-slate-400 stroke-[2.2]" />
                          <span>{formatCheckInTime(record.timeRecorded)}</span>
                        </div>
                      </td>

                      {/* Column 3: VERIFICATION METHOD */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                          <Camera className="w-3.5 h-3.5 stroke-[2.2]" />
                          <span>{attendanceMethodLabel(record.verificationMethod, record.overrideReason)}</span>
                        </span>
                      </td>

                      {/* Column 4: ATTENDANCE STATUS */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                            record.status === 'present'
                              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                              : record.status === 'late'
                              ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                              : record.status === 'absent'
                              ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                              : 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
                          }`}
                        >
                          <span className="text-sm leading-none">•</span>
                          <span className="capitalize">{record.status || 'Present'}</span>
                        </span>
                      </td>

                      {/* Column 5: ACTIONS */}
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenOverride(record)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-500" />
                          <span>Override</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden border border-slate-200 p-0 shadow-xs dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><h2 className="font-heading text-sm font-extrabold text-slate-800 dark:text-slate-100">Class Sessions History & Management</h2><p className="mt-1 text-[11px] text-slate-400">Review created attendance sessions for your authorized class section.</p></div><Link to="/secretary/start-session" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-extrabold text-white hover:bg-blue-700"><Play className="h-3.5 w-3.5 fill-white" /> New session</Link></div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">{loading ? <div className="px-5 py-12 text-center text-slate-400">Loading session history…</div> : filteredSessions.length === 0 ? <div className="px-5 py-12 text-center text-slate-400">No sessions match this filter.</div> : filteredSessions.map((session) => <div key={session.sessionId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-800 dark:text-slate-100">{session.subjectCode} · {session.className}</span><span className={`rounded-lg px-2 py-1 text-[10px] font-extrabold capitalize ${sessionStatusClass[session.status] || sessionStatusClass.ended}`}>{session.status}</span></div><p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><CalendarDays className="h-3.5 w-3.5" /> {session.date}<Clock3 className="ml-1 h-3.5 w-3.5" /> {formatSessionTime(session.startedAt)} {session.room && <><MapPin className="ml-1 h-3.5 w-3.5" /> {session.room}</>}</p><p className="mt-1 text-[10px] font-mono text-slate-400">Session code: {session.sessionCode}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => { setDate(session.date); setSubject(session.subjectCode); setSearchParams({}); }} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer">View roll call</button><Link to="/secretary/start-session" className="rounded-lg border border-blue-200 px-3 py-1.5 text-[10px] font-bold text-blue-700 dark:border-blue-900 dark:text-blue-300">View control</Link></div></div>)}</div>
        </Card>
      )}

      {selectedRecord && (
        <Modal
          isOpen={Boolean(selectedRecord)}
          onClose={() => {
            if (!submitting) {
              setSelectedRecord(null);
              setFeedback(null);
            }
          }}
          title="Manual Attendance Override"
        >
          <div className="space-y-5">
            {/* Student info header */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {selectedRecord.studentName}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedRecord.studentNumber} · {selectedRecord.subjectCode} · {selectedRecord.date}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Current:</span>
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold capitalize ${statusClass[selectedRecord.status] || 'bg-slate-100 text-slate-600'}`}>
                    {selectedRecord.status || 'Not recorded'}
                  </span>
                </div>
              </div>
            </div>

            {/* Status selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Target Status
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { key: 'present', label: 'Present' },
                    { key: 'late', label: 'Late' },
                    { key: 'absent', label: 'Absent' },
                    { key: 'excused', label: 'Request Excused' },
                  ] as const
                ).map((opt) => {
                  const isSelected = overrideStatus === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setOverrideStatus(opt.key)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
                        isSelected
                          ? opt.key === 'present'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : opt.key === 'late'
                            ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                            : opt.key === 'absent'
                            ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                            : 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {overrideStatus === 'excused' && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                <p className="font-semibold">Excused needs Faculty approval</p>
                <p className="mt-0.5 text-[11px] text-sky-700 dark:text-sky-300">
                  Submitting will create an excused absence request for the assigned faculty to review.
                </p>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Required Correction Reason
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the reason for this attendance override (e.g., Medical certificate verified, technical camera delay, authorized official business)..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:bg-slate-800"
              />
            </div>

            {feedback && (
              <div
                className={`rounded-xl p-3 text-xs font-semibold ${
                  feedback.type === 'success'
                    ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                }`}
              >
                {feedback.text}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedRecord(null);
                  setFeedback(null);
                }}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveOverride()}
                disabled={submitting || !reason.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Saving…' : overrideStatus === 'excused' ? 'Send request' : 'Confirm override'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
