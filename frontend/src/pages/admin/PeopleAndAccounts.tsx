import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleAlert, KeyRound, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { ApiError, deactivatePersonApi, getAdminPeopleApi, reactivatePersonApi } from '../../services/apiClient';
import type { AdminPerson, PersonClass } from '../../services/apiClient';
import { formatManilaWhen } from '../../services/auditService';

// ADM-001 Part C (docs/contracts/superadmin.md): the Dean lists Faculty and Students and deactivates or reactivates
// their accounts in Superadmin mode. Page parts copied from the earlier preview (tabs, filter row, table, phone blocks).
type Kind = 'faculty' | 'student';
type StatusFilter = 'all' | 'active' | 'deactivated';
type Blocked = { message: string; classes: PersonClass[] };

const PAGE_SIZE = 50;
const filterClass = 'min-h-10 w-full min-w-36 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const cancelButton = 'min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
const kindLabel: Record<Kind, string> = { faculty: 'Faculty', student: 'Students' };
const sentence = (name: string, n: number) => `${name} teaches ${n} ${n === 1 ? 'class' : 'classes'} this school year. Reassign or archive them first.`;
const classesOf = (person: AdminPerson): PersonClass[] => (person.kind === 'faculty' ? person.classes : person.enrolledClasses) ?? [];

export const PeopleAndAccounts: React.FC = () => {
  const [kind, setKind] = useState<Kind>('faculty');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [twoFactor, setTwoFactor] = useState('all');
  const [page, setPage] = useState(1);
  const [people, setPeople] = useState<AdminPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<AdminPerson | null>(null);
  const [reason, setReason] = useState('');
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = () => {
    const ticket = ++latest.current;
    setLoading(true);
    setError('');
    getAdminPeopleApi({ kind, status, q, page })
      .then(r => { if (ticket === latest.current) { setPeople(r.people); setTotal(r.total); } })
      .catch(err => { if (ticket === latest.current) setError(err instanceof Error ? err.message : 'Unable to load accounts.'); })
      .finally(() => { if (ticket === latest.current) setLoading(false); });
  };
  useEffect(load, [kind, status, q, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = people.filter(person => twoFactor === 'all' || (twoFactor === 'on') === person.twoFactor);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openAction = (person: AdminPerson) => {
    setReason('');
    const current = person.status === 'active' && person.kind === 'faculty' ? classesOf(person).filter(c => c.current) : [];
    setBlocked(current.length > 0 ? { message: sentence(person.name, current.length), classes: current } : null);
    setTarget(person);
  };
  const close = () => { if (!busy) { setTarget(null); setBlocked(null); } };
  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (target.status === 'active') await deactivatePersonApi(target.userId, reason.trim() || undefined);
      else await reactivatePersonApi(target.userId);
      showFeedback(`${target.name} ${target.status === 'active' ? 'deactivated' : 'reactivated'}.`, 'success');
      setTarget(null);
      setBlocked(null);
      load();
    } catch (err) {
      const classes = err instanceof ApiError ? (err.details?.classes as Array<{ csId: number; label: string }> | undefined) : undefined;
      if (err instanceof ApiError && err.code === 'faculty_has_current_classes' && classes) {
        setBlocked({ message: err.message, classes: classes.map(c => ({ ...c, schoolYear: '', current: true })) });
      } else {
        setTarget(null);
        showFeedback(err instanceof Error ? err.message : 'Unable to update the account.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
        Showing <b className="text-slate-800 dark:text-slate-100">{shown.length}</b> of {total} {kind === 'faculty' ? 'Faculty accounts' : 'Student accounts'}
      </p>

      <ListToolbar
        left={(
          <Tabs variant="switch" color="accent" label="Account roles" value={kind}
            onChange={value => { setKind(value); setSearch(''); setQ(''); setStatus('all'); setTwoFactor('all'); setPage(1); }}
            tabs={[{ id: 'faculty', label: 'Faculty' }, { id: 'student', label: 'Students' }]} />
        )}
        below={(
          <>
            <SearchField value={search} onChange={setSearch} placeholder={`Search ${kindLabel[kind].toLowerCase()}…`} color="accent" />
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Status</span>
              <select aria-label="Status" value={status} onChange={event => { setStatus(event.target.value as StatusFilter); setPage(1); }} className={filterClass}>
                <option value="all">All Statuses</option><option value="active">Active</option><option value="deactivated">Deactivated</option>
              </select>
            </label>
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">2FA</span>
              <select aria-label="2FA" value={twoFactor} onChange={event => setTwoFactor(event.target.value)} className={filterClass}>
                <option value="all">All 2FA</option><option value="on">On</option><option value="off">Off</option>
              </select>
            </label>
            <button type="button" onClick={() => { setSearch(''); setQ(''); setStatus('all'); setTwoFactor('all'); setPage(1); }} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40">Clear filters</button>
          </>
        )}
      />

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
        <p>Deactivating an account signs the person out on every device and blocks sign-in until you reactivate it. Records, classes and enrolments are kept. Faculty are invited from Faculty Invitations; Students are invited from class rosters.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
          <span className="break-words">{error}</span>
          <button type="button" onClick={load} className="min-h-[44px] font-bold underline">Retry</button>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading accounts…</div>
        ) : shown.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No matching accounts</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try a different name, email or account status.</p>
            {search && <button type="button" onClick={() => setSearch('')} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40"><X className="h-3.5 w-3.5" /> Clear search</button>}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-sm:hidden">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Name</th>
                    <th scope="col" className="px-4 py-3.5">Email</th>
                    {kind === 'student' && <th scope="col" className="px-4 py-3.5">Student Number</th>}
                    <th scope="col" className="px-4 py-3.5">Classes</th>
                    <th scope="col" className="px-4 py-3.5">Status</th>
                    <th scope="col" className="px-4 py-3.5">2FA</th>
                    <th scope="col" className="px-4 py-3.5">Last Activity</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {shown.map(person => (
                    <tr key={person.userId} className="align-middle hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-4"><div className="font-bold text-slate-800 dark:text-slate-100">{person.name}</div></td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{person.email}</td>
                      {kind === 'student' && <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{person.studentNo}</td>}
                      <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{classSummary(person)}</td>
                      <td className="px-4 py-4"><StatusPill status={person.status} /></td>
                      <td className="px-4 py-4"><TwoFactor on={person.twoFactor} /></td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500 dark:text-slate-400">{person.lastActivityAt ? formatManilaWhen(person.lastActivityAt) : '—'}</td>
                      <td className="px-4 py-4 text-right"><ActionButton person={person} onClick={() => openAction(person)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 sm:hidden">
              {shown.map(person => (
                <article key={person.userId} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><h3 className="break-words text-sm font-bold text-slate-800 dark:text-slate-100">{person.name}</h3><p className="break-all text-xs text-slate-500 dark:text-slate-400">{person.email}</p></div></div>
                    <ActionButton person={person} onClick={() => openAction(person)} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {kind === 'student' && <Item label="Student Number">{person.studentNo}</Item>}
                    <Item label="Classes">{classSummary(person)}</Item>
                    <Item label="Status"><StatusPill status={person.status} /></Item>
                    <Item label="2FA">{person.twoFactor ? 'On' : 'Off'}</Item>
                    <Item label="Last Activity">{person.lastActivityAt ? formatManilaWhen(person.lastActivityAt) : '—'}</Item>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800">Previous</button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800">Next</button>
          </div>
        </div>
      )}

      <Modal isOpen={Boolean(target)} onClose={close} title={target?.status === 'active' ? 'Deactivate Account' : 'Reactivate Account'} size="sm">
        {target && (
          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{target.name}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{target.email} · {target.kind === 'faculty' ? 'Faculty' : 'Student'}</p>
            </div>
            {blocked ? (
              <div role="alert" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="flex items-start gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{blocked.message}</p>
                <ul className="space-y-1 pl-6">{blocked.classes.map(c => <li key={c.csId}><Link to="/admin/classes" className="font-bold underline">{c.label}</Link></li>)}</ul>
              </div>
            ) : target.status === 'active' ? (
              <>
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>Signed out on every device now, and sign-in is refused until you reactivate.</li>
                  <li>Records, classes and enrolments are kept.</li>
                  {target.kind === 'student' && <li>If this Student is a Class Secretary, the Secretary sign-in is blocked too.</li>}
                </ul>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Reason (optional)
                  <input maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className={inputClass} />
                </label>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">The person can sign in again with their existing password and 2FA. {target.kind === 'student' ? 'A linked Class Secretary sign-in is restored too.' : ''}</p>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" disabled={busy} onClick={close} className={cancelButton}>{blocked ? 'Close' : 'Cancel'}</button>
              {!blocked && <button type="button" disabled={busy} onClick={() => void confirm()} className={`min-h-11 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50 ${target.status === 'active' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-accent-600 hover:bg-accent-700'}`}>{target.status === 'active' ? 'Deactivate account' : 'Reactivate account'}</button>}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};

/** Faculty: this school year's classes; Student: how many classes they are enrolled in. */
function classSummary(person: AdminPerson): string {
  const all = classesOf(person);
  const current = all.filter(c => c.current);
  if (person.kind === 'faculty') return current.length > 0 ? current.map(c => c.label).join(', ') : 'None this school year';
  return all.length > 0 ? `${all.length} ${all.length === 1 ? 'class' : 'classes'}` : 'None';
}

function StatusPill({ status }: { status: AdminPerson['status'] }) {
  const active = status === 'active';
  const Icon = active ? CheckCircle2 : CircleAlert;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${active
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20'
    : 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20'}`}><Icon className="h-3 w-3" />{active ? 'Active' : 'Deactivated'}</span>;
}

function TwoFactor({ on }: { on: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 ${on ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}><KeyRound className="h-3.5 w-3.5" />{on ? 'On' : 'Off'}</span>;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[10px] font-semibold text-slate-400">{label}</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{children}</dd></div>;
}

function ActionButton({ person, onClick }: { person: AdminPerson; onClick: () => void }) {
  const label = person.status === 'active' ? 'Deactivate' : 'Reactivate';
  return <button type="button" aria-label={`${label} ${person.name}`} aria-haspopup="dialog" onClick={onClick} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{label}</button>;
}
