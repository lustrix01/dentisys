import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarX, ChevronRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { semesterLabel } from '../../utils/academicTermDefaults';
import { getAdminOverviewApi } from '../../services/apiClient';
import { AuditCompactList } from '../../components/AuditTrailPage';
import type { AdminOverview } from '../../services/apiClient';
import { formatSchoolYear as schoolYearText } from '../../utils/schoolYear';
import { yearLevelLabel } from './peopleHelpers';

// Page parts: chart cards copied from pages/admin/Dashboard.tsx; error banner copied from PeopleAndAccounts.tsx;
// loading and setup tiles are the earlier Overview's own. One request (GET /api/admin/overview) feeds everything.
type Tile = { label: string; value: string; sub: string; to: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthDay = (iso: string) => { const [, m, d] = iso.split('-'); return `${MONTHS[Number(m) - 1]} ${Number(d)}`; };
const shortDate = (iso: string) => `${monthDay(iso)}, ${iso.slice(0, 4)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const cardClass = 'bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800';
const titleClass = 'text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const subClass = 'text-[11px] text-slate-500 dark:text-slate-400 mt-0.5';
const emptyClass = 'h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400';
const margin = { top: 10, right: 10, left: -25, bottom: 0 };

/** One row per attention item with a count above zero; each links into the page already filtered. */
export function attentionRows(a: AdminOverview['attention']): Array<{ count: number | null; text: string; to: string }> {
  const rows = [
    { count: a.expiredInvitations.faculty, text: a.expiredInvitations.faculty === 1 ? 'Faculty invitation has expired' : 'Faculty invitations have expired', to: '/superadmin/people?kind=faculty&status=invited&invitation=expired' },
    { count: a.expiredInvitations.students, text: a.expiredInvitations.students === 1 ? 'Student invitation has expired' : 'Student invitations have expired', to: '/superadmin/people?kind=student&status=invited&invitation=expired' },
    { count: a.facultyWithoutClasses, text: a.facultyWithoutClasses === 1 ? 'Faculty account has no classes this school year' : 'Faculty accounts have no classes this school year', to: '/superadmin/people?kind=faculty&classes=none' },
    { count: a.inactive30.faculty, text: a.inactive30.faculty === 1 ? 'Faculty account inactive for 30+ days' : 'Faculty accounts inactive for 30+ days', to: '/superadmin/people?kind=faculty&activity=inactive30' },
    { count: a.inactive30.students, text: a.inactive30.students === 1 ? 'Student account inactive for 30+ days' : 'Student accounts inactive for 30+ days', to: '/superadmin/people?kind=student&activity=inactive30' },
  ].filter(r => r.count > 0) as Array<{ count: number | null; text: string; to: string }>;
  return a.nextTermMissing ? [...rows, { count: null, text: 'The next term has no dates yet', to: '/superadmin/terms' }] : rows;
}

export const SuperadminOverview: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError('');
    getAdminOverviewApi()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load the overview. Select Retry.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const intro = <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">Accounts, sign-ins, security and school setup at a glance. Select a row or tile to open its page.</p>;
  if (loading) return <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">{intro}<div role="status" className="rounded-3xl border border-slate-200/80 bg-white p-12 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Loading overview…</div></div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
        {intro}
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="break-words">{error}</span>
          <button type="button" onClick={load} className="min-h-[44px] font-bold underline">Retry</button>
        </div>
      </div>
    );
  }

  const rows = attentionRows(data.attention);
  const accounts = [
    { role: 'Faculty', Active: data.accounts.faculty.active, Invited: data.accounts.faculty.invited, Deactivated: data.accounts.faculty.deactivated },
    { role: 'Students', Active: data.accounts.students.active, Invited: data.accounts.students.invited, Deactivated: data.accounts.students.deactivated },
  ];
  const hasAccounts = accounts.some(a => a.Active + a.Invited + a.Deactivated > 0);
  const signIns = data.signIns.map(w => ({ week: monthDay(w.weekStart), Faculty: w.faculty, Students: w.students }));
  const hasSignIns = signIns.some(w => w.Faculty + w.Students > 0);
  const twoFactor = [
    { role: 'Faculty', On: data.security.twoFactor.faculty.on, Off: data.security.twoFactor.faculty.total - data.security.twoFactor.faculty.on },
    { role: 'Students', On: data.security.twoFactor.students.on, Off: data.security.twoFactor.students.total - data.security.twoFactor.students.on },
  ];
  const hasTwoFactor = twoFactor.some(t => t.On + t.Off > 0);
  const failed = data.security.failedSignIns.map(d => ({ day: monthDay(d.day), count: d.count }));
  const hasFailed = failed.some(d => d.count > 0);
  const levels = data.yearLevels.map(l => ({ label: yearLevelLabel(l.yearLevel), students: l.students }));
  const sections = data.sectionsByCourse;

  const term = data.setup.currentTerm;
  const tiles: Tile[] = [
    { label: 'Current Term', value: term ? semesterLabel(term.semester) : 'No current term', sub: term ? `${schoolYearText(term.schoolYear)}${term.endDate ? ` · ends ${shortDate(term.endDate)}` : ''}` : 'Add the term dates', to: '/superadmin/terms' },
    { label: 'Courses', value: String(data.setup.courses.active), sub: `${data.setup.courses.retired} retired`, to: '/superadmin/course-catalog' },
    { label: 'Rooms', value: String(data.setup.rooms.active), sub: `${data.setup.rooms.retired} retired`, to: '/superadmin/rooms' },
    { label: 'Face enrolment flags', value: String(data.faceFlagsOpen ?? 0), sub: 'open', to: '/superadmin/face-flags' },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      {intro}

      <section aria-label="Needs attention" className={cardClass}>
        <h3 className={titleClass}>Needs Attention</h3>
        {rows.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Nothing needs attention.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(row => (
              <li key={row.to}>
                <Link to={row.to} className="flex min-h-11 items-center gap-3 rounded-lg py-2.5 text-xs text-slate-700 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-200 dark:hover:text-accent-300">
                  <span className="min-w-8 text-lg font-extrabold text-amber-600 dark:text-amber-400">{row.count ?? <CalendarX className="h-5 w-5" aria-hidden="true" />}</span>
                  <span className="min-w-0 flex-1 break-words font-semibold">{row.text}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-label={`Accounts by status: ${accounts.map(a => `${a.role} ${a.Active} active, ${a.Invited} invited, ${a.Deactivated} deactivated`).join('; ')}`} className={cardClass}>
          <h3 className={titleClass}>Accounts by Status</h3>
          <p className={subClass}>Faculty and Students</p>
          <div className="h-48 mt-3">
            {hasAccounts ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accounts} margin={margin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="role" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Active" stackId="a" fill="#10b981" />
                  <Bar dataKey="Invited" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="Deactivated" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={emptyClass}>No accounts yet.</p>}
          </div>
        </section>

        <section aria-label={`Sign-in activity over 12 weeks: ${hasSignIns ? signIns.map(w => `week of ${w.week}, ${w.Faculty} Faculty and ${plural(w.Students, 'Student', 'Students')}`).join('; ') : 'no sign-ins'}`} className={cardClass}>
          <h3 className={titleClass}>Sign-in Activity</h3>
          <p className={subClass}>People who signed in each week, last 12 weeks</p>
          <div className="h-48 mt-3">
            {hasSignIns ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={signIns} margin={margin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="week" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Line type="linear" dataKey="Faculty" stroke="#4f46e5" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="linear" dataKey="Students" stroke="#0d9488" strokeWidth={2} dot={{ r: 2.5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className={emptyClass}>No sign-ins in the last 12 weeks.</p>}
          </div>
        </section>

        <section aria-label={`Two-factor sign-in: ${twoFactor.map(t => `${t.role} ${t.On} of ${t.On + t.Off} have 2FA on`).join('; ')}`} className={cardClass}>
          <h3 className={titleClass}>Two-Factor Sign-In</h3>
          <p className={subClass}>Active accounts with 2FA on or off</p>
          <div className="h-48 mt-3">
            {hasTwoFactor ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={twoFactor} margin={margin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="role" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="On" stackId="a" fill="#10b981" />
                  <Bar dataKey="Off" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={emptyClass}>No active accounts yet.</p>}
          </div>
        </section>

        <section aria-label={`Failed sign-ins over 14 days: ${hasFailed ? failed.filter(d => d.count > 0).map(d => `${d.day} ${d.count}`).join('; ') : 'none'}`} className={cardClass}>
          <h3 className={titleClass}>Failed Sign-Ins</h3>
          <p className={subClass}>Per day, last 14 days</p>
          <div className="h-48 mt-3">
            {hasFailed ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={failed} margin={margin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip formatter={(value) => [String(value), 'Failed sign-ins']} />
                  <Bar dataKey="count" fill="#e11d48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={emptyClass}>No failed sign-ins in the last 14 days.</p>}
          </div>
        </section>

        <section aria-label={`Students per year level: ${levels.length ? levels.map(l => `${l.label} ${l.students}`).join('; ') : 'no students'}`} className={cardClass}>
          <h3 className={titleClass}>Students per Year Level</h3>
          <p className={subClass}>Student accounts by year level</p>
          <div className="h-48 mt-3">
            {levels.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={levels} margin={margin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip formatter={(value) => [String(value), 'Students']} />
                  <Bar dataKey="students" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={emptyClass}>No students yet.</p>}
          </div>
        </section>

        <section aria-label={`Class sections per course: ${sections.length ? sections.map(s => `${s.courseCode} ${s.sections}`).join('; ') : 'no class sections'}`} className={cardClass}>
          <h3 className={titleClass}>Class Sections per Course</h3>
          <p className={subClass}>This school year, top 10 courses</p>
          <div className="h-48 mt-3">
            {sections.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sections} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="courseCode" stroke="#94a3b8" fontSize={9} tickLine={false} width={60} interval={0} />
                  <Tooltip formatter={(value) => [String(value), 'Class sections']} />
                  <Bar dataKey="sections" fill="#0d9488" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={emptyClass}>No class sections this school year.</p>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {tiles.map(t => (
          <button
            key={t.label}
            type="button"
            onClick={() => navigate(t.to)}
            aria-label={`${t.label}: ${t.value}${t.sub ? `, ${t.sub}` : ''}`}
            className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 min-w-0 text-left transition hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block break-words">{t.label}</span>
            <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5 break-words">{t.value}</span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5 min-h-[1rem]">{t.sub}</span>
          </button>
        ))}
      </div>

      {/* 13.9 D13: moved here from the Dean Dashboard, markup copied as is */}
      <section aria-label="Latest audit events" className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Latest Audit Events</h3>
          <button type="button" onClick={() => navigate('/superadmin/audit-trail')} className="text-xs font-bold whitespace-nowrap text-accent-600 hover:underline cursor-pointer">View audit trail</button>
        </div>
        {data.recentAuditEvents.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">No audit events recorded yet.</p>
        ) : (
          <AuditCompactList entries={data.recentAuditEvents} />
        )}
      </section>
    </div>
  );
};
