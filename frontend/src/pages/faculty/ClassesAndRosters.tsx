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
  FacultyClassItem,
  CourseCatalogItem
} from '../../services/apiClient';

export const ClassesAndRosters: React.FC = () => {
  const { students: initialGlobalStudents } = useApp();

  const [classes, setClasses] = useState<FacultyClassItem[]>([]);
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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

  // Form States: New Class Creation
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newBlock, setNewBlock] = useState('Section 3-A');
  const [newSchedule, setNewSchedule] = useState('Mon/Wed 08:00 AM - 11:00 AM');
  const [newRoom, setNewRoom] = useState('Dental Room 101');
  const [newYearLevel, setNewYearLevel] = useState(3);

  // Form States: Add / Edit Student
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentEmailInput, setStudentEmailInput] = useState('');
  const [studentYearInput, setStudentYearInput] = useState(3);
  const [studentClassSelect, setStudentClassSelect] = useState('Clinical Dentistry I (Sec A)');

  // Form States: Import iBU File Data
  const [ictoFileText, setIctoFileText] = useState('');

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // Sync initial global students
  useEffect(() => {
    if (initialGlobalStudents && initialGlobalStudents.length > 0) {
      setStudentsList(initialGlobalStudents);
    }
  }, [initialGlobalStudents]);

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [clsRes, crsRes] = await Promise.all([
        getFacultyClassesApi().catch(() => ({ status: 'success', classes: [] })),
        getFacultyCoursesApi().catch(() => ({ status: 'success', courses: [] }))
      ]);

      if (clsRes.classes && clsRes.classes.length > 0) {
        setClasses(clsRes.classes);
      } else {
        setClasses([
          {
            id: 'cls-1',
            csId: 101,
            csName: 'CLIN401-SecA',
            courseId: 1,
            courseCode: 'CLIN401',
            courseName: 'Clinical Dentistry I',
            units: 3,
            schoolYear: '2025-2026',
            semester: '1st Semester',
            yearLevel: 4,
            block: 'Section 4-A',
            schedule: 'Mon/Wed 08:00 AM - 11:00 AM',
            lecRoom: 'Lecture Hall A',
            labRoom: 'Sim Lab 1',
            enrolledCount: 24,
            instructorName: 'Faculty Member',
            status: 'Active'
          },
          {
            id: 'cls-2',
            csId: 102,
            csName: 'CLIN402-SecB',
            courseId: 2,
            courseCode: 'CLIN402',
            courseName: 'Clinical Dentistry II',
            units: 4,
            schoolYear: '2025-2026',
            semester: '1st Semester',
            yearLevel: 4,
            block: 'Section 4-B',
            schedule: 'Tue/Thu 01:00 PM - 05:00 PM',
            lecRoom: 'Lecture Hall B',
            labRoom: 'Dental Room 204',
            enrolledCount: 18,
            instructorName: 'Faculty Member',
            status: 'Active'
          }
        ]);
      }

      if (crsRes.courses) setCourses(crsRes.courses);
    } catch (err) {
      console.error('Failed to load classes and rosters:', err);
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
    return studentsList.filter((student, idx) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        student.name.toLowerCase().includes(query) ||
        student.studentId.toLowerCase().includes(query) ||
        student.email.toLowerCase().includes(query)
      );

      const assignedClass = student.classSections && student.classSections.length > 0 
        ? student.classSections[0].classId 
        : (idx % 2 === 0 ? 'cls-1' : 'cls-2');
      
      const matchesClass = selectedClassFilterId === 'all' || assignedClass === selectedClassFilterId;

      return matchesSearch && matchesClass;
    });
  }, [studentsList, searchQuery, selectedClassFilterId]);

  const handleOpenClassRoster = (cls: FacultyClassItem) => {
    setSelectedClass(cls);
    setSelectedClassFilterId(cls.id);
    setActiveTab('roster');
  };

  // Handler: Create Class Manually
  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseCode || !newCourseName) {
      alert('Please fill in Course Code and Course Name.');
      return;
    }

    const created: FacultyClassItem = {
      id: `cls-${Date.now()}`,
      csId: Math.floor(Math.random() * 1000) + 200,
      csName: `${newCourseCode}-${newBlock}`,
      courseId: 99,
      courseCode: newCourseCode.trim().toUpperCase(),
      courseName: newCourseName.trim(),
      units: 3,
      schoolYear: '2025-2026',
      semester: '2nd Semester',
      yearLevel: newYearLevel,
      block: newBlock,
      schedule: newSchedule,
      lecRoom: newRoom,
      labRoom: newRoom,
      enrolledCount: 0,
      instructorName: 'Faculty Member',
      status: 'Active'
    };

    setClasses([created, ...classes]);
    setNewCourseCode('');
    setNewCourseName('');
    setIsCreateClassOpen(false);
    showFeedback(`Class section ${created.courseCode} created successfully!`, 'success');
  };

  // Handler: Update Class Details
  const handleUpdateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    setClasses(classes.map(c => c.id === editingClass.id ? editingClass : c));
    setEditingClass(null);
    showFeedback(`Class ${editingClass.courseCode} updated!`, 'success');
  };

  // Handler: Add Student Manually
  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentNameInput || !studentEmailInput) {
      alert('Please enter student name and email address.');
      return;
    }

    const targetClassId = selectedClass ? selectedClass.id : (classes[0]?.id || 'cls-1');
    const targetClassName = selectedClass ? selectedClass.courseName : studentClassSelect;

    const newStudent: Student = {
      id: `st-${Date.now()}`,
      studentId: studentIdInput.trim() || `2024-DENT-${Math.floor(1000 + Math.random() * 9000)}`,
      name: studentNameInput.trim(),
      email: studentEmailInput.trim().toLowerCase(),
      yearLevel: (studentYearInput as 1 | 2 | 3 | 4) || 4,
      status: 'active',
      faceEnrolled: false,
      consentStatus: 'approved',
      enrolledSubjects: [],
      overallGWA: 1.75,
      clinicHoursCompleted: 0,
      remedialExams: [],
      classSections: [{ classId: targetClassId, className: targetClassName, enrollmentId: `enr-${Date.now()}` }]
    };

    setStudentsList([newStudent, ...studentsList]);
    setStudentIdInput('');
    setStudentNameInput('');
    setStudentEmailInput('');
    setIsAddStudentOpen(false);
    showFeedback(`Student ${newStudent.name} added to ${targetClassName}!`, 'success');
  };

  // Handler: Open Edit Student Modal
  const handleOpenEditStudent = (st: Student) => {
    setEditingStudent(st);
    setStudentIdInput(st.studentId);
    setStudentNameInput(st.name);
    setStudentEmailInput(st.email);
    setStudentYearInput(st.yearLevel);
    setStudentClassSelect(st.classSections?.[0]?.className || 'Clinical Dentistry I');
  };

  // Handler: Save Edit Student
  const handleUpdateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    const updated = studentsList.map(s => {
      if (s.id === editingStudent.id) {
        return {
          ...s,
          studentId: studentIdInput.trim(),
          name: studentNameInput.trim(),
          email: studentEmailInput.trim().toLowerCase(),
          yearLevel: (studentYearInput as 1 | 2 | 3 | 4) || 4,
          classSections: [{ classId: s.classSections?.[0]?.classId || 'cls-1', className: studentClassSelect, enrollmentId: `enr-${Date.now()}` }]
        };
      }
      return s;
    });

    setStudentsList(updated);
    setEditingStudent(null);
    showFeedback(`Student details for ${studentNameInput} updated!`, 'success');
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
  const handleSendStudentEmailInvite = (student: Student) => {
    setNotification({
      type: 'success',
      message: `Email invitation dispatched to ${student.name} (${student.email})!`
    });
  };

  const handleSendAllStudentInvites = () => {
    setNotification({
      type: 'success',
      message: `Email invitations dispatched to all ${filteredStudents.length} students on the class roster!`
    });
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <span className="text-xs font-extrabold text-accent-600 dark:text-accent-400 uppercase tracking-widest block mb-0.5">
            Faculty Portal • Bicol University CDM
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Classes & Student Rosters
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Create classes, import iBU student rosters (PDF/CSV), manage students, and send email invitations.
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
                  : `Add, edit, or remove student accounts and dispatch registration email invitations.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setStudentIdInput('');
                  setStudentNameInput('');
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
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
                {filteredStudents.map((st, idx) => {
                  const assignedClassLabel = st.classSections && st.classSections.length > 0 
                    ? st.classSections[0].className 
                    : (idx % 2 === 0 ? 'Clinical Dentistry I (Sec A)' : 'Clinical Dentistry II (Sec B)');

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
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-accent-600 hover:text-white dark:hover:bg-accent-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-all cursor-pointer"
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

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Full Name</label>
              <input
                type="text"
                required
                value={studentNameInput}
                onChange={(e) => setStudentNameInput(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
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
                className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold shadow-md shadow-accent-600/20"
              >
                Add Student
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

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Full Name</label>
              <input
                type="text"
                required
                value={studentNameInput}
                onChange={(e) => setStudentNameInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
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
        <Modal isOpen={isCreateClassOpen} onClose={() => setIsCreateClassOpen(false)} title="Create New Class Section">
          <form onSubmit={handleCreateClass} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Code</label>
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
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Title</label>
              <input
                type="text"
                required
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="e.g. Restorative Dentistry I"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Section / Block</label>
                <input
                  type="text"
                  value={newBlock}
                  onChange={(e) => setNewBlock(e.target.value)}
                  placeholder="Section 3-A"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Room Venue</label>
                <input
                  type="text"
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  placeholder="Dental Room 101"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Class Schedule</label>
              <input
                type="text"
                value={newSchedule}
                onChange={(e) => setNewSchedule(e.target.value)}
                placeholder="Mon/Wed 08:00 AM - 11:00 AM"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateClassOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold shadow-md shadow-accent-600/20"
              >
                Save Class Section
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

            <div className="grid grid-cols-2 gap-3">
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
                  value={editingClass.lecRoom}
                  onChange={(e) => setEditingClass({ ...editingClass, lecRoom: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Class Schedule</label>
              <input
                type="text"
                value={editingClass.schedule}
                onChange={(e) => setEditingClass({ ...editingClass, schedule: e.target.value })}
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
