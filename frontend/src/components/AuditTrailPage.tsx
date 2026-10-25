import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileText, Filter, RefreshCw, Search, ShieldAlert, ShieldCheck, ShieldOff, SlidersHorizontal, UserX } from 'lucide-react';
import type { AuditEntry, AuditListResponse, AuditQuery, AuditStatus, DatePreset } from '../services/auditService';
import {
  auditCsv, auditCsvRows, auditDateRange, auditWho, currentTerm, formatManilaWhen, groupByDay,
} from '../services/auditService';
import { getAcademicTermsApi, getAdminAuditLogsApi, getFacultyActivityApi, getFacultyClassesApi, getSecretaryActivityApi } from '../services/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Modal } from './Modal';
import { flushSync } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { PrintStyle, PrintHeader, PrintCaption, formatPrintedAt } from './PrintSheet';

type Role = 'admin' | 'faculty' | 'secretary';
type Props = { role: Role; title: string; subtitle: string; allLogs?: boolean; accent: 'accent' | 'clinical' | 'blue' };
type Term = { startDate: string | null; endDate: string | null };

const themes = {
  accent: { button: 'bg-accent-600 hover:bg-accent-700', icon: 'text-accent-500', surface: 'border-accent-200/60 bg-accent-50/50 dark:border-accent-900/30 dark:bg-accent-950/15' },
  clinical: { button: 'bg-clinical-600 hover:bg-clinical-700', icon: 'text-clinical-500', surface: 'border-clinical-200/60 bg-clinical-50/50 dark:border-clinical-900/30 dark:bg-clinical-950/15' },
  blue: { button: 'bg-blue-600 hover:bg-blue-700', icon: 'text-blue-500', surface: 'border-blue-200/60 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/15' },
};
const statusClass: Record<AuditStatus, string> = {
  Success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  Warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  Failed: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
};
const EXPORT_PAGE_CAP = 40; // 40 pages x 50 rows; larger exports say so
const CHANGES_PREVIEW = 10;
// Old look at xl (>= 1280 px); taller touch targets below it.
const control = 'min-h-[44px] xl:min-h-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500';
const tapButton = 'flex items-center gap-1.5 min-h-[44px] xl:min-h-0 px-3.5 py-2.5 rounded-xl text-xs font-bold';
const pagerButton = 'min-h-[44px] xl:min-h-0 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 font-bold disabled:opacity-40';
const ROLE_OPTIONS: Array<[string, string]> = [['', 'All roles'], ['admin', 'Dean'], ['faculty', 'Faculty'], ['secretary', 'Secretary'], ['student', 'Student'], ['system', 'System']];

const StatusBadge: React.FC<{ status: AuditStatus }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase ${statusClass[status]}`}>{status}</span>
);

/** Same wording as the Audit Trail, in the dashboards' own markup. */
export const AuditCompactList: React.FC<{ entries: AuditEntry[]; variant?: 'list' | 'cards' }> = ({ entries, variant = 'list' }) => variant === 'cards' ? (
  <>
    {entries.map(entry => (
      <div key={entry.id} className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
        <p className="text-slate-700 dark:text-slate-300 text-xs font-medium break-words">{entry.what} — {entry.record}{entry.change && entry.change !== '—' ? ` · ${entry.change}` : ''}</p>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">{formatManilaWhen(entry.occurredAt)}</span>
      </div>
    ))}
  </>
) : (
  <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
    {entries.map(entry => (
      <li key={entry.id} className="py-2.5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <span className="text-slate-700 dark:text-slate-200 break-words">
          <span className="font-semibold">{auditWho(entry)}</span>
          {' — '}{entry.what} · <span className="whitespace-nowrap">{entry.record}</span>{entry.change && entry.change !== '—' ? ` · ${entry.change}` : ''}
        </span>
        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{entry.status} · {formatManilaWhen(entry.occurredAt)}</span>
      </li>
    ))}
  </ul>
);

const ChangesTable: React.FC<{ changes: AuditEntry['details']['changes'] }> = ({ changes }) => {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const matching = needle ? changes.filter(c => `${c.field} ${c.before} ${c.after}`.toLowerCase().includes(needle)) : changes;
  const shown = showAll || needle ? matching : matching.slice(0, CHANGES_PREVIEW);
  if (changes.length === 0) return <p className="mt-1 text-slate-500 dark:text-slate-400">No field changes recorded.</p>;
  return (
    <div className="mt-1 space-y-2">
      {changes.length > CHANGES_PREVIEW && (
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search changes..." aria-label="Search changes" className={control} />
      )}
      <div className="overflow-x-auto rounded-lg bg-slate-50 dark:bg-slate-900">
        <table className="w-full min-w-[420px] text-left text-[11px]">
          <thead className="text-[9px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
            <tr><th className="px-3 py-2">Field</th><th className="px-3 py-2">Before</th><th className="px-3 py-2">After</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {shown.map((c, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2 font-semibold break-words">{c.field}</td>
                <td className="px-3 py-2 break-words text-slate-500">{c.before}</td>
                <td className="px-3 py-2 break-words text-slate-700 dark:text-slate-300">{c.after}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">No changes match.</td></tr>}
          </tbody>
        </table>
      </div>
      {!needle && matching.length > CHANGES_PREVIEW && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="min-h-[44px] xl:min-h-0 text-[11px] font-bold text-blue-600 dark:text-blue-400">
          {showAll ? 'Show fewer' : `Show all ${matching.length}`}
        </button>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{label}</p>
    <div className="mt-1 font-medium text-slate-700 dark:text-slate-300 break-words">{children}</div>
  </div>
);

export const AuditTrailPage: React.FC<Props> = ({ role, title, subtitle, accent }) => {
  const theme = themes[accent];
  const { user } = useAuth();
  const [printRows, setPrintRows] = useState<string[][] | null>(null);
  const [printedAt, setPrintedAt] = useState<Date | null>(null);

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [card, setCard] = useState('');
  const [cls, setCls] = useState('');
  const [signins, setSignins] = useState(false);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AuditListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [term, setTerm] = useState<Term | null>(null);
  const [classes, setClasses] = useState<Array<{ id: string; label: string }>>([]);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState('');
  const latest = useRef(0);

  // Search is sent to the server after a short pause, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  // "This term" needs a known current term: Dean reads the terms list, Faculty gets terms with their classes.
  // The Secretary has no term API, so that role gets the custom range only.
  useEffect(() => {
    if (role === 'admin') {
      getAcademicTermsApi().then(r => setTerm(currentTerm(r.terms ?? []))).catch(() => setTerm(null));
    } else if (role === 'faculty') {
      getFacultyClassesApi().then(r => {
        setTerm(currentTerm(r.academicTerms ?? []));
        setClasses((r.classes ?? []).map(c => ({ id: String(c.csId), label: `${c.courseCode} · ${c.csName}` })));
      }).catch(() => undefined);
    }
  }, [role]);

  const range = auditDateRange(preset, custom, term);
  const params = (pageNumber: number): AuditQuery => ({
    q, area, status, from: range.from, to: range.to, signins, sort, page: pageNumber,
    ...(role === 'admin' ? { role: roleFilter, card } : {}),
    ...(role === 'faculty' ? { cls } : {}),
  });
  const fetchPage = (pageNumber: number): Promise<AuditListResponse> => {
    const p = params(pageNumber);
    return role === 'admin' ? getAdminAuditLogsApi(p) : role === 'faculty' ? getFacultyActivityApi(p) : getSecretaryActivityApi(p);
  };

  const fetchLogs = () => {
    const ticket = ++latest.current;
    setLoading(true);
    setError('');
    fetchPage(page)
      .then(r => { if (ticket === latest.current) { setData(r); setExpanded(new Set()); setPrintRows(null); } })
      .catch(err => { if (ticket === latest.current) setError(err instanceof Error ? err.message : 'Failed to retrieve audit trail records.'); })
      .finally(() => { if (ticket === latest.current) setLoading(false); });
  };

  const paramKey = JSON.stringify(params(page));
  useEffect(() => { fetchLogs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [paramKey]);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize || 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const groups = useMemo(() => groupByDay(entries), [entries]);
  const filtersActive = Boolean(q || area || status || roleFilter || card || cls || signins || preset !== 'all' || sort !== 'newest');

  const change = (fn: () => void) => { fn(); setPage(1); };
  const clearFilters = () => {
    setQInput(''); setQ(''); setArea(''); setStatus(''); setRoleFilter(''); setCard(''); setCls(''); setSignins(false);
    setSort('newest'); setPreset('all'); setCustom({ from: '', to: '' }); setPage(1);
  };
  // A card shows exactly the rows it counts; other filters except the date are reset.
  const applyCard = (key: string) => {
    setCard(key); setArea(''); setStatus(''); setQInput(''); setQ(''); setRoleFilter(''); setPage(1);
  };

  // Export and print use the whole filtered list, not just the visible page.
  const fetchAll = async (): Promise<AuditEntry[]> => {
    const all: AuditEntry[] = [];
    setNote('');
    for (let p = 1; p <= EXPORT_PAGE_CAP; p++) {
      const r = await fetchPage(p);
      all.push(...r.entries);
      if (p >= Math.ceil(r.total / (r.pageSize || 50))) return all;
    }
    setNote(`Only the first ${EXPORT_PAGE_CAP * 50} rows were included. Narrow the filters to export the rest.`);
    return all;
  };

  const exportCsv = async () => {
    setWorking(true);
    try {
      const all = await fetchAll();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['﻿' + auditCsv(all)], { type: 'text/csv;charset=utf-8;' }));
      link.download = `dentisys-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally { setWorking(false); }
  };

  const handlePrint = async () => {
    setWorking(true);
    try {
      const all = await fetchAll();
      flushSync(() => { setPrintRows(auditCsvRows(all)); setPrintedAt(new Date()); });
      window.print();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed.');
    } finally { setWorking(false); }
  };

  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); if (!n.delete(id)) n.add(id); return n; });
  const att = data?.attention;
  const cards = att ? [
    { label: 'Failed sign-ins', count: att.failedSignIns, icon: UserX, tone: 'rose', apply: () => applyCard('failedSignIns') },
    { label: 'Security alerts', count: att.securityAlerts, icon: ShieldAlert, tone: 'amber', apply: () => applyCard('securityAlerts') },
    { label: '2FA turned off', count: att.mfaTurnedOff, icon: ShieldOff, tone: 'amber', apply: () => applyCard('mfaTurnedOff') },
  ] : [];
  const cardLabel = cards.find((_, i) => ['failedSignIns', 'securityAlerts', 'mfaTurnedOff'][i] === card)?.label;

  const filterLabel = [
    cardLabel && `Card: ${cardLabel}`,
    area && `Area: ${area}`, status && `Status: ${status}`,
    role === 'admin' && roleFilter && `Role: ${roleFilter}`,
    cls && `Class: ${classes.find(c => c.id === cls)?.label ?? cls}`,
    (range.from || range.to) && `Date: ${range.from || '…'} to ${range.to || '…'}`,
    q && `Search: "${q}"`, signins && 'Sign-ins shown',
  ].filter(Boolean).join(' · ') || 'None';

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto min-w-0">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 no-print">
        <div className="sm:flex-1 sm:basis-64">
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">{title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
          {role === 'admin' && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Class work (grades, attendance, retention) is not shown here; it stays recorded.</p>}
        </div>
        <div className="flex gap-2 whitespace-nowrap no-print">
          <button onClick={exportCsv} disabled={working} className={`${tapButton} border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-50`}>
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button onClick={handlePrint} disabled={working} className={`${tapButton} text-white disabled:opacity-50 ${theme.button}`}>
            <FileText className="w-4 h-4" />
            Print PDF
          </button>
        </div>
      </div>

      {note && <div role="status" className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 no-print">{note}</div>}

      {role === 'faculty' && (
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-800 dark:text-blue-300 no-print">
          <p className="font-bold">Faculty Workspace Activity</p>
          <p className="mt-1">
            This view lists actions made with your own account, including grades, attendance and retention. Your sign-ins are hidden unless you turn on Sign-ins. Attendance changes made by anyone in your classes are under <strong>Class Attendance Activity</strong>, and email dispatch activity is tracked under <strong>Email Management</strong>.
          </p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="break-words">{error}</span>
          </div>
          <button onClick={fetchLogs} className="flex items-center gap-1 min-h-[44px] xl:min-h-0 font-bold underline hover:opacity-80">
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {cards.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 no-print">
          {cards.map(({ label, count, icon: Icon, tone, apply }) => (
            <button key={label} type="button" onClick={apply} aria-label={`${label}: ${count}. Show these rows`} className="text-left">
              <Card className={`p-4 max-sm:p-3 flex items-center justify-between gap-3 max-sm:gap-2 xl:gap-0 border hover:shadow-md ${tone === 'rose'
                ? 'border-rose-200/60 bg-rose-50/50 dark:border-rose-900/30 dark:bg-rose-950/15'
                : 'border-amber-200/60 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/15'}`}>
                <div className="min-w-0 xl:min-w-[auto]">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{label.replace(/-/g, '‑')}</p>
                  <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{count}</p>
                </div>
                <div className={`p-2.5 max-sm:p-1.5 shrink-0 xl:shrink rounded-xl bg-white/70 dark:bg-slate-900/60 ${tone === 'rose' ? 'text-rose-500' : 'text-amber-500'}`}><Icon className="w-5 h-5 max-sm:w-4 max-sm:h-4" /></div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Card className="no-print">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Filter className={`w-4 h-4 ${theme.icon}`} />
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" value={qInput} onChange={e => setQInput(e.target.value)} maxLength={100} aria-label="Search" placeholder="Search who, what, record, student"
                className={`${control} pl-8 w-48`} />
            </div>
            <select aria-label="Area" value={area} onChange={e => change(() => setArea(e.target.value))} className={control}>
              <option value="">All areas</option>
              {(data?.areas ?? []).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select aria-label="Date" value={preset} onChange={e => change(() => setPreset(e.target.value as DatePreset))} className={control}>
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="7">Last 7 days</option>
              {term && <option value="term">This term</option>}
              <option value="custom">Custom range</option>
            </select>
            {preset === 'custom' && (
              <>
                <input type="date" aria-label="From date" value={custom.from} max={custom.to || undefined} onChange={e => change(() => setCustom(c => ({ ...c, from: e.target.value })))} className={control} />
                <input type="date" aria-label="To date" value={custom.to} min={custom.from || undefined} onChange={e => change(() => setCustom(c => ({ ...c, to: e.target.value })))} className={control} />
              </>
            )}
            <select aria-label="Status" value={status} onChange={e => change(() => setStatus(e.target.value))} className={control}>
              <option value="">All statuses</option>
              {['Success', 'Warning', 'Failed'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {role === 'admin' && (
              <select aria-label="Role" value={roleFilter} onChange={e => change(() => setRoleFilter(e.target.value))} className={control}>
                {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            {role === 'faculty' && (
              <select aria-label="Class" value={cls} onChange={e => change(() => setCls(e.target.value))} className={control}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            )}
            <button type="button" aria-pressed={signins} onClick={() => change(() => setSignins(v => !v))}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] xl:min-h-0 rounded-xl border text-xs font-bold ${signins ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}>
              Sign-ins
            </button>
            <button type="button" onClick={() => change(() => setSort(sort === 'newest' ? 'oldest' : 'newest'))} className={`flex items-center gap-1.5 min-h-[44px] xl:min-h-0 px-3 py-2 rounded-xl border text-xs font-bold ${theme.surface}`}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {sort === 'newest' ? 'Newest first' : 'Oldest first'}
            </button>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="flex items-center gap-1 min-h-[44px] xl:min-h-0 text-xs font-bold underline hover:opacity-80">Clear filters</button>
            )}
            <span className="ml-auto text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{total} logs</span>
          </div>
        </CardContent>
      </Card>

      <Card className="p-0 overflow-hidden no-print">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className={`w-4.5 h-4.5 ${theme.icon}`} />
            Activity records
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500 dark:text-slate-400">Loading audit trail records...</p>
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-20 shadow-sm">
                <tr className="text-[9px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-3 sticky left-0 z-30 bg-slate-50 dark:bg-slate-900 w-36 min-w-[9rem]">When</th>
                  <th className="px-5 py-3">Who</th>
                  <th className="px-5 py-3">What</th>
                  <th className="px-5 py-3">Record</th>
                  <th className="px-5 py-3">Change</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              {groups.map(group => (
                <tbody key={group.key} className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th colSpan={6} scope="colgroup" className="px-5 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <span className="sticky left-5">{group.label}</span>
                    </th>
                  </tr>
                  {group.entries.map(entry => (
                    <React.Fragment key={entry.id}>
                      <tr className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                        <td className="px-5 py-3 sticky left-0 z-10 bg-white dark:bg-slate-950 w-36 min-w-[9rem] text-slate-500">{formatManilaWhen(entry.occurredAt)}</td>
                        <td className="px-5 py-3 break-words min-w-[9rem]">
                          <p className="font-bold text-slate-800 dark:text-slate-200">{entry.who ? entry.who.name : entry.whoText ?? '—'}</p>
                          {entry.who && <p className="text-[10px] text-slate-500 dark:text-slate-400">{entry.who.roleLabel}</p>}
                        </td>
                        <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-300 break-words min-w-[8rem]">{entry.what}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400 max-2xl:whitespace-nowrap 2xl:break-words min-w-[10rem]">{entry.record}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400 break-words min-w-[8rem]">
                          {entry.change}
                          {entry.batch && (
                            <button type="button" onClick={() => toggle(entry.id)} aria-expanded={expanded.has(entry.id)}
                              className={`ml-2 min-h-[44px] xl:min-h-0 px-2 text-[10px] font-bold ${theme.icon}`}>
                              {entry.batch.count} {expanded.has(entry.id) ? '▾' : '▸'}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <StatusBadge status={entry.status} />
                          <button type="button" onClick={() => setSelected(entry)} className={`ml-2 min-h-[44px] min-w-[44px] xl:min-h-0 xl:min-w-0 text-[10px] font-bold ${theme.icon}`}>
                            Details
                          </button>
                        </td>
                      </tr>
                      {entry.batch && expanded.has(entry.id) && (
                        <tr className="bg-slate-50/60 dark:bg-slate-900/30">
                          <td className="sticky left-0 bg-slate-50 dark:bg-slate-900" />
                          <td colSpan={5} className="px-5 py-2">
                            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                              {entry.batch.members.map((m, i) => (
                                <li key={i} className="py-1.5 flex flex-wrap gap-x-4 break-words">
                                  <span className="text-slate-600 dark:text-slate-400">{m.record}</span>
                                  <span className="text-slate-500">{m.change}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              ))}
              {entries.length === 0 && (
                <tbody>
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500 dark:text-slate-400">
                      No audit records match the selected filters.
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between text-xs no-print">
          <span className="text-slate-500 dark:text-slate-400">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className={pagerButton}>Previous</button>
            <span className="font-bold text-slate-700 dark:text-slate-200">Page {page} of {totalPages}</span>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className={pagerButton}>Next</button>
          </div>
        </div>
      )}

      {(() => { const sheetRows = printRows ?? auditCsvRows(entries); return (
        <div className="print-only hidden bg-white text-slate-900 font-sans ps">
          <PrintStyle title={title} running={`${title} · ${role === 'admin' ? "Dean's Office" : user?.display_name ?? ''}`} generated={formatPrintedAt(printedAt ?? new Date())} note="Confidential Academic Document" />
          <PrintHeader
            title={title}
            sub={role === 'admin' ? "Dean's Office" : user?.display_name ?? ''}
            rows={[
              ['Filters', filterLabel],
              ['Sort', sort === 'newest' ? 'Newest first' : 'Oldest first'],
              ['Rows', String(sheetRows.length)],
              ['Date', formatPrintedAt(printedAt ?? new Date())],
            ]}
          />
          <PrintCaption>Activity records</PrintCaption>
          <table>
            <colgroup>{[16, 18, 16, 20, 18, 12].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
            <thead>
              <tr><th className="l">When</th><th className="l">Who</th><th className="l">What</th><th className="l">Record</th><th className="l">Change</th><th>Status</th></tr>
            </thead>
            <tbody>
              {sheetRows.map((r, i) => (
                <tr key={i}>
                  {r.slice(0, 5).map((cell, j) => <td key={j} className="l">{cell}</td>)}
                  <td className={r[5] === 'Failed' ? 'bad' : ''}>{r[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ); })()}

      <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title="Audit log details" size="lg" fullScreenOnMobile>
        {selected && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <Field label="When">{formatManilaWhen(selected.occurredAt)}</Field>
            <Field label="Who">
              {selected.who ? (
                <>
                  <p>{selected.who.name} · {selected.who.roleLabel}</p>
                  {selected.who.email && <p className="text-slate-500 dark:text-slate-400">{selected.who.email}</p>}
                </>
              ) : selected.whoText ?? '—'}
            </Field>
            <Field label="What">{selected.what}</Field>
            <Field label="Record">{selected.record}</Field>
            <Field label="From where">{[selected.details.fromWhere.ip, selected.details.fromWhere.device].filter(Boolean).join(' · ') || '—'}</Field>
            <Field label="Status"><StatusBadge status={selected.status} /></Field>
            <div className="sm:col-span-2"><Field label="Reason">{selected.details.reason || '—'}</Field></div>
            <div className="sm:col-span-2 min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Changes</p>
              <ChangesTable key={selected.id} changes={selected.details.changes} />
            </div>
            {selected.details.technical && (
              <details className="sm:col-span-2 min-w-0">
                <summary className="min-h-[44px] xl:min-h-0 flex items-center cursor-pointer text-[11px] font-bold text-slate-500">Technical details</summary>
                <div className="space-y-2">
                  <Field label="Action code">{selected.details.technical.actionCode}</Field>
                  <Field label="Module">{selected.details.technical.module}</Field>
                  <Field label="Operation">{selected.details.technical.operationUuid ?? '—'}</Field>
                  {(['before', 'after'] as const).map(k => (
                    <Field key={k} label={k === 'before' ? 'Before (raw)' : 'After (raw)'}>
                      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 dark:bg-slate-900 p-2 text-[11px] whitespace-pre-wrap break-words">
                        {selected.details.technical![k] == null ? '—' : JSON.stringify(selected.details.technical![k], null, 2)}
                      </pre>
                    </Field>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
