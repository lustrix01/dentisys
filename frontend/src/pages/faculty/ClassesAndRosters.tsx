import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
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
  Pencil,
  AlertCircle,
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
  updateFacultyStudentApi,
  createStudentInvitation,
  createStudentApi,
  FacultyClassItem,
  CourseCatalogItem
} from '../../services/apiClient';

import {
  ClassSessionSlot,
  ROOM_OPTIONS,
  SCHEDULE_DAYS,
  SCHEDULE_PRESETS,
  SCHEDULE_TIME_SLOTS,
  checkScheduleConflicts,
  formatSessionsForSubmission,
} from '../../utils/scheduleHelper';
import { RoomSelector } from '../../components/RoomSelector';
import { RosterImportModal } from '../../components/RosterImportModal';

const DEFAULT_EMAIL_DOMAIN = 'bicol-u.edu.ph';


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
  const syInitializedRef = useRef(false);

  // Selected Class & Modals
  const [selectedClass, setSelectedClass] = useState<FacultyClassItem | null>(null);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
  const [isImportIctoOpen, setIsImportIctoOpen] = useState(false);

  // Student Enrollment Modal States
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isImportRosterOpen, setIsImportRosterOpen] = useState(false);
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
  const [newBlock, setNewBlock] = useState('');
  const [newSchoolYear, setNewSchoolYear] = useState('');
  const [newSemester, setNewSemester] = useState('1st Semester');
  const [newYearLevel, setNewYearLevel] = useState(4);

  // Session Slots: User can customize sessions (Lecture/Lab, Room, Days, Time)
  const [sessionSlots, setSessionSlots] = useState<ClassSessionSlot[]>([
    {
      id: 'session-1',
      type: 'Lecture',
      room: '',
      days: [],
      startTime: '08:00 AM',
      endTime: '09:00 AM',
    },
  ]);
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

  // Student roster profile edit state. Membership and canonical Student number
  // remain server-owned; this modal edits only the fields in the roster API.
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editStudentFirstName, setEditStudentFirstName] = useState('');
  const [editStudentPrefix, setEditStudentPrefix] = useState('');
  const [editStudentSuffix, setEditStudentSuffix] = useState('');
  const [editStudentMiddleName, setEditStudentMiddleName] = useState('');
  const [editStudentLastName, setEditStudentLastName] = useState('');
  const [editStudentEmail, setEditStudentEmail] = useState('');
  const [editStudentYearLevel, setEditStudentYearLevel] = useState(4);
  const [editStudentError, setEditStudentError] = useState<string | null>(null);
  const [isUpdatingStudent, setIsUpdatingStudent] = useState(false);

  // Form States: Add Student Manually (C4 Split-Name Interface)
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentFirstName, setStudentFirstName] = useState('');
  const [studentPrefix, setStudentPrefix] = useState('');
  const [studentSuffix, setStudentSuffix] = useState('');
  const [studentMiddleName, setStudentMiddleName] = useState('');
  const [studentLastName, setStudentLastName] = useState('');
  const [studentEmailInput, setStudentEmailInput] = useState('');
  const [studentYearInput, setStudentYearInput] = useState(4);
  const [isSubmittingNewStudent, setIsSubmittingNewStudent] = useState(false);

  // Derived read-only composed name preview
  const composedStudentName = useMemo(() => {
    return [studentPrefix.trim(), studentFirstName.trim(), studentMiddleName.trim(), studentLastName.trim(), studentSuffix.trim()]
      .filter(Boolean)
      .join(' ');
  }, [studentPrefix, studentFirstName, studentMiddleName, studentLastName, studentSuffix]);

  // Form States: Import iBU File Data
  const [ictoFileText, setIctoFileText] = useState('');

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch authoritative data from PostgreSQL APIs
  const fetchData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [clsRes, crsRes, rosterRes] = await Promise.all([
        getFacultyClassesApi(),
        getFacultyCoursesApi(),
        getFacultyStudentsApi(),
      ]);

      const classData = Array.isArray(clsRes.classes) ? clsRes.classes : [];
      setClasses(classData);
      const currentSy = clsRes.currentSchoolYear || '';
      setNewSchoolYear(currentSy);
      if (!syInitializedRef.current && currentSy) {
        setSelectedSchoolYear(currentSy);
        syInitializedRef.current = true;
      }

      const courseData = Array.isArray(crsRes.courses) ? crsRes.courses : [];
      setCourses(courseData);

      const studentData = Array.isArray(rosterRes) ? (rosterRes as unknown as Student[]) : [];
      setStudentsList(studentData);
    } catch (err: any) {
      console.error('Failed to load authoritative classes and rosters:', err);
      setFetchError(err instanceof Error ? err.message : 'Failed to load authoritative classes and rosters from server.');
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
    const years = new Set([newSchoolYear, ...classes.map(c => c.schoolYear)].filter(Boolean));
    return Array.from(years);
  }, [classes, newSchoolYear]);

  // The server supplies eligibility; do not infer an academic year from the clock.
  const isHistoricalClass = useCallback((classItem: FacultyClassItem | null | undefined) => {
    const record = classItem as (FacultyClassItem & {
      isHistorical?: boolean;
      isCurrentSchoolYear?: boolean;
    }) | null | undefined;
    return record?.isHistorical === true || record?.isCurrentSchoolYear === false;
  }, []);

  // Map classId to schoolYear for fast lookup in student filtering
  const classSchoolYearMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach(c => {
      map.set(String(c.id), c.schoolYear);
      map.set(String(c.csId), c.schoolYear);
    });
    return map;
  }, [classes]);

  // Available class sections for the class section filter dropdown (constrained by school year if chosen)
  const availableClassFilterOptions = useMemo(() => {
    if (selectedSchoolYear === 'all') return classes;
    return classes.filter(c => c.schoolYear === selectedSchoolYear);
  }, [classes, selectedSchoolYear]);

  // Keep selectedClassFilterId valid when school year changes
  useEffect(() => {
    if (selectedClassFilterId !== 'all') {
      const exists = availableClassFilterOptions.some(
        c => String(c.id) === String(selectedClassFilterId) || String(c.csId) === String(selectedClassFilterId)
      );
      if (!exists) {
        setSelectedClassFilterId('all');
      }
    }
  }, [availableClassFilterOptions, selectedClassFilterId]);

  // Filtered assigned classes by School Year, Class Section, and Search
  const filteredClasses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return classes.filter(cls => {
      const matchesSearch =
        !query ||
        cls.courseCode.toLowerCase().includes(query) ||
        cls.courseName.toLowerCase().includes(query) ||
        cls.block.toLowerCase().includes(query) ||
        cls.csName.toLowerCase().includes(query) ||
        (cls.lecRoom && cls.lecRoom.toLowerCase().includes(query)) ||
        (cls.labRoom && cls.labRoom.toLowerCase().includes(query));

      const matchesSchoolYear = selectedSchoolYear === 'all' || cls.schoolYear === selectedSchoolYear;

      const matchesClass = selectedClassFilterId === 'all' ||
        String(cls.id) === String(selectedClassFilterId) ||
        String(cls.csId) === String(selectedClassFilterId);

      return matchesSearch && matchesSchoolYear && matchesClass;
    });
  }, [classes, searchQuery, selectedSchoolYear, selectedClassFilterId]);

  // Filtered student roster by Search, Class Filter, and School Year Filter
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return studentsList.filter((student) => {
      const matchesSearch = !query || (
        (student.name && student.name.toLowerCase().includes(query)) ||
        (student.studentId && student.studentId.toLowerCase().includes(query)) ||
        (student.email && student.email.toLowerCase().includes(query))
      );

      const matchesClass = selectedClassFilterId === 'all' ||
        (student.classSections && student.classSections.some(sec => String(sec.classId) === String(selectedClassFilterId))) ||
        String(student.classId) === String(selectedClassFilterId);

      const matchesSchoolYear = selectedSchoolYear === 'all' ||
        (student.classSections && student.classSections.some(sec => classSchoolYearMap.get(String(sec.classId)) === selectedSchoolYear)) ||
        (student.classId && classSchoolYearMap.get(String(student.classId)) === selectedSchoolYear);

      return matchesSearch && matchesClass && matchesSchoolYear;
    });
  }, [studentsList, searchQuery, selectedClassFilterId, selectedSchoolYear, classSchoolYearMap]);

  const handleOpenClassRoster = (cls: FacultyClassItem) => {
    setSelectedClass(cls);
    if (cls.schoolYear && selectedSchoolYear !== 'all' && selectedSchoolYear !== cls.schoolYear) {
      setSelectedSchoolYear(cls.schoolYear);
    }
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
    if (cls && isHistoricalClass(cls)) {
      showFeedback('Past school-year classes are view-only. Adding students is unavailable.', 'info');
      return;
    }
    const targetId = cls
      ? cls.csId
      : (selectedClassFilterId !== 'all' ? Number(selectedClassFilterId) : (classes.find(c => !isHistoricalClass(c))?.csId || 0));
    if (!targetId || isHistoricalClass(classes.find(c => c.csId === targetId))) {
      showFeedback('Select a current school-year class to enroll students.', 'info');
      return;
    }

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
    if (isHistoricalClass(cls)) {
      showFeedback('Past school-year classes are view-only. Editing is unavailable.', 'info');
      return;
    }
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

  const handleOpenEditStudent = (student: Student) => {
    if (selectedClassFilterId !== 'all' && isHistoricalClass(classes.find(c => String(c.csId) === selectedClassFilterId))) {
      showFeedback('Past school-year rosters are view-only.', 'info');
      return;
    }
    setEditingStudent(student);
    // Never infer name boundaries from a display name: compound names are ambiguous.
    setEditStudentPrefix(student.prefix || '');
    setEditStudentFirstName(student.firstName || '');
    setEditStudentMiddleName(student.middleName || '');
    setEditStudentLastName(student.lastName || '');
    setEditStudentSuffix(student.suffix || '');
    setEditStudentEmail(student.email || '');
    setEditStudentYearLevel(student.yearLevel || 4);
    setEditStudentError(null);
  };

  const handleUpdateStudent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingStudent) return;

    const firstName = editStudentFirstName.trim();
    const middleName = editStudentMiddleName.trim();
    const lastName = editStudentLastName.trim();
    const email = editStudentEmail.trim() && (editStudentEmail.includes('@')
      ? editStudentEmail.trim() : `${editStudentEmail.trim()}@bicol-u.edu.ph`);
    if (firstName.length < 2 || lastName.length < 2) {
      setEditStudentError('First name and last name must each contain at least two characters.');
      return;
    }
    if (!email) {
      setEditStudentError('Institutional email is required for roster edits.');
      return;
    }
    if (!Number.isInteger(editStudentYearLevel) || editStudentYearLevel < 1 || editStudentYearLevel > 4) {
      setEditStudentError('Year level must be between 1 and 4.');
      return;
    }

    setIsUpdatingStudent(true);
    setEditStudentError(null);
    try {
      await updateFacultyStudentApi(editingStudent.id, {
        prefix: editStudentPrefix.trim(),
        suffix: editStudentSuffix.trim(),
        firstName,
        middleName,
        lastName,
        email,
        yearLevel: editStudentYearLevel,
      });
      setEditingStudent(null);
      showFeedback(`Updated ${firstName}${middleName ? ` ${middleName}` : ''} ${lastName}.`, 'success');
      await fetchData();
    } catch (error) {
      setEditStudentError(error instanceof Error ? error.message : 'Unable to save Student roster changes.');
    } finally {
      setIsUpdatingStudent(false);
    }
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

  // Schedule Conflict Detection: verifies all session slots against active classes
  const scheduleConflict = useMemo<string | null>(() => {
    return checkScheduleConflicts(sessionSlots, classes, newSchoolYear);
  }, [sessionSlots, classes, newSchoolYear]);

  const handleAddSessionSlot = () => {
    const nextType: 'Lecture' | 'Laboratory' = sessionSlots.some(s => s.type === 'Lecture') ? 'Laboratory' : 'Lecture';
    const nextRoom = nextType === 'Laboratory' ? 'Dental Clinic Lab 1' : 'Lecture Hall A';
    const nextDays = nextType === 'Laboratory' ? ['Wed'] : ['Tue'];
    const initialConfig = {
      room: nextRoom,
      days: nextDays,
      startTime: '10:00 AM',
      endTime: '01:00 PM',
    };
    setSessionSlots(prev => [
      ...prev,
      {
        id: `session-${Date.now()}`,
        type: nextType,
        ...initialConfig,
        ...(nextType === 'Lecture' ? { lectureData: initialConfig } : { labData: initialConfig }),
      },
    ]);
  };

  const handleRemoveSessionSlot = (id: string) => {
    if (sessionSlots.length <= 1) return;
    setSessionSlots(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateSlot = (id: string, updates: Partial<ClassSessionSlot>) => {
    setSessionSlots(prev =>
      prev.map(s => {
        if (s.id !== id) return s;

        // If toggling type between Lecture and Laboratory
        if (updates.type && updates.type !== s.type) {
          const nextType = updates.type;
          const currentConfig = {
            room: s.room,
            days: s.days,
            startTime: s.startTime,
            endTime: s.endTime,
          };
          const oldCache = s.type === 'Lecture' ? { lectureData: currentConfig } : { labData: currentConfig };
          const cachedForNext = nextType === 'Lecture' ? s.lectureData : s.labData;

          if (cachedForNext) {
            return {
              ...s,
              ...oldCache,
              type: nextType,
              room: cachedForNext.room,
              days: cachedForNext.days,
              startTime: cachedForNext.startTime,
              endTime: cachedForNext.endTime,
            };
          } else {
            // Keep user's inputted room, days, and times without wiping anything
            return {
              ...s,
              ...oldCache,
              type: nextType,
            };
          }
        }

        // Standard updates (room, days, times)
        const updated = { ...s, ...updates };
        const currentConfig = {
          room: updated.room,
          days: updated.days,
          startTime: updated.startTime,
          endTime: updated.endTime,
        };
        if (updated.type === 'Lecture') {
          updated.lectureData = currentConfig;
        } else {
          updated.labData = currentConfig;
        }
        return updated;
      })
    );
  };

  const handleOpenCreateClassModal = () => {
    if (!newSchoolYear) {
      showFeedback('Current active school year is unavailable. Class creation is disabled.', 'error');
      return;
    }
    // Switch filter to the current active school year so the faculty member can immediately see the new class
    if (selectedSchoolYear !== 'all' && selectedSchoolYear !== newSchoolYear) {
      setSelectedSchoolYear(newSchoolYear);
    }
    setNewCourseId(0);
    setNewCourseCode('');
    setNewCourseName('');
    setNewYearLevel(4);
    setNewBlock('');
    const initialLec = {
      room: '',
      days: [],
      startTime: '08:00 AM',
      endTime: '09:00 AM',
    };
    setSessionSlots([
      {
        id: 'session-1',
        type: 'Lecture',
        ...initialLec,
        lectureData: initialLec,
      },
    ]);
    setIsCreateClassOpen(true);
  };

  // Handler: Create Class via authoritative API with strict conflict prevention
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scheduleConflict) {
      showFeedback(scheduleConflict, 'error');
      return;
    }
    if (!newSchoolYear) {
      showFeedback('Classes can only be created for the current active school year. Please reload.', 'error');
      return;
    }

    let targetCourseId = newCourseId;
    if (!targetCourseId || targetCourseId <= 0) {
      const found = courses.find(c => c.courseCode.toLowerCase() === newCourseCode.trim().toLowerCase());
      if (found) {
        targetCourseId = found.id;
      } else if (courses.length > 0) {
        targetCourseId = courses[0].id;
      }
    }

    if (!targetCourseId || targetCourseId <= 0) {
      showFeedback('Please select or specify a valid Course Offering.', 'error');
      return;
    }

    const csName = `${newCourseCode.trim()}-${newBlock.trim()}`;
    if (!csName) {
      showFeedback('Please provide a class section name.', 'error');
      return;
    }

    const { lecRoom, labRoom } = formatSessionsForSubmission(sessionSlots);

    setIsSubmittingClass(true);
    try {
      const res = await createFacultyClassApi({
        csName,
        courseId: targetCourseId,
        semester: newSemester,
        schoolYear: newSchoolYear,
        yearLevel: newYearLevel,
        block: newBlock.trim(),
        lecRoom: lecRoom || undefined,
        labRoom: labRoom || undefined,
      });

      showFeedback(res.message || `Class section ${csName} created successfully for current S.Y. ${newSchoolYear}!`, 'success');
      setIsCreateClassOpen(false);
      if (selectedSchoolYear !== 'all' && selectedSchoolYear !== newSchoolYear) {
        setSelectedSchoolYear(newSchoolYear);
      }
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
        prefix: studentPrefix.trim(),
        suffix: studentSuffix.trim(),
        firstName: studentFirstName.trim(),
        middleName: studentMiddleName.trim() || undefined,
        lastName: studentLastName.trim(),
        email: (studentEmailInput.includes('@') ? studentEmailInput.trim() : `${studentEmailInput.trim()}@bicol-u.edu.ph`).toLowerCase(),
        yearLevel: studentYearInput,
        classId: String(targetEnrollCsId),
      });

      showFeedback(res.message || `Student registered and enrolled successfully!`, 'success');
      setIsAddStudentOpen(false);
      setStudentIdInput('');
      setStudentFirstName('');
      setStudentPrefix('');
      setStudentSuffix('');
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
        if (facultySections.length > 1) {
          showFeedback('Select a class section before removing a Student enrolled in multiple assigned classes.', 'info');
          return;
        }
        if (facultySections.length === 1) {
          csId = parseInt(facultySections[0].classId, 10);
        }
      }
    }

    if (!csId || isNaN(csId)) {
      showFeedback(`No assigned class section found to remove ${student.name} from.`, 'error');
      return;
    }

    const targetClass = classes.find(c => c.csId === csId);
    if (isHistoricalClass(targetClass)) {
      showFeedback('Past school-year classes are view-only. Students cannot be removed.', 'info');
      return;
    }
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

  // Handler: Import iBU Class List File - Externally Blocked (Batch X1)
  const handleImportIctoFile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsImportIctoOpen(false);
    showFeedback('Registrar/iBU roster import is externally blocked awaiting official University file layout specification (Batch X1). Automated parsing is disabled.', 'info');
  };

  // Handler: Send Email Invitation to Student
  const invitationClassId = (student: Student): string | null => {
    if (!/^\d+$/.test(student.id)) return null;
    const sections = student.classSections ?? [];
    const selected = sections.find(section => String(section.classId) === String(selectedClassFilterId));
    const target = selectedClassFilterId === 'all'
      ? sections.find(section => classes.some(c => String(c.csId) === String(section.classId) && !isHistoricalClass(c)))
      : selected;
    if (target && isHistoricalClass(classes.find(c => String(c.csId) === String(target.classId)))) return null;
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
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            {newSchoolYear ? `Current school year: ${newSchoolYear}. Past school-year classes are view-only.` : 'Current school year is unavailable. Class creation is disabled.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={handleOpenCreateClassModal}
            disabled={!newSchoolYear}
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

      {fetchError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button onClick={() => void fetchData()} className="px-3 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-bold text-xs">Retry</button>
        </div>
      )}

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
              {filteredClasses.length}
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
              {filteredStudents.length}
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
                  {availableClassFilterOptions.map(c => (
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
                  : (selectedSchoolYear !== 'all' && selectedSchoolYear !== newSchoolYear)
                    ? `Viewing past school year (S.Y. ${selectedSchoolYear}). Past school-year records are view-only. Class creation is only permitted for the current school year (S.Y. ${newSchoolYear}).`
                    : 'You do not have any class sections assigned for the selected criteria. Create a class section to get started.'}
              </p>
              {!searchQuery && (selectedSchoolYear === 'all' || selectedSchoolYear === newSchoolYear) && (
                <button
                  onClick={handleOpenCreateClassModal}
                  disabled={!newSchoolYear}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Class Section</span>
                </button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredClasses.map((cls) => {
                const historicalClass = isHistoricalClass(cls);
                return (
                <Card key={cls.id} className={`p-5 hover:shadow-md transition-all flex flex-col justify-between space-y-4 ${historicalClass ? 'border-slate-300/80 dark:border-slate-700' : ''}`}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 text-[10px] font-extrabold uppercase tracking-wider">
                        {cls.courseCode} &bull; Year {cls.yearLevel}
                      </span>
                      <div className="flex items-center gap-2">
                        {historicalClass && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-extrabold uppercase tracking-wider">View only</span>}
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
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-accent-500 flex-shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            {cls.lecRoom && (
                              <div>
                                <span className="font-bold text-slate-700 dark:text-slate-200">Lec:</span> {cls.lecRoom}
                              </div>
                            )}
                            {cls.labRoom && (
                              <div>
                                <span className="font-bold text-slate-700 dark:text-slate-200">{cls.labRoom.includes('(') ? 'Lab:' : 'Sched:'}</span> {cls.labRoom}
                              </div>
                            )}
                            {!cls.lecRoom && !cls.labRoom && <div>Venue / Schedule TBA</div>}
                          </div>
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
                        disabled={historicalClass}
                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        title={historicalClass ? 'Past school-year classes are view-only.' : 'Edit Class Section Details'}
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleOpenAddStudent(cls)}
                        disabled={historicalClass}
                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        title={historicalClass ? 'Past school-year classes are view-only.' : 'Add student to class roster'}
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
                );
              })}
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Student</span>
              </button>

              <button
                onClick={() => setIsImportRosterOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-bold transition-all cursor-pointer shadow-xs"
                title="Import student roster from registrar CSV or PDF file"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Students</span>
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
                              onClick={() => handleOpenEditStudent(st)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-600 hover:text-white text-blue-700 dark:text-blue-300 text-[11px] font-bold transition-all cursor-pointer"
                              title="Edit Student roster profile"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>

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
                  <option key={c.csId} value={c.csId} disabled={isHistoricalClass(c)}>{c.courseCode} - {c.courseName} ({c.block}){isHistoricalClass(c) ? ' - View only' : ''}</option>
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
              <button
                type="button"
                onClick={() => {
                  setIsAddStudentOpen(false);
                  setIsImportRosterOpen(true);
                }}
                className="py-2 px-4 font-bold border-b-2 border-transparent text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import File (CSV / PDF)</span>
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
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Prefix
                    <input value={studentPrefix} onChange={e => setStudentPrefix(e.target.value)} maxLength={50} placeholder="e.g. Ms."
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-xs" />
                  </label>
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

                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Suffix
                  <input value={studentSuffix} onChange={e => setStudentSuffix(e.target.value)} maxLength={50} placeholder="e.g. Jr., III"
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-xs" />
                </label>
                <div className="p-2.5 bg-slate-100 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span className="font-semibold text-slate-400">Composed Name Preview:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-100">
                    {composedStudentName || '—'}
                  </span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Official Bicol University Email</label>
                  <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="email"
                    required
                    value={studentEmailInput}
                    onChange={(e) => setStudentEmailInput(e.target.value)}
                    placeholder="username"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                  />
                  {!studentEmailInput.includes('@') && <span className="text-xs font-bold text-accent-600 whitespace-nowrap">@bicol-u.edu.ph</span>}
                  </div>
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
            {/* Academic School Year (Strictly current year only) */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-bold text-xs">
                  Academic Year: <span className="font-extrabold underline decoration-emerald-500">S.Y. {newSchoolYear || 'Loading...'}</span> (Current Active Year)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/70 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 whitespace-nowrap">
                Current Year Only
              </span>
            </div>

            {/* Course Code & Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Code *</label>
                <input
                  type="text"
                  required
                  list="course-catalog-codes"
                  value={newCourseCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setNewCourseCode(code);
                    const found = courses.find(c => c.courseCode.toLowerCase() === code.trim().toLowerCase());
                    if (found) {
                      setNewCourseId(found.id);
                      setNewCourseName(found.name);
                      setNewYearLevel(found.yearLevel);
                    }
                  }}
                  placeholder="e.g. DENT 301"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
                <datalist id="course-catalog-codes">
                  {courses.map(c => (
                    <option key={c.id} value={c.courseCode}>{c.name} ({c.units} Units, Year {c.yearLevel})</option>
                  ))}
                </datalist>
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
            </div>

            {/* Section / Block & Semester */}
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
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Semester *</label>
                <select
                  value={newSemester}
                  onChange={(e) => setNewSemester(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value="1st Semester">1st Semester</option>
                  <option value="2nd Semester">2nd Semester</option>
                  <option value="Summer">Summer</option>
                </select>
              </div>
            </div>

            {/* SESSION CONFIGURATION (CUSTOMIZABLE LECTURE / LAB & ROOM) */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                  Class Sessions & Rooms ({sessionSlots.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddSessionSlot}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Session
                </button>
              </div>

              {sessionSlots.map((slot, index) => (
                <div
                  key={slot.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-3.5"
                >
                  {/* Slot Header: Type Selector & Remove Button */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                        Session {index + 1}:
                      </span>
                      {/* Choose between Lecture or Laboratory */}
                      <div className="flex items-center bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => handleUpdateSlot(slot.id, { type: 'Lecture' })}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            slot.type === 'Lecture'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          Lecture
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateSlot(slot.id, { type: 'Laboratory' })}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                            slot.type === 'Laboratory'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          Laboratory
                        </button>
                      </div>
                    </div>

                    {sessionSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSessionSlot(slot.id)}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors cursor-pointer"
                        title="Remove this session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Choose Room Venue with RoomSelector */}
                  <RoomSelector
                    key={`${slot.id}-${slot.type}-room`}
                    id={`room-select-${slot.id}`}
                    label={`${slot.type} Room Venue *`}
                    value={slot.room}
                    onChange={(r) => handleUpdateSlot(slot.id, { room: r })}
                    placeholder={`Choose ${slot.type} Room`}
                  />

                  {/* Days Selection */}
                  <div>
                    <span className="font-semibold text-slate-600 dark:text-slate-400 block mb-1.5 text-[11px]">
                      {slot.type} Day(s) *
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {SCHEDULE_DAYS.map(day => {
                        const isDaySelected = slot.days.includes(day);
                        return (
                          <button
                            key={`${slot.id}-${day}`}
                            type="button"
                            onClick={() => {
                              const nextDays = isDaySelected
                                ? slot.days.filter(d => d !== day)
                                : [...slot.days, day];
                              handleUpdateSlot(slot.id, { days: nextDays });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              isDaySelected
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                      <span className="text-slate-400 font-semibold">Presets:</span>
                      {SCHEDULE_PRESETS.map(preset => (
                        <button
                          key={`${slot.id}-preset-${preset.label}`}
                          type="button"
                          onClick={() => handleUpdateSlot(slot.id, { days: preset.days })}
                          className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Start Time</span>
                      <select
                        value={slot.startTime}
                        onChange={(e) => handleUpdateSlot(slot.id, { startTime: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold cursor-pointer text-xs"
                      >
                        {SCHEDULE_TIME_SLOTS.map(t => (
                          <option key={`${slot.id}-start-${t}`} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">End Time</span>
                      <select
                        value={slot.endTime}
                        onChange={(e) => handleUpdateSlot(slot.id, { endTime: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold cursor-pointer text-xs"
                      >
                        {SCHEDULE_TIME_SLOTS.map(t => (
                          <option key={`${slot.id}-end-${t}`} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Generated Schedule Preview */}
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Class Schedule Preview</span>
              {sessionSlots.map((slot) => (
                <div key={`prev-${slot.id}`} className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                    slot.type === 'Lecture'
                      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  }`}>
                    {slot.type}
                  </span>
                  <span>
                    {slot.room || 'Venue TBA'} &bull; {slot.days.length > 0 ? `${slot.days.join('/')} ${slot.startTime} - ${slot.endTime}` : 'No days selected'}
                  </span>
                </div>
              ))}
            </div>

            {/* Conflict Error Banner */}
            {scheduleConflict && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs font-semibold flex items-start gap-2.5 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{scheduleConflict}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateClassOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmittingClass ||
                  !newSchoolYear ||
                  !!scheduleConflict ||
                  !newCourseCode.trim() ||
                  !newCourseName.trim() ||
                  !newBlock.trim() ||
                  sessionSlots.some(s => !s.room.trim() || s.days.length === 0)
                }
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                {isSubmittingClass ? 'Saving...' : 'Save Class Section'}
              </button>
            </div>
          </form>
        </Modal>
      )}



      {/* Modal: Edit Student roster profile */}
      {editingStudent && (
        <Modal
          isOpen={!!editingStudent}
          onClose={() => {
            setEditingStudent(null);
            setEditStudentError(null);
          }}
          title={`Edit Student: ${editingStudent.studentId}`}
        >
          <form onSubmit={handleUpdateStudent} className="space-y-4 text-xs">
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Update the canonical roster profile. Student number and class membership stay protected by the server.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 font-bold text-slate-700 dark:text-slate-300">
                Prefix
                <input value={editStudentPrefix} onChange={e => setEditStudentPrefix(e.target.value)} maxLength={50}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900" />
              </label>
              <label className="space-y-1 font-bold text-slate-700 dark:text-slate-300">
                Suffix
                <input value={editStudentSuffix} onChange={e => setEditStudentSuffix(e.target.value)} maxLength={50}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900" />
              </label>
              <label className="space-y-1 font-bold text-slate-700 dark:text-slate-300">
                First name *
                <input
                  required
                  value={editStudentFirstName}
                  onChange={event => setEditStudentFirstName(event.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </label>
              <label className="space-y-1 font-bold text-slate-700 dark:text-slate-300">
                Last name *
                <input
                  required
                  value={editStudentLastName}
                  onChange={event => setEditStudentLastName(event.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </label>
              <label className="space-y-1 font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                Middle name
                <input
                  value={editStudentMiddleName}
                  onChange={event => setEditStudentMiddleName(event.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </label>
              <label className="space-y-1 font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                Institutional email *
                <span className="flex items-center gap-2">
                <input
                  required
                  type="text"
                  inputMode="email"
                  value={editStudentEmail}
                  onChange={event => setEditStudentEmail(event.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
                {!editStudentEmail.includes('@') && <span className="text-xs font-bold text-accent-600 whitespace-nowrap">@bicol-u.edu.ph</span>}
                </span>
              </label>
              <label className="space-y-1 font-bold text-slate-700 dark:text-slate-300">
                Year level *
                <select
                  value={editStudentYearLevel}
                  onChange={event => setEditStudentYearLevel(Number(event.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                </select>
              </label>
            </div>

            {editStudentError && (
              <div role="alert" className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-300 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{editStudentError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingStudent(null);
                  setEditStudentError(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingStudent}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                {isUpdatingStudent ? 'Saving Student...' : 'Save Student'}
              </button>
            </div>
          </form>
        </Modal>
      )}

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

            {/* Room Venues */}
            <div className="grid grid-cols-2 gap-3">
              <RoomSelector
                id="edit-lec-room"
                label="Lecture Room Venue"
                value={editLecRoom}
                onChange={(r) => {
                  setEditLecRoom(r);
                  setEditError(null);
                }}
                placeholder="Choose Lecture Room"
              />

              <RoomSelector
                id="edit-lab-room"
                label="Laboratory Room Venue"
                value={editLabRoom}
                onChange={(r) => {
                  setEditLabRoom(r);
                  setEditError(null);
                }}
                placeholder="Choose Laboratory Room"
              />
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

      {/* Modal: Import iBU Class List File - Blocked (Batch X1) */}
      {isImportIctoOpen && (
        <Modal isOpen={isImportIctoOpen} onClose={() => setIsImportIctoOpen(false)} title="Import iBU Class Roster File (Batch X1 Blocked)">
          <form onSubmit={handleImportIctoFile} className="space-y-4 text-xs">
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-amber-800 dark:text-amber-200 space-y-1.5">
              <span className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-100">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Registrar/iBU Import Blocked (Batch X1)
              </span>
              <p className="text-amber-700 dark:text-amber-300 leading-relaxed">
                Automated roster import is externally blocked awaiting official University / Registrar file layout specification (exact headers, Student identifier format, course/section columns, and encoding). Browser-only file parsing is disabled to protect database integrity.
              </p>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">Select PDF or CSV File</label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-5 text-center bg-slate-50/50 dark:bg-slate-900/50">
                <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                <span className="font-bold text-slate-600 dark:text-slate-400 block text-xs">
                  Official roster file upload is pending format specification
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5 mb-2">
                  Awaiting Registrar format guidelines
                </span>
                <input
                  type="file"
                  accept=".pdf, .csv, .txt"
                  disabled
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsImportIctoOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Close
              </button>
              <button
                type="submit"
                disabled
                className="px-5 py-2 rounded-xl bg-slate-300 dark:bg-slate-700 text-slate-500 font-bold cursor-not-allowed"
                title="Awaiting University/Registrar file specification (Batch X1)"
              >
                Import Blocked (Pending Registrar Layout)
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Import Student Roster from Registrar (CSV or PDF) */}
      {isImportRosterOpen && (
        <RosterImportModal
          isOpen={isImportRosterOpen}
          onClose={() => setIsImportRosterOpen(false)}
          classes={classes}
          defaultClassId={selectedClassFilterId !== 'all' ? Number(selectedClassFilterId) : (classes.find(c => !isHistoricalClass(c))?.csId || 0)}
          existingStudentIds={new Set(studentsList.map(s => s.studentId))}
          onSuccess={fetchData}
        />
      )}

    </div>
  );
};
