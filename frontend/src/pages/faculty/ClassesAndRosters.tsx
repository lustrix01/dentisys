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
  Trash2,
  Filter,
  Pencil
} from 'lucide-react';
import { Student } from '../../types';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { showFeedback, requestConfirmation } from '../../components/FeedbackCenter';
import {
  getFacultyClassesApi,
  getFacultyCoursesApi,
  getFacultyStudentsApi,
  createFacultyClassApi,
  updateFacultyClassApi,
  getAvailableStudentsForClassApi,
  enrollStudentsInClassApi,
  unenrollStudentFromClassApi,
  createStudentInvitation,
  createStudentApi,
  FacultyClassItem,
  CourseCatalogItem
} from '../../services/apiClient';

const ROOM_OPTIONS = [
  'Lecture Hall A',
  'Lecture Hall B',
  'Dental Clinic Lab 1',
  'Dental Clinic Lab 2',
  'Room 101',
  'Room 102',
  'Room 201',
  'Room 202',
  'Room 301',
  'Room 302',
  'Oral Anatomy Lab',
  'Prosthodontics Lab',
  'Periodontics Lab',
  'Auditorium',
  'Simulation Lab',
];

const DAYS_LIST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME_OPTIONS = [
  '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  '07:00 PM'
];

interface ParsedSchedule {
  days: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  startMin: number;
  endMin: number;
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function parseScheduleTimeslot(scheduleStr: string): ParsedSchedule | null {
  if (!scheduleStr || !scheduleStr.trim()) return null;
  const parts = scheduleStr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const dayPart = parts[0];
  const timePart = parts.slice(1).join(' ');
  const timeSubParts = timePart.split('-');
  if (timeSubParts.length !== 2) return null;

  const startMin = parseTimeToMinutes(timeSubParts[0]);
  const endMin = parseTimeToMinutes(timeSubParts[1]);
  if (startMin === null || endMin === null || endMin <= startMin) return null;

  const days: number[] = [];
  const dayTokens = dayPart.split(/[/,-]/);
  const dayMap: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
  };
  for (const token of dayTokens) {
    const key = token.trim().toLowerCase();
    if (dayMap[key] !== undefined) {
      days.push(dayMap[key]);
    }
  }
  if (days.length === 0) return null;
  return { days, startMin, endMin };
}

function checkRoomScheduleConflict(
  existingClasses: FacultyClassItem[],
  targetRoom: string,
  targetScheduleStr: string,
  excludeClassId?: string | number
): FacultyClassItem | null {
  if (!targetRoom || !targetRoom.trim() || !targetScheduleStr || !targetScheduleStr.trim()) return null;
  const targetSched = parseScheduleTimeslot(targetScheduleStr);
  if (!targetSched) return null;

  const cleanRoom = targetRoom.trim().toLowerCase();

  for (const cls of existingClasses) {
    if (excludeClassId !== undefined && (String(cls.id) === String(excludeClassId) || String(cls.csId) === String(excludeClassId))) {
      continue;
    }
    const clsLec = (cls.lecRoom || '').trim().toLowerCase();
    const clsLab = (cls.labRoom || '').trim().toLowerCase();
    const roomMatches = (clsLec && clsLec === cleanRoom) || (clsLab && clsLab === cleanRoom);
    if (!roomMatches) continue;

    const clsSchedStr = cls.schedule || '';
    const clsSched = parseScheduleTimeslot(clsSchedStr);
    if (!clsSched) continue;

    const hasCommonDay = targetSched.days.some(d => clsSched.days.includes(d));
    if (!hasCommonDay) continue;

    const overlaps = targetSched.startMin < clsSched.endMin && targetSched.endMin > clsSched.startMin;
    if (overlaps) {
      return cls;
    }
  }
  return null;
}

export const ClassesAndRosters: React.FC = () => {
  const [classes, setClasses] = useState<FacultyClassItem[]>([]);
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSendingInvitations, setIsSendingInvitations] = useState(false);

  // Active view tab: 'classes' or 'roster'
  const [activeTab, setActiveTab] = useState<'classes' | 'roster'>('classes');

  // Search query, School Year filter, and Class Section filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>('all');
  const [selectedClassFilterId, setSelectedClassFilterId] = useState<string>('all');

  // Selected Class & Modals
  const [selectedClass, setSelectedClass] = useState<FacultyClassItem | null>(null);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
  const [isImportIctoOpen, setIsImportIctoOpen] = useState(false);

  // Student Enrollment Modal States
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [targetEnrollCsId, setTargetEnrollCsId] = useState<number>(0);
  const [enrollTab, setEnrollTab] = useState<'directory' | 'manual'>('directory');
  const [availableStudents, setAvailableStudents] = useState<Array<{
    id: string;
    studentId: string;
    name: string;
    email: string;
    yearLevel: number;
    status: string;
  }>>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [availSearchQuery, setAvailSearchQuery] = useState('');
  const [isSubmittingEnroll, setIsSubmittingEnroll] = useState(false);

  // Form States: New Class Creation
  const [newCourseId, setNewCourseId] = useState<number>(0);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newCsName, setNewCsName] = useState('');
  const [newBlock, setNewBlock] = useState('Section 4-A');
  const [newSchoolYear, setNewSchoolYear] = useState('2025-2026');
  const [newSemester, setNewSemester] = useState('1st Semester');
  const [newYearLevel, setNewYearLevel] = useState(4);
  const [newSchedule, setNewSchedule] = useState('Mon/Wed 08:00 AM - 11:00 AM');
  const [newSelectedDays, setNewSelectedDays] = useState<string[]>(['Mon', 'Wed']);
  const [newStartTime, setNewStartTime] = useState('08:00 AM');
  const [newEndTime, setNewEndTime] = useState('11:00 AM');
  const [newScheduleError, setNewScheduleError] = useState<string | null>(null);
  const [newLecRoom, setNewLecRoom] = useState('Lecture Hall A');
  const [newLabRoom, setNewLabRoom] = useState('Dental Clinic Lab 1');
  const [isSubmittingClass, setIsSubmittingClass] = useState(false);

  // Form States: Edit Class Section
  const [editingClass, setEditingClass] = useState<FacultyClassItem | null>(null);
  const [editCourseCode, setEditCourseCode] = useState('');
  const [editCourseName, setEditCourseName] = useState('');
  const [editBlock, setEditBlock] = useState('');
  const [editYearLevel, setEditYearLevel] = useState(4);
  const [editLecRoom, setEditLecRoom] = useState('');
  const [editLabRoom, setEditLabRoom] = useState('');
  const [editSemester, setEditSemester] = useState('1st Semester');
  const [editSchoolYear, setEditSchoolYear] = useState('2025-2026');
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdatingClass, setIsUpdatingClass] = useState(false);

  // Form States: Add Student Manually (C4 Split-Name Interface)
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentMiddleName, setStudentMiddleName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentEmailInput, setStudentEmailInput] = useState('');
  const [studentYearInput, setStudentYearInput] = useState(4);
  const [isSubmittingNewStudent, setIsSubmittingNewStudent] = useState(false);

  // Derived read-only composed name preview
  const composedStudentName = useMemo(() => {
    return [studentFirstName.trim(), studentMiddleName.trim(), studentLastName.trim()]
      .filter(Boolean)
      .join(' ');
  }, [studentFirstName, studentMiddleName, studentLastName]);

  // Form States: Import iBU File Data
  const [ictoFileText, setIctoFileText] = useState('');

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // Fetch authoritative data from PostgreSQL APIs
  const fetchData = async () => {
    setLoading(true);
    try {
      const [clsRes, crsRes, rosterRes] = await Promise.all([
        getFacultyClassesApi().catch(() => ({ status: 'success', classes: [] })),
        getFacultyCoursesApi().catch(() => ({ status: 'success', courses: [] })),
        getFacultyStudentsApi().catch(() => []),
      ]);

      const classData = Array.isArray(clsRes.classes) ? clsRes.classes : [];
      setClasses(classData);

      const courseData = Array.isArray(crsRes.courses) ? crsRes.courses : [];
      setCourses(courseData);
      if (courseData.length > 0) {
        setNewCourseId(prev => prev > 0 ? prev : courseData[0].id);
        setNewCourseCode(prev => prev || courseData[0].courseCode);
        setNewCourseName(prev => prev || courseData[0].name);
        setNewYearLevel(prev => prev || courseData[0].yearLevel);
        setNewCsName(prev => prev || `${courseData[0].courseCode}-Section 4-A`);
      }

      const studentData = Array.isArray(rosterRes) ? (rosterRes as unknown as Student[]) : [];
      setStudentsList(studentData);
    } catch (err) {
      console.error('Failed to load authoritative classes and rosters:', err);
      setClasses([]);
      setStudentsList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Available School Years derived from classes
  const availableSchoolYears = useMemo(() => {
    const years = new Set(['2025-2026', '2024-2025', ...classes.map(c => c.schoolYear).filter(Boolean)]);
    return Array.from(years);
  }, [classes]);

  // Filtered assigned classes by School Year and Search
  const filteredClasses = useMemo(() => {
    return classes.filter(cls => {
      const matchesSearch =
        cls.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.block.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.csName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSchoolYear = selectedSchoolYear === 'all' || cls.schoolYear === selectedSchoolYear;

      return matchesSearch && matchesSchoolYear;
    });
  }, [classes, searchQuery, selectedSchoolYear]);

  // Filtered student roster by Search and Class Filter
  const filteredStudents = useMemo(() => {
    return studentsList.filter((student) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        student.name.toLowerCase().includes(query) ||
        student.studentId.toLowerCase().includes(query) ||
        student.email.toLowerCase().includes(query)
      );

      const matchesClass = selectedClassFilterId === 'all' ||
        (student.classSections && student.classSections.some(sec => String(sec.classId) === String(selectedClassFilterId)));

      return matchesSearch && matchesClass;
    });
  }, [studentsList, searchQuery, selectedClassFilterId]);

  const handleOpenClassRoster = (cls: FacultyClassItem) => {
    setSelectedClass(cls);
    setSelectedClassFilterId(cls.id);
    setActiveTab('roster');
  };

  // Load available unenrolled students for a target class section
  const loadAvailableStudents = async (csId: number) => {
    if (!csId || csId <= 0) {
      setAvailableStudents([]);
      return;
    }
    setLoadingAvailable(true);
    setSelectedStudentIds([]);
    setAvailSearchQuery('');
    try {
      const res = await getAvailableStudentsForClassApi(csId);
      if (Array.isArray(res.students)) {
        setAvailableStudents(res.students);
      } else {
        setAvailableStudents([]);
      }
    } catch (err) {
      console.error('Failed to fetch available students:', err);
      setAvailableStudents([]);
    } finally {
      setLoadingAvailable(false);
    }
  };

  // Open the Add / Enroll Student modal
  const handleOpenAddStudent = async (cls?: FacultyClassItem) => {
    const targetId = cls
      ? cls.csId
      : (selectedClassFilterId !== 'all' ? Number(selectedClassFilterId) : (classes[0]?.csId || 0));

    setTargetEnrollCsId(targetId);
    if (cls) {
      setSelectedClass(cls);
    } else if (targetId > 0) {
      const found = classes.find(c => c.csId === targetId);
      if (found) setSelectedClass(found);
    }

    setEnrollTab('directory');
    setStudentIdInput('');
    setStudentFirstName('');
    setStudentMiddleName('');
    setStudentLastName('');
    setStudentEmailInput('');
    setStudentYearInput(4);
    setIsAddStudentOpen(true);

    if (targetId > 0) {
      await loadAvailableStudents(targetId);
    }
  };

  // Handler: Open Edit Class Section Modal
  const handleOpenEditClass = (cls: FacultyClassItem) => {
    setEditingClass(cls);
    setEditCourseCode(cls.courseCode || '');
    setEditCourseName(cls.courseName || '');
    setEditBlock(cls.block || '');
    setEditYearLevel(cls.yearLevel || 4);
    setEditLecRoom(cls.lecRoom || '');
    setEditLabRoom(cls.labRoom || '');
    setEditSemester(cls.semester || '1st Semester');
    setEditSchoolYear(cls.schoolYear || '2025-2026');
    setEditError(null);
  };

  // Handler: Update Class Section
  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;
    setEditError(null);

    const rawId = editingClass.csId ?? editingClass.id;
    const parsedCsId = typeof rawId === 'number' ? rawId : parseInt(String(rawId).replace(/\D+/g, ''), 10);
    if (isNaN(parsedCsId) || parsedCsId <= 0) {
      const errMsg = 'Invalid class ID. Cannot update class section.';
      setEditError(errMsg);
      showFeedback(errMsg, 'error');
      return;
    }

    if (!editBlock.trim()) {
      setEditError('Please enter a Section / Block.');
      return;
    }

    setIsUpdatingClass(true);
    try {
      const res = await updateFacultyClassApi({
        csId: parsedCsId,
        csName: `${editCourseCode.trim()}-${editBlock.trim()}`,
        block: editBlock.trim(),
        yearLevel: editYearLevel,
        lecRoom: editLecRoom.trim() || undefined,
        labRoom: editLabRoom.trim() || undefined,
      });

      if (res && (res.status === 'ok' || res.status === 'success')) {
        showFeedback(`Class ${editCourseCode} (${editBlock.trim()}) updated successfully!`, 'success');
        setEditingClass(null);
        await fetchData();
      } else {
        setEditError(res?.message || 'Failed to update class section.');
      }
    } catch (err: any) {
      setEditError(err?.message || 'Failed to save class section updates to backend.');
    } finally {
      setIsUpdatingClass(false);
    }
  };

  // Handler: Create Class via authoritative API
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewScheduleError(null);

    if (!newCourseId || newCourseId <= 0) {
      showFeedback('Please select a course from the catalog.', 'error');
      return;
    }

    const csName = newCsName.trim() || `${newCourseCode}-${newBlock}`;
    if (!csName) {
      showFeedback('Please provide a class section name.', 'error');
      return;
    }

    if (newLecRoom.trim() && newSchedule.trim()) {
      const conflict = checkRoomScheduleConflict(classes, newLecRoom, newSchedule);
      if (conflict) {
        setNewScheduleError(`Room Conflict: Lecture venue "${newLecRoom}" is occupied on "${newSchedule}" by ${conflict.courseCode} (${conflict.block || 'Sec'}).`);
        return;
      }
    }

    if (newLabRoom.trim() && newSchedule.trim()) {
      const conflict = checkRoomScheduleConflict(classes, newLabRoom, newSchedule);
      if (conflict) {
        setNewScheduleError(`Room Conflict: Lab venue "${newLabRoom}" is occupied on "${newSchedule}" by ${conflict.courseCode} (${conflict.block || 'Sec'}).`);
        return;
      }
    }

    setIsSubmittingClass(true);
    try {
      const res = await createFacultyClassApi({
        csName,
        courseId: newCourseId,
        semester: newSemester,
        schoolYear: newSchoolYear,
        yearLevel: newYearLevel,
        block: newBlock,
        lecRoom: newLecRoom,
        labRoom: newLabRoom,
      });

      showFeedback(res.message || `Class section ${csName} created successfully!`, 'success');
      setIsCreateClassOpen(false);
      await fetchData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to create class section.', 'error');
    } finally {
      setIsSubmittingClass(false);
    }
  };

  // Handler: Enroll Selected Students via authoritative API
  const handleEnrollStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEnrollCsId || targetEnrollCsId <= 0) {
      showFeedback('Please select a valid class section.', 'error');
      return;
    }
    if (selectedStudentIds.length === 0) {
      showFeedback('Please select at least one student to enroll.', 'error');
      return;
    }

    setIsSubmittingEnroll(true);
    try {
      const res = await enrollStudentsInClassApi({
        csId: targetEnrollCsId,
        studentIds: selectedStudentIds,
      });

      showFeedback(res.message || `Successfully enrolled ${selectedStudentIds.length} student(s)!`, 'success');
      setIsAddStudentOpen(false);
      setSelectedStudentIds([]);
      await fetchData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to enroll students.', 'error');
    } finally {
      setIsSubmittingEnroll(false);
    }
  };

  // Handler: Register New Student & Enroll via authoritative API (C4 Split Names)
  const handleRegisterNewStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentIdInput.trim() || !studentFirstName.trim() || !studentLastName.trim() || !studentEmailInput.trim()) {
      showFeedback('Please fill in Student ID, First Name, Last Name, and Email.', 'error');
      return;
    }
    if (!targetEnrollCsId || targetEnrollCsId <= 0) {
      showFeedback('Please select a target class section.', 'error');
      return;
    }

    setIsSubmittingNewStudent(true);
    try {
      const res = await createStudentApi({
        studentId: studentIdInput.trim(),
        firstName: studentFirstName.trim(),
        middleName: studentMiddleName.trim() || undefined,
        lastName: studentLastName.trim(),
        email: studentEmailInput.trim().toLowerCase(),
        yearLevel: studentYearInput,
        classId: String(targetEnrollCsId),
      });

      showFeedback(res.message || `Student registered and enrolled successfully!`, 'success');
      setIsAddStudentOpen(false);
      setStudentIdInput('');
      setStudentFirstName('');
      setStudentMiddleName('');
      setStudentLastName('');
      setStudentEmailInput('');
      await fetchData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to register student.', 'error');
    } finally {
      setIsSubmittingNewStudent(false);
    }
  };

  // Handler: Unenroll / Remove Student from Class via authoritative API
  const handleDeleteStudent = async (student: Student, specificCsId?: number) => {
    let csId: number | null = specificCsId ?? null;
    if (!csId) {
      if (selectedClassFilterId !== 'all') {
        csId = parseInt(selectedClassFilterId, 10);
      } else {
        const facultySections = (student.classSections || []).filter(s =>
          classes.some(c => String(c.csId) === String(s.classId))
        );
        if (facultySections.length > 0) {
          csId = parseInt(facultySections[0].classId, 10);
        }
      }
    }

    if (!csId || isNaN(csId)) {
      showFeedback(`No assigned class section found to remove ${student.name} from.`, 'error');
      return;
    }

    const targetClass = classes.find(c => c.csId === csId);
    const className = targetClass ? `${targetClass.courseCode} (${targetClass.block})` : `Class #${csId}`;

    const confirmed = await requestConfirmation(
      `Are you sure you want to remove ${student.name} (${student.studentId}) from ${className}?`,
      'Remove Student from Class'
    );
    if (!confirmed) return;

    try {
      const res = await unenrollStudentFromClassApi({
        csId,
        studentId: parseInt(student.id, 10),
      });
      showFeedback(res.message || `${student.name} removed from ${className}.`, 'success');
      await fetchData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to remove student from class section.', 'error');
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
    const selected = sections.find(section => String(section.classId) === String(selectedClassFilterId));
    const target = selectedClassFilterId === 'all' ? sections[0] : selected;
    return target && /^\d+$/.test(String(target.classId)) ? String(target.classId) : null;
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

  // Filtered available students in the enroll modal
  const filteredAvailableStudents = useMemo(() => {
    return availableStudents.filter(st => {
      const q = availSearchQuery.toLowerCase();
      return st.name.toLowerCase().includes(q) ||
             st.studentId.toLowerCase().includes(q) ||
             st.email.toLowerCase().includes(q);
    });
  }, [availableStudents, availSearchQuery]);

  const toggleSelectStudent = (idNum: number) => {
    setSelectedStudentIds(prev =>
      prev.includes(idNum) ? prev.filter(id => id !== idNum) : [...prev, idNum]
    );
  };

  const toggleSelectAllAvailable = () => {
    if (selectedStudentIds.length === filteredAvailableStudents.length && filteredAvailableStudents.length > 0) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredAvailableStudents.map(st => parseInt(st.id, 10)));
    }
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
            Authoritative records: class sections and enrollments are synced with the server. Development preview: roster file imports remain browser-local.
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
                  <option value="all">All School Years</option>
                  {availableSchoolYears.map(sy => (
                    <option key={sy} value={sy}>S.Y. {sy}</option>
                  ))}
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
        <>
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs font-semibold">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-emerald-600" />
              Loading assigned classes from server...
            </div>
          ) : filteredClasses.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <BookMarked className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">No Assigned Classes Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery
                  ? 'No class sections match your search query.'
                  : 'You do not have any class sections assigned for the selected criteria. Create a class section to get started.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setIsCreateClassOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Class Section</span>
                </button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredClasses.map((cls) => (
                <Card key={cls.id} className="p-5 hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 text-[10px] font-extrabold uppercase tracking-wider">
                        {cls.courseCode} &bull; Year {cls.yearLevel}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          {cls.csName || cls.block}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                      {cls.courseName}
                    </h3>

                    <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" />
                        <span>{cls.semester || '1st Semester'} &bull; {cls.schoolYear || '2025-2026'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" />
                        <span>
                          {[
                            cls.lecRoom ? `Lec: ${cls.lecRoom}` : null,
                            cls.labRoom ? `Lab: ${cls.labRoom}` : null,
                          ].filter(Boolean).join(' | ') || 'Venue TBA'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>{cls.enrolledCount} Students</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => handleOpenEditClass(cls)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                        title="Edit Class Section Details"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleOpenAddStudent(cls)}
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
          )}
        </>
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
                  : `Add, manage, or remove roster entries and invite eligible Students to activate their accounts.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenAddStudent()}
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
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                      Loading student roster...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold">
                      <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {searchQuery
                          ? 'No students match your search criteria.'
                          : 'No students are currently enrolled in this class section.'}
                      </p>
                      {classes.length > 0 && !searchQuery && (
                        <button
                          onClick={() => handleOpenAddStudent()}
                          className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-sm"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Enroll Students</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => {
                    const assignedSections = st.classSections || [];
                    const displayedSections = selectedClassFilterId !== 'all'
                      ? assignedSections.filter(s => String(s.classId) === String(selectedClassFilterId))
                      : assignedSections;
                    const assignedClassLabel = displayedSections.map(s => s.className).join(', ') || 'No class section';

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
                              onClick={() => handleDeleteStudent(st)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                              title="Remove Student from Class"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal: Add / Enroll Student */}
      {isAddStudentOpen && (
        <Modal
          isOpen={isAddStudentOpen}
          onClose={() => setIsAddStudentOpen(false)}
          title={selectedClass ? `Add Students to ${selectedClass.courseCode} (${selectedClass.block})` : "Add Students to Class Roster"}
        >
          <div className="space-y-4 text-xs">
            {/* Target Class Selector */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Target Class Section</label>
              <select
                value={targetEnrollCsId}
                onChange={async (e) => {
                  const idNum = Number(e.target.value);
                  setTargetEnrollCsId(idNum);
                  const matched = classes.find(c => c.csId === idNum);
                  if (matched) setSelectedClass(matched);
                  if (idNum > 0) await loadAvailableStudents(idNum);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                {classes.map(c => (
                  <option key={c.csId} value={c.csId}>{c.courseCode} - {c.courseName} ({c.block})</option>
                ))}
              </select>
            </div>

            {/* Mode Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEnrollTab('directory')}
                className={`py-2 px-4 font-bold border-b-2 transition-colors cursor-pointer ${
                  enrollTab === 'directory'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Enroll from University Directory ({availableStudents.length} Available)
              </button>
              <button
                type="button"
                onClick={() => setEnrollTab('manual')}
                className={`py-2 px-4 font-bold border-b-2 transition-colors cursor-pointer ${
                  enrollTab === 'manual'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Register New Student
              </button>
            </div>

            {enrollTab === 'directory' ? (
              <form onSubmit={handleEnrollStudents} className="space-y-3">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student number or name..."
                    value={availSearchQuery}
                    onChange={(e) => setAvailSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Available Students Table */}
                <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {loadingAvailable ? (
                    <div className="py-10 text-center text-slate-400 font-semibold">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-emerald-600" />
                      Loading available unenrolled students...
                    </div>
                  ) : filteredAvailableStudents.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 font-semibold">
                      {availableStudents.length === 0
                        ? 'All registered students are already enrolled in this class section.'
                        : 'No available students match your search.'}
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-2.5 w-8">
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.length === filteredAvailableStudents.length && filteredAvailableStudents.length > 0}
                              onChange={toggleSelectAllAvailable}
                              className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </th>
                          <th className="p-2.5">Student ID</th>
                          <th className="p-2.5">Full Name</th>
                          <th className="p-2.5">Year Level</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredAvailableStudents.map(st => {
                          const idNum = parseInt(st.id, 10);
                          const isSelected = selectedStudentIds.includes(idNum);
                          return (
                            <tr
                              key={st.id}
                              onClick={() => toggleSelectStudent(idNum)}
                              className={`hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 cursor-pointer transition-colors ${
                                isSelected ? 'bg-emerald-50/70 dark:bg-emerald-950/50' : ''
                              }`}
                            >
                              <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectStudent(idNum)}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>
                              <td className="p-2.5 font-mono font-bold text-slate-700 dark:text-slate-200">
                                {st.studentId}
                              </td>
                              <td className="p-2.5 font-bold text-slate-800 dark:text-slate-100">
                                {st.name}
                              </td>
                              <td className="p-2.5 text-slate-500">
                                Year {st.yearLevel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    {selectedStudentIds.length} student(s) selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddStudentOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingEnroll || selectedStudentIds.length === 0}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isSubmittingEnroll ? 'Enrolling...' : `Enroll Selected (${selectedStudentIds.length})`}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegisterNewStudent} className="space-y-4">
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Middle Name</label>
                    <input
                      type="text"
                      value={studentMiddleName}
                      onChange={(e) => setStudentMiddleName(e.target.value.replace(/[0-9]/g, ''))}
                      placeholder="e.g. Santos"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium text-xs"
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium text-xs"
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-slate-100 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span className="font-semibold text-slate-400">Composed Name Preview:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-100">
                    {composedStudentName || '—'}
                  </span>
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
                    disabled={isSubmittingNewStudent}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingNewStudent ? 'Registering...' : 'Register & Enroll Student'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}

      {/* Modal: Create Class Manually via Authoritative API */}
      {isCreateClassOpen && (
        <Modal isOpen={isCreateClassOpen} onClose={() => setIsCreateClassOpen(false)} title="Create New Class Section">
          <form onSubmit={handleCreateClass} className="space-y-4 text-xs">
            {/* Course Catalog Selection */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select Course Offering</label>
              <select
                value={newCourseId}
                onChange={(e) => {
                  const cId = Number(e.target.value);
                  setNewCourseId(cId);
                  const found = courses.find(c => c.id === cId);
                  if (found) {
                    setNewCourseCode(found.courseCode);
                    setNewCourseName(found.name);
                    setNewYearLevel(found.yearLevel);
                    setNewCsName(`${found.courseCode}-${newBlock}`);
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.courseCode} - {c.name} ({c.units} Units, Year {c.yearLevel})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Class Section Name</label>
              <input
                type="text"
                required
                value={newCsName}
                onChange={(e) => setNewCsName(e.target.value)}
                placeholder="e.g. CLIN401-SecA"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Section / Block</label>
                <input
                  type="text"
                  value={newBlock}
                  onChange={(e) => {
                    const blk = e.target.value;
                    setNewBlock(blk);
                    if (newCourseCode) setNewCsName(`${newCourseCode}-${blk}`);
                  }}
                  placeholder="Section 4-A"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">School Year</label>
                <input
                  type="text"
                  required
                  value={newSchoolYear}
                  onChange={(e) => setNewSchoolYear(e.target.value)}
                  placeholder="2025-2026"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Semester</label>
                <select
                  value={newSemester}
                  onChange={(e) => setNewSemester(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value="1st Semester">1st Semester</option>
                  <option value="2nd Semester">2nd Semester</option>
                  <option value="Summer">Summer</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Year Level</label>
                <select
                  value={newYearLevel}
                  onChange={(e) => setNewYearLevel(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Lecture Room</label>
                <input
                  type="text"
                  list="room-suggestions"
                  value={newLecRoom}
                  onChange={(e) => {
                    setNewLecRoom(e.target.value);
                    setNewScheduleError(null);
                  }}
                  placeholder="Lecture Hall A"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Laboratory Room</label>
                <input
                  type="text"
                  list="room-suggestions"
                  value={newLabRoom}
                  onChange={(e) => {
                    setNewLabRoom(e.target.value);
                    setNewScheduleError(null);
                  }}
                  placeholder="Dental Clinic Lab 1"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            {/* Step-by-Step Schedule Controls */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  1. Select Day(s) *
                </label>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {DAYS_LIST.map(day => {
                    const isSelected = newSelectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const updated = isSelected
                            ? newSelectedDays.filter(d => d !== day)
                            : DAYS_LIST.filter(d => d === day || newSelectedDays.includes(d));
                          setNewSelectedDays(updated);
                          if (updated.length > 0) {
                            setNewSchedule(`${updated.join('/')} ${newStartTime} - ${newEndTime}`);
                          }
                          setNewScheduleError(null);
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
                        setNewSelectedDays(combo.days);
                        setNewSchedule(`${combo.days.join('/')} ${newStartTime} - ${newEndTime}`);
                        setNewScheduleError(null);
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
                      value={newStartTime}
                      onChange={(e) => {
                        setNewStartTime(e.target.value);
                        if (newSelectedDays.length > 0) {
                          setNewSchedule(`${newSelectedDays.join('/')} ${e.target.value} - ${newEndTime}`);
                        }
                        setNewScheduleError(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                    >
                      {TIME_OPTIONS.map(t => (
                        <option key={`new-start-${t}`} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold block mb-0.5">End Time</span>
                    <select
                      value={newEndTime}
                      onChange={(e) => {
                        setNewEndTime(e.target.value);
                        if (newSelectedDays.length > 0) {
                          setNewSchedule(`${newSelectedDays.join('/')} ${newStartTime} - ${e.target.value}`);
                        }
                        setNewScheduleError(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                    >
                      {TIME_OPTIONS.map(t => (
                        <option key={`new-end-${t}`} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Class Schedule (Generated / Editable) *
                </label>
                <input
                  type="text"
                  required
                  value={newSchedule}
                  onChange={(e) => {
                    setNewSchedule(e.target.value);
                    setNewScheduleError(null);
                  }}
                  placeholder="e.g. Mon/Wed 08:00 AM - 11:00 AM"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            {newScheduleError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold flex items-start gap-2 animate-fade-in">
                <Info className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{newScheduleError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateClassOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingClass}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingClass ? 'Saving...' : 'Save Class Section'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Room Suggestion Datalist */}
      <datalist id="room-suggestions">
        {ROOM_OPTIONS.map(room => (
          <option key={room} value={room} />
        ))}
      </datalist>

      {/* Modal: Edit Class Section Details */}
      {editingClass && (
        <Modal
          isOpen={!!editingClass}
          onClose={() => {
            setEditingClass(null);
            setEditError(null);
          }}
          title="Edit Class Section Details"
        >
          <form onSubmit={handleUpdateClass} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Code</label>
                <input
                  type="text"
                  readOnly
                  value={editCourseCode}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium cursor-not-allowed"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Title</label>
                <input
                  type="text"
                  readOnly
                  value={editCourseName}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Section / Block *</label>
                <input
                  type="text"
                  required
                  value={editBlock}
                  onChange={(e) => setEditBlock(e.target.value)}
                  placeholder="Section 4-A"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Year Level *</label>
                <select
                  value={editYearLevel}
                  onChange={(e) => setEditYearLevel(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                  <option value={5}>Year 5</option>
                  <option value={6}>Year 6</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Semester</label>
                <input
                  type="text"
                  readOnly
                  value={editSemester}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium cursor-not-allowed"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">School Year</label>
                <input
                  type="text"
                  readOnly
                  value={editSchoolYear}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Lecture Room Venue</label>
                <input
                  type="text"
                  list="room-suggestions"
                  value={editLecRoom}
                  onChange={(e) => {
                    setEditLecRoom(e.target.value);
                    setEditError(null);
                  }}
                  placeholder="Lecture Hall A"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Laboratory Room Venue</label>
                <input
                  type="text"
                  list="room-suggestions"
                  value={editLabRoom}
                  onChange={(e) => {
                    setEditLabRoom(e.target.value);
                    setEditError(null);
                  }}
                  placeholder="Dental Clinic Lab 1"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            {editError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold flex items-start gap-2 animate-fade-in">
                <Info className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingClass(null);
                  setEditError(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingClass}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                {isUpdatingClass ? 'Saving Changes...' : 'Save Changes'}
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
