import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, BookOpen, Pencil, Search, X } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { ListToolbar, SearchField } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { getAdminCoursesApi, restoreCourseApi, retireCourseApi, updateCourseApi } from '../../services/apiClient';
import type { CatalogCourse } from '../../services/apiClient';

// ADM-001 Part B (docs/contracts/superadmin.md): the Dean edits, retires and restores courses in Superadmin mode.
// Page parts copied from the earlier preview and from pages/admin/Rooms.tsx (loading, empty state, retire confirm).
type Draft = { id: number; courseCode: string; name: string; lectureUnits: string; labUnits: string; classCount: number; currentClassCount: number; reason: string };

const inputClass = 'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const cancelButton = 'min-h-11 rounded-xl px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
const iconButton = 'inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-40';
const num = (value: number | null) => (value ?? 0);
const shownUnits = (value: number | null) => (value === null ? '—' : String(value)); // older courses have no lecture/lab split
const used = (course: CatalogCourse) => `Used by ${course.classCount} ${course.classCount === 1 ? 'class' : 'classes'} (${course.currentClassCount} this school year)`;

export const CourseCatalog: React.FC = () => {
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'active' | 'retired'>('active');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState('');
  const [retiring, setRetiring] = useState<CatalogCourse | null>(null);
  const [reason, setReason] = useState('');

  const load = async () => setCourses((await getAdminCoursesApi('all')).courses);
  useEffect(() => {
    load()
      .catch(err => showFeedback(err instanceof Error ? err.message : 'Unable to load courses.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => courses.filter(course => course.status === tab
    && `${course.courseCode} ${course.name}`.toLowerCase().includes(search.trim().toLowerCase())), [courses, tab, search]);
  const activeCount = courses.filter(course => course.status === 'active').length;
  const retiredCount = courses.length - activeCount;

  const openEdit = (course: CatalogCourse) => {
    setFormError('');
    setDraft({ id: course.id, courseCode: course.courseCode, name: course.name, lectureUnits: String(course.lectureUnits === null && course.labUnits === null ? course.units : num(course.lectureUnits)), labUnits: String(num(course.labUnits)), classCount: course.classCount, currentClassCount: course.currentClassCount, reason: '' });
  };
  const run = async (action: () => Promise<unknown>, done: string, close: () => void) => {
    setBusy(true);
    try {
      await action();
      close();
      showFeedback(done, 'success');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save the course.';
      if (draft) setFormError(message); else { close(); showFeedback(message, 'error'); }
    } finally {
      setBusy(false);
    }
  };
  const saveCourse = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setFormError('');
    void run(() => updateCourseApi({ id: draft.id, courseCode: draft.courseCode, name: draft.name, lectureUnits: Number(draft.lectureUnits) || 0, labUnits: Number(draft.labUnits) || 0, reason: draft.reason.trim() || undefined }),
      `${draft.courseCode.trim()} saved.`, () => setDraft(null));
  };
  const retireCourse = () => {
    if (!retiring) return;
    const target = retiring;
    void run(() => retireCourseApi(target.id, reason.trim() || undefined), `${target.courseCode} retired.`, () => { setRetiring(null); setReason(''); });
  };
  const restoreCourse = (course: CatalogCourse) => void run(() => restoreCourseApi(course.id), `${course.courseCode} restored.`, () => undefined);

  const actions = (course: CatalogCourse) => course.status === 'active' ? (
    <>
      <button type="button" disabled={busy} onClick={() => openEdit(course)} aria-label={`Edit ${course.courseCode}`} title={`Edit ${course.courseCode}`} className={iconButton}><Pencil className="h-4 w-4" /></button>
      <button type="button" disabled={busy} onClick={() => { setReason(''); setRetiring(course); }} aria-label={`Retire ${course.courseCode}`} title={`Retire ${course.courseCode}`} className={`${iconButton} hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300`}><Archive className="h-4 w-4" /></button>
    </>
  ) : (
    <button type="button" disabled={busy} onClick={() => restoreCourse(course)} aria-label={`Restore ${course.courseCode}`} title={`Restore ${course.courseCode}`} className={iconButton}><ArchiveRestore className="h-4 w-4" /></button>
  );

  return (
    <section className="mx-auto max-w-7xl animate-fade-in space-y-6">
      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">Showing <b className="text-slate-800 dark:text-slate-100">{filtered.length}</b> of {tab === 'active' ? activeCount : retiredCount} {tab} courses</p>

      <Tabs variant="switch" color="accent" label="Course views" value={tab} onChange={setTab} tabs={[
        { id: 'active', label: 'Active Courses', icon: <BookOpen className="h-4 w-4" />, count: activeCount },
        { id: 'retired', label: 'Retired Courses', icon: <Archive className="h-4 w-4" />, count: retiredCount },
      ]} />

      <ListToolbar left={<SearchField value={search} onChange={setSearch} placeholder="Search course code or title…" color="accent" />} />

      {loading ? (
        <div role="status" className="rounded-3xl border border-slate-200/80 bg-white p-12 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Loading courses…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
          <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">{search ? 'No matching courses' : tab === 'retired' ? 'Nothing is retired' : 'No courses yet'}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{search ? 'Search for another course.' : tab === 'retired' ? 'Retired courses appear here.' : 'Faculty add a course when they create a class.'}</p>
          {search && <button type="button" onClick={() => setSearch('')} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-950/40"><X className="h-3.5 w-3.5" />Clear search</button>}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:block">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400"><tr>
                <th className="px-5 py-3.5">Course Code</th><th className="px-4 py-3.5">Course Title</th><th className="px-4 py-3.5">Lecture Units</th><th className="px-4 py-3.5">Laboratory Units</th><th className="px-4 py-3.5">Total Units</th><th className="px-4 py-3.5">Classes</th><th className="px-4 py-3.5 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.map(course => (
                <tr key={course.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <td className="px-5 py-4 font-bold text-slate-800 dark:text-slate-100">{course.courseCode}</td>
                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{course.name}</td>
                  <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{shownUnits(course.lectureUnits)}</td>
                  <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{shownUnits(course.labUnits)}</td>
                  <td className="px-4 py-4 font-semibold text-slate-700 dark:text-slate-200">{course.units}</td>
                  <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{course.classCount} <span className="text-slate-400">({course.currentClassCount} this year)</span></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1.5">{actions(course)}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="space-y-3 sm:hidden">{filtered.map(course => (
            <article key={course.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-extrabold tracking-wide text-accent-700 dark:text-accent-300">{course.courseCode}</p><h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{course.name}</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${course.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{course.status === 'active' ? 'Active' : 'Retired'}</span></div>
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">{[['Lecture Units', shownUnits(course.lectureUnits)], ['Laboratory Units', shownUnits(course.labUnits)], ['Total Units', String(course.units)], ['Classes', `${course.classCount} (${course.currentClassCount} this year)`]].map(([label, value]) => <div key={label}><dt className="text-[10px] font-semibold text-slate-400">{label}</dt><dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">{value}</dd></div>)}</dl>
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">{actions(course)}</div>
            </article>
          ))}</div>
        </>
      )}

      <Modal isOpen={Boolean(draft)} onClose={() => { if (!busy) setDraft(null); }} title="Edit Course" size="lg">
        {draft && <form onSubmit={saveCourse} className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Course Code"><input required maxLength={50} value={draft.courseCode} onChange={event => setDraft({ ...draft, courseCode: event.target.value })} placeholder="e.g. DENT 101" className={inputClass} /></Field>
            <Field label="Course Title"><input required maxLength={255} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Course title" className={inputClass} /></Field>
            <Field label="Lecture Units"><input type="number" min="0" max="20" step="0.5" value={draft.lectureUnits} onChange={event => setDraft({ ...draft, lectureUnits: event.target.value })} className={inputClass} /></Field>
            <Field label="Laboratory Units"><input type="number" min="0" max="20" step="0.5" value={draft.labUnits} onChange={event => setDraft({ ...draft, labUnits: event.target.value })} className={inputClass} /></Field>
            <div className="sm:col-span-2"><Field label="Reason (optional)"><input maxLength={500} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} className={inputClass} /></Field></div>
          </div>
          <p role="note" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
            {`Used by ${draft.classCount} ${draft.classCount === 1 ? 'class' : 'classes'} (${draft.currentClassCount} this school year). A change applies to every class that uses this course; grades and attendance are not affected.`}
          </p>
          {formError && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{formError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setDraft(null)} className={cancelButton}>Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-accent-600 px-4 text-xs font-bold text-white hover:bg-accent-700 disabled:opacity-50">Save Changes</button></div>
        </form>}
      </Modal>

      <Modal isOpen={Boolean(retiring)} onClose={() => { if (!busy) setRetiring(null); }} title="Retire Course" size="sm">
        {retiring && <div className="space-y-4 p-5 sm:p-6">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{retiring.courseCode} · {retiring.name}</p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{`${used(retiring)}. Retiring hides the course from Faculty's course list and stops it being typed again. Existing classes keep it. You can restore it later.`}</p>
          <Field label="Reason (optional)"><input maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className={inputClass} /></Field>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><button type="button" disabled={busy} onClick={() => setRetiring(null)} className={cancelButton}>Cancel</button><button type="button" disabled={busy} onClick={retireCourse} className="min-h-11 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">Retire course</button></div>
        </div>}
      </Modal>
    </section>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-xs font-bold text-slate-700 dark:text-slate-300">{label}{children}</label>;
}
