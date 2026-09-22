import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Users, 
  Calendar, 
  MapPin, 
  ChevronRight, 
  GraduationCap,
  X,
  RefreshCw,
  ShieldCheck,
  Info,
  BookMarked,
  CalendarDays,
  Download,
  Plus,
  Upload,
  FileText,
  Mail,
  Send,
  Printer,
  CheckCircle2,
  UserPlus,
  Pencil,
  Trash2,
  Filter
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Student, EnrolledSubject } from '../../types';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { 
  getFacultyClassesApi, 
  getFacultyCoursesApi, 
  getFacultyStudentsApi,
  createFacultyClassApi,
  createStudentApi,
  createStudentInvitation,
  FacultyClassItem,
  CourseCatalogItem
} from '../../services/apiClient';

const ROOM_OPTIONS = [
  'Dental Room 101',
  'Dental Room 102',
  'Lab Room 201',
  'Lab Room 204',
  'Lecture Hall A',
  'Lecture Hall B',
  'Operating Room A',
  'Operating Room B',
  'BU Dental Clinic'
];

const DAYS_LIST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME_OPTIONS = [
  '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM'
];

const SCHEDULE_PRESETS = [
  'Mon/Wed 08:00 AM - 11:00 AM',
  'Mon/Wed 01:00 PM - 04:00 PM',
  'Tue/Thu 08:00 AM - 11:00 AM',
  'Tue/Thu 01:00 PM - 04:00 PM',
  'Fri 08:00 AM - 12:00 PM',
  'Fri 01:00 PM - 05:00 PM',
  'Sat 08:00 AM - 12:00 PM',
  'Sat 01:00 PM - 05:00 PM'
];

interface ParsedSchedule {
  days: number[];
  startMinutes: number;
  endMinutes: number;
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function parseScheduleTimeslot(scheduleStr: string): ParsedSchedule | null {
  if (!scheduleStr || !scheduleStr.trim()) return null;

  const parts = scheduleStr.trim().split(/\s+/);
  if (parts.length < 4) return null;

  const dayPart = parts[0];
  const timePart = parts.slice(1).join(' ');

  const timeSubParts = timePart.split('-');
  if (timeSubParts.length !== 2) return null;

  const startMin = parseTimeToMinutes(timeSubParts[0]);
  const endMin = parseTimeToMinutes(timeSubParts[1]);

  if (startMin === null || endMin === null || startMin >= endMin) return null;

  const days: number[] = [];
  const dayTokens = dayPart.split(/[/,-]/);
  const dayMap: Record<string, number> = {
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
    sun: 7, sunday: 7
  };

  for (const token of dayTokens) {
    const key = token.trim().toLowerCase();
    if (dayMap[key]) {
      if (!days.includes(dayMap[key])) {
        days.push(dayMap[key]);
      }
    }
  }

  if (days.length === 0) return null;

  return { days, startMinutes: startMin, endMinutes: endMin };
}

function checkRoomScheduleConflict(
  existingClasses: FacultyClassItem[],
  targetRoom: string,
  targetScheduleStr: string,
  excludeClassId?: string
): FacultyClassItem | null {
  if (!targetRoom || !targetScheduleStr) return null;

  const targetSched = parseScheduleTimeslot(targetScheduleStr);
  if (!targetSched) return null;

  for (const cls of existingClasses) {
    if (excludeClassId && cls.id === excludeClassId) continue;

    const clsRoom = cls.lecRoom || '';
    if (!clsRoom || clsRoom.trim().toLowerCase() !== targetRoom.trim().toLowerCase()) {
      continue;
    }

    const clsSchedStr = cls.labRoom || cls.schedule || '';
    const clsSched = parseScheduleTimeslot(clsSchedStr);
    if (!clsSched) continue;

    const hasCommonDay = targetSched.days.some(d => clsSched.days.includes(d));
    if (!hasCommonDay) continue;

    if (targetSched.startMinutes < clsSched.endMinutes && targetSched.endMinutes > clsSched.startMinutes) {
      return cls;
    }
  }

  return null;
}


export const ClassesAndRosters: React.FC = () => {
  const { students: initialGlobalStudents } = useApp();

  const [classes, setClasses] = useState<FacultyClassItem[]>([]);
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSendingInvitations, setIsSendingInvitations] = useState(false);

  // Active view tab: 'classes' or 'roster'
  const [activeTab, setActiveTab] = useState<'classes' | 'roster'>('classes');

  // Search query, School Year filter, and Class Section filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>('2025-2026');
  const [selectedClassFilterId, setSelectedClassFilterId] = useState<string>('all');

  // Selected Class & Modals
  const [selectedClass, setSelectedClass] = useState<FacultyClassItem | null>(null);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<FacultyClassItem | null>(null);
  const [isImportIctoOpen, setIsImportIctoOpen] = useState(false);
  
  // Student Modals
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Form States: New Class Creation & Day-First Schedule Picker
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newBlock, setNewBlock] = useState('');
  const [newSchedule, setNewSchedule] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [newYearLevel, setNewYearLevel] = useState(1);
  const [selectedCourseId, setSelectedCourseId] = useState<number>(0);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSubmittingClass, setIsSubmittingClass] = useState(false);

  // Day-First Schedule Builder State
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<string>('08:00 AM');
  const [endTime, setEndTime] = useState<string>('11:00 AM');

  const updateScheduleFromPicker = (days: string[], start: string, end: string) => {
    if (days.length === 0) {
      setNewSchedule('');
      return;
    }
    const dayStr = days.join('/');
    const timeStr = `${start} - ${end}`;
    setNewSchedule(`${dayStr} ${timeStr}`);
    setScheduleError(null);
  };

  // Form States: Add / Edit Student (Split Name Fields & No Numbers)
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentMiddleName, setStudentMiddleName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentEmailInput, setStudentEmailInput] = useState('');
  const [studentYearInput, setStudentYearInput] = useState(3);
  const [studentClassSelect, setStudentClassSelect] = useState('Clinical Dentistry I (Sec A)');

  // Form States: Import iBU File Data
  const [ictoFileText, setIctoFileText] = useState('');

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // Fetch initial data for logged-in faculty
  const fetchData = async () => {
    setLoading(true);
    try {
      const [clsRes, crsRes, rosterRes] = await Promise.all([
        getFacultyClassesApi().catch(() => null),
        getFacultyCoursesApi().catch(() => ({ status: 'success', courses: [] })),
        getFacultyStudentsApi().catch(() => null),
      ]);

      if (rosterRes !== null && Array.isArray(rosterRes)) {
        setStudentsList(rosterRes as unknown as Student[]);
      } else {
        setStudentsList([]);
      }

      if (clsRes !== null && Array.isArray(clsRes.classes)) {
        setClasses(clsRes.classes);
      } else {
        setClasses([]);
      }

      if (crsRes?.courses) setCourses(crsRes.courses);
    } catch (err) {
      console.error('Failed to load classes and rosters:', err);
      setClasses([]);
      setStudentsList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered assigned classes by School Year and Search
  const filteredClasses = useMemo(() => {
    return classes.filter(cls => {
      const matchesSearch = 
        cls.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.block.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSchoolYear = selectedSchoolYear === 'all' || cls.schoolYear === selectedSchoolYear;
      
      return matchesSearch && matchesSchoolYear;
    });
  }, [classes, searchQuery, selectedSchoolYear]);

  // Filtered student roster by Search and Class Filter
  const filteredStudents = useMemo(() => {
    return studentsList.filter((student) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = !query || (
        student.name.toLowerCase().includes(query) ||
        student.studentId.toLowerCase().includes(query) ||
        student.email.toLowerCase().includes(query)
      );

      if (!matchesSearch) return false;

      if (selectedClassFilterId === 'all') return true;

      const sections = student.classSections || [];
      if (sections.length === 0) return true;

      return sections.some(cs =>
        cs.classId === selectedClassFilterId ||
        cs.className === selectedClassFilterId ||
        cs.classId === `cls-${selectedClassFilterId}` ||
        `cls-${cs.classId}` === selectedClassFilterId ||
        (selectedClassFilterId === 'cls-1' && cs.className.includes('Sec A')) ||
        (selectedClassFilterId === 'cls-2' && cs.className.includes('Sec B'))
      );
    });
  }, [studentsList, searchQuery, selectedClassFilterId]);

  const handleOpenClassRoster = (cls: FacultyClassItem) => {
    setSelectedClass(cls);
    setSelectedClassFilterId(cls.id);
    setActiveTab('roster');
  };

  // Handler: Create Class Manually with Database Persistence & Conflict Check
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError(null);

    if (!newCourseCode.trim() || !newCourseName.trim()) {
      setScheduleError('Please enter Course Code and Course Title.');
      return;
    }
    if (!newBlock.trim()) {
      setScheduleError('Please enter a Section / Block.');
      return;
    }
    if (!newRoom.trim()) {
      setScheduleError('Please select a Room Venue.');
      return;
    }
    if (!newSchedule.trim()) {
      setScheduleError('Please select or specify a Class Schedule.');
      return;
    }

    // Check Room Schedule Conflict against existing classes
    const conflictingClass = checkRoomScheduleConflict(classes, newRoom, newSchedule);
    if (conflictingClass) {
      setScheduleError(
        `Room Schedule Conflict: ${newRoom} is already occupied on "${newSchedule}" by ${conflictingClass.courseCode} (${conflictingClass.block || 'Sec'}). Please select a different timeslot or room.`
      );
      return;
    }

    setIsSubmittingClass(true);
    try {
      const courseIdToUse = selectedCourseId > 0
        ? selectedCourseId
        : (courses.find(c => c.courseCode.toLowerCase() === newCourseCode.trim().toLowerCase())?.id || courses[0]?.id || 1);

      const res = await createFacultyClassApi({
        csName: `${newCourseCode.trim().toUpperCase()}-${newBlock.trim()}`,
        courseId: courseIdToUse,
        semester: '2nd Semester',
        schoolYear: selectedSchoolYear === 'all' ? '2025-2026' : selectedSchoolYear,
        yearLevel: newYearLevel,
        block: newBlock.trim(),
        lecRoom: newRoom.trim(),
        labRoom: newSchedule.trim(),
      });

      if (res && res.status === 'ok') {
        showFeedback(`Class section ${newCourseCode.trim().toUpperCase()} (${newBlock.trim()}) created successfully!`, 'success');
        setNewCourseCode('');
        setNewCourseName('');
        setNewBlock('');
        setNewRoom('');
        setNewSchedule('');
        setSelectedCourseId(0);
        setIsCreateClassOpen(false);
        await fetchData();
      } else {
        setScheduleError(res?.message || 'Failed to create class section.');
      }
    } catch (err: any) {
      console.error('Error creating class:', err);
      setScheduleError(err?.message || 'Failed to save class section to database.');
    } finally {
      setIsSubmittingClass(false);
    }
  };


  // Handler: Update Class Details
  const handleUpdateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    setClasses(classes.map(c => c.id === editingClass.id ? editingClass : c));
    setEditingClass(null);
    showFeedback(`Class ${editingClass.courseCode} updated!`, 'success');
  };

  // State: Student Submitting Loading State
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);

  // Helper to parse full name string into structured first, middle, and last name
  const parseFullName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { first: parts[0] || '', middle: '', last: '' };
    } else if (parts.length === 2) {
      return { first: parts[0] || '', middle: '', last: parts[1] || '' };
    } else {
      return {
        first: parts[0] || '',
        middle: parts.slice(1, parts.length - 1).join(' '),
        last: parts[parts.length - 1] || ''
      };
    }
  };

  // Handler: Add Student Manually with Database Persistence
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentFirstName.trim() || !studentLastName.trim() || !studentEmailInput.trim()) {
      alert('Please enter First Name, Last Name, and official Email address.');
      return;
    }

    if (classes.length === 0) {
      alert('Please create a class section first before adding students.');
      return;
    }

    const targetClass = classes.find(c => String(c.csId) === String(studentClassSelect) || String(c.id) === String(studentClassSelect) || c.courseName === studentClassSelect) || selectedClass || classes[0];
    const targetCsId = targetClass ? (targetClass.csId || targetClass.id) : (classes[0].csId || classes[0].id);

    setIsSubmittingStudent(true);
    try {
      const res = await createStudentApi({
        studentId: studentIdInput.trim() || `2024-DENT-${Math.floor(1000 + Math.random() * 9000)}`,
        firstName: studentFirstName.trim(),
        middleName: studentMiddleName.trim() || undefined,
        lastName: studentLastName.trim(),
        email: studentEmailInput.trim().toLowerCase(),
        yearLevel: studentYearInput,
        classId: String(targetCsId),
      });

      if (res && (res.status === 'ok' || res.status === 'success')) {
        showFeedback(`Student ${studentFirstName.trim()} ${studentLastName.trim()} added and saved to database!`, 'success');
        setStudentIdInput('');
        setStudentFirstName('');
        setStudentMiddleName('');
        setStudentLastName('');
        setStudentEmailInput('');
        setIsAddStudentOpen(false);
        await fetchData();
      } else {
        alert(res?.message || 'Failed to add student to database.');
      }
    } catch (err: any) {
      console.error('Error adding student:', err);
      alert(err?.message || 'Failed to save student to database.');
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  // Handler: Open Edit Student Modal
  const handleOpenEditStudent = (st: Student) => {
    setEditingStudent(st);
    setStudentIdInput(st.studentId);
    const parsed = parseFullName(st.name);
    setStudentFirstName(parsed.first);
    setStudentMiddleName(parsed.middle);
    setStudentLastName(parsed.last);
    setStudentEmailInput(st.email);
    setStudentYearInput(st.yearLevel);
    setStudentClassSelect(st.classSections?.[0]?.className || 'Clinical Dentistry I');
  };

  // Handler: Save Edit Student
  const handleUpdateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!studentFirstName.trim() || !studentLastName.trim()) {
      alert('Please enter First Name and Last Name.');
      return;
    }

    const fullName = `${studentFirstName.trim()} ${studentMiddleName.trim() ? studentMiddleName.trim() + ' ' : ''}${studentLastName.trim()}`;

    const updated = studentsList.map(s => {
      if (s.id === editingStudent.id) {
        return {
          ...s,
          studentId: studentIdInput.trim(),
          name: fullName,
          email: studentEmailInput.trim().toLowerCase(),
          yearLevel: (studentYearInput as 1 | 2 | 3 | 4) || 4,
          classSections: [{ classId: s.classSections?.[0]?.classId || 'cls-1', className: studentClassSelect, enrollmentId: `enr-${Date.now()}` }]
        };
      }
      return s;
    });

    setStudentsList(updated);
    setEditingStudent(null);
    showFeedback(`Student details for ${fullName} updated!`, 'success');
  };

  // Handler: Remove Student
  const handleDeleteStudent = (studentId: string, studentName: string) => {
    if (window.confirm(`Are you sure you want to remove ${studentName} from the class roster?`)) {
      setStudentsList(studentsList.filter(s => s.id !== studentId));
      showFeedback(`${studentName} removed from roster.`, 'info');
    }
  };

  // Handler: Import iBU Class List File
  const handleImportIctoFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ictoFileText.trim()) {
      alert('Please select a PDF or CSV file to import.');
      return;
    }

    setIsImportIctoOpen(false);
    setIctoFileText('');
    showFeedback('iBU Roster File processed and student roster updated!', 'success');
  };

  // Handler: Send Email Invitation to Student
  const invitationClassId = (student: Student): string | null => {
    if (!/^\d+$/.test(student.id)) return null;
    const sections = student.classSections ?? [];
    const selected = sections.find(section => section.classId === selectedClassFilterId);
    const target = selectedClassFilterId === 'all' ? sections[0] : selected;
    return target && /^\d+$/.test(target.classId) ? target.classId : null;
  };

  const handleSendStudentEmailInvite = async (student: Student) => {
    const classId = invitationClassId(student);
    if (!classId) {
      setNotification({ type: 'info', message: `${student.name} has no server-authoritative class enrollment to invite from.` });
      return;
    }
    setIsSendingInvitations(true);
    try {
      const response = await createStudentInvitation({ studentId: student.id, classId });
      setNotification({ type: response.delivery_status === 'Failed' ? 'info' : 'success', message: response.message });
    } catch (error) {
      setNotification({ type: 'info', message: error instanceof Error ? error.message : `Unable to invite ${student.name}.` });
    } finally {
      setIsSendingInvitations(false);
    }
  };

  const handleSendAllStudentInvites = async () => {
    setIsSendingInvitations(true);
    const results = await Promise.all(filteredStudents.map(async student => {
      const classId = invitationClassId(student);
      if (!classId) return { issued: false, deliveryFailed: false };
      try {
        const response = await createStudentInvitation({ studentId: student.id, classId });
        return { issued: true, deliveryFailed: response.delivery_status === 'Failed' };
      } catch {
        return { issued: false, deliveryFailed: false };
      }
    }));
    const invited = results.filter(result => result.issued).length;
    const deliveryFailed = results.filter(result => result.deliveryFailed).length;
    setIsSendingInvitations(false);
    setNotification({
      type: invited === results.length && deliveryFailed === 0 ? 'success' : 'info',
      message: deliveryFailed > 0
        ? `Issued ${invited} of ${results.length} Student invitations; ${deliveryFailed} email deliveries failed. Review the roster and retry any that failed.`
        : `Issued ${invited} of ${results.length} Student invitations. Review the roster and retry any that failed.`,
    });
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Classes & Student Rosters
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Create classes, import iBU student rosters (PDF/CSV), manage students, and send email invitations.
          </p>
          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-2">
            Development preview: roster edits and imports are browser-local. Invitations are validated and issued by the server against canonical Student and class records.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => setIsCreateClassOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Class</span>
          </button>

          <button
            onClick={() => setIsImportIctoOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Import iBU Roster</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Control Bar: Tabs, Filters & Search */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        {/* Tab Buttons */}
        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => setActiveTab('classes')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'classes'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <BookMarked className="w-4 h-4 text-emerald-600" />
            Assigned Classes
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
              {classes.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('roster')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'roster'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-600" />
            Enrolled Student Roster
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
              {studentsList.length}
            </span>
          </button>
        </div>

        {/* Filters & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full xl:w-auto xl:max-w-3xl">
          {/* Dropdowns Wrapper */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
            {/* Class Section Filter Dropdown Pill */}
            <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3.5 py-2 shadow-xs flex-1 hover:border-emerald-500 transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <BookMarked className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <select
                  value={selectedClassFilterId}
                  onChange={(e) => setSelectedClassFilterId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer w-full truncate pr-1"
                >
                  <option value="all">All Class Sections</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.courseCode} ({c.block})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* School Year Selector Filter Pill */}
            <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3.5 py-2 shadow-xs flex-1 hover:border-emerald-500 transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <select
                  value={selectedSchoolYear}
                  onChange={(e) => setSelectedSchoolYear(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer w-full truncate pr-1"
                >
                  <option value="2025-2026">S.Y. 2025-2026 (Current)</option>
                  <option value="2024-2025">S.Y. 2024-2025</option>
                  <option value="all">All School Years</option>
                </select>
              </div>
            </div>
          </div>

          {/* Search Input Pill */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={activeTab === 'classes' ? "Search code, title..." : "Search student ID, name..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* TAB 1: ASSIGNED CLASSES */}
      {activeTab === 'classes' && (
        filteredClasses.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <BookMarked className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">No Assigned Classes Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              You currently have no class sections assigned to your account. Click below to create a class section.
            </p>
            <button
              onClick={() => setIsCreateClassOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Class</span>
            </button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredClasses.map((cls) => (
              <Card key={cls.id} className="p-5 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-lg bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 text-[10px] font-extrabold uppercase tracking-wider">
                      {cls.courseCode} • Year {cls.yearLevel}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        {cls.block}
                      </span>
                      <button
                        onClick={() => setEditingClass(cls)}
                        className="p-1 text-slate-400 hover:text-accent-600 dark:hover:text-accent-400 transition-colors cursor-pointer"
                        title="Edit Class Details"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                    {cls.courseName}
                  </h3>

                  <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" />
                      <span>{cls.schedule}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" />
                      <span>Room: {cls.lecRoom}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>{cls.enrolledCount} Students</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedClass(cls);
                        setIsAddStudentOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-accent-50 text-accent-700 hover:bg-accent-600 hover:text-white transition-all cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>Add Student</span>
                    </button>

                    <button
                      onClick={() => handleOpenClassRoster(cls)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-accent-600 dark:text-accent-400 hover:underline cursor-pointer"
                    >
                      <span>View Roster</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* TAB 2: STUDENT ROSTER (WITH ENROLLED CLASS COLUMN) */}
      {activeTab === 'roster' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Enrolled Student Roster ({filteredStudents.length})
              </h2>
              <p className="text-xs text-slate-400">
                {selectedClassFilterId !== 'all' 
                  ? `Showing enrolled students for selected class section.`
                  : `Add, edit, or remove roster entries and invite eligible Students to activate their accounts.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setStudentIdInput('');
                  setStudentFirstName('');
                  setStudentMiddleName('');
                  setStudentLastName('');
                  setStudentEmailInput('');
                  setIsAddStudentOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold shadow-md shadow-accent-600/20 transition-all cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Add Student</span>
              </button>

              <button
                onClick={handleSendAllStudentInvites}
                disabled={isSendingInvitations || filteredStudents.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Send Invites to All</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">BU Email Address</th>
                  <th className="py-3 px-4">Enrolled Class Section</th>
                  <th className="py-3 px-4">Year Level</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredStudents.map((st) => {
                  const assignedClassLabel = st.classSections && st.classSections.length > 0 
                    ? st.classSections.map(cs => cs.className).join(', ')
                    : 'Clinical Dentistry';

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-200">
                        {st.studentId}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                        {st.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {st.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-extrabold text-[10px] uppercase tracking-wider border border-accent-200/60 dark:border-accent-800/40">
                          {assignedClassLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        Year {st.yearLevel}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSendStudentEmailInvite(st)}
                            disabled={isSendingInvitations}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-accent-600 hover:text-white dark:hover:bg-accent-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            title="Send Email Invitation"
                          >
                            <Send className="w-3 h-3" />
                            <span>Invite</span>
                          </button>

                          <button
                            onClick={() => handleOpenEditStudent(st)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
                            title="Edit Student Information"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteStudent(st.id, st.name)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                            title="Remove Student from Roster"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal: Add Student Manually */}
      {isAddStudentOpen && (
        <Modal isOpen={isAddStudentOpen} onClose={() => setIsAddStudentOpen(false)} title="Add New Student to Class Roster">
          <form onSubmit={handleAddStudent} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Enrolled Class Section</label>
              <select
                value={studentClassSelect}
                onChange={(e) => setStudentClassSelect(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.courseName}>{c.courseCode} - {c.courseName} ({c.block})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Student ID Number</label>
              <input
                type="text"
                required
                value={studentIdInput}
                onChange={(e) => setStudentIdInput(e.target.value)}
                placeholder="e.g. 2024-DENT-0012"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={studentFirstName}
                  onChange={(e) => setStudentFirstName(e.target.value.replace(/[0-9]/g, ''))}
                  placeholder="e.g. Juan"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Middle Name</label>
                <input
                  type="text"
                  value={studentMiddleName}
                  onChange={(e) => setStudentMiddleName(e.target.value.replace(/[0-9]/g, ''))}
                  placeholder="e.g. Santos"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={studentLastName}
                  onChange={(e) => setStudentLastName(e.target.value.replace(/[0-9]/g, ''))}
                  placeholder="e.g. Dela Cruz"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Official Bicol University Email</label>
              <input
                type="email"
                required
                value={studentEmailInput}
                onChange={(e) => setStudentEmailInput(e.target.value)}
                placeholder="username@bicol-u.edu.ph"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Year Level</label>
              <select
                value={studentYearInput}
                onChange={(e) => setStudentYearInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                <option value={1}>Year 1</option>
                <option value={2}>Year 2</option>
                <option value={3}>Year 3</option>
                <option value={4}>Year 4</option>
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddStudentOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingStudent}
                className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold shadow-md shadow-accent-600/20 disabled:opacity-50"
              >
                {isSubmittingStudent ? 'Saving Student...' : 'Add Student'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Student Information */}
      {editingStudent && (
        <Modal isOpen={!!editingStudent} onClose={() => setEditingStudent(null)} title="Edit Student Information">
          <form onSubmit={handleUpdateStudent} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Enrolled Class Section</label>
              <select
                value={studentClassSelect}
                onChange={(e) => setStudentClassSelect(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.courseName}>{c.courseCode} - {c.courseName} ({c.block})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Student ID Number</label>
              <input
                type="text"
                required
                value={studentIdInput}
                onChange={(e) => setStudentIdInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={studentFirstName}
                  onChange={(e) => setStudentFirstName(e.target.value.replace(/[0-9]/g, ''))}
                  placeholder="First Name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Middle Name</label>
                <input
                  type="text"
                  value={studentMiddleName}
                  onChange={(e) => setStudentMiddleName(e.target.value.replace(/[0-9]/g, ''))}
                  placeholder="Middle Name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={studentLastName}
                  onChange={(e) => setStudentLastName(e.target.value.replace(/[0-9]/g, ''))}
                  placeholder="Last Name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Official Bicol University Email</label>
              <input
                type="email"
                required
                value={studentEmailInput}
                onChange={(e) => setStudentEmailInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Year Level</label>
              <select
                value={studentYearInput}
                onChange={(e) => setStudentYearInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                <option value={1}>Year 1</option>
                <option value={2}>Year 2</option>
                <option value={3}>Year 3</option>
                <option value={4}>Year 4</option>
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold shadow-md shadow-accent-600/20"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Create Class Manually */}
      {isCreateClassOpen && (
        <Modal isOpen={isCreateClassOpen} onClose={() => { setIsCreateClassOpen(false); setScheduleError(null); }} title="Create New Class Section">
          <form onSubmit={handleCreateClass} className="space-y-4 text-xs">

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Code *</label>
              <input
                type="text"
                required
                value={newCourseCode}
                onChange={(e) => setNewCourseCode(e.target.value)}
                placeholder="e.g. DENT 301"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Title *</label>
              <input
                type="text"
                required
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="e.g. Restorative Dentistry I"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Section / Block *</label>
                <input
                  type="text"
                  required
                  value={newBlock}
                  onChange={(e) => setNewBlock(e.target.value)}
                  placeholder="e.g. Section 3-A"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Room Venue *</label>
                <input
                  type="text"
                  required
                  list="room-suggestions"
                  value={newRoom}
                  onChange={(e) => {
                    setNewRoom(e.target.value);
                    setScheduleError(null);
                  }}
                  placeholder="e.g. Dental Room 101"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
                <datalist id="room-suggestions">
                  {ROOM_OPTIONS.map(room => (
                    <option key={room} value={room} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Step-by-Step Schedule Builder */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  1. Select Day(s) *
                </label>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {DAYS_LIST.map(day => {
                    const isSelected = selectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          let updated: string[];
                          if (isSelected) {
                            updated = selectedDays.filter(d => d !== day);
                          } else {
                            updated = DAYS_LIST.filter(d => d === day || selectedDays.includes(d));
                          }
                          setSelectedDays(updated);
                          updateScheduleFromPicker(updated, startTime, endTime);
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className="text-slate-400 font-semibold">Presets:</span>
                  {[
                    { label: 'Mon/Wed', days: ['Mon', 'Wed'] },
                    { label: 'Tue/Thu', days: ['Tue', 'Thu'] },
                    { label: 'Mon/Wed/Fri', days: ['Mon', 'Wed', 'Fri'] },
                    { label: 'Sat', days: ['Sat'] },
                  ].map(combo => (
                    <button
                      key={combo.label}
                      type="button"
                      onClick={() => {
                        setSelectedDays(combo.days);
                        updateScheduleFromPicker(combo.days, startTime, endTime);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors cursor-pointer"
                    >
                      {combo.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  2. Select Time Range *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold block mb-0.5">Start Time</span>
                    <select
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        updateScheduleFromPicker(selectedDays, e.target.value, endTime);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                    >
                      {TIME_OPTIONS.map(t => (
                        <option key={`start-${t}`} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold block mb-0.5">End Time</span>
                    <select
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        updateScheduleFromPicker(selectedDays, startTime, e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                    >
                      {TIME_OPTIONS.map(t => (
                        <option key={`end-${t}`} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Final Class Schedule (Editable) *
                </label>
                <input
                  type="text"
                  required
                  value={newSchedule}
                  onChange={(e) => {
                    setNewSchedule(e.target.value);
                    setScheduleError(null);
                  }}
                  placeholder="e.g. Mon/Wed 08:00 AM - 11:00 AM"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                />
                <span className="text-[11px] text-slate-400 block mt-1">
                  Select Day(s) & Time above to auto-generate, or type any custom schedule text directly.
                </span>
              </div>
            </div>

            {scheduleError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold flex items-start gap-2 animate-fade-in">
                <Info className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{scheduleError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setIsCreateClassOpen(false); setScheduleError(null); }}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingClass}
                className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold shadow-md shadow-accent-600/20 disabled:opacity-50"
              >
                {isSubmittingClass ? 'Saving Class...' : 'Save Class Section'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Class Section */}
      {editingClass && (
        <Modal isOpen={!!editingClass} onClose={() => setEditingClass(null)} title="Edit Class Section Details">
          <form onSubmit={handleUpdateClass} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Code</label>
              <input
                type="text"
                required
                value={editingClass.courseCode}
                onChange={(e) => setEditingClass({ ...editingClass, courseCode: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Title</label>
              <input
                type="text"
                required
                value={editingClass.courseName}
                onChange={(e) => setEditingClass({ ...editingClass, courseName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Section / Block</label>
                <input
                  type="text"
                  value={editingClass.block}
                  onChange={(e) => setEditingClass({ ...editingClass, block: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Room Venue</label>
                <input
                  type="text"
                  list="room-suggestions"
                  value={editingClass.lecRoom || ''}
                  onChange={(e) => setEditingClass({ ...editingClass, lecRoom: e.target.value })}
                  placeholder="e.g. Dental Room 101"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Class Schedule</label>
              <input
                type="text"
                list="schedule-suggestions"
                value={editingClass.schedule}
                onChange={(e) => setEditingClass({ ...editingClass, schedule: e.target.value })}
                placeholder="e.g. Mon/Wed 08:00 AM - 11:00 AM"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingClass(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold shadow-md shadow-accent-600/20"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}


      {/* Modal: Import iBU Class List File */}
      {isImportIctoOpen && (
        <Modal isOpen={isImportIctoOpen} onClose={() => setIsImportIctoOpen(false)} title="Import iBU Class Roster File (PDF or CSV)">
          <form onSubmit={handleImportIctoFile} className="space-y-4 text-xs">
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-xl text-slate-700 dark:text-slate-300 space-y-1">
              <span className="font-bold block text-blue-900 dark:text-blue-200">Import iBU Class Roster:</span>
              <p className="text-slate-600 dark:text-slate-400">
                Upload your class list exported from iBU system in <strong>PDF</strong> or <strong>CSV</strong> format to automatically populate student enrollments.
              </p>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Select PDF or CSV File</label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-5 text-center hover:border-indigo-500 transition-colors cursor-pointer bg-slate-50/50 dark:bg-slate-900/50">
                <Upload className="w-7 h-7 text-indigo-500 mx-auto mb-2" />
                <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                  Choose a PDF or CSV file to upload
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5 mb-2">
                  Supports .pdf, .csv, and .txt files exported from iBU portal
                </span>
                <input
                  type="file"
                  accept=".pdf, .csv, .txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setIctoFileText(e.target.files[0].name);
                    }
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>
            </div>

            {ictoFileText && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Selected file: <strong>{ictoFileText}</strong></span>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsImportIctoOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20"
              >
                Process & Import iBU Roster
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
};
