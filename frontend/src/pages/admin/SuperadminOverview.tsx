import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { semesterLabel } from '../../utils/academicTermDefaults';
import {
  getAcademicTermsApi,
  getAdminCoursesApi,
  getAdminPeopleApi,
  getAdminRoomsApi,
  getFacultyInvitations,
} from '../../services/apiClient';

type Tile = { label: string; value: string; sub: string; to: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`; };

const LOADING = '…';
const FAILED = '—';

const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

export const SuperadminOverview: React.FC = () => {
  const navigate = useNavigate();
  const [tiles, setTiles] = useState<Tile[] | null>(null);

  useEffect(() => {
    let ignore = false;
    Promise.allSettled([
      getAdminPeopleApi({ kind: 'faculty', status: 'active' }),
      getAdminPeopleApi({ kind: 'faculty', status: 'deactivated' }),
      getAdminPeopleApi({ kind: 'student', status: 'active' }),
      getAdminPeopleApi({ kind: 'student', status: 'deactivated' }),
      getAdminPeopleApi({ kind: 'faculty', status: 'active', twoFactor: 'on' }),
      getAdminPeopleApi({ kind: 'student', status: 'active', twoFactor: 'on' }),
      getFacultyInvitations(),
      getAdminCoursesApi('all'),
      getAdminRoomsApi(),
      getAcademicTermsApi(),
    ]).then(([fa, fd, sa, sd, f2, s2, inv, courses, rooms, terms]) => {
      if (ignore) return;
      const n = (r: PromiseSettledResult<{ total: number }>) => ok(r)?.total;
      const faculty = n(fa), students = n(sa), on = f2.status === 'fulfilled' && s2.status === 'fulfilled' ? f2.value.total + s2.value.total : undefined;
      const people = faculty !== undefined && students !== undefined ? faculty + students : undefined;
      const pending = ok(inv)?.invitations.filter((i) => i.status === 'Pending').length;
      const courseList = ok(courses)?.courses;
      const roomList = ok(rooms)?.rooms;
      const termData = ok(terms);
      // Same rule as the Academic Terms page's "Current" chip: today (Asia/Manila, from the server) inside the term dates.
      const current = termData?.terms.find((t) => t.startDate && t.endDate && termData.today >= t.startDate && termData.today <= t.endDate);
      const num = (v: number | undefined) => (v === undefined ? FAILED : String(v));
      const subOf = (v: number | undefined, text: string) => (v === undefined ? '' : text);
      setTiles([
        { label: 'Faculty Accounts', value: num(faculty), sub: subOf(n(fd), `${n(fd)} deactivated`), to: '/superadmin/people?kind=faculty' },
        { label: 'Student Accounts', value: num(students), sub: subOf(n(sd), `${n(sd)} deactivated`), to: '/superadmin/people?kind=student' },
        { label: '2FA Turned On', value: on === undefined || people === undefined ? FAILED : `${on} of ${people}`, sub: on === undefined || people === undefined ? '' : `${people - on} without 2FA`, to: '/superadmin/people?kind=faculty&twoFactor=off' },
        { label: 'Pending Invitations', value: num(pending), sub: subOf(pending, 'Faculty not yet signed up'), to: '/superadmin/faculty-invite' },
        { label: 'Courses', value: courseList ? String(courseList.filter((c) => c.status === 'active').length) : FAILED, sub: courseList ? `${courseList.filter((c) => c.status === 'retired').length} retired` : '', to: '/superadmin/course-catalog' },
        { label: 'Rooms', value: roomList ? String(roomList.filter((r) => r.status === 'active').length) : FAILED, sub: roomList ? `${roomList.filter((r) => r.status === 'retired').length} retired` : '', to: '/superadmin/rooms' },
        {
          label: 'Current Term',
          value: !termData ? FAILED : current ? semesterLabel(current.semester) : 'No current term',
          sub: !termData ? '' : current ? `${current.schoolYear} · ends ${longDate(current.endDate as string)}` : 'Add the term dates',
          to: '/superadmin/terms',
        },
      ]);
    });
    return () => { ignore = true; };
  }, []);

  const labels = ['Faculty Accounts', 'Student Accounts', '2FA Turned On', 'Pending Invitations', 'Courses', 'Rooms', 'Current Term'];
  const items: Tile[] = tiles ?? labels.map((label) => ({ label, value: LOADING, sub: '', to: '' }));

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
        Accounts, courses and school setup at a glance. Select a tile to open its page.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={!tiles}
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
    </div>
  );
};
