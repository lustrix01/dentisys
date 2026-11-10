import React, { useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Clock3, Ellipsis, Filter, KeyRound, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';

type RoleTab = 'faculty' | 'students' | 'deans';
type AccountStatus = 'Active' | 'Pending activation' | 'Deactivated';
type PreviewAccount = {
  id: string;
  name: string;
  email: string;
  identifier: string;
  className?: string;
  status: AccountStatus;
  twoFactor: 'On' | 'Off' | 'Not set up';
  lastActive: string;
};

// Preview-only sample data. The account directory API is not available yet.
const PREVIEW_ACCOUNTS: Record<RoleTab, PreviewAccount[]> = {
  faculty: [
    { id: 'f-1', name: 'Avery Santos', email: 'avery.santos@example.edu', identifier: 'Faculty', status: 'Active', twoFactor: 'On', lastActive: 'Today, 9:42 AM' },
    { id: 'f-2', name: 'Morgan Reyes', email: 'morgan.reyes@example.edu', identifier: 'Faculty', status: 'Active', twoFactor: 'Off', lastActive: 'Yesterday' },
    { id: 'f-3', name: 'Jordan Dela Cruz', email: 'jordan.delacruz@example.edu', identifier: 'Faculty', status: 'Pending activation', twoFactor: 'Not set up', lastActive: 'Invitation sent · Nov 8' },
    { id: 'f-4', name: 'Casey Mendoza', email: 'casey.mendoza@example.edu', identifier: 'Faculty', status: 'Deactivated', twoFactor: 'On', lastActive: 'Oct 29, 2026' },
  ],
  students: [
    { id: 's-1', name: 'Taylor Garcia', email: 'taylor.garcia@example.edu', identifier: '2024-00128', className: 'CDM-1A', status: 'Active', twoFactor: 'Off', lastActive: 'Today, 8:16 AM' },
    { id: 's-2', name: 'Riley Fernandez', email: 'riley.fernandez@example.edu', identifier: '2023-00471', className: 'CDM-2B', status: 'Active', twoFactor: 'On', lastActive: 'Nov 9, 2026' },
    { id: 's-3', name: 'Quinn Villanueva', email: 'quinn.villanueva@example.edu', identifier: '2025-00092', className: 'CDM-1A', status: 'Pending activation', twoFactor: 'Not set up', lastActive: 'Invitation sent · Nov 7' },
  ],
  deans: [
    { id: 'd-1', name: 'Alex Rivera', email: 'alex.rivera@example.edu', identifier: 'Dean', status: 'Active', twoFactor: 'On', lastActive: 'Today, 10:03 AM' },
  ],
};

const roleLabels: Record<RoleTab, string> = { faculty: 'Faculty', students: 'Students', deans: 'Deans' };
const statusStyle: Record<AccountStatus, string> = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20',
  'Pending activation': 'bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-400/20',
  Deactivated: 'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20',
};
const unavailable = 'Available when account management is connected';

export const PeopleAndAccounts: React.FC = () => {
  const [tab, setTab] = useState<RoleTab>('faculty');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [twoFactorFilter, setTwoFactorFilter] = useState('all');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const accounts = useMemo(() => PREVIEW_ACCOUNTS[tab].filter(account =>
    `${account.name} ${account.email} ${account.identifier} ${account.className ?? ''} ${account.status} ${account.twoFactor}`.toLowerCase().includes(search.trim().toLowerCase())
    && (classFilter === 'all' || account.className === classFilter)
    && (statusFilter === 'all' || account.status === statusFilter)
    && (twoFactorFilter === 'all' || account.twoFactor === twoFactorFilter),
  ), [tab, search, classFilter, statusFilter, twoFactorFilter]);
  const counts = { faculty: PREVIEW_ACCOUNTS.faculty.length, students: PREVIEW_ACCOUNTS.students.length, deans: PREVIEW_ACCOUNTS.deans.length };
  const activeCount = PREVIEW_ACCOUNTS[tab].filter(account => account.status === 'Active').length;

  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p><strong>Preview data.</strong> These sample accounts are for UI review only; they are not live records. Account actions are unavailable until account management is connected.</p>
      </div>

      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
        Showing <b className="text-slate-800 dark:text-slate-100">{accounts.length}</b> of {PREVIEW_ACCOUNTS[tab].length} sample {PREVIEW_ACCOUNTS[tab].length === 1 ? 'account' : 'accounts'} · {activeCount} active
      </p>

      <ListToolbar
        left={(
          <>
            <Tabs
              variant="section"
              color="accent"
              className="w-full"
              label="Account roles"
              value={tab}
              onChange={value => { setTab(value); setSearch(''); setClassFilter('all'); setStatusFilter('all'); setTwoFactorFilter('all'); setOpenMenu(null); }}
              tabs={[
                { id: 'faculty', label: 'Faculty', count: counts.faculty },
                { id: 'students', label: 'Students', count: counts.students },
                { id: 'deans', label: 'Deans', count: counts.deans },
              ]}
            />
          </>
        )}
        below={(
          <>
            <SearchField value={search} onChange={setSearch} placeholder={`Search ${roleLabels[tab].toLowerCase()}…`} color="accent" />
            <span className="inline-flex min-h-10 items-center gap-2 px-1 text-xs font-bold text-slate-500 dark:text-slate-400"><Filter className="h-3.5 w-3.5" />Filters</span>
            {tab === 'students' && <FilterSelect label="Class" value={classFilter} onChange={setClassFilter} options={[
              ['all', 'All Classes'], ['CDM-1A', 'CDM-1A'], ['CDM-2B', 'CDM-2B'],
            ]} />}
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
              ['all', 'All Statuses'], ['Active', 'Active'], ['Pending activation', 'Pending activation'], ['Deactivated', 'Deactivated'],
            ]} />
            <FilterSelect label="2FA" value={twoFactorFilter} onChange={setTwoFactorFilter} options={[
              ['all', 'All 2FA'], ['On', 'On'], ['Off', 'Off'], ['Not set up', 'Not set up'],
            ]} />
            <button type="button" onClick={() => { setClassFilter('all'); setStatusFilter('all'); setTwoFactorFilter('all'); setSearch(''); }} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40">Clear filters</button>
          </>
        )}
      />

      {tab !== 'faculty' && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
          <p>{tab === 'students'
            ? 'Student invitations are sent by Faculty from an assigned class roster so each invitation stays connected to the Student record.'
            : 'Dean access is configured for the initial administrator during deployment. Additional Dean invitations are not available in the current workflow.'}</p>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {accounts.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No matching accounts</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try a different name, email or account status.</p>
            <button type="button" onClick={() => setSearch('')} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40"><X className="h-3.5 w-3.5" /> Clear search</button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-sm:hidden">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Name</th>
                    <th scope="col" className="px-4 py-3.5">Email</th>
                    {tab === 'students' && <th scope="col" className="px-4 py-3.5">Class</th>}
                    <th scope="col" className="px-4 py-3.5">{tab === 'students' ? 'Student Number' : 'Role'}</th>
                    <th scope="col" className="px-4 py-3.5">Status</th>
                    <th scope="col" className="px-4 py-3.5">2FA</th>
                    <th scope="col" className="px-4 py-3.5">Last Activity</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {accounts.map(account => <AccountRow key={account.id} account={account} tab={tab} open={openMenu === account.id} onToggle={() => setOpenMenu(openMenu === account.id ? null : account.id)} />)}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 sm:hidden">
              {accounts.map(account => <AccountBlock key={account.id} account={account} tab={tab} open={openMenu === account.id} onToggle={() => setOpenMenu(openMenu === account.id ? null : account.id)} />)}
            </div>
          </>
        )}
      </div>
      <p className="px-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Invitation rules follow the current account lifecycle. Faculty can be invited here; Students are invited from assigned class rosters, and Dean access follows deployment setup.</p>
    </section>
  );
};

function StatusPill({ status }: { status: AccountStatus }) {
  const Icon = status === 'Active' ? CheckCircle2 : status === 'Pending activation' ? Clock3 : CircleAlert;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${statusStyle[status]}`}><Icon className="h-3 w-3" />{status}</span>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="min-w-0 flex-1 sm:flex-none">
    <span className="sr-only">{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)} aria-label={label} className="min-h-10 w-full min-w-36 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
      {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}
    </select>
  </label>;
}

function AccountRow({ account, tab, open, onToggle }: { account: PreviewAccount; tab: RoleTab; open: boolean; onToggle: () => void }) {
  return <tr className="align-middle hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
    <td className="px-5 py-4"><div className="font-bold text-slate-800 dark:text-slate-100">{account.name}</div></td>
    <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{account.email}</td>
    {tab === 'students' && <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{account.className}</td>}
    <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{account.identifier}</td>
    <td className="px-4 py-4"><StatusPill status={account.status} /></td>
    <td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 ${account.twoFactor === 'On' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}><KeyRound className="h-3.5 w-3.5" />{account.twoFactor}</span></td>
    <td className="px-4 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">{account.lastActive}</td>
    <td className="relative px-4 py-4 text-right"><ActionMenu account={account} tab={tab} open={open} onToggle={onToggle} /></td>
  </tr>;
}

function AccountBlock({ account, tab, open, onToggle }: { account: PreviewAccount; tab: RoleTab; open: boolean; onToggle: () => void }) {
  return <article className="relative rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><h3 className="break-words text-sm font-bold text-slate-800 dark:text-slate-100">{account.name}</h3><p className="break-all text-xs text-slate-500 dark:text-slate-400">{account.email}</p></div></div>
      <ActionMenu account={account} tab={tab} open={open} onToggle={onToggle} />
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      {tab === 'students' && <div><dt className="text-[10px] font-semibold text-slate-400">Class</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{account.className}</dd></div>}
      <div><dt className="text-[10px] font-semibold text-slate-400">{tab === 'students' ? 'Student Number' : 'Role'}</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{account.identifier}</dd></div>
      <div><dt className="text-[10px] font-semibold text-slate-400">Status</dt><dd className="mt-1"><StatusPill status={account.status} /></dd></div>
      <div><dt className="text-[10px] font-semibold text-slate-400">2FA</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{account.twoFactor}</dd></div>
      <div><dt className="text-[10px] font-semibold text-slate-400">Last Activity</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{account.lastActive}</dd></div>
    </dl>
  </article>;
}

function ActionMenu({ account, tab, open, onToggle }: { account: PreviewAccount; tab: RoleTab; open: boolean; onToggle: () => void }) {
  const statusAction = account.status === 'Deactivated' ? 'Reactivate account' : 'Deactivate account';
  return <>
    <button type="button" aria-label={`Account options for ${account.name}`} aria-haspopup="dialog" onClick={onToggle} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Ellipsis className="h-4 w-4" /></button>
    <Modal isOpen={open} onClose={onToggle} title="Account Options" size="sm">
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{account.name}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{account.email} · {roleLabels[tab]}</p>
        </div>
        <div role="note" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Preview only. These actions are unavailable until account management is connected.</p>
        </div>
        <div className="space-y-2">
          {[statusAction, 'Reset 2FA', 'Sign out all devices'].map(label => <button key={label} type="button" disabled title={unavailable} className="flex min-h-11 w-full cursor-not-allowed items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 text-left text-xs font-bold text-slate-400 opacity-75 dark:border-slate-700 dark:text-slate-500" aria-label={`${label} for ${account.name} unavailable`}><span>{label}</span><span className="text-[9px] font-bold uppercase tracking-wide">Unavailable</span></button>)}
        </div>
        {tab === 'deans' && <p className="text-[11px] text-slate-500 dark:text-slate-400">Administrator accounts require additional protection.</p>}
      </div>
    </Modal>
  </>;
}
