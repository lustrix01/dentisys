import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Filter, 
  Users, 
  Calendar, 
  MapPin, 
  ChevronRight, 
  ArrowLeft, 
  UserPlus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  GraduationCap,
  Sparkles,
  Building2,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { showFeedback } from '../../components/FeedbackCenter';
import { 
  getFacultyClassesApi, 
  getFacultyCoursesApi, 
  createFacultyClassApi, 
  getAvailableStudentsForClassApi, 
  enrollStudentsInClassApi, 
  unenrollStudentFromClassApi,
  FacultyClassItem,
  CourseCatalogItem
} from '../../services/apiClient';

export const ClassManagement: React.FC = () => {
  const { students: globalStudents } = useApp();

  const [classes, setClasses] = useState<FacultyClassItem[]>([]);
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters & Search for Classes list
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('all');
  const [selectedSemesterFilter, setSelectedSemesterFilter] = useState<string>('all');

  // Selected Class View state
  const [selectedClass, setSelectedClass] = useState<FacultyClassItem | null>(null);
  const [studentSearch, setStudentSearch] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [studentToRemove, setStudentToRemove] = useState<{ id: number; name: string } | null>(null);

  // Create Class Form state
  const [formData, setFormData] = useState({
    courseId: 0,
    csName: '',
    schoolYear: '2024-2025',
    semester: '1ST',
    yearLevel: 4,
    block: 'A',
    lecRoom: '',
    labRoom: '',
  });
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Available students for Add Students modal
  const [availableStudents, setAvailableStudents] = useState<Array<{
    id: string;
    studentId: string;
    name: string;
    email: string;
    yearLevel: number;
    status: string;
  }>>([]);
  const [availSearch, setAvailSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [enrollingSubmitting, setEnrollingSubmitting] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const fetchClassesAndCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const [classRes, courseRes] = await Promise.all([
        getFacultyClassesApi(),
        getFacultyCoursesApi(),
      ]);

      if (Array.isArray(classRes.classes)) {
        setClasses(classRes.classes);
      }
      if (Array.isArray(courseRes.courses)) {
        setCourses(courseRes.courses);
        if (courseRes.courses.length > 0 && formData.courseId === 0) {
          setFormData(prev => ({
            ...prev,
            courseId: courseRes.courses[0].id,
            csName: `${courseRes.courses[0].courseCode}-A`,
            yearLevel: courseRes.courses[0].yearLevel,
          }));
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch class management data', err);
      setError('Unable to load classes from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchClassesAndCourses();
  }, []);

  // Open Add Student Modal
  const handleOpenAddStudentModal = async () => {
    if (!selectedClass) return;
    setIsAddStudentModalOpen(true);
    setLoadingAvailable(true);
    setSelectedStudentIds([]);
    setAvailSearch('');
    try {
      const res = await getAvailableStudentsForClassApi(selectedClass.csId);
      if (Array.isArray(res.students)) {
        setAvailableStudents(res.students);
      }
    } catch (err) {
      console.error('Failed to fetch available students', err);
    } finally {
      setLoadingAvailable(false);
    }
  };

  // Create Class submit
  const handleCreateClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.courseId <= 0 || !formData.csName.trim()) {
      showFeedback('Please fill in all required fields.', 'error');
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await createFacultyClassApi({
        csName: formData.csName.trim(),
        courseId: formData.courseId,
        semester: formData.semester,
        schoolYear: formData.schoolYear,
        yearLevel: formData.yearLevel,
        block: formData.block,
        lecRoom: formData.lecRoom,
        labRoom: formData.labRoom,
      });

      showNotification(res.message || 'Class section created successfully!');
      setIsCreateModalOpen(false);
      fetchClassesAndCourses();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to create class section.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Enroll Students submit
  const handleEnrollSubmit = async () => {
    if (!selectedClass || selectedStudentIds.length === 0) return;
    setEnrollingSubmitting(true);
    try {
      const res = await enrollStudentsInClassApi({
        csId: selectedClass.csId,
        studentIds: selectedStudentIds,
      });

      showNotification(res.message || `Successfully enrolled ${selectedStudentIds.length} student(s).`);
      setIsAddStudentModalOpen(false);
      
      // Update local class count and refresh class list
      setSelectedClass(prev => prev ? { ...prev, enrolledCount: prev.enrolledCount + selectedStudentIds.length } : null);
      fetchClassesAndCourses();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to enroll students.', 'error');
    } finally {
      setEnrollingSubmitting(false);
    }
  };

  // Unenroll Student submit
  const handleUnenrollConfirm = async () => {
    if (!selectedClass || !studentToRemove) return;
    try {
      const res = await unenrollStudentFromClassApi({
        csId: selectedClass.csId,
        studentId: studentToRemove.id,
      });

      showNotification(res.message || 'Student removed from class.');
      setStudentToRemove(null);

      setSelectedClass(prev => prev ? { ...prev, enrolledCount: Math.max(0, prev.enrolledCount - 1) } : null);
      fetchClassesAndCourses();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to remove student from class.', 'error');
    }
  };

  // Filtered Classes list
  const filteredClasses = classes.filter(cls => {
    const matchesSearch = 
      cls.csName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.courseName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesYear = selectedYearFilter === 'all' || cls.yearLevel.toString() === selectedYearFilter;
    const matchesSem = selectedSemesterFilter === 'all' || cls.semester === selectedSemesterFilter;
    return matchesSearch && matchesYear && matchesSem;
  });

  // Enrolled students for selected class
  const enrolledStudentsForSelectedClass = globalStudents.filter(s => {
    if (!selectedClass) return false;
    return s.classSections?.some(section => section.classId === String(selectedClass.csId))
      || s.enrolledSubjects.some(subject => subject.classId === String(selectedClass.csId));
  });

  const filteredEnrolledStudents = enrolledStudentsForSelectedClass.filter(s => {
    return (
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
    );
  });

  // Available students filtered by search in modal
  const filteredAvailableStudents = availableStudents.filter(s => {
    return (
      s.name.toLowerCase().includes(availSearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(availSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(availSearch.toLowerCase())
    );
  });

  const toggleSelectAllStudents = () => {
    if (selectedStudentIds.length === filteredAvailableStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredAvailableStudents.map(s => parseInt(s.id, 10)));
    }
  };

  const toggleStudentSelection = (id: number) => {
    if (selectedStudentIds.includes(id)) {
      setSelectedStudentIds(selectedStudentIds.filter(item => item !== id));
    } else {
      setSelectedStudentIds([...selectedStudentIds, id]);
    }
  };

  return (
    <div className="space-y-6 text-slate-800 dark:text-slate-100">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-xl animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-200" />
          <span className="font-semibold text-xs tracking-wide">{successToast}</span>
        </div>
      )}

      {/* Navigation Breadcrumb / Top Header */}
      {selectedClass ? (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedClass(null)}
            className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 font-bold text-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to All Classes
          </button>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Class Management &bull; {selectedClass.csName}</span>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <BookOpen className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              Class Management
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Manage assigned clinical and academic sections, class offerings, and student enrollments.
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Class
          </button>
        </div>
      )}

      {/* ERROR ALERT */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 p-4 rounded-xl flex items-center gap-3 text-rose-700 dark:text-rose-300 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* VIEW A: CLASSES LIST GRID */}
      {/* ------------------------------------------------------------------ */}
      {!selectedClass && (
        <div className="space-y-5">
          {/* Search & Filter Toolbar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search class name, course, code..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <select
                  value={selectedYearFilter}
                  onChange={e => setSelectedYearFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">All Year Levels</option>
                  <option value="1">Year 1</option>
                  <option value="2">Year 2</option>
                  <option value="3">Year 3</option>
                  <option value="4">Year 4 (Clinicians)</option>
                </select>
              </div>

              <select
                value={selectedSemesterFilter}
                onChange={e => setSelectedSemesterFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-medium px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Semesters</option>
                <option value="1ST">1st Semester</option>
                <option value="2ND">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </div>
          </div>

          {/* Classes Cards Grid */}
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
              <Sparkles className="w-6 h-6 animate-spin text-emerald-600" />
              <span>Loading class offerings from database...</span>
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
              <GraduationCap className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No classes found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No active class sections match your current search or filters. Click "Create Class" to add a new section.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredClasses.map(cls => (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClass(cls)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    {/* Header tags */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-extrabold px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 tracking-wider uppercase">
                        {cls.courseCode} &bull; Block {cls.block}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        Year {cls.yearLevel} &bull; {cls.semester}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                      {cls.csName}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium line-clamp-1">
                      {cls.courseName}
                    </p>

                    {/* Room & Units details */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-700 dark:text-slate-300 font-medium">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="truncate">{cls.schedule}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span>SY {cls.schoolYear} ({cls.units} Units)</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{cls.enrolledCount} Students Enrolled</span>
                    </div>
                    <span className="inline-flex items-center text-xs font-bold text-emerald-700 dark:text-emerald-400 group-hover:translate-x-1 transition-transform">
                      View <ChevronRight className="w-4 h-4 ml-0.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* VIEW B: CLASS DETAILS & STUDENTS TAB */}
      {/* ------------------------------------------------------------------ */}
      {selectedClass && (
        <div className="space-y-6">
          {/* Class Information Banner - Dark Solid Navy Card for High Contrast */}
          <div className="bg-slate-900 dark:bg-slate-950 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden border border-slate-800">
            <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-10 -translate-y-10">
              <GraduationCap className="w-72 h-72 text-white" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="bg-emerald-500 text-slate-950 text-[11px] font-extrabold px-3 py-1 rounded-md tracking-wider uppercase shadow-xs">
                    {selectedClass.courseCode} &bull; Block {selectedClass.block}
                  </span>
                  <span className="text-xs font-bold text-emerald-300">
                    {selectedClass.semester} Term &bull; SY {selectedClass.schoolYear}
                  </span>
                </div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight">{selectedClass.csName}</h2>
                <p className="text-sm font-semibold text-emerald-100 mt-1">{selectedClass.courseName} ({selectedClass.units} Units)</p>

                <div className="flex flex-wrap items-center gap-4 mt-4 text-xs font-medium text-slate-200">
                  <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    {selectedClass.schedule}
                  </span>
                  <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    Instructor: {selectedClass.instructorName}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="bg-slate-800/90 border border-slate-700 px-5 py-3 rounded-xl text-center">
                  <span className="block text-2xl font-extrabold text-white">{selectedClass.enrolledCount}</span>
                  <span className="text-[10px] uppercase font-bold text-emerald-300">Enrolled Students</span>
                </div>
                <button
                  onClick={handleOpenAddStudentModal}
                  className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold px-5 py-3 rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  <UserPlus className="w-4.5 h-4.5" />
                  Add Students
                </button>
              </div>
            </div>
          </div>

          {/* Students Directory Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Enrolled Students Directory ({enrolledStudentsForSelectedClass.length})</span>
              </div>

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student number or name..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="p-0">
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 uppercase font-bold text-[11px] tracking-wider sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-5 py-3.5">Student Number</th>
                      <th className="px-5 py-3.5">Full Name</th>
                      <th className="px-5 py-3.5">Year Level</th>
                      <th className="px-5 py-3.5">Academic Status</th>
                      <th className="px-5 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredEnrolledStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500 font-medium text-xs">
                          No enrolled students found in this class section. Click "Add Students" to enroll students.
                        </td>
                      </tr>
                    ) : (
                      filteredEnrolledStudents.map(student => (
                        <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                          <td className="px-5 py-4 font-extrabold font-mono text-emerald-700 dark:text-emerald-400 text-xs">
                            {student.studentId}
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-900 dark:text-white text-xs">
                            {student.name}
                            <span className="block text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">{student.email}</span>
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-700 dark:text-slate-300">
                            Year Level {student.yearLevel}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold capitalize border ${
                              (student.status as string) === 'active' || (student.status as string) === 'good standing' ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' :
                              (student.status as string) === 'warning' ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' :
                              'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                            }`}>
                              {student.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => setStudentToRemove({ id: parseInt(student.id, 10), name: student.name })}
                              className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer font-bold inline-flex items-center gap-1"
                              title="Remove from class"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span className="hidden sm:inline text-xs">Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 1: CREATE CLASS MODAL */}
      {/* ------------------------------------------------------------------ */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-900 dark:text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Create New Class Section
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClassSubmit} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block font-bold text-slate-900 dark:text-white mb-1">Select Course / Subject *</label>
                <select
                  value={formData.courseId}
                  onChange={e => {
                    const cId = parseInt(e.target.value, 10);
                    const selectedC = courses.find(c => c.id === cId);
                    setFormData(prev => ({
                      ...prev,
                      courseId: cId,
                      csName: selectedC ? `${selectedC.courseCode}-A` : prev.csName,
                      yearLevel: selectedC ? selectedC.yearLevel : prev.yearLevel,
                    }));
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.courseCode} &bull; {c.name} ({c.units} Units)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-900 dark:text-white mb-1">Section Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. CLINIC-4C"
                    value={formData.csName}
                    onChange={e => setFormData({ ...formData, csName: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-900 dark:text-white mb-1">Block *</label>
                  <input
                    type="text"
                    placeholder="e.g. A, B, C"
                    value={formData.block}
                    onChange={e => setFormData({ ...formData, block: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-900 dark:text-white mb-1">Academic Year</label>
                  <input
                    type="text"
                    value={formData.schoolYear}
                    onChange={e => setFormData({ ...formData, schoolYear: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-900 dark:text-white mb-1">Semester</label>
                  <select
                    value={formData.semester}
                    onChange={e => setFormData({ ...formData, semester: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="1ST">1st Semester</option>
                    <option value="2ND">2nd Semester</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-900 dark:text-white mb-1">Year Level</label>
                  <select
                    value={formData.yearLevel}
                    onChange={e => setFormData({ ...formData, yearLevel: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
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
                  <label className="block font-bold text-slate-900 dark:text-white mb-1">Lecture Room / Schedule</label>
                  <input
                    type="text"
                    placeholder="e.g. Lecture Hall A"
                    value={formData.lecRoom}
                    onChange={e => setFormData({ ...formData, lecRoom: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-900 dark:text-white mb-1">Laboratory Room</label>
                  <input
                    type="text"
                    placeholder="e.g. Dental Clinic Lab 1"
                    value={formData.labRoom}
                    onChange={e => setFormData({ ...formData, labRoom: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving...' : 'Save Class Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 2: ADD STUDENTS MODAL */}
      {/* ------------------------------------------------------------------ */}
      {isAddStudentModalOpen && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 text-slate-900 dark:text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Add Students to {selectedClass.csName}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Select unenrolled students from the university directory.</p>
              </div>
              <button onClick={() => setIsAddStudentModalOpen(false)} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search student number or name..."
                value={availSearch}
                onChange={e => setAvailSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Students Table */}
            <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              {loadingAvailable ? (
                <div className="py-12 text-center text-slate-500 text-xs font-semibold">Loading available students...</div>
              ) : filteredAvailableStudents.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs font-semibold">
                  No available unenrolled students found.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold uppercase text-[11px] sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.length === filteredAvailableStudents.length && filteredAvailableStudents.length > 0}
                          onChange={toggleSelectAllStudents}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                      </th>
                      <th className="px-4 py-3">Student Number</th>
                      <th className="px-4 py-3">Full Name</th>
                      <th className="px-4 py-3">Year Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredAvailableStudents.map(student => {
                      const idNum = parseInt(student.id, 10);
                      const isSelected = selectedStudentIds.includes(idNum);
                      return (
                        <tr
                          key={student.id}
                          onClick={() => toggleStudentSelection(idNum)}
                          className={`hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50 dark:bg-emerald-950/60' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleStudentSelection(idNum)}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                            {student.studentId}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                            {student.name}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                            Year Level {student.yearLevel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {selectedStudentIds.length} student(s) selected
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddStudentModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEnrollSubmit}
                  disabled={selectedStudentIds.length === 0 || enrollingSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md text-xs cursor-pointer disabled:opacity-50"
                >
                  {enrollingSubmitting ? 'Enrolling...' : `Enroll Selected (${selectedStudentIds.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL 3: UNENROLL CONFIRMATION MODAL */}
      {/* ------------------------------------------------------------------ */}
      {studentToRemove && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Confirm Removal</h3>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              Are you sure you want to remove <strong className="text-slate-900 dark:text-white">{studentToRemove.name}</strong> from section <strong className="text-emerald-700 dark:text-emerald-400">{selectedClass.csName}</strong>?
            </p>

            <div className="pt-2 flex justify-end gap-2 text-xs">
              <button
                onClick={() => setStudentToRemove(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleUnenrollConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
