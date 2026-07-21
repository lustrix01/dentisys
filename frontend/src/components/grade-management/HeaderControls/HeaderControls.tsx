import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useGradeManagementContext } from '../../../contexts/GradeManagementContext';

export const HeaderControls: React.FC = () => {
  const { students } = useApp();
  const { state, dispatch, loadWorkspace } = useGradeManagementContext();
  const currentUser = useMemo(() => { try { return JSON.parse(localStorage.getItem('dentisys_user') ?? '{}') as { role?: string; assignedClasses?: string[]; assignedSubjects?: string[] }; } catch { return {}; } }, []);
  const scopedStudents = useMemo(() => students.filter(student => (currentUser.role !== 'faculty' || !currentUser.assignedClasses?.length || currentUser.assignedClasses.includes(student.classId ?? ''))), [currentUser, students]);
  const sections = useMemo(() => [...new Map(scopedStudents.filter(student => student.classId).map(student => [student.classId!, student.className ?? student.classId!])).entries()], [scopedStudents]);
  const subjects = useMemo(() => [...new Map(scopedStudents.flatMap(student => student.enrolledSubjects.filter(subject => currentUser.role !== 'faculty' || !currentUser.assignedSubjects?.length || currentUser.assignedSubjects.includes(subject.code)).map(subject => [subject.code, subject.name] as const))).entries()], [currentUser, scopedStudents]);
  const [academicYear, setAcademicYear] = useState(state.academicYear);
  const [semester, setSemester] = useState(state.semester);
  const [subjectCode, setSubjectCode] = useState(state.subjectCode);
  const [sectionId, setSectionId] = useState(state.sectionId);

  const activeSubjectCode = subjectCode || subjects[0]?.[0] || '';
  const activeSectionId = sectionId || sections[0]?.[0] || '';
  useEffect(() => { if (activeSubjectCode && activeSectionId) void loadWorkspace(academicYear, semester, activeSubjectCode, activeSectionId); }, [academicYear, semester, activeSubjectCode, activeSectionId, loadWorkspace]);

  return <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Academic year
        <select className="mt-1 w-full rounded-lg border p-2" value={academicYear} onChange={event => setAcademicYear(event.target.value)}><option>2026-2027</option><option>2025-2026</option></select>
      </label>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Semester
        <select className="mt-1 w-full rounded-lg border p-2" value={semester} onChange={event => setSemester(event.target.value)}><option>First Semester</option><option>Second Semester</option></select>
      </label>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Course subject
        <select className="mt-1 w-full rounded-lg border p-2" value={subjectCode} onChange={event => setSubjectCode(event.target.value)}>{subjects.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Section
        <select className="mt-1 w-full rounded-lg border p-2" value={sectionId} onChange={event => setSectionId(event.target.value)}>{sections.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 xl:col-span-2">Student search
        <input className="mt-1 w-full rounded-lg border p-2" value={state.searchTerm} onChange={event => dispatch({ type: 'SET_STATE', payload: { searchTerm: event.target.value } })} placeholder="Name or student number" />
      </label>
    </div>
    <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{state.students.length} enrolled student{state.students.length === 1 ? '' : 's'} in this authorized workspace</span><button className="inline-flex items-center gap-1 text-emerald-700 hover:underline" onClick={() => void loadWorkspace(academicYear, semester, subjectCode, sectionId)}><RotateCcw size={14}/> Refresh</button></div>
  </section>;
};
