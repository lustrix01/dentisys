import React, { useMemo, useState } from 'react';
import { Archive, BookOpen, CalendarDays, Clock3, Eye, Pencil, Plus, RotateCcw, Users } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';

type ClassView = 'active' | 'archived';
type ArchiveReason = 'finished' | 'cancelled' | 'mistake';
type RosterStudent = { studentNumber: string; name: string; email: string; yearLevel: number };
type PreviewClass = {
  id: string;
  courseCode: string;
  courseTitle: string;
  section: string;
  schoolYear: string;
  semester: string;
  yearLevel: number;
  faculty: string;
  schedule: string;
  room: string;
  status: ClassView;
  archiveReason?: ArchiveReason | 'completed';
  roster: RosterStudent[];
};
type ClassDraft = Pick<PreviewClass, 'courseCode' | 'courseTitle' | 'section' | 'yearLevel' | 'faculty' | 'schedule' | 'room' | 'schoolYear' | 'semester'>;

const CURRENT_SCHOOL_YEAR = '2026-2027';
const FACULTY = ['Avery Santos', 'Morgan Reyes', 'Jordan Dela Cruz'];
const REASONS: { value: ArchiveReason; label: string }[] = [
  { value: 'finished', label: 'Finished' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'mistake', label: 'Created by mistake' },
];
const SAMPLE_ROSTER: RosterStudent[] = [
  { studentNumber: '2024-00128', name: 'Taylor Garcia', email: 'taylor.garcia@example.edu', yearLevel: 1 },
  { studentNumber: '2024-00146', name: 'Sam Castillo', email: 'sam.castillo@example.edu', yearLevel: 1 },
  { studentNumber: '2024-00203', name: 'Drew Flores', email: 'drew.flores@example.edu', yearLevel: 1 },
];
const INITIAL_CLASSES: PreviewClass[] = [
  { id: 'c-1', courseCode: 'DENT 101', courseTitle: 'Introduction to Dentistry', section: 'CDM-1A', schoolYear: CURRENT_SCHOOL_YEAR, semester: '1st Semester', yearLevel: 1, faculty: 'Avery Santos', schedule: 'Mon · 8:00–10:00 AM', room: 'CDM-1', status: 'active', roster: SAMPLE_ROSTER },
  { id: 'c-2', courseCode: 'DENT 204', courseTitle: 'Oral Biology', section: 'CDM-2B', schoolYear: CURRENT_SCHOOL_YEAR, semester: '1st Semester', yearLevel: 2, faculty: 'Morgan Reyes', schedule: 'Tue · 1:00–3:00 PM', room: 'CDM-2', status: 'active', roster: SAMPLE_ROSTER.slice(0, 2) },
  { id: 'c-3', courseCode: 'DENT 305', courseTitle: 'Clinical Practice', section: 'CDM-3A', schoolYear: CURRENT_SCHOOL_YEAR, semester: '2nd Semester', yearLevel: 3, faculty: 'Jordan Dela Cruz', schedule: 'Wed · 9:00–11:00 AM', room: 'CDM-3', status: 'active', roster: SAMPLE_ROSTER },
  { id: 'c-4', courseCode: 'DENT 202', courseTitle: 'Dental Materials', section: 'CDM-2A', schoolYear: '2025-2026', semester: '2nd Semester', yearLevel: 2, faculty: 'Avery Santos', schedule: 'Thu · 10:00 AM–12:00 PM', room: 'CDM-2', status: 'archived', archiveReason: 'completed', roster: SAMPLE_ROSTER.slice(1) },
  { id: 'c-5', courseCode: 'DENT 103', courseTitle: 'Dental Anatomy', section: 'CDM-1B', schoolYear: CURRENT_SCHOOL_YEAR, semester: '1st Semester', yearLevel: 1, faculty: 'Morgan Reyes', schedule: 'Fri · 8:00–10:00 AM', room: 'CDM-1', status: 'archived', archiveReason: 'finished', roster: SAMPLE_ROSTER },
];

const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const filterClass = 'min-h-10 w-full min-w-36 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';
const toReasonLabel = (reason?: PreviewClass['archiveReason']) => reason === 'cancelled' ? 'Cancelled' : reason === 'mistake' ? 'Created by mistake' : reason === 'completed' ? 'Completed' : 'Finished';

export const Classes: React.FC = () => {
  const [classes, setClasses] = useState(INITIAL_CLASSES);
  const [view, setView] = useState<ClassView>('active');
  const [search, setSearch] = useState('');
  const [schoolYear, setSchoolYear] = useState('all');
  const [faculty, setFaculty] = useState('all');
  const [draft, setDraft] = useState<ClassDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rosterClass, setRosterClass] = useState<PreviewClass | null>(null);
  const [archiveClass, setArchiveClass] = useState<PreviewClass | null>(null);
  const [restoreClass, setRestoreClass] = useState<PreviewClass | null>(null);
  const [archiveReason, setArchiveReason] = useState<ArchiveReason>('finished');

  const years = useMemo(() => [...new Set(classes.map(item => item.schoolYear))].sort().reverse(), [classes]);
  const facultyNames = useMemo(() => [...new Set(classes.map(item => item.faculty))].sort(), [classes]);
  const shown = useMemo(() => classes.filter(item => item.status === view
    && (schoolYear === 'all' || item.schoolYear === schoolYear)
    && (faculty === 'all' || item.faculty === faculty)
    && `${item.courseCode} ${item.courseTitle} ${item.section} ${item.faculty} ${item.schoolYear} ${item.semester}`.toLowerCase().includes(search.trim().toLowerCase())),
  [classes, view, schoolYear, faculty, search]);

  const startCreate = () => {
    setEditingId(null);
    setDraft({ courseCode: '', courseTitle: '', section: '', yearLevel: 1, faculty: FACULTY[0], schedule: '', room: '', schoolYear: CURRENT_SCHOOL_YEAR, semester: '1st Semester' });
  };
  const startEdit = (item: PreviewClass) => {
    setEditingId(item.id);
    setDraft({ courseCode: item.courseCode, courseTitle: item.courseTitle, section: item.section, yearLevel: item.yearLevel, faculty: item.faculty, schedule: item.schedule, room: item.room, schoolYear: item.schoolYear, semester: item.semester });
  };
  const saveDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.courseCode.trim() || !draft.courseTitle.trim() || !draft.section.trim() || !draft.faculty) {
      showFeedback('Enter a course code, course title, section and assigned Faculty.', 'error');
      return;
    }
    if (editingId) {
      setClasses(current => current.map(item => item.id === editingId ? { ...item, ...draft, courseCode: draft.courseCode.trim(), courseTitle: draft.courseTitle.trim(), section: draft.section.trim() } : item));
      showFeedback('Preview class updated in this view only.', 'success');
    } else {
      setClasses(current => [{ ...draft, id: `preview-${Date.now()}`, courseCode: draft.courseCode.trim(), courseTitle: draft.courseTitle.trim(), section: draft.section.trim(), status: 'active', roster: [] }, ...current]);
      setView('active');
      setSearch('');
      setSchoolYear('all');
      setFaculty('all');
      showFeedback('Preview class added in this view only.', 'success');
    }
    setDraft(null);
    setEditingId(null);
  };
  const confirmArchive = () => {
    if (!archiveClass) return;
    setClasses(current => current.map(item => item.id === archiveClass.id ? { ...item, status: 'archived', archiveReason } : item));
    setArchiveClass(null);
    setView('archived');
    showFeedback('Preview class archived in this view only.', 'success');
  };
  const confirmRestore = () => {
    if (!restoreClass) return;
    setClasses(current => current.map(row => row.id === restoreClass.id ? { ...row, status: 'active', archiveReason: undefined } : row));
    setRestoreClass(null);
    setView('active');
    showFeedback('Preview class restored in this view only.', 'success');
  };

  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Preview data.</strong> These sample classes and rosters are not live records. Create, edit, archive and restore changes are temporary and stay in this view only.</p>
      </div>

      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">Showing <b className="text-slate-800 dark:text-slate-100">{shown.length}</b> of {classes.filter(item => item.status === view).length} sample {view} classes · {classes.filter(item => item.status === 'active').length} active overall</p>

      <Tabs variant="section" color="accent" className="w-full" label="Class views" value={view} onChange={value => setView(value)} tabs={[
        { id: 'active', label: 'Active Classes', icon: <BookOpen className="h-4 w-4" />, count: classes.filter(item => item.status === 'active').length },
        { id: 'archived', label: 'Archived Classes', icon: <Archive className="h-4 w-4" />, count: classes.filter(item => item.status === 'archived').length },
      ]} />

      <ListToolbar
        left={<SearchField value={search} onChange={setSearch} placeholder="Search course, section or Faculty…" color="accent" />}
        right={(
          // Full-width controls on phones, and a width-capped group at lg so the filters wrap
          // inside the toolbar instead of colliding with the search field.
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto lg:max-w-[24rem] lg:justify-end xl:max-w-none">
            <label className="w-full min-w-0 sm:w-auto sm:flex-none"><span className="sr-only">School Year</span><select aria-label="School Year" value={schoolYear} onChange={event => setSchoolYear(event.target.value)} className={filterClass}><option value="all">All School Years</option>{years.map(year => <option key={year} value={year}>S.Y. {year}</option>)}</select></label>
            <label className="w-full min-w-0 sm:w-auto sm:flex-none"><span className="sr-only">Faculty</span><select aria-label="Faculty" value={faculty} onChange={event => setFaculty(event.target.value)} className={filterClass}><option value="all">All Faculty</option>{facultyNames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <button type="button" onClick={() => { setSchoolYear('all'); setFaculty('all'); setSearch(''); }} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40">Clear filters</button>
            {view === 'active' && <button type="button" onClick={startCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-accent-700 hover:shadow-md"><Plus className="h-4 w-4" />Create Class</button>}
          </div>
        )}
      />

      {shown.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900"><BookOpen className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No matching classes</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Adjust the filters or search for another class.</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {shown.map(item => <ClassCard key={item.id} item={item} canManage={item.schoolYear === CURRENT_SCHOOL_YEAR} onEdit={() => startEdit(item)} onArchive={() => { setArchiveClass(item); setArchiveReason('finished'); }} onRestore={() => setRestoreClass(item)} onRoster={() => setRosterClass(item)} />)}
        </div>
      )}

      <p className="px-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Past school-year classes remain view-only. Class creation requires a current Dean-defined term; existing class schedule and archive rules still apply.</p>

      <Modal isOpen={Boolean(draft)} onClose={() => { setDraft(null); setEditingId(null); }} title={editingId ? 'Edit Class' : 'Create Class'} size="lg">
        {draft && <form onSubmit={saveDraft} className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Course Code"><input required value={draft.courseCode} onChange={event => setDraft({ ...draft, courseCode: event.target.value })} placeholder="e.g. DENT 101" disabled={Boolean(editingId)} title={editingId ? 'Course identity is protected.' : undefined} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-900`} /></Field>
            <Field label="Course Title"><input required value={draft.courseTitle} onChange={event => setDraft({ ...draft, courseTitle: event.target.value })} placeholder="Course title" className={inputClass} /></Field>
            <Field label="Section / Block"><input required value={draft.section} onChange={event => setDraft({ ...draft, section: event.target.value })} placeholder="e.g. CDM-1A" className={inputClass} /></Field>
            <Field label="Assigned Faculty"><select required value={draft.faculty} onChange={event => setDraft({ ...draft, faculty: event.target.value })} className={inputClass}>{FACULTY.map(name => <option key={name} value={name}>{name}</option>)}</select></Field>
            <Field label="School Year"><input value={draft.schoolYear} readOnly className={`${inputClass} cursor-not-allowed bg-slate-50 dark:bg-slate-900`} /></Field>
            <Field label="Semester"><select value={draft.semester} onChange={event => setDraft({ ...draft, semester: event.target.value })} disabled={Boolean(editingId)} title={editingId ? 'Term identity is protected.' : undefined} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-900`}><option>1st Semester</option><option>2nd Semester</option><option>Summer</option></select></Field>
            <Field label="Year Level"><select value={draft.yearLevel} onChange={event => setDraft({ ...draft, yearLevel: Number(event.target.value) })} className={inputClass}>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>Year {level}</option>)}</select></Field>
            <Field label="Class Schedule"><input value={draft.schedule} onChange={event => setDraft({ ...draft, schedule: event.target.value })} placeholder="Day and time" className={inputClass} /></Field>
            <Field label="Room"><input value={draft.room} onChange={event => setDraft({ ...draft, room: event.target.value })} placeholder="Room" className={inputClass} /></Field>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setDraft(null); setEditingId(null); }} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button><button type="submit" className="min-h-11 rounded-xl bg-accent-600 px-4 text-xs font-bold text-white hover:bg-accent-700">{editingId ? 'Save Changes' : 'Create Class'}</button></div>
        </form>}
      </Modal>

      <Modal isOpen={Boolean(archiveClass)} onClose={() => setArchiveClass(null)} title="Archive Class" size="sm">
        {archiveClass && <div className="space-y-4 p-5 sm:p-6">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{archiveClass.courseCode} · {archiveClass.section}</p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Choose why this class is being archived. Existing eligibility and session rules apply.</p>
          <fieldset className="space-y-2"><legend className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">Archive Reason</legend>{REASONS.map(reason => <label key={reason.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><input type="radio" name="archiveReason" value={reason.value} checked={archiveReason === reason.value} onChange={() => setArchiveReason(reason.value)} className="accent-accent-600" />{reason.label}</label>)}</fieldset>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><button type="button" onClick={() => setArchiveClass(null)} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button><button type="button" onClick={confirmArchive} className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700">Archive Class</button></div>
        </div>}
      </Modal>

      <Modal isOpen={Boolean(restoreClass)} onClose={() => setRestoreClass(null)} title="Restore Class" size="sm">
        {restoreClass && <div className="space-y-4 p-5 sm:p-6">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{restoreClass.courseCode} · {restoreClass.section}</p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Restore this class to Active Classes? It will become editable again. Scheduled attendance sessions and Class Secretary appointments ended when the class was archived will not be restored.</p>
          {restoreClass.archiveReason === 'cancelled' && <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">Enrolled Students will be notified that this cancelled class has been restored.</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><button type="button" onClick={() => setRestoreClass(null)} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button><button type="button" onClick={confirmRestore} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700">Restore Class</button></div>
        </div>}
      </Modal>

      <Modal isOpen={Boolean(rosterClass)} onClose={() => setRosterClass(null)} title="Class Details" size="lg">
        {rosterClass && <div className="space-y-4 p-5 sm:p-6">
          <div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{rosterClass.courseCode} · {rosterClass.section}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{rosterClass.courseTitle} · {rosterClass.roster.length} sample students</p></div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-3">{[['School Year', rosterClass.schoolYear], ['Semester', rosterClass.semester], ['Year Level', `Year ${rosterClass.yearLevel}`], ['Assigned Faculty', rosterClass.faculty], ['Class Schedule', rosterClass.schedule || 'Schedule TBA'], ['Room', rosterClass.room || 'Room TBA']].map(([label, value]) => <div key={label}><dt className="text-[10px] font-semibold text-slate-400">{label}</dt><dd className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{value}</dd></div>)}</dl>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="px-4 py-3">Student Number</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Year Level</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rosterClass.roster.map(student => <tr key={student.studentNumber}><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{student.studentNumber}</td><td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{student.name}</td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">{student.email}</td><td className="px-4 py-3 text-slate-500 dark:text-slate-400">Year {student.yearLevel}</td></tr>)}</tbody></table></div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Preview roster only. Student enrollment data is not connected.</p>
        </div>}
      </Modal>
    </section>
  );
};

function ClassCard({ item, canManage, onEdit, onArchive, onRestore, onRoster }: { item: PreviewClass; canManage: boolean; onEdit: () => void; onArchive: () => void; onRestore: () => void; onRoster: () => void }) {
  return <article className="flex min-w-0 flex-col justify-between space-y-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-accent-50 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-accent-700 dark:bg-accent-950/40 dark:text-accent-300">{item.courseCode} · Year {item.yearLevel}</span>{item.status === 'archived' && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.archiveReason === 'cancelled' || item.archiveReason === 'mistake' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{toReasonLabel(item.archiveReason)}</span>}</div>
      <div><h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{item.courseTitle}</h3><p className="mt-1 text-xs font-bold text-accent-700 dark:text-accent-300">{item.section}</p></div>
      <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400"><p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-accent-500" />{item.semester} · S.Y. {item.schoolYear}</p><p className="flex items-center gap-2"><Users className="h-3.5 w-3.5 shrink-0 text-accent-500" />{item.faculty}</p><p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" />{item.schedule || 'Schedule TBA'} · {item.room || 'Room TBA'}</p></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">{item.roster.length} sample students</span><div className="ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-2">
      {item.status === 'active' && <button type="button" disabled={!canManage} aria-label={`Edit ${item.courseCode} ${item.section}`} title={!canManage ? 'Past school-year classes are view-only.' : `Edit ${item.courseCode} ${item.section} and assigned Faculty`} onClick={onEdit} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"><Pencil className="h-4 w-4" /></button>}
      {item.status === 'active' && <button type="button" disabled={!canManage} aria-label={`Archive ${item.courseCode} ${item.section}`} title={!canManage ? 'Past school-year classes are view-only.' : `Archive ${item.courseCode} ${item.section}`} onClick={onArchive} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"><Archive className="h-4 w-4" /></button>}
      {item.status === 'archived' && canManage && item.archiveReason !== 'completed' && <button type="button" aria-label={`Restore ${item.courseCode} ${item.section}`} title={`Restore ${item.courseCode} ${item.section}`} onClick={onRestore} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"><RotateCcw className="h-4 w-4" /></button>}
      <button type="button" aria-label={`View details for ${item.courseCode} ${item.section}`} title={`View details for ${item.courseCode} ${item.section}`} onClick={onRoster} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Eye className="h-4 w-4" /></button>
    </div></div>
  </article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-xs font-bold text-slate-700 dark:text-slate-300">{label}{children}</label>;
}
