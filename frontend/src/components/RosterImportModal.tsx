import { filterPersonNameInput, preventInvalidPersonNameKey } from '../utils/personNameValidation';
import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  RefreshCw,
  Download,
  Trash2,
  Users,
  Search,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from './Modal';
import { showFeedback } from './FeedbackCenter';
import {
  ParsedRosterStudent,
  parseCSVText,
  validateRosterStudents,
  getSampleRegistrarCSV,
  compareRosterHeader,
  findClassMatchingHeader,
  termForHeader,
  catalogUnitsNote,
  newClassBlockers,
  type RosterPDFHeader,
  type RosterPDFResult,
} from '../utils/rosterImportHelper';
import {
  checkScheduleConflicts,
  displayMeetingTime,
  formatSessionsForSubmission,
  SCHEDULE_DAYS,
  SCHEDULE_TIME_SLOTS,
  type ClassSessionSlot,
} from '../utils/scheduleHelper';
import {
  createFacultyClassApi,
  createStudentApi,
  enrollStudentsInClassApi,
  getAvailableStudentsForClassApi,
  getFacultyStudentsApi,
  FacultyClassItem,
  type AcademicTerm,
  type CourseCatalogItem,
} from '../services/apiClient';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';

interface RosterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: FacultyClassItem[];
  defaultClassId?: number;
  currentSchoolYear: string;
  existingStudents: Array<{ id: string; studentId: string; classSections?: Array<{ classId: string }> }>;
  courses: CourseCatalogItem[];
  academicTerms: AcademicTerm[];
  onSuccess: () => Promise<void>;
}

/** Step 1 value for "New class from this file". */
const NEW_CLASS = -1;

/** The new-class form, prefilled from the file header. Meeting times use the 12-hour labels Create Class uses. */
interface NewClassDraft {
  code: string; title: string; section: string; yearLevel: number; lectureUnits: string; labUnits: string;
  /** null until the Faculty picks a term; the file's own term (found from the Dean's list) applies meanwhile. */
  termChoice: string | null; fileUnits: { lectureUnits?: number; labUnits?: number };
  meetings: Array<{ id: string; component: 'Lecture' | 'Laboratory'; day: string; startTime: string; endTime: string; room: string }>;
  notRead: string[];
}

const labelCls = 'text-xs font-semibold text-slate-600 dark:text-slate-300 block';
const fieldCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500';
const invalidFieldCls = '!border-rose-500 !bg-rose-50/70 dark:!border-rose-400 dark:!bg-rose-950/30 focus:!ring-rose-500';

export const RosterImportModal: React.FC<RosterImportModalProps> = ({
  isOpen,
  onClose,
  classes,
  defaultClassId,
  currentSchoolYear,
  existingStudents,
  courses,
  academicTerms,
  onSuccess,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<number>(defaultClassId || classes[0]?.csId || 0);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedStudents, setParsedStudents] = useState<ParsedRosterStudent[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseSequence = useRef(0);
  const runtime = useRuntimeConfig();
  const [targetReviewed, setTargetReviewed] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [pdfInfo, setPdfInfo] = useState<(Omit<RosterPDFResult, 'students'> & { read: number }) | null>(null);
  const [draft, setDraft] = useState<NewClassDraft | null>(null);
  const [pickedFromFile, setPickedFromFile] = useState(false);
  const [matchPrompt, setMatchPrompt] = useState('');
  const [createdCsId, setCreatedCsId] = useState<number | null>(null);
  const [classNotice, setClassNotice] = useState('');
  const meetingCounter = useRef(0);
  useEffect(() => () => { parseSequence.current++; }, []);

  // Filter out historical classes
  // Archived classes are view-only (CLS-003), so they cannot receive students.
  const availableClasses = classes.filter(c => currentSchoolYear && c.schoolYear === currentSchoolYear && c.status.toLowerCase() === 'active' && !c.archiveReason);
  const targetClass = availableClasses.find(cls => cls.csId === selectedClassId);
  const headerDiffs = pdfInfo && targetClass ? compareRosterHeader(pdfInfo.header, targetClass) : [];
  const validatedStudents = validateRosterStudents(parsedStudents, runtime.allowed_email_domains);
  const readyStudents = validatedStudents.filter(student => student.included && student.reviewed && student.status === 'valid');

  // "New class from this file": decisions come from the pure helpers.
  const isNewClass = selectedClassId === NEW_CLASS && Boolean(draft);
  const catalogCourse = draft ? courses.find(course => course.courseCode.toLowerCase() === draft.code.trim().toLowerCase()) : undefined;
  const catalogLocked = Boolean(catalogCourse && (Number(catalogCourse.lectureUnits ?? 0) > 0 || Number(catalogCourse.labUnits ?? 0) > 0));
  const lectureUnits = catalogLocked ? String(catalogCourse?.lectureUnits ?? 0) : draft?.lectureUnits ?? '';
  const labUnits = catalogLocked ? String(catalogCourse?.labUnits ?? 0) : draft?.labUnits ?? '';
  const unitsNote = draft && catalogLocked ? catalogUnitsNote(draft.code, draft.fileUnits, catalogCourse) : null;
  const slots: ClassSessionSlot[] = (draft?.meetings ?? []).map(meeting => ({ id: meeting.id, type: meeting.component, room: meeting.room, days: [meeting.day], startTime: meeting.startTime, endTime: meeting.endTime }));
  const fileTerm = pdfInfo ? termForHeader(pdfInfo.header, currentSchoolYear, academicTerms) : { termId: '' };
  const termId = draft?.termChoice ?? fileTerm.termId;
  const selectedTerm = academicTerms.find(term => term.id !== null && String(term.id) === termId);
  const selectedTermYear = selectedTerm?.schoolYear.replace(/\s/g, '');
  const pastTermProblem = selectedTerm && selectedTermYear !== currentSchoolYear.replace(/\s/g, '')
    ? `Selected academic term is for AY ${selectedTermYear}. Choose a term for the current school year (AY ${currentSchoolYear}) to create this class.`
    : undefined;
  const termOverrideNotice = pdfInfo?.header.schoolYear && selectedTerm && selectedTermYear !== pdfInfo.header.schoolYear
    ? `The file says AY ${pdfInfo.header.schoolYear}; this class will use the selected term for AY ${selectedTerm.schoolYear}.`
    : undefined;
  const scheduleError = checkScheduleConflicts(slots, classes, currentSchoolYear);
  const newClassProblems = isNewClass && draft ? newClassBlockers({
    code: draft.code, title: draft.title, section: draft.section, lectureUnits, labUnits, termId,
    pastYear: pastTermProblem, noTerm: 'noTerm' in fileTerm ? fileTerm.noTerm : undefined, rooms: slots.map(slot => slot.room),
    scheduleError,
  }) : [];
  const problemFor = (message: string) => newClassProblems.find(problem => problem === message);
  const termProblem = newClassProblems.find(problem => problem.startsWith('Selected academic term ') || problem.startsWith('No Dean-defined term matches AY ') || problem.startsWith('This file is for AY ') || problem === 'Choose an academic term.');
  const overlapMatch = scheduleError?.match(/^Internal Conflict: (.+?) \(Session (\d+)\) and (.+?) \(Session (\d+)\) overlap on (.+?) at the same time\.$/);
  const scheduleGuidance = overlapMatch
    ? `${overlapMatch[1]} (Session ${overlapMatch[2]}) and ${overlapMatch[3]} (Session ${overlapMatch[4]}) overlap on ${overlapMatch[5]}. Change one meeting's day or start/end time so they no longer overlap.`
    : scheduleError?.startsWith('Room Conflict:')
      ? `${scheduleError} Choose another room or change the meeting day/time.`
      : scheduleError?.startsWith('Schedule Conflict:')
        ? `${scheduleError} Change the meeting day or time so it no longer overlaps.`
        : scheduleError;
  const updateDraft = (changes: Partial<NewClassDraft>) => setDraft(previous => previous && { ...previous, ...changes });
  const updateMeeting = (id: string, changes: Partial<NewClassDraft['meetings'][number]>) => setDraft(previous => previous && { ...previous, meetings: previous.meetings.map(meeting => meeting.id === id ? { ...meeting, ...changes } : meeting) });
  const newMeeting = (component: 'Lecture' | 'Laboratory', day: string, startTime: string, endTime: string, room: string) => ({ id: `new-meeting-${++meetingCounter.current}`, component, day, startTime, endTime, room });
  const buildDraft = (header: RosterPDFHeader): NewClassDraft => {
    return {
      code: header.courseCode ?? '', title: header.courseTitle ?? '', section: header.section ?? '', yearLevel: header.yearLevel ?? 1,
      lectureUnits: header.lectureUnits === undefined ? '' : String(header.lectureUnits), labUnits: header.labUnits === undefined ? '' : String(header.labUnits),
      termChoice: null, fileUnits: { lectureUnits: header.lectureUnits, labUnits: header.labUnits },
      meetings: (header.meetings ?? []).map(meeting => newMeeting(meeting.component, meeting.day, displayMeetingTime(meeting.startTime), displayMeetingTime(meeting.endTime), meeting.room)),
      notRead: header.notRead ?? [],
    };
  };

  const handleFileChange = async (selectedFile: File) => {
    if (isImporting || isParsing) return;
    const sequence = ++parseSequence.current;
    setFile(selectedFile);
    setIsParsing(true);
    setParsedStudents([]);
    setPdfInfo(null);
    setTargetReviewed(false);
    setImportErrors([]);
    setClassNotice('');
    setCreatedCsId(null);
    setDraft(null);
    setMatchPrompt('');
    setPickedFromFile(false);
    setSelectedClassId(id => id === NEW_CLASS ? (defaultClassId || availableClasses[0]?.csId || 0) : id);

    try {
      const fileName = selectedFile.name.toLowerCase();

      if (fileName.endsWith('.pdf')) {
        const buffer = await selectedFile.arrayBuffer();
        const { parseRosterPDF } = await import('../utils/rosterPDF');
        const { students: parsed, ...info } = await parseRosterPDF(buffer);
        if (sequence !== parseSequence.current) return;

        if (parsed.length === 0) {
          showFeedback('No student records detected. Use a text PDF with the provisional table layout, or CSV.', 'error');
        } else {
          setParsedStudents(parsed);
          setPdfInfo({ ...info, read: parsed.length });
          if (info.official && info.header.courseCode && info.header.section && info.header.schoolYear && info.header.semester) {
            // N1: Step 1 is always set from the file (a header with course, section, school year and semester): the Faculty own matching class, else a new one.
            const match = findClassMatchingHeader(info.header, availableClasses);
            setDraft(buildDraft(info.header));
            setSelectedClassId(match ? match.csId : NEW_CLASS);
            setMatchPrompt(match ? `${match.courseCode}-${match.block}` : '');
            setPickedFromFile(true);
          }
          showFeedback(`Previewed ${parsed.length} student record(s). Review each PDF row before selecting it.`, 'info');
        }
      } else {
        // CSV / TSV / TXT
        const text = await selectedFile.text();
        if (!/\.(csv|tsv|txt)$/i.test(fileName)) throw new Error('Supported files are PDF, CSV, TSV and TXT.');
        const parsed = parseCSVText(text);
        if (sequence !== parseSequence.current) return;

        if (parsed.length === 0) {
          showFeedback('No student records found in the uploaded file.', 'error');
        } else {
          setParsedStudents(parsed);
          showFeedback(`Parsed ${parsed.length} student record(s) from CSV!`, 'success');
        }
      }
    } catch (err: any) {
      if (sequence !== parseSequence.current) return;
      showFeedback(`Failed to parse file: ${err.message || 'Unknown format'}`, 'error');
    } finally {
      if (sequence === parseSequence.current) setIsParsing(false);
    }
  };

  const handleDownloadSample = () => {
    const csvContent = getSampleRegistrarCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'dentisys_provisional_roster_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRemoveStudent = (tempKey: string) => {
    setParsedStudents(prev => prev.filter(s => s.tempKey !== tempKey));
  };

  const handleUpdateStudentField = (tempKey: string, field: keyof ParsedRosterStudent, value: any) => {
    setParsedStudents(prev => prev.map(s => {
      if (s.tempKey !== tempKey) return s;
      const updated = { ...s, [field]: value };
      if (field === 'included') updated.reviewed = Boolean(value);
      else if (updated.requiresNameReview || updated.possibleCrossedOut) { updated.reviewed = false; updated.included = false; }
      return updated;
    }));
  };

  const handleExecuteImport = async () => {
    if (isImporting || runtime.loading || !targetReviewed || (isNewClass ? newClassProblems.length > 0 : !availableClasses.some(cls => cls.csId === selectedClassId))) {
      showFeedback('Please select a target class section to import students into.', 'error');
      return;
    }

    const validStudents = readyStudents;
    if (validStudents.length === 0) {
      showFeedback('No valid students to import. Please check for errors in the preview list.', 'error');
      return;
    }

    setIsImporting(true);
    setClassNotice('');
    let csId = selectedClassId;
    let createdLabel = '';
    if (isNewClass && draft) {
      // N6a: the class is created first; once it exists it is never created again.
      const includesLecture = Number(lectureUnits) > 0, includesLab = Number(labUnits) > 0;
      const units = (value: string) => Math.round(Number(value) * 10) / 10;
      const { lecRoom, labRoom, meetings } = formatSessionsForSubmission(slots);
      const csName = `${draft.code.trim()}-${draft.section.trim()}`;
      try {
        const res = await createFacultyClassApi({
          csName,
          courseId: catalogCourse && catalogCourse.id > 0 ? catalogCourse.id : undefined,
          courseCode: draft.code.trim(),
          courseName: draft.title.trim(),
          academicTermId: Number(termId),
          yearLevel: draft.yearLevel,
          block: draft.section.trim(),
          lecRoom: includesLecture ? (lecRoom || undefined) : undefined,
          labRoom: includesLab ? (labRoom || undefined) : undefined,
          lectureUnits: includesLecture ? units(lectureUnits) : null,
          labUnits: includesLab ? units(labUnits) : null,
          meetings,
        });
        csId = res.csId;
        createdLabel = csName;
      } catch (error: any) {
        setIsImporting(false);
        showFeedback(error.message || 'Failed to create class section.', 'error');
        return;
      }
      setCreatedCsId(csId);
      try { await onSuccess(); } catch { /* the class list refreshes again after the students */ }
      setSelectedClassId(csId);
      setPickedFromFile(false);
      setTargetReviewed(false);
    }
    const auditBatchId = crypto.randomUUID(); // one id per import run
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];
    const completedKeys = new Set<string>();
    setImportErrors([]);

    // Student numbers are external identifiers, never numeric database IDs.
    let available: Awaited<ReturnType<typeof getAvailableStudentsForClassApi>>['students'];
    try {
      available = (await getAvailableStudentsForClassApi(csId)).students;
    } catch (error) {
      setIsImporting(false);
      const reason = error instanceof Error ? error.message : 'Could not verify existing students. Nothing was imported.';
      if (createdLabel) {
        setClassNotice(`Class created. Students were not added: ${reason}. Try again.`);
        showFeedback(`Class created. Students were not added: ${reason}. Try again.`, 'error');
      } else setImportErrors([reason]);
      return;
    }

    for (let i = 0; i < validStudents.length; i++) {
      const student = validStudents[i];
      setImportProgress({
        current: i + 1,
        total: validStudents.length,
        name: `${student.firstName} ${student.lastName} (${student.studentId})`,
      });

      try {
        const number = student.studentId.trim().toLowerCase();
        const existing = available.find(row => row.studentId.trim().toLowerCase() === number)
          ?? existingStudents.find(row => row.studentId.trim().toLowerCase() === number);
        if (existing) {
          // The cached roster can resolve an ID, but only the server's
          // idempotent enrollment mutation can confirm current membership.
          await enrollStudentsInClassApi({ csId, studentIds: [Number(existing.id)] }, auditBatchId);
          successCount++;
          completedKeys.add(student.tempKey);
          continue;
        }
        await createStudentApi({
          studentId: student.studentId.trim(),
          prefix: student.prefix,
          suffix: student.suffix,
          firstName: student.firstName,
          middleName: student.middleName,
          lastName: student.lastName,
          email: student.email.trim().toLowerCase(),
          contact: student.contact?.trim() || undefined,
          yearLevel: student.yearLevel ?? undefined,
          sex: student.sex,
          classId: String(csId),
        }, auditBatchId);
        successCount++;
        completedKeys.add(student.tempKey);
      } catch (createErr: any) {
        // Resolve only the same student number after a race; a 409 may instead
        // be an email/role conflict and must never enroll an unrelated record.
        if (createErr.status === 409) {
          try {
            const refreshed = await getAvailableStudentsForClassApi(csId);
            const number = student.studentId.trim().toLowerCase();
            const existing = refreshed.students.find(row => row.studentId.trim().toLowerCase() === number)
              ?? (await getFacultyStudentsApi()).find(row => row.studentId.trim().toLowerCase() === number);
            if (existing) {
              await enrollStudentsInClassApi({
                csId,
                studentIds: [Number(existing.id)],
              }, auditBatchId);
              successCount++;
              completedKeys.add(student.tempKey);
            } else {
              failCount++;
              errors.push(`${student.studentId}: ${createErr.message || 'Student identity conflict; review this row.'}`);
            }
          } catch (enrollErr: any) {
            failCount++;
            errors.push(`${student.studentId}: ${enrollErr.message || 'Enrollment failed'}`);
          }
        } else {
          failCount++;
          errors.push(`${student.studentId}: ${createErr.message || 'Creation failed'}`);
        }
      }
    }

    setIsImporting(false);
    setImportProgress(null);
    setImportErrors(errors);
    setParsedStudents(previous => previous.filter(row => !completedKeys.has(row.tempKey)));

    if (createdLabel && (failCount > 0 || successCount === 0)) {
      const message = `Class created. Students were not added: ${errors.slice(0, 2).join('; ')}. Try again.`;
      setClassNotice(message);
      showFeedback(message, 'error');
      if (successCount > 0) { try { await onSuccess(); } catch { /* shown on the next refresh */ } }
      return;
    }
    if (successCount > 0) {
      if (createdLabel) showFeedback(`Class ${createdLabel} created and ${successCount} students added.`, 'success');
      else showFeedback(`${successCount} student(s) enrolled or already enrolled. ${failCount} failed.`, failCount ? 'info' : 'success');
      try { await onSuccess(); } catch { setImportErrors(previous => [...previous, 'Records were saved, but refreshing the roster failed. Reload the page.']); return; }
      if (!failCount) onClose();
    } else {
      showFeedback(`Failed to import students. ${errors.slice(0, 2).join('; ')}`, 'error');
    }
  };

  const filteredPreview = validatedStudents.filter(s => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      s.studentId.toLowerCase().includes(q) ||
      s.firstName.toLowerCase().includes(q) ||
      s.lastName.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });
  const selectablePreview = filteredPreview.filter(student => student.status !== 'error' && !student.possibleCrossedOut && !student.requiresNameReview);
  const allVisibleSelected = selectablePreview.length > 0 && selectablePreview.every(student => student.included);
  const handleSelectVisibleStudents = () => {
    const selected = !allVisibleSelected;
    const visibleKeys = new Set(selectablePreview.map(student => student.tempKey));
    setParsedStudents(previous => previous.map(student => visibleKeys.has(student.tempKey)
      ? { ...student, included: selected, reviewed: selected }
      : student));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isImporting) onClose();
      }}
      title="Class Details & Student Roster Import"
      size="xl"
    >
      <div className="space-y-5 font-sans text-sm max-h-[80vh] overflow-y-auto pr-1">
        <fieldset disabled={isImporting} className="space-y-4 min-w-0 text-left">
        {file && (
          <div role="note" className="space-y-0.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <p>{pdfInfo?.official && <strong className="mr-1">Official class list.</strong>}Review the class details and student rows before saving. The original file stays in this browser; only selected student fields are sent to DentiSys. Invitations are sent separately.</p>
            <p>Required for each imported row: complete student number, first name, last name and a valid institutional email. Missing emails must be corrected in preview.</p>
          </div>
        )}
        {parsedStudents.length > 0 && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <label className={labelCls}>
              Target class section *
              <select
                value={selectedClassId}
                aria-label="Target class section"
                onChange={(e) => { setSelectedClassId(Number(e.target.value)); setTargetReviewed(false); setPickedFromFile(false); setMatchPrompt(''); }}
                className={`mt-1 cursor-pointer ${fieldCls}`}
              >
                {pdfInfo?.official && draft && !createdCsId && <option value={NEW_CLASS}>New class from this file</option>}
                {selectedClassId !== NEW_CLASS && !availableClasses.some(cls => cls.csId === selectedClassId) && <option value={0}>Select a current-year class</option>}
                {availableClasses.map(c => (
                  <option key={c.csId} value={c.csId}>
                    {c.courseCode} - {c.courseName} ({c.block}) — {c.semester}, {c.schoolYear}
                  </option>
                ))}
              </select>
            </label>
            {pickedFromFile && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Picked from the file. Change it if this is wrong.</p>}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isNewClass ? 'The class below is created, then the students are enrolled into it.' : 'Imported students will be registered in the institution and immediately enrolled into this class section.'}
            </p>
          </div>
        )}
        {matchPrompt && (
          <div role="alert" className="p-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            This file matches <b>{matchPrompt}</b>. Import into it?
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setMatchPrompt('')} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs cursor-pointer">Import into this class</button>
              <button
                type="button"
                onClick={() => {
                  parseSequence.current++;
                  setFile(null); setParsedStudents([]); setPdfInfo(null); setDraft(null); setMatchPrompt(''); setPickedFromFile(false); setTargetReviewed(false); setIsParsing(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isNewClass && draft && (
          <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 space-y-2">
            <span className={labelCls}>New class from this file</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className={labelCls}>Course code
                <input type="text" value={draft.code} onChange={e => updateDraft({ code: e.target.value })} aria-invalid={Boolean(problemFor('Enter a course code.'))} className={`mt-1 ${fieldCls} ${problemFor('Enter a course code.') ? invalidFieldCls : ''}`} />
                {problemFor('Enter a course code.') && <span role="alert" className="mt-1 block text-xs font-medium text-rose-700 dark:text-rose-300">Enter a course code.</span>}
              </label>
              <label className={labelCls}>Course title
                <input type="text" value={draft.title} onChange={e => updateDraft({ title: e.target.value })} aria-invalid={Boolean(problemFor('Enter the course title.'))} className={`mt-1 ${fieldCls} ${problemFor('Enter the course title.') ? invalidFieldCls : ''}`} />
                {problemFor('Enter the course title.') && <span role="alert" className="mt-1 block text-xs font-medium text-rose-700 dark:text-rose-300">Enter the course title.</span>}
              </label>
              <label className={labelCls}>Section
                <input type="text" value={draft.section} onChange={e => updateDraft({ section: e.target.value })} aria-invalid={Boolean(problemFor('Enter the section or block.'))} className={`mt-1 ${fieldCls} ${problemFor('Enter the section or block.') ? invalidFieldCls : ''}`} />
                {problemFor('Enter the section or block.') && <span role="alert" className="mt-1 block text-xs font-medium text-rose-700 dark:text-rose-300">Enter a section or block.</span>}
              </label>
              <label className={labelCls}>Year level
                <select value={draft.yearLevel} onChange={e => updateDraft({ yearLevel: Number(e.target.value) })} className={`mt-1 cursor-pointer ${fieldCls}`}>
                  {[1, 2, 3, 4, 5, 6].map(year => <option key={year} value={year}>Year {year}</option>)}
                </select>
              </label>
              <label className={labelCls}>Lecture units
                <input type="number" min={0} max={20} step={0.5} value={lectureUnits} disabled={catalogLocked} onChange={e => updateDraft({ lectureUnits: e.target.value })} aria-invalid={Boolean(problemFor('Enter units between 0.5 and 20.'))} className={`mt-1 ${fieldCls} ${problemFor('Enter units between 0.5 and 20.') ? invalidFieldCls : ''}`} />
                {problemFor('Enter units between 0.5 and 20.') && <span role="alert" className="mt-1 block text-xs font-medium text-rose-700 dark:text-rose-300">Use 0.5–20 units, or 0 if not offered. Lecture or Laboratory must have units.</span>}
              </label>
              <label className={labelCls}>Laboratory units
                <input type="number" min={0} max={20} step={0.5} value={labUnits} disabled={catalogLocked} onChange={e => updateDraft({ labUnits: e.target.value })} aria-invalid={Boolean(problemFor('Enter units between 0.5 and 20.'))} className={`mt-1 ${fieldCls} ${problemFor('Enter units between 0.5 and 20.') ? invalidFieldCls : ''}`} />
                {problemFor('Enter units between 0.5 and 20.') && <span role="alert" className="mt-1 block text-xs font-medium text-rose-700 dark:text-rose-300">Use 0.5–20 units, or 0 if not offered. Lecture or Laboratory must have units.</span>}
              </label>
              <label className={`${labelCls} col-span-2 sm:col-span-3`}>Academic term
                <select value={termId} onChange={e => updateDraft({ termChoice: e.target.value })} aria-invalid={Boolean(termProblem)} className={`mt-1 cursor-pointer ${fieldCls} ${termProblem ? invalidFieldCls : ''}`}>
                  <option value="">Choose a term</option>
                  {academicTerms.filter(term => term.id !== null).map(term => <option key={term.id} value={String(term.id)}>{term.semester} {term.schoolYear}{term.schoolYear.replace(/\s/g, '') === currentSchoolYear.replace(/\s/g, '') ? ' (Current year)' : ''} ({term.startDate} – {term.endDate})</option>)}
                </select>
                {termProblem && <span role="alert" className="mt-1 block text-xs font-medium text-rose-700 dark:text-rose-300">
                  {termProblem}
                </span>}
                {termOverrideNotice && <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">{termOverrideNotice}</span>}
              </label>
            </div>
            {unitsNote
              ? <div role="alert" className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{unitsNote}</div>
              : Number(labUnits) === 0 && Number(lectureUnits) > 0 && <p className="text-[11px] text-slate-500 dark:text-slate-400">Laboratory units 0: this class is graded <b>Lecture only</b>.</p>}
            <span className={`${labelCls} pt-1`}>Meetings</span>
            {draft.meetings.map((meeting, index) => {
              const meetingHasOverlap = Boolean(overlapMatch && [Number(overlapMatch[2]), Number(overlapMatch[4])].includes(index + 1));
              const roomIsMissing = !meeting.room.trim() && Boolean(problemFor('Every meeting needs a room.'));
              return (
              <div key={meeting.id} className={`grid grid-cols-2 sm:grid-cols-6 gap-2 items-start ${meetingHasOverlap ? 'rounded-lg bg-rose-50/70 dark:bg-rose-950/20 p-1' : ''}`}>
                <select aria-label={`Meeting ${index + 1} day`} value={meeting.day} onChange={e => updateMeeting(meeting.id, { day: e.target.value })} aria-invalid={meetingHasOverlap} className={`cursor-pointer ${fieldCls} ${meetingHasOverlap ? invalidFieldCls : ''}`}>
                  {SCHEDULE_DAYS.map(day => <option key={day} value={day}>{day}</option>)}
                </select>
                <select aria-label={`Meeting ${index + 1} component`} value={meeting.component} onChange={e => updateMeeting(meeting.id, { component: e.target.value as 'Lecture' | 'Laboratory' })} className={`cursor-pointer ${fieldCls}`}>
                  <option value="Lecture">Lecture</option>
                  <option value="Laboratory">Laboratory</option>
                </select>
                {(['startTime', 'endTime'] as const).map(key => (
                  <select key={key} aria-label={`Meeting ${index + 1} ${key === 'startTime' ? 'start' : 'end'} time`} value={meeting[key]} onChange={e => updateMeeting(meeting.id, { [key]: e.target.value })} aria-invalid={meetingHasOverlap} className={`cursor-pointer ${fieldCls} ${meetingHasOverlap ? invalidFieldCls : ''}`}>
                    {Array.from(new Set([...SCHEDULE_TIME_SLOTS, meeting[key]])).map(time => <option key={time} value={time}>{time}</option>)}
                  </select>
                ))}
                <div>
                  <input type="text" aria-label={`Meeting ${index + 1} room`} placeholder="Room (required)" value={meeting.room} onChange={e => updateMeeting(meeting.id, { room: e.target.value })} aria-invalid={roomIsMissing} className={`${fieldCls} ${roomIsMissing ? invalidFieldCls : ''}`} />
                  {roomIsMissing && <span role="alert" className="mt-1 block text-xs font-medium text-rose-700 dark:text-rose-300">Enter a room.</span>}
                </div>
                <button type="button" aria-label={`Remove meeting ${index + 1}`} onClick={() => setDraft(previous => previous && { ...previous, meetings: previous.meetings.filter(item => item.id !== meeting.id) })} className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors justify-self-start">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              );
            })}
            {isNewClass && scheduleGuidance && !problemFor('Every meeting needs a room.') && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{scheduleGuidance}</p>}
            <button type="button" onClick={() => setDraft(previous => previous && { ...previous, meetings: [...previous.meetings, newMeeting('Lecture', 'Mon', '08:00 AM', '09:00 AM', '')] })} className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              Add meeting
            </button>
            {draft.notRead.length > 0 && (
              <div role="alert" className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {draft.notRead.map(line => <div key={line}>Not read: <b>{line}</b></div>)}
                Add it as a meeting by hand if it is needed.
              </div>
            )}
          </div>
        )}

        {(!file || (!isParsing && parsedStudents.length === 0)) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              File (.csv, .tsv, .txt, .pdf)
            </span>
            <button
              type="button"
              onClick={handleDownloadSample}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Sample CSV
            </button>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/40 dark:bg-slate-900/30 transition-all group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.pdf"
              aria-label="Class list or student roster file"
              disabled={isParsing || isImporting}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
            />

            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                  {file ? file.name : 'Click to select a roster file'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Official class list PDFs, or CSV, TSV and TXT. Scans and Excel workbooks are not supported.
                </p>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Loading Spinner during parse */}
        {isParsing && (
          <div className="p-6 text-center text-slate-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
            <p className="font-bold text-xs">Extracting and analyzing registrar student records...</p>
          </div>
        )}

        {/* Step 3: Parsed Results Preview */}
        {!isParsing && parsedStudents.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                  Parsed Students ({parsedStudents.length})
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                  {readyStudents.length} Selected and ready
                </span>
              </div>

              <button
                type="button"
                onClick={handleSelectVisibleStudents}
                disabled={selectablePreview.length === 0}
                aria-pressed={allVisibleSelected}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40"
              >
                {allVisibleSelected ? 'Clear visible selection' : 'Select all visible'}
              </button>

              <div className="relative w-full sm:w-52">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Select all applies to the rows shown by the filter. Rows with errors or flagged for review stay unselected; tick those one by one.</p>

            {pdfInfo?.total != null && (pdfInfo.total === pdfInfo.read
              ? <p role="status" className="font-bold text-emerald-700 dark:text-emerald-300">✓ {pdfInfo.read} of {pdfInfo.total} students read</p>
              : <p role="alert" className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">The file lists {pdfInfo.total} students, but {pdfInfo.read} {pdfInfo.read === 1 ? 'was' : 'were'} read. Check the PDF before saving.</p>)}
            {headerDiffs.length > 0 && (
              <div role="alert" className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <strong>This file may be for a different class. Check you chose the right file.</strong>
                <ul className="list-disc pl-4">{headerDiffs.map(diff => <li key={diff}>{diff}</li>)}</ul>
              </div>
            )}
            <p className="text-amber-700 dark:text-amber-300">Selecting a row confirms you reviewed its source and name split. Possible red strike-throughs are flagged; markings in other colors may not be detected. Check the original PDF for exclusions.</p>
            <div role="table" aria-label="Student roster preview" className="max-h-96 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30">
              <div role="rowgroup" className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredPreview.map(st => (
                  <div role="row" key={st.tempKey} className="grid grid-cols-2 gap-x-3 gap-y-2.5 bg-white p-4 transition-colors hover:bg-emerald-50/40 dark:bg-slate-900 dark:hover:bg-slate-800/50 sm:grid-cols-6 lg:grid-cols-12 lg:gap-x-4">
                    <div role="cell" className="col-span-2 flex items-center gap-2 sm:col-span-1 lg:col-span-1">
                      <input type="checkbox" aria-label={`Include student ${st.studentId}`} checked={st.included} disabled={st.status === 'error'} onChange={event => handleUpdateStudentField(st.tempKey, 'included', event.target.checked)} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Include</span>
                    </div>
                    <label role="cell" className="col-span-2 block min-w-0 sm:col-span-2 lg:col-span-2">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Student ID</span>
                      <input type="text" value={st.studentId} aria-label={`Student number row ${st.tempKey}`} onChange={event => handleUpdateStudentField(st.tempKey, 'studentId', event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
                    </label>
                    <div role="cell" className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-8">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Name</span>
                      {st.originalName && <p className="mb-1 truncate text-[10px] text-slate-500" title={st.originalName}>Source: {st.originalName}</p>}
                      <div className="grid min-w-0 grid-cols-2 gap-1.5">
                        <input type="text" value={st.firstName} placeholder="First name" aria-label={`First name for ${st.studentId}`} onChange={event => handleUpdateStudentField(st.tempKey, 'firstName', filterPersonNameInput('firstName', event.target.value, (event.nativeEvent as InputEvent).isComposing))} onCompositionEnd={event => handleUpdateStudentField(st.tempKey, 'firstName', filterPersonNameInput('firstName', event.currentTarget.value))} onKeyDown={event => preventInvalidPersonNameKey('firstName', event)} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                        <input type="text" value={st.lastName} placeholder="Last name" aria-label={`Last name for ${st.studentId}`} onChange={event => handleUpdateStudentField(st.tempKey, 'lastName', filterPersonNameInput('lastName', event.target.value, (event.nativeEvent as InputEvent).isComposing))} onCompositionEnd={event => handleUpdateStudentField(st.tempKey, 'lastName', filterPersonNameInput('lastName', event.currentTarget.value))} onKeyDown={event => preventInvalidPersonNameKey('lastName', event)} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                        <input type="text" value={st.middleName ?? ''} placeholder="Middle name" aria-label={`Middle name for ${st.studentId}`} onChange={event => handleUpdateStudentField(st.tempKey, 'middleName', filterPersonNameInput('middleName', event.target.value, (event.nativeEvent as InputEvent).isComposing))} onCompositionEnd={event => handleUpdateStudentField(st.tempKey, 'middleName', filterPersonNameInput('middleName', event.currentTarget.value))} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                        <input type="text" value={st.prefix ?? ''} placeholder="Prefix" aria-label={`Prefix for ${st.studentId}`} onChange={event => handleUpdateStudentField(st.tempKey, 'prefix', filterPersonNameInput('prefix', event.target.value))} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                        <input type="text" value={st.suffix ?? ''} placeholder="Suffix" aria-label={`Suffix for ${st.studentId}`} onChange={event => handleUpdateStudentField(st.tempKey, 'suffix', filterPersonNameInput('suffix', event.target.value))} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                      </div>
                    </div>
                    <label role="cell" className="col-span-2 block min-w-0 sm:col-span-4 lg:col-span-6">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Institutional email *</span>
                      <input type="text" value={st.email} aria-label={`Email for ${st.studentId}`} required onChange={event => handleUpdateStudentField(st.tempKey, 'email', event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                    </label>
                    <label role="cell" className="col-span-1 block min-w-0 sm:col-span-1 lg:col-span-2">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Year level</span>
                      <input type="number" min="1" max="6" value={st.yearLevel !== null && Number.isFinite(st.yearLevel) ? st.yearLevel : ''} aria-label={`Year level for ${st.studentId}`} onChange={event => handleUpdateStudentField(st.tempKey, 'yearLevel', event.target.value === '' ? null : Number(event.target.value))} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs font-semibold dark:border-slate-700 dark:bg-slate-900" />
                    </label>
                    <div role="cell" className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sex and contact</span>
                      <div className="grid min-w-0 grid-cols-2 gap-1.5">
                        <input type="text" aria-label={`Sex for ${st.studentId}`} placeholder="Sex" value={st.sex ?? ''} onChange={event => handleUpdateStudentField(st.tempKey, 'sex', event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                        <input type="text" aria-label={`Contact for ${st.studentId}`} placeholder="Contact" value={st.contact ?? ''} onChange={event => handleUpdateStudentField(st.tempKey, 'contact', event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                      </div>
                    </div>
                    <div role="cell" className="col-span-2 flex items-center justify-end sm:col-span-2 lg:col-span-1 lg:row-start-1 lg:col-start-12">
                      <button type="button" onClick={() => handleRemoveStudent(st.tempKey)} aria-label={`Remove student ${st.studentId} from preview`} className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:text-slate-400 dark:hover:bg-rose-950/40">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {(st.sourcePage || st.possibleCrossedOut || st.validationMessage) && (
                      <div role="cell" className="col-span-2 space-y-0.5 border-t border-slate-100 pt-2 text-[10px] sm:col-span-6 lg:col-span-12">
                        {st.sourcePage && <span className="mr-2 text-slate-500">Page {st.sourcePage}, row {st.sourceRow}</span>}
                        {st.possibleCrossedOut && <span className="mr-2 font-semibold text-amber-700 dark:text-amber-300">Possible crossed-out row</span>}
                        {st.validationMessage && <span role="status" className={st.status === 'error' ? 'text-rose-600' : 'text-amber-700 dark:text-amber-300'}>{st.validationMessage}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {parsedStudents.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" checked={targetReviewed} onChange={event => setTargetReviewed(event.target.checked)} />{isNewClass ? 'I reviewed the class details and student rows from this file.' : 'I reviewed the source course, section, semester and school year against the selected target class.'}</label>}
        {classNotice && <p role="alert" className="text-rose-600 font-bold">{classNotice}</p>}
        {importErrors.length > 0 && <div role="alert" className="text-rose-600"><strong>Rows requiring correction</strong><ul>{importErrors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}

        {/* Progress Bar during import */}
        {isImporting && importProgress && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-200">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Importing: {importProgress.name}
              </span>
              <span>
                {importProgress.current} / {importProgress.total}
              </span>
            </div>
            <div className="w-full bg-emerald-200/60 dark:bg-emerald-900/60 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 transition-all duration-200"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          {isNewClass && pdfInfo && !isParsing && !parsedStudents.some(st => st.status !== 'error') && <span className="text-slate-500 dark:text-slate-400 text-[11px] mr-auto">No students are ready to add. To make an empty class, use Create Class.</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={isImporting || isParsing || runtime.loading || !readyStudents.length || !targetReviewed || Boolean(matchPrompt) || (isNewClass ? newClassProblems.length > 0 : !availableClasses.some(cls => cls.csId === selectedClassId))}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isImporting
                ? `Importing (${importProgress?.current || 0}/${importProgress?.total || 0})...`
                : isNewClass ? `Create class and add ${readyStudents.length} students` : `Confirm & Import (${readyStudents.length}) Students`}
            </span>
          </button>
        </div>
        </fieldset>
      </div>
    </Modal>
  );
};
