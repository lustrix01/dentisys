import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, BookOpen, CalendarDays, Clock3, Eye, UserRoundCog, Users } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { ApiError, changeClassFacultyApi, getAdminClassDetailApi, getAdminClassFiltersApi, getAdminClassesApi } from '../../services/apiClient';
import type { AdminClassFilters, AdminClassRosterStudent, AdminClassRow } from '../../services/apiClient';
import { formatSchoolYear as schoolYearText } from '../../utils/schoolYear';
import { displayMeetingTime } from '../../utils/scheduleHelper';

// Superadmin Classes (docs/contracts/superadmin-classes.md): every Faculty member's classes, read-only, plus Change Faculty.
type ClassView = 'active' | 'archived';

const PAGE_SIZE = 50;
const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const filterClass = 'min-h-10 w-full min-w-36 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const toReasonLabel = (reason?: AdminClassRow['archiveReason']) => reason === 'cancelled' ? 'Cancelled' : reason === 'mistake' ? 'Created by mistake' : reason === 'completed' ? 'Completed' : 'Finished';
const semesterLabel = (value: string) => ({ '1ST': '1st Semester', '2ND': '2nd Semester', SUMMER: 'Summer' } as Record<string, string>)[value.toUpperCase()] ?? value;
const scheduleText = (item: AdminClassRow) => item.schedule.map(m => `${m.day} · ${displayMeetingTime(m.start)}–${displayMeetingTime(m.end)}`).join('; ') || 'Schedule TBA';
const roomText = (item: AdminClassRow) => [item.rooms.lecture && `Lec: ${item.rooms.lecture}`, item.rooms.laboratory && `Lab: ${item.rooms.laboratory}`].filter(Boolean).join(' · ') || 'Room TBA';
const studentsText = (n: number) => `${n} ${n === 1 ? 'student' : 'students'}`;

export const Classes: React.FC = () => {
  const [params] = useSearchParams(); // read once: People & Accounts links here with ?facultyId=
  const [classes, setClasses] = useState<AdminClassRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ active: 0, archived: 0 });
  const [filters, setFilters] = useState<AdminClassFilters>({ schoolYears: [], currentSchoolYear: '', courses: [], faculty: [] });
  const [view, setView] = useState<ClassView>('active');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [schoolYear, setSchoolYear] = useState('all');
  const [semester, setSemester] = useState('all');
  const [courseId, setCourseId] = useState(0);
  const [facultyId, setFacultyId] = useState(() => Number(params.get('facultyId')) || 0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rosterClass, setRosterClass] = useState<AdminClassRow | null>(null);
  const [roster, setRoster] = useState<AdminClassRosterStudent[] | null>(null);
  const [changeClass, setChangeClass] = useState<AdminClassRow | null>(null);
  const [toUserId, setToUserId] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { getAdminClassFiltersApi().then(setFilters).catch(() => undefined); }, []);

  const load = () => {
    const ticket = ++latest.current;
    setLoading(true);
    setError('');
    getAdminClassesApi({ view, q, page, schoolYear: schoolYear === 'all' ? undefined : schoolYear, semester: semester === 'all' ? undefined : semester, courseId: courseId || undefined, facultyId: facultyId || undefined })
      .then(r => { if (ticket === latest.current) { setClasses(r.classes); setTotal(r.total); setCounts(r.counts); } })
      .catch(err => { if (ticket === latest.current) setError(err instanceof Error ? err.message : 'Could not load classes. Select Retry.'); })
      .finally(() => { if (ticket === latest.current) setLoading(false); });
  };
  useEffect(load, [view, q, page, schoolYear, semester, courseId, facultyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clearFilters = () => { setSchoolYear('all'); setSemester('all'); setCourseId(0); setFacultyId(0); setSearch(''); setQ(''); setPage(1); };

  const openRoster = (item: AdminClassRow) => {
    setRosterClass(item);
    setRoster(null);
    getAdminClassDetailApi(item.csId)
      .then(r => setRoster(r.roster))
      .catch(err => { setRosterClass(null); showFeedback(err instanceof Error ? err.message : 'Could not load the class details. Try again.', 'error'); });
  };
  const openChange = (item: AdminClassRow) => { setToUserId(''); setReason(''); setReasonError(''); setFormError(''); setChangeClass(item); };
  const closeChange = () => { if (!busy) setChangeClass(null); };
  const confirmChange = async () => {
    if (!changeClass) return;
    const note = reason.trim();
    if (note.length < 5) { setReasonError('Enter a reason.'); return; }
    if (!toUserId) { setFormError('Choose an active Faculty member.'); return; }
    setBusy(true);
    try {
      const response = await changeClassFacultyApi(changeClass.csId, Number(toUserId), note);
      showFeedback(response.message, 'success');
      setChangeClass(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not change the Faculty member. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">Showing <b className="text-slate-800 dark:text-slate-100">{classes.length}</b> of {total} {view} classes · {counts.active} active overall</p>

      <ListToolbar
        left={(
          <>
            <Tabs variant="switch" color="accent" label="Class views" value={view} onChange={value => { setView(value); setPage(1); }} tabs={[
              { id: 'active', label: 'Active Classes', icon: <BookOpen className="h-4 w-4" />, count: counts.active },
              { id: 'archived', label: 'Archived Classes', icon: <Archive className="h-4 w-4" />, count: counts.archived },
            ]} />
          </>
        )}
        below={(
          <>
            <SearchField value={search} onChange={setSearch} placeholder="Search course, section or Faculty…" color="accent" />
            <label className="w-full min-w-0 sm:w-auto sm:flex-none"><span className="sr-only">School Year</span><select aria-label="School Year" value={schoolYear} onChange={event => { setSchoolYear(event.target.value); setPage(1); }} className={filterClass}><option value="all">All school years</option>{filters.schoolYears.map(year => <option key={year} value={year}>{schoolYearText(year)}{year === filters.currentSchoolYear ? ' (Current)' : ''}</option>)}</select></label>
            <label className="w-full min-w-0 sm:w-auto sm:flex-none"><span className="sr-only">Semester</span><select aria-label="Semester" value={semester} onChange={event => { setSemester(event.target.value); setPage(1); }} className={filterClass}><option value="all">All semesters</option><option value="1ST">1st Semester</option><option value="2ND">2nd Semester</option><option value="Summer">Summer</option></select></label>
            <label className="w-full min-w-0 sm:w-auto sm:max-w-56 sm:flex-none"><span className="sr-only">Course</span><select aria-label="Course" value={courseId} onChange={event => { setCourseId(Number(event.target.value)); setPage(1); }} className={filterClass}><option value={0}>All courses</option>{filters.courses.map(course => <option key={course.courseId} value={course.courseId}>{course.courseCode} · {course.title}</option>)}</select></label>
            <label className="w-full min-w-0 sm:w-auto sm:max-w-56 sm:flex-none"><span className="sr-only">Faculty</span><select aria-label="Faculty" value={facultyId} onChange={event => { setFacultyId(Number(event.target.value)); setPage(1); }} className={filterClass}><option value={0}>All Faculty</option>{filters.faculty.map(member => <option key={member.userId} value={member.userId}>{member.name}{member.status === 'deactivated' ? ' (deactivated)' : ''}</option>)}</select></label>
            <button type="button" onClick={clearFilters} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40">Clear filters</button>
          </>
        )}
      />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
          <span className="break-words">{error}</span>
          <button type="button" onClick={load} className="min-h-[44px] font-bold underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div role="status" className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Loading classes…</div>
      ) : classes.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900"><BookOpen className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No matching classes</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Adjust the filters or search for another class.</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {classes.map(item => <ClassCard key={item.csId} item={item} archived={view === 'archived'} onChangeFaculty={() => openChange(item)} onRoster={() => openRoster(item)} />)}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800">Previous</button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40 dark:border-slate-800">Next</button>
          </div>
        </div>
      )}

      <Modal isOpen={Boolean(changeClass)} onClose={closeChange} title="Change Faculty" size="sm">
        {changeClass && (
          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{changeClass.courseCode} · {changeClass.section}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Current Faculty: {changeClass.faculty.name}</p>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <li>Students, grades, attendance, sessions, the Class Secretary and the join code stay with the class.</li>
              <li>The new Faculty member gets full access; the class leaves the current Faculty member's classes and reports.</li>
              <li>Both Faculty members get a notice and an email; the Class Secretary gets a notice.</li>
            </ul>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">New Faculty
              <select value={toUserId} onChange={event => { setToUserId(event.target.value); setFormError(''); }} className={inputClass}>
                <option value="">Choose an active Faculty member</option>
                {filters.faculty.filter(member => member.status === 'active' && member.userId !== changeClass.faculty.userId).map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Reason
              <input maxLength={240} value={reason} onChange={event => { setReason(event.target.value); setReasonError(''); }} className={inputClass} />
              {reasonError && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">{reasonError}</span>}
            </label>
            {formError && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-400">{formError}</div>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" disabled={busy} onClick={closeChange} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void confirmChange()} className="min-h-11 rounded-xl bg-accent-600 px-4 text-xs font-bold text-white hover:bg-accent-700 disabled:opacity-50">Change Faculty</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(rosterClass)} onClose={() => setRosterClass(null)} title="Class Details" size="lg">
        {rosterClass && <div className="space-y-4 p-5 sm:p-6">
          <div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{rosterClass.courseCode} · {rosterClass.section}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{rosterClass.courseTitle} · {studentsText(rosterClass.studentCount)}</p></div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-3">{[['School Year', schoolYearText(rosterClass.schoolYear)], ['Semester', semesterLabel(rosterClass.semester)], ['Year Level', `Year ${rosterClass.yearLevel}`], ['Assigned Faculty', rosterClass.faculty.name], ['Class Secretary', rosterClass.secretary?.name ?? 'None'], ['Class Schedule', scheduleText(rosterClass)], ['Room', roomText(rosterClass)]].map(([label, value]) => <div key={label}><dt className="text-[10px] font-semibold text-slate-400">{label}</dt><dd className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{value}</dd></div>)}</dl>
          {roster === null ? (
            <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading roster…</div>
          ) : (
            <div className="table-pin table-pin-first rounded-2xl border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="whitespace-nowrap px-4 py-3">Student No.</th><th className="px-4 py-3">Name</th><th className="whitespace-nowrap px-4 py-3">Email</th><th className="whitespace-nowrap px-4 py-3">Year Level</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{roster.map(student => <tr key={student.studentNo}><td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{student.studentNo}</td><td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{student.name}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{student.email}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">Year {student.yearLevel}</td></tr>)}</tbody></table></div>
          )}
        </div>}
      </Modal>
    </section>
  );
};

function ClassCard({ item, archived, onChangeFaculty, onRoster }: { item: AdminClassRow; archived: boolean; onChangeFaculty: () => void; onRoster: () => void }) {
  return <article className="flex min-w-0 flex-col justify-between space-y-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-accent-50 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-accent-700 dark:bg-accent-950/40 dark:text-accent-300">{item.courseCode} · Year {item.yearLevel}</span>{archived && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.archiveReason === 'cancelled' || item.archiveReason === 'mistake' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{toReasonLabel(item.archiveReason)}</span>}</div>
      <div><h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{item.courseTitle}</h3><p className="mt-1 text-xs font-bold text-accent-700 dark:text-accent-300">{item.section}</p></div>
      <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400"><p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-accent-500" />{semesterLabel(item.semester)} · {schoolYearText(item.schoolYear)}</p><p className="flex items-center gap-2"><Users className="h-3.5 w-3.5 shrink-0 text-accent-500" />{item.faculty.name}</p><p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" />{scheduleText(item)} · {roomText(item)}</p></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">{studentsText(item.studentCount)}</span><div className="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-2">
      {item.canChangeFaculty && <button type="button" aria-label={`Change Faculty for ${item.courseCode} ${item.section}`} title={`Change Faculty for ${item.courseCode} ${item.section}`} onClick={onChangeFaculty} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"><UserRoundCog className="h-4 w-4" /></button>}
      <button type="button" aria-label={`View details for ${item.courseCode} ${item.section}`} title={`View details for ${item.courseCode} ${item.section}`} onClick={onRoster} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Eye className="h-4 w-4" /></button>
    </div></div>
  </article>;
}
