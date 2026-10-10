import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatSessionDate } from '../../utils/sessionDate';
import { AlertCircle, Camera, CheckCircle2, Clock, Pencil, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { StartSession } from './StartSession';
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
  const [query, setQuery] = useState(() => searchParams.get('student') ?? '');
  const [date, setDate] = useState(() => searchParams.get('date') ?? '');
  const [subject, setSubject] = useState('all');
  const [sessionId, setSessionId] = useState(() => searchParams.get('sessionId') ?? searchParams.get('session') ?? '');
  const [sessionRecords, setSessionRecords] = useState<AttendanceItem[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const sessionRequest = useRef(0);
  const loadRequest = useRef(0);
  const saving = useRef(false);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedRecord, setSelectedRecord] = useState<AttendanceItem | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<'present' | 'late' | 'absent' | 'excused'>('present');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activePanel = searchParams.get('tab') === 'sessions' ? 'sessions' : searchParams.get('tab') === 'rollcall' || searchParams.get('view') === 'rollcall' || searchParams.has('sessionId') || searchParams.has('session') || searchParams.has('student') || searchParams.has('date') ? 'rollcall' : 'sessions';
  const switchTab = (tab: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    next.delete('view');
    next.set('tab', tab);
    return next;
  });

  const load = async () => {
    if (saving.current) return;
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError('');
    try {
      const [attendance, profile] = await Promise.all([
        getSecretaryAttendanceApi(),
        getSecretaryProfileApi(),
      ]);
      if (loadRequest.current !== requestId) return;
      setRecords(attendance.records || []);
      setSessions(attendance.sessions || []);
      setClassName(profile.profile.assignedClassName);
    } catch (requestError) {
      if (loadRequest.current !== requestId) return;
      setRecords([]);
      setSessions([]);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load attendance.');
    } finally {
      if (loadRequest.current === requestId) setLoading(false);
    }
  };

  const handleOpenOverride = (record: AttendanceItem) => {
    if (saving.current || loading || sessionLoading) return;
    setSelectedRecord(record);
    const validStatuses = ['present', 'late', 'absent', 'excused'];
    setOverrideStatus((validStatuses.includes(record.status) ? record.status : 'present') as 'present' | 'late' | 'absent' | 'excused');
    setReason('');
    setFeedback(null);
  };

  const handleSaveOverride = async () => {
    if (!selectedRecord || saving.current || loading || sessionLoading) return;
    const trimmedReason = reason.trim().replace(/\s+/g, ' ');
    if (trimmedReason.length < 8 || trimmedReason.length > (overrideStatus === 'excused' ? 500 : 240)) {
      setFeedback({ type: 'error', text: `Provide a new reason of 8–${overrideStatus === 'excused' ? 500 : 240} characters.` });
      return;
    }
    if (overrideStatus === selectedRecord.status) {
      setFeedback({ type: 'error', text: 'Choose a different attendance status.' });
      return;
    }

    saving.current = true;
    ++loadRequest.current;
    ++sessionRequest.current;
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
        setSelectedRecord(null);
        setReason('');
        setRefreshVersion(version => version + 1);
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

      const updateRecords = (current: AttendanceItem[]) =>
        current.map((r) =>
          (r.id && r.id === selectedRecord.id) || (!r.id && r.studentId === selectedRecord.studentId && r.attendanceSessionId === selectedRecord.attendanceSessionId)
            ? {
                ...r,
                id: response.record?.id ?? r.id,
                status: overrideStatus,
                overrideReason: trimmedReason,
                overrideAt: response.record?.overrideAt ?? r.overrideAt,
                // Corrections keep how the original attendance was established (ATT-005).
                verificationMethod: r.id ? r.verificationMethod : 'manual_secretary',
              }
            : r
        )
      ;
      setRecords(current => {
        const updated = updateRecords(current);
        if (!selectedRecord.id && response.record?.id && !current.some(record => record.id === response.record?.id)) {
          return [...updated, {
            ...selectedRecord,
            id: response.record.id,
            status: overrideStatus,
            overrideReason: trimmedReason,
            overrideAt: response.record.overrideAt,
            verificationMethod: 'manual_secretary',
          }];
        }
        return updated;
      });
      setSessionRecords(updateRecords);

      setFeedback({ type: 'success', text: response.message || 'Attendance override applied successfully.' });
      setSelectedRecord(null);
      setReason('');
      setRefreshVersion(version => version + 1);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Attendance override was rejected.',
      });
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void load();
    return () => { ++loadRequest.current; };
  }, [activePanel]);

  useEffect(() => {
    const requestId = ++sessionRequest.current;
    setSessionRecords([]);
    setSelectedRecord(null);
    if (!sessionId) { setSessionLoading(false); return; }
    setSessionLoading(true);
    setError('');
    getSecretaryAttendanceApi({ sessionId })
      .then(response => { if (sessionRequest.current === requestId) setSessionRecords(response.records); })
      .catch(err => { if (sessionRequest.current === requestId) setError(err instanceof Error ? err.message : 'Unable to load session roster.'); })
      .finally(() => { if (sessionRequest.current === requestId) setSessionLoading(false); });
    return () => { ++sessionRequest.current; };
  }, [sessionId, refreshVersion]);

  const dates = useMemo(() => Array.from(new Set([...records.map(record => record.date), ...sessions.map(session => session.date)])).sort().reverse(), [records, sessions]);
  const subjects = useMemo(() => Array.from(new Set([...records.map(record => record.subjectCode), ...sessions.map(session => session.subjectCode)].filter(Boolean))).sort(), [records, sessions]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (sessionId ? sessionRecords : records).filter((record) => {
      if (date && record.date !== date) return false;
      if (subject !== 'all' && record.subjectCode !== subject) return false;
      if (status !== 'all' && record.status !== status) return false;
      if (!needle) return true;
      return record.studentName.toLocaleLowerCase().includes(needle) || record.studentNumber.toLocaleLowerCase().includes(needle) || record.subjectCode.toLocaleLowerCase().includes(needle);
    });
  }, [date, query, records, sessionRecords, sessionId, status, subject]);

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
          {activePanel === 'rollcall' && <button type="button" onClick={() => { setRefreshVersion(version => version + 1); void load(); }} disabled={loading || submitting || sessionLoading} aria-label="Refresh attendance" className="inline-flex items-center justify-center rounded-xl bg-slate-100 p-2.5 text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>}
        </div>
      </div>

      {error && <div role="alert" className="flex items-center justify-between rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span><button type="button" disabled={submitting} onClick={() => { setRefreshVersion(version => version + 1); void load(); }} className="font-bold underline">Retry</button></div>}

      <div role="tablist" aria-label="Attendance Monitoring" className="flex flex-wrap gap-2">
        {(['sessions', 'rollcall'] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={activePanel === tab} onClick={() => switchTab(tab)} className={activePanel === tab ? 'rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white' : 'rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>{tab === 'sessions' ? 'Sessions' : 'Roll call'}</button>)}
      </div>
      {activePanel === 'sessions' && <StartSession embedded onOpenRollCall={id => { setSessionId(id); setDate(''); setSubject('all'); setQuery(''); switchTab('rollcall'); }} />}
      {activePanel === 'rollcall' && <>
        <p className="text-xs text-slate-500 dark:text-slate-400">Students in this section and their attendance for the selected session.</p>
      {!selectedRecord && feedback && <p role="status" className="text-xs font-bold text-emerald-700">{feedback.text}</p>}
      <Card className="border border-slate-200 p-4 shadow-xs dark:border-slate-800">
        <label className="mb-3 block text-xs font-bold">Attendance session
          <select value={sessionId} disabled={submitting} onChange={event => { setSessionId(event.target.value); setDate(''); setSubject('all'); }} className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <option value="">All recorded results</option>
            {sessions.map(session => <option key={session.sessionId} value={session.sessionId}>{session.subjectCode} · {formatSessionDate(session.date)} · {formatSessionTime(session.startedAt)} · {session.sessionCode}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Class section</span><div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">{className || 'No section assigned'}</div></label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Subject</span><select value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"><option value="all">All subjects</option>{subjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Date</span><select value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"><option value="">All dates</option>{dates.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Search</span><div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student name or ID..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 text-xs text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200" /></div></label>
        </div>
        {activePanel === 'rollcall' && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">Class Roll Call ({filtered.length} records)</span><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">All: {filtered.length}</span><span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Present: {present}</span><span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">Late: {late}</span><span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:text-rose-300">Absent: {absent}</span><span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:text-sky-300">Excused: {excused}</span><span className="ml-auto text-[10px] font-bold text-slate-400">{filtered.length ? Math.round((attended / filtered.length) * 100) : 0}% attended</span></div>}
      </Card>

      {(
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
                {loading || sessionLoading ? (
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
                      key={record.id || `${record.studentId}-${record.attendanceSessionId}`}
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
                          <span className="capitalize">{record.status && record.status !== 'not_recorded' ? record.status : 'Not recorded'}</span>
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
      )}
      </>}

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
                maxLength={overrideStatus === 'excused' ? 500 : 240}
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
                disabled={submitting || reason.trim().length < 8 || overrideStatus === selectedRecord.status}
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
