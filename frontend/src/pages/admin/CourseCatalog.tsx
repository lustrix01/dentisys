import React, { useMemo, useState } from 'react';
import { Archive, BookOpen, Pencil, Plus, Search, X } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';

type CatalogStatus = 'active' | 'retired';
type CatalogCourse = {
  id: string;
  courseCode: string;
  name: string;
  lectureUnits: number;
  labUnits: number;
  yearLevel: number;
  semester: string;
  isClinical: boolean;
  status: CatalogStatus;
};
type CourseDraft = Omit<CatalogCourse, 'id' | 'status'>;

const INITIAL_COURSES: CatalogCourse[] = [
  { id: 'course-1', courseCode: 'DENT 101', name: 'Introduction to Dentistry', lectureUnits: 2, labUnits: 1, yearLevel: 1, semester: '1st Semester', isClinical: false, status: 'active' },
  { id: 'course-2', courseCode: 'DENT 204', name: 'Oral Biology', lectureUnits: 2, labUnits: 2, yearLevel: 2, semester: '1st Semester', isClinical: false, status: 'active' },
  { id: 'course-3', courseCode: 'DENT 305', name: 'Clinical Practice', lectureUnits: 1, labUnits: 4, yearLevel: 3, semester: '2nd Semester', isClinical: true, status: 'active' },
  { id: 'course-4', courseCode: 'DENT 202', name: 'Dental Materials', lectureUnits: 2, labUnits: 1, yearLevel: 2, semester: '2nd Semester', isClinical: false, status: 'retired' },
];

const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const filterClass = 'min-h-10 w-full min-w-36 cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';

export const CourseCatalog: React.FC = () => {
  const [courses, setCourses] = useState(INITIAL_COURSES);
  const [tab, setTab] = useState<CatalogStatus>('active');
  const [search, setSearch] = useState('');
  const [semester, setSemester] = useState('all');
  const [yearLevel, setYearLevel] = useState('all');
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<CatalogCourse | null>(null);

  const filtered = useMemo(() => courses.filter(course => course.status === tab
    && (semester === 'all' || course.semester === semester)
    && (yearLevel === 'all' || String(course.yearLevel) === yearLevel)
    && `${course.courseCode} ${course.name} ${course.semester} ${course.yearLevel}`.toLowerCase().includes(search.trim().toLowerCase())),
  [courses, tab, semester, yearLevel, search]);
  const activeCount = courses.filter(course => course.status === 'active').length;
  const retiredCount = courses.length - activeCount;

  const openCreate = () => {
    setEditingId(null);
    setDraft({ courseCode: '', name: '', lectureUnits: 0, labUnits: 0, yearLevel: 1, semester: '1st Semester', isClinical: false });
  };
  const openEdit = (course: CatalogCourse) => {
    setEditingId(course.id);
    setDraft({ courseCode: course.courseCode, name: course.name, lectureUnits: course.lectureUnits, labUnits: course.labUnits, yearLevel: course.yearLevel, semester: course.semester, isClinical: course.isClinical });
  };
  const saveCourse = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.courseCode.trim() || !draft.name.trim()) {
      showFeedback('Enter a course code and course title.', 'error');
      return;
    }
    const normalized = { ...draft, courseCode: draft.courseCode.trim().toUpperCase(), name: draft.name.trim().replace(/\s+/g, ' ') };
    if (editingId) {
      setCourses(current => current.map(course => course.id === editingId ? { ...course, ...normalized } : course));
      showFeedback('Preview course updated in this view only.', 'success');
    } else {
      setCourses(current => [{ ...normalized, id: `preview-${Date.now()}`, status: 'active' }, ...current]);
      showFeedback('Preview course added in this view only.', 'success');
    }
    setDraft(null);
    setEditingId(null);
  };
  const retireCourse = () => {
    if (!retiring) return;
    setCourses(current => current.map(course => course.id === retiring.id ? { ...course, status: 'retired' } : course));
    setRetiring(null);
    setTab('retired');
    showFeedback('Preview course retired in this view only.', 'success');
  };

  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Preview data.</strong> These sample courses are not live catalog records. Add, edit and retire changes are temporary and stay in this view only.</p>
      </div>

      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">Showing <b className="text-slate-800 dark:text-slate-100">{filtered.length}</b> of {courses.filter(course => course.status === tab).length} sample {tab} courses · {activeCount} active overall</p>

      <Tabs variant="section" color="accent" className="w-full" label="Course views" value={tab} onChange={setTab} tabs={[
        { id: 'active', label: 'Active Courses', icon: <BookOpen className="h-4 w-4" />, count: activeCount },
        { id: 'retired', label: 'Retired Courses', icon: <Archive className="h-4 w-4" />, count: retiredCount },
      ]} />

      <ListToolbar
        left={<SearchField value={search} onChange={setSearch} placeholder="Search course code or title…" color="accent" />}
        right={(
          <>
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Semester</span><select aria-label="Semester" value={semester} onChange={event => setSemester(event.target.value)} className={filterClass}><option value="all">All Semesters</option><option>1st Semester</option><option>2nd Semester</option><option>Summer</option></select></label>
            <label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Year Level</span><select aria-label="Year Level" value={yearLevel} onChange={event => setYearLevel(event.target.value)} className={filterClass}><option value="all">All Year Levels</option>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>{`Year ${level}`}</option>)}</select></label>
            <button type="button" onClick={() => { setSearch(''); setSemester('all'); setYearLevel('all'); }} className="min-h-10 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40">Clear filters</button>
            {tab === 'active' && <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-accent-700 hover:shadow-md"><Plus className="h-4 w-4" />Add Course</button>}
          </>
        )}
      />

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900"><Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No matching courses</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Adjust the filters or search for another course.</p><button type="button" onClick={() => { setSearch(''); setSemester('all'); setYearLevel('all'); }} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40"><X className="h-3.5 w-3.5" />Clear filters</button></div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:block">
            <table className="w-full min-w-[940px] text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400"><tr>
                <th className="px-5 py-3.5">Course Code</th><th className="px-4 py-3.5">Course Title</th><th className="px-4 py-3.5">Year Level</th><th className="px-4 py-3.5">Semester</th><th className="px-4 py-3.5">Lecture Units</th><th className="px-4 py-3.5">Laboratory Units</th><th className="px-4 py-3.5">Total Units</th><th className="px-4 py-3.5">Clinical</th><th className="px-4 py-3.5 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.map(course => <CourseRow key={course.id} course={course} onEdit={() => openEdit(course)} onRetire={() => setRetiring(course)} />)}</tbody>
            </table>
          </div>
          <div className="space-y-3 sm:hidden">{filtered.map(course => <CourseBlock key={course.id} course={course} onEdit={() => openEdit(course)} onRetire={() => setRetiring(course)} />)}</div>
        </>
      )}

      <Modal isOpen={Boolean(draft)} onClose={() => { setDraft(null); setEditingId(null); }} title={editingId ? 'Edit Course' : 'Add Course'} size="lg">
        {draft && <form onSubmit={saveCourse} className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Course Code"><input required value={draft.courseCode} onChange={event => setDraft({ ...draft, courseCode: event.target.value })} placeholder="e.g. DENT 101" className={inputClass} /></Field>
            <Field label="Course Title"><input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Course title" className={inputClass} /></Field>
            <Field label="Lecture Units"><input type="number" min="0" max="20" step="0.5" value={draft.lectureUnits} onChange={event => setDraft({ ...draft, lectureUnits: Number(event.target.value) })} className={inputClass} /></Field>
            <Field label="Laboratory Units"><input type="number" min="0" max="20" step="0.5" value={draft.labUnits} onChange={event => setDraft({ ...draft, labUnits: Number(event.target.value) })} className={inputClass} /></Field>
            <Field label="Year Level"><select value={draft.yearLevel} onChange={event => setDraft({ ...draft, yearLevel: Number(event.target.value) })} className={inputClass}>{[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>Year {level}</option>)}</select></Field>
            <Field label="Semester"><select value={draft.semester} onChange={event => setDraft({ ...draft, semester: event.target.value })} className={inputClass}><option>1st Semester</option><option>2nd Semester</option><option>Summer</option></select></Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><input type="checkbox" checked={draft.isClinical} onChange={event => setDraft({ ...draft, isClinical: event.target.checked })} className="h-4 w-4 accent-accent-600" />Clinical course</label>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setDraft(null); setEditingId(null); }} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button><button type="submit" className="min-h-11 rounded-xl bg-accent-600 px-4 text-xs font-bold text-white hover:bg-accent-700">{editingId ? 'Save Changes' : 'Add Course'}</button></div>
        </form>}
      </Modal>

      <Modal isOpen={Boolean(retiring)} onClose={() => setRetiring(null)} title="Retire Course" size="sm">
        {retiring && <div className="space-y-4 p-5 sm:p-6"><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{retiring.courseCode} · {retiring.name}</p><p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">This preview action moves the course to Retired Courses. It does not affect existing class sections.</p><div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><button type="button" onClick={() => setRetiring(null)} className="min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button><button type="button" onClick={retireCourse} className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700">Retire Course</button></div></div>}
      </Modal>
    </section>
  );
};

function CourseRow({ course, onEdit, onRetire }: { course: CatalogCourse; onEdit: () => void; onRetire: () => void }) {
  return <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
    <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-100">{course.courseCode}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{course.name}</td><td className="px-4 py-4 text-slate-500 dark:text-slate-400">Year {course.yearLevel}</td><td className="px-4 py-4 text-slate-500 dark:text-slate-400">{course.semester}</td><td className="px-4 py-4 text-slate-500 dark:text-slate-400">{course.lectureUnits}</td><td className="px-4 py-4 text-slate-500 dark:text-slate-400">{course.labUnits}</td><td className="px-4 py-4 font-semibold text-slate-700 dark:text-slate-200">{course.lectureUnits + course.labUnits}</td><td className="px-4 py-4">{course.isClinical ? 'Yes' : 'No'}</td>
    <td className="px-4 py-3"><div className="flex justify-end gap-1.5">{course.status === 'active' && <><button type="button" onClick={onEdit} aria-label={`Edit ${course.courseCode}`} title={`Edit ${course.courseCode}`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"><Pencil className="h-4 w-4" /></button><button type="button" onClick={onRetire} aria-label={`Retire ${course.courseCode}`} title={`Retire ${course.courseCode}`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"><Archive className="h-4 w-4" /></button></>}</div></td>
  </tr>;
}

function CourseBlock({ course, onEdit, onRetire }: { course: CatalogCourse; onEdit: () => void; onRetire: () => void }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-extrabold tracking-wide text-accent-700 dark:text-accent-300">{course.courseCode}</p><h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{course.name}</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${course.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{course.status === 'active' ? 'Active' : 'Retired'}</span></div>
    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">{[['Year Level', `Year ${course.yearLevel}`], ['Semester', course.semester], ['Lecture Units', String(course.lectureUnits)], ['Laboratory Units', String(course.labUnits)], ['Total Units', String(course.lectureUnits + course.labUnits)], ['Clinical', course.isClinical ? 'Yes' : 'No']].map(([label, value]) => <div key={label}><dt className="text-[10px] font-semibold text-slate-400">{label}</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{value}</dd></div>)}</dl>
    {course.status === 'active' && <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"><button type="button" onClick={onEdit} aria-label={`Edit ${course.courseCode}`} title={`Edit ${course.courseCode}`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Pencil className="h-4 w-4" /></button><button type="button" onClick={onRetire} aria-label={`Retire ${course.courseCode}`} title={`Retire ${course.courseCode}`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Archive className="h-4 w-4" /></button></div>}
  </article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-xs font-bold text-slate-700 dark:text-slate-300">{label}{children}</label>;
}
