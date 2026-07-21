import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  GraduationCap, 
  Mail, 
  BookOpen, 
  Clock, 
  AlertTriangle,
  Camera,
  UserCheck,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Student, EnrolledSubject } from '../../types';
import { Card } from '../../components/Card';
import { getAssignedClasses, getClassStudents, getBiometricProfiles, updateBiometricConsent } from '../../services/facultyService';

const getDefaultSubjectsForYear = (year: 1 | 2 | 3 | 4): EnrolledSubject[] => {
  const defaultComponents = { quizzes: 80, exams: 80, practicum: 80, attendance: 80 };
  switch(year) {
    case 1:
      return [
        { code: 'ODON101', name: 'Oral Anatomy', units: 3, isClinical: false, components: { ...defaultComponents }, grade: 2.5, hasRemedial: false },
        { code: 'BIO102', name: 'Dental Biochemistry', units: 3, isClinical: false, components: { ...defaultComponents }, grade: 2.5, hasRemedial: false }
      ];
    case 2:
      return [
        { code: 'ODON202', name: 'Oral Histology & Embryology', units: 4, isClinical: false, components: { ...defaultComponents }, grade: 2.5, hasRemedial: false },
        { code: 'ANAT101', name: 'Head & Neck Anatomy', units: 4, isClinical: false, components: { ...defaultComponents }, grade: 2.5, hasRemedial: false }
      ];
    case 3:
      return [
        { code: 'CLIN301', name: 'Endodontics I Clinic', units: 3, isClinical: true, components: { ...defaultComponents }, grade: 2.5, hasRemedial: false },
        { code: 'CLIN302', name: 'Prosthodontics Clinic I', units: 4, isClinical: true, components: { ...defaultComponents }, grade: 2.5, hasRemedial: false }
      ];
    case 4:
      return [
        { code: 'CLIN401', name: 'Clinical Dentistry I (Endodontics focus)', units: 6, isClinical: true, components: { ...defaultComponents }, grade: 2.5, hasRemedial: false },
        { code: 'CLIN402', name: 'Restorative Dentistry Clinic', units: 4, isClinical: true, components: { ...defaultComponents }, grade: 2.5, hasRemedial: false }
      ];
  }
};

export const StudentManagement: React.FC = () => {
  const { students, addStudent, updateStudent, deleteStudent } = useApp();
  
  // Active sub-tab under Left Pane
  const [activeTab, setActiveTab] = useState<'list' | 'enroll' | 'facial'>('list');

  const [assignedClasses, setAssignedClasses] = useState<Array<{ cs_id: number; cs_name: string }>>([]);
  const [selectedCsId, setSelectedCsId] = useState<number>(0);
  const [loadingApi, setLoadingApi] = useState<boolean>(false);

  useEffect(() => {
    getAssignedClasses()
      .then(res => {
        if (res.success && res.classes.length > 0) {
          setAssignedClasses(res.classes);
          setSelectedCsId(res.classes[0].cs_id);
        }
      })
      .catch(err => {
        console.warn('Backend API assigned classes check:', err);
      });
  }, []);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [faceFilter, setFaceFilter] = useState<string>('all');

  // Selected student for Profile display (default to first student)
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStudentId, setFormStudentId] = useState('');
  const [formYearLevel, setFormYearLevel] = useState<'1' | '2' | '3' | '4'>('1');
  const [formClinicHours, setFormClinicHours] = useState('0');

  // Facial Simulator State
  const [facialStudentId, setFacialStudentId] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  // Sync selectedStudentId when students list changes
  useEffect(() => {
    if (students.length > 0 && !selectedStudentId) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  const selectedStudent = students.find(s => s.id === selectedStudentId) || students[0];

  // Filtering students
  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(search.toLowerCase()) || 
                          student.studentId.toLowerCase().includes(search.toLowerCase()) ||
                          student.email.toLowerCase().includes(search.toLowerCase());
    const matchesYear = yearFilter === 'all' ? true : student.yearLevel === parseInt(yearFilter);
    const matchesStatus = statusFilter === 'all' ? true : student.status === statusFilter;
    const matchesFace = faceFilter === 'all' ? true : (faceFilter === 'enrolled' ? student.faceEnrolled : !student.faceEnrolled);

    return matchesSearch && matchesYear && matchesStatus && matchesFace;
  });

  const handleEnrollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const yearNum = parseInt(formYearLevel) as 1 | 2 | 3 | 4;
    addStudent({
      name: formName,
      email: formEmail,
      studentId: formStudentId,
      yearLevel: yearNum,
      clinicHoursCompleted: parseInt(formClinicHours) || 0,
      enrolledSubjects: getDefaultSubjectsForYear(yearNum),
    });
    // Reset Form
    setFormName('');
    setFormEmail('');
    setFormStudentId('');
    setFormYearLevel('1');
    setFormClinicHours('0');
    // Switch to list
    setActiveTab('list');
    alert('Student registered and standard Year Level subjects enrolled successfully.');
  };

  const handleFacialScan = () => {
    if (!facialStudentId) return;
    setIsScanning(true);
    setScanProgress(0);
    setScanStatus('Initializing camera & depth sensor...');

    const statuses = [
      { p: 15, msg: 'Detecting facial contour markers...' },
      { p: 40, msg: 'Capturing stereoscopic iris map...' },
      { p: 65, msg: 'Hashing facial biome templates...' },
      { p: 85, msg: 'Encrypting data payload...' },
      { p: 100, msg: 'Complete!' }
    ];

    statuses.forEach(step => {
      setTimeout(() => {
        setScanProgress(step.p);
        setScanStatus(step.msg);
        if (step.p === 100) {
          const target = students.find(s => s.id === facialStudentId);
          if (target) {
            updateStudent({
              ...target,
              faceEnrolled: true
            });
            setTimeout(() => {
              setIsScanning(false);
              setScanProgress(0);
              alert(`Facial biometric template generated and saved for ${target.name}.`);
            }, 800);
          }
        }
      }, step.p * 35);
    });
  };

  const handleUpdateHours = (student: Student, hours: string) => {
    updateStudent({
      ...student,
      clinicHoursCompleted: parseInt(hours) || 0
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-7xl mx-auto animate-fade-in">
      
      {/* LEFT PANE (spans 8): Master controls and lists */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        
        {/* Module Nav Tabs */}
        <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-xs">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'list'
                ? 'bg-clinical-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Student Directory
          </button>
          <button
            onClick={() => {
              setActiveTab('enroll');
              setFormStudentId(`DENT-2026-0${Math.floor(100 + Math.random() * 900)}`);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'enroll'
                ? 'bg-clinical-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Enroll Student Form
          </button>
          <button
            onClick={() => {
              setActiveTab('facial');
              if (students.length > 0) {
                setFacialStudentId(students[0].id);
              }
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'facial'
                ? 'bg-clinical-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Facial Recognition Portal
          </button>
        </div>

        {/* Tab 1: Student List / Directory */}
        {activeTab === 'list' && (
          <div className="flex flex-col space-y-4">
            
            {/* Advanced Table Filters */}
            <Card className="p-3 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by student, ID, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                />
              </div>

              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Year Levels</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year (Clinician)</option>
                <option value="4">4th Year (Clinician)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
                <option value="remedial">Remedial</option>
              </select>

              <select
                value={faceFilter}
                onChange={(e) => setFaceFilter(e.target.value)}
                className="px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none"
              >
                <option value="all">Facial Status</option>
                <option value="enrolled">Enrolled Only</option>
                <option value="pending">Pending Scan</option>
              </select>
            </Card>

            {/* Students Table */}
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Student Details</th>
                      <th className="px-4 py-2.5 text-left">Student ID</th>
                      <th className="px-4 py-2.5 text-left">Year Level</th>
                      <th className="px-4 py-2.5 text-left">Biometrics</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No student records matched the filters.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map(student => (
                        <tr
                          key={student.id}
                          onClick={() => setSelectedStudentId(student.id)}
                          className={`cursor-pointer transition-colors ${
                            selectedStudentId === student.id
                              ? 'bg-clinical-50/30 dark:bg-clinical-950/20'
                              : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/10'
                          }`}
                        >
                          <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                            {student.name}
                          </td>
                          <td className="px-4 py-3.5 text-slate-450 dark:text-slate-400">{student.studentId}</td>
                          <td className="px-4 py-3.5">
                            {student.yearLevel === 3 || student.yearLevel === 4
                              ? `Year ${student.yearLevel} (Clinician)`
                              : `Year ${student.yearLevel}`}
                          </td>
                          <td className="px-4 py-3.5">
                            {student.faceEnrolled ? (
                              <span className="inline-flex items-center gap-1 text-emerald-555 font-bold">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Enrolled
                              </span>
                            ) : (
                              <span className="text-slate-400 font-semibold">Pending Scan</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              student.status === 'critical'
                                ? 'bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-400'
                                : student.status === 'warning'
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400'
                                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-955/20'
                            }`}>
                              {student.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete ${student.name}?`)) {
                                  deleteStudent(student.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Delete Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 2: Enroll / Register Student */}
        {activeTab === 'enroll' && (
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
              Registration & Academic Intake
            </h3>
            
            <form onSubmit={handleEnrollSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Ramos"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sarah@dentisys.edu"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Student ID</label>
                  <input
                    type="text"
                    required
                    value={formStudentId}
                    onChange={(e) => setFormStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-205 dark:border-slate-850 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Year Level</label>
                  <select
                    value={formYearLevel}
                    onChange={(e) => setFormYearLevel(e.target.value as '1' | '2' | '3' | '4')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-205 dark:border-slate-850 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
                  >
                    <option value="1">1st Year (Pre-clinical)</option>
                    <option value="2">2nd Year (Pre-clinical)</option>
                    <option value="3">3rd Year (Clinician)</option>
                    <option value="4">4th Year (Clinician)</option>
                  </select>
                </div>
              </div>

              {parseInt(formYearLevel) >= 3 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Initial Clinic Hours completed</label>
                  <input
                    type="number"
                    min="0"
                    value={formClinicHours}
                    onChange={(e) => setFormClinicHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-205 dark:border-slate-805 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>
              )}

              <div className="p-3 bg-accent-50/20 dark:bg-accent-950/15 border border-accent-100/30 dark:border-accent-900/30 rounded-xl text-xs text-accent-700 dark:text-accent-400 leading-relaxed">
                ℹ️ **Course Pre-assignment**: Enrolling this student will automatically pre-assign standard curriculum dentistry courses for their selected Year Level.
              </div>

              <div className="flex space-x-3 pt-2 justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-bold text-xs shadow-md transition-colors"
                >
                  Confirm Registration
                </button>
              </div>
            </form>
          </Card>
        )}

        {/* Tab 3: Facial Recognition Scan Simulator */}
        {activeTab === 'facial' && (
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-105 mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              Facial Biometric Data Enrollment
            </h3>
            <p className="text-xs text-slate-400 mb-4">Register student's facial markers to enable biometric attendance scanning</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left Form: Select Student & trigger */}
              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                    Select student for scan
                  </label>
                  <select
                    value={facialStudentId}
                    onChange={(e) => setFacialStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-205 dark:border-slate-855 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
                  >
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.studentId}) {s.faceEnrolled ? '✓ Enrolled' : '• Pending'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-lg text-xs leading-relaxed text-slate-650 dark:text-slate-400 space-y-1.5">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Biometric Verification Guide:</h4>
                  <ul className="list-disc pl-4 space-y-1 text-[11px]">
                    <li>Position the camera direct to the subject.</li>
                    <li>Avoid high back-lights or shadows.</li>
                    <li>The scanner requires iris depth scan template mapping.</li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={handleFacialScan}
                  disabled={isScanning || !facialStudentId}
                  className="w-full py-3 rounded-xl bg-clinical-500 hover:bg-clinical-600 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Scanning... {scanProgress}%
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      Begin Biometric Capture
                    </>
                  )}
                </button>
              </div>

              {/* Right View: Simulated Scanner Cam */}
              <div className="relative aspect-video md:aspect-auto md:h-64 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col items-center justify-center text-slate-500">
                
                {/* Simulated Lens view grid */}
                <div className="absolute inset-0 border border-accent-500/20 grid grid-cols-3 grid-rows-3 pointer-events-none">
                  <div className="border-r border-b border-white/5" />
                  <div className="border-r border-b border-white/5" />
                  <div className="border-b border-white/5" />
                  <div className="border-r border-b border-white/5" />
                  <div className="border-r border-b border-white/5" />
                  <div className="border-b border-white/5" />
                  <div className="border-r border-white/5" />
                  <div className="border-r border-white/5" />
                </div>

                {isScanning ? (
                  <div className="z-10 text-center space-y-3 px-4">
                    
                    {/* Animated target box */}
                    <div className="w-20 h-20 border-2 border-accent-500 border-dashed rounded-full mx-auto animate-spin flex items-center justify-center">
                      <div className="w-16 h-16 border-2 border-clinical-400 border-dashed rounded-full" />
                    </div>

                    <p className="text-xs font-bold text-clinical-400 animate-pulse uppercase tracking-widest">
                      Scanner active
                    </p>
                    <p className="text-[10px] text-slate-400 italic">
                      {scanStatus}
                    </p>
                  </div>
                ) : (
                  <div className="z-10 text-center space-y-2">
                    <Camera className="w-10 h-10 mx-auto text-slate-600 animate-pulse" />
                    <p className="text-xs font-bold text-slate-500">Intake Camera Standby</p>
                    <p className="text-[10px] text-slate-600">Select student and begin capture to mock verification</p>
                  </div>
                )}

                {/* Progress bar line overlay */}
                {isScanning && (
                  <div className="absolute left-0 right-0 bottom-0 bg-slate-900 border-t border-slate-800 p-2 text-center text-[10px] text-slate-400 flex items-center gap-2">
                    <div className="flex-1 bg-slate-850 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-clinical-500 h-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
                    </div>
                    <span>{scanProgress}%</span>
                  </div>
                )}
              </div>

            </div>
          </Card>
        )}

      </div>

      {/* RIGHT PANE (spans 4): Active Profile Preview (Prevents empty space) */}
      <div className="lg:col-span-4">
        <Card className="h-full flex flex-col justify-between p-4 space-y-4">
          {selectedStudent ? (
            <div className="space-y-4">
              
              {/* Profile Header card */}
              <div className="pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-clinical-500 to-accent-500 flex items-center justify-center font-bold text-white text-lg font-heading shadow-md">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-805 dark:text-slate-100 truncate">{selectedStudent.name}</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{selectedStudent.email}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{selectedStudent.studentId}</p>
                </div>
              </div>

              {/* Status Pills */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Retention Status</span>
                  <span className={`inline-block text-[10px] font-bold mt-1 uppercase ${
                    selectedStudent.status === 'critical'
                      ? 'text-rose-600'
                      : selectedStudent.status === 'warning'
                      ? 'text-amber-500'
                      : 'text-emerald-500'
                  }`}>
                    {selectedStudent.status}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Biometric Data</span>
                  <span className={`inline-block text-[10px] font-bold mt-1 uppercase ${
                    selectedStudent.faceEnrolled ? 'text-emerald-500' : 'text-slate-450'
                  }`}>
                    {selectedStudent.faceEnrolled ? 'Face Enrolled' : 'Not Scanner'}
                  </span>
                </div>
              </div>

              {/* Core Details */}
              <div className="space-y-2">
                
                {/* Year Level detail */}
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-400">Program Year Level</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Year {selectedStudent.yearLevel}</span>
                </div>

                {/* Overall GWA detail */}
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-400">Overall GWA</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{selectedStudent.overallGWA.toFixed(2)}</span>
                </div>

                {/* Completed Clinic Hours detail (Editable for secretaries!) */}
                {selectedStudent.yearLevel >= 3 && (
                  <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400">Completed Clinic Hours</span>
                    <input
                      type="number"
                      min="0"
                      value={selectedStudent.clinicHoursCompleted}
                      onChange={(e) => handleUpdateHours(selectedStudent, e.target.value)}
                      className="w-16 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-805 dark:text-white font-semibold text-right text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Enrolled Courses Table */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Subjects</h4>
                <div className="border border-slate-100 dark:border-slate-800/85 rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-400 font-bold uppercase">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Code</th>
                        <th className="px-2 py-1.5 text-left">Grade</th>
                        <th className="px-2 py-1.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                      {selectedStudent.enrolledSubjects.map(sub => (
                        <tr key={sub.code}>
                          <td className="px-2 py-1.5 font-semibold text-slate-700 dark:text-slate-300">{sub.code}</td>
                          <td className="px-2 py-1.5 font-bold text-slate-800 dark:text-slate-100">{sub.grade.toFixed(2)}</td>
                          <td className="px-2 py-1.5">
                            <span className={sub.grade > 2.5 && sub.isClinical ? 'text-rose-500 font-semibold' : 'text-emerald-500'}>
                              {sub.grade > 2.5 && sub.isClinical ? 'Fails Ret.' : 'Pass'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              No students selected.
            </div>
          )}

          {/* Quick tips footer */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-[10px] text-slate-450 dark:text-slate-500 text-center leading-relaxed">
            Students flagged as warning/critical can take **Remedial Exams** managed by clinicians.
          </div>
        </Card>
      </div>

    </div>
  );
};
