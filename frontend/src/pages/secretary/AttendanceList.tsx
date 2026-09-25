import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, History, MapPin, Play, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { getSecretaryAttendanceApi, getSecretaryProfileApi } from '../../services/apiClient';

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
    } catch (requestError) {
      setRecords([]);
      setSessions([]);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load attendance.');
    } finally {
      setLoading(false);
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

  const attended = filtered.filter((record) => record.status === 'present' || record.status === 'late').length;
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
        <Link to="/secretary/override" className="mb-2 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Manual attendance override <span aria-hidden="true">→</span></Link>
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
        <Card className="overflow-hidden border border-slate-200 p-0 shadow-xs dark:border-slate-800">
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:bg-slate-900"><tr><th className="px-5 py-3">Student details</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Verification method</th><th className="px-5 py-3">Attendance status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">Loading persisted attendance…</td></tr> : filtered.length === 0 ? <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">No attendance records match this filter.</td></tr> : filtered.map((record) => <tr key={record.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"><td className="px-5 py-4"><p className="font-bold text-slate-800 dark:text-slate-100">{record.studentName}</p><p className="text-[10px] text-slate-400">{record.studentNumber} · {record.subjectCode}</p></td><td className="px-5 py-4 text-slate-600 dark:text-slate-300">{record.date}</td><td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" /> {record.overrideReason ? 'Manual correction' : 'Method unavailable'}</span></td><td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold capitalize ${statusClass[record.status] || 'bg-slate-100 text-slate-600'}`}>{record.status}</span>{record.overrideReason && <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><ShieldCheck className="h-3 w-3" /> Audited correction</span>}</td><td className="px-5 py-4 text-right"><Link to="/secretary/override" className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Override</Link></td></tr>)}
          </tbody></table></div>
        </Card>
      ) : (
        <Card className="overflow-hidden border border-slate-200 p-0 shadow-xs dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><h2 className="font-heading text-sm font-extrabold text-slate-800 dark:text-slate-100">Class Sessions History & Management</h2><p className="mt-1 text-[11px] text-slate-400">Review created attendance sessions for your authorized class section.</p></div><Link to="/secretary/start-session" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-extrabold text-white hover:bg-blue-700"><Play className="h-3.5 w-3.5 fill-white" /> New session</Link></div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">{loading ? <div className="px-5 py-12 text-center text-slate-400">Loading session history…</div> : filteredSessions.length === 0 ? <div className="px-5 py-12 text-center text-slate-400">No sessions match this filter.</div> : filteredSessions.map((session) => <div key={session.sessionId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-800 dark:text-slate-100">{session.subjectCode} · {session.className}</span><span className={`rounded-lg px-2 py-1 text-[10px] font-extrabold capitalize ${sessionStatusClass[session.status] || sessionStatusClass.ended}`}>{session.status}</span></div><p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><CalendarDays className="h-3.5 w-3.5" /> {session.date}<Clock3 className="ml-1 h-3.5 w-3.5" /> {formatSessionTime(session.startedAt)} {session.room && <><MapPin className="ml-1 h-3.5 w-3.5" /> {session.room}</>}</p><p className="mt-1 text-[10px] font-mono text-slate-400">Session code: {session.sessionCode}</p></div><div className="flex items-center gap-2"><Link to="/secretary/override" className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Edit attendance</Link><Link to="/secretary/start-session" className="rounded-lg border border-blue-200 px-3 py-1.5 text-[10px] font-bold text-blue-700 dark:border-blue-900 dark:text-blue-300">View control</Link></div></div>)}</div>
        </Card>
      )}
    </div>
  );
};
