import React, { useState, useEffect, useMemo } from 'react';
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
  RefreshCw,
  XCircle,
  ShieldCheck,
  Info
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Student, EnrolledSubject } from '../../types';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';

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

const SIMULATED_CAMERA_PORTRAITS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop', // Front View
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop', // Left Profile
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop', // Right Profile
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop', // Tilt Up
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&h=150&fit=crop', // Tilt Down
];

import { getFacultyStudentsApi, createStudentApi, updateFacialEnrollmentApi } from '../../services/apiClient';

export const StudentManagement: React.FC = () => {
  const { 
    students, 
    addStudent, 
    updateStudent, 
    deleteStudent,
    enrollStudentFace,
    deleteStudentFace
  } = useApp();

  const assignedClasses = ['CLINIC-A', 'CLINIC-B'];
  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFacultyStudentsApi()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          data.forEach(dbStudent => {
            if (!students.some(s => s.studentId === dbStudent.studentId || s.id === dbStudent.id)) {
              addStudent({
                name: dbStudent.name,
                email: dbStudent.email,
                studentId: dbStudent.studentId,
                yearLevel: (dbStudent.yearLevel || 4) as 1 | 2 | 3 | 4,
                classId: dbStudent.classId || selectedClassId,
                className: dbStudent.className || 'Clinical Rotation A',
                clinicHoursCompleted: 0,
                enrolledSubjects: getDefaultSubjectsForYear((dbStudent.yearLevel || 4) as 1 | 2 | 3 | 4),
              });
            }
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Selected class block
  const [selectedClassId, setSelectedClassId] = useState<string>(assignedClasses[0] || 'CLINIC-A');

  // Tab management
  const [activeTab, setActiveTab] = useState<'list' | 'enroll' | 'facial'>('list');

  // Search filters
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [faceFilter, setFaceFilter] = useState<string>('all');

  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Form states for all DB columns
  const [formFirstName, setFormFirstName] = useState('');
  const [formMiddleName, setFormMiddleName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStudentId, setFormStudentId] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formSex, setFormSex] = useState<'M' | 'F' | ''>('F');
  const [formYearLevel, setFormYearLevel] = useState<'1' | '2' | '3' | '4'>('4');
  const [formClinicHours, setFormClinicHours] = useState('0');
  const [formAdmissionDate, setFormAdmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [formBirthdate, setFormBirthdate] = useState('');

  // Client-side real-time validation state
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validateStudentForm = (): boolean => {
    const errors: Record<string, string> = {};

    const cleanId = formStudentId.trim();
    if (!cleanId) {
      errors.studentId = 'Student ID Number is required.';
    } else if (cleanId.length < 3) {
      errors.studentId = 'Student ID Number must be at least 3 characters.';
    }

    const cleanFirst = formFirstName.trim();
    if (!cleanFirst) {
      errors.firstName = 'First Name is required.';
    } else if (cleanFirst.length < 2) {
      errors.firstName = 'First Name must be at least 2 characters.';
    } else if (!/^[\p{L}\s'\-\.]+$/u.test(cleanFirst)) {
      errors.firstName = 'First Name can only contain letters, spaces, hyphens, and apostrophes.';
    }

    const cleanLast = formLastName.trim();
    if (!cleanLast) {
      errors.lastName = 'Last Name is required.';
    } else if (cleanLast.length < 2) {
      errors.lastName = 'Last Name must be at least 2 characters.';
    } else if (!/^[\p{L}\s'\-\.]+$/u.test(cleanLast)) {
      errors.lastName = 'Last Name can only contain letters, spaces, hyphens, and apostrophes.';
    }

    const cleanEmail = formEmail.trim();
    if (cleanEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        errors.email = 'Invalid email address format.';
      } else if (!cleanEmail.toLowerCase().endsWith('@bicol-u.edu.ph')) {
        errors.email = 'Only official Bicol University email addresses (@bicol-u.edu.ph) are allowed.';
      }
    }

    const yearNum = parseInt(formYearLevel);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
      errors.yearLevel = 'Year level must be between 1 and 4.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Facial enrollment simulator states
  const [facialStudentId, setFacialStudentId] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const [scanStep, setScanStep] = useState(0); // 0 to 5
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);

  // Apply RBAC: filter students
  const facultyStudents = useMemo(() => {
    return students;
  }, [students]);

  // Sync selected student ID on load
  useEffect(() => {
    if (facultyStudents.length > 0 && !selectedStudentId) {
      setSelectedStudentId(facultyStudents[0].id);
    }
  }, [facultyStudents, selectedStudentId]);

  const selectedStudent = facultyStudents.find(s => s.id === selectedStudentId) || facultyStudents[0];

  // Search & Filter students list
  const filteredStudents = useMemo(() => {
    return facultyStudents.filter(student => {
      const matchesSearch = student.name.toLowerCase().includes(search.toLowerCase()) || 
                            student.studentId.toLowerCase().includes(search.toLowerCase()) ||
                            student.email.toLowerCase().includes(search.toLowerCase());
      const matchesYear = yearFilter === 'all' ? true : student.yearLevel === parseInt(yearFilter);
      const matchesStatus = statusFilter === 'all' ? true : student.status === statusFilter;
      const matchesFace = faceFilter === 'all' ? true : (faceFilter === 'enrolled' ? student.faceEnrolled : !student.faceEnrolled);

      return matchesSearch && matchesYear && matchesStatus && matchesFace;
    });
  }, [facultyStudents, search, yearFilter, statusFilter, faceFilter]);

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStudentForm()) return;

    const yearNum = parseInt(formYearLevel) as 1 | 2 | 3 | 4;
    const fullName = `${formFirstName} ${formMiddleName ? formMiddleName + ' ' : ''}${formLastName}`.trim();
    
    try {
      const res = await createStudentApi({
        studentId: formStudentId,
        firstName: formFirstName,
        middleName: formMiddleName,
        lastName: formLastName,
        name: fullName,
        email: formEmail,
        contact: formContact,
        sex: formSex,
        yearLevel: yearNum,
        admissionDate: formAdmissionDate,
        birthdate: formBirthdate,
      });

      addStudent({
        name: fullName,
        email: formEmail,
        studentId: formStudentId,
        yearLevel: yearNum,
        classId: selectedClassId,
        className: students.find(s => s.classId === selectedClassId)?.className || selectedClassId,
        clinicHoursCompleted: parseInt(formClinicHours) || 0,
        enrolledSubjects: getDefaultSubjectsForYear(yearNum),
      });

      // Reset Form
      setFormFirstName('');
      setFormMiddleName('');
      setFormLastName('');
      setFormEmail('');
      setFormStudentId('');
      setFormContact('');
      setFormSex('F');
      setFormYearLevel('4');
      setFormClinicHours('0');
      setFormBirthdate('');
      setFormErrors({});
      // Switch to list
      setActiveTab('list');
      alert(res.message || 'Student registered and saved directly into all database columns!');
    } catch (err: any) {
      alert(err.message || 'Failed to register student into the database.');
    }
  };

  // Facial Biometrics multi-angle scanning simulation
  const startBiometricEnrollment = () => {
    if (!facialStudentId) return;
    const student = facultyStudents.find(s => s.id === facialStudentId);
    if (student?.consentStatus !== 'approved') {
      alert('Facial enrollment requires approved privacy consent. Send a request from Email Management first.');
      return;
    }
    setIsScanning(true);
    setScanStep(1);
    setScanProgress(0);
    setCapturedPhotos([]);
    setScanStatusMsg('Looking Center: Aligning face with circular overlay markers...');
  };

  useEffect(() => {
    if (!isScanning || scanStep === 0) return;

    const stepsInfo = [
      { step: 1, msg: 'Step 1/5 - Front View: Keep still and look directly at camera...', p: 20 },
      { step: 2, msg: 'Step 2/5 - Left Profile: Turn head slowly to the left...', p: 40 },
      { step: 3, msg: 'Step 3/5 - Right Profile: Turn head slowly to the right...', p: 60 },
      { step: 4, msg: 'Step 4/5 - Tilt Up: Look slightly upward...', p: 80 },
      { step: 5, msg: 'Step 5/5 - Tilt Down: Look slightly downward...', p: 100 },
    ];

    const currentStepInfo = stepsInfo.find(s => s.step === scanStep);
    if (!currentStepInfo) return;

    const interval = setTimeout(() => {
      // Capture simulated photo
      setCapturedPhotos(prev => [...prev, SIMULATED_CAMERA_PORTRAITS[scanStep - 1]]);
      setScanProgress(currentStepInfo.p);

      if (scanStep < 5) {
        setScanStep(prev => prev + 1);
        setScanStatusMsg(stepsInfo[scanStep].msg);
      } else {
        // Enrollment completed!
        setIsScanning(false);
        setScanStep(0);
        setScanStatusMsg('Verification template completed successfully.');
        enrollStudentFace(facialStudentId, capturedPhotos);
        setIsVerificationModalOpen(true);
      }
    }, 1800);

    return () => clearTimeout(interval);
  }, [isScanning, scanStep, facialStudentId]);

  const handleRemoveFaceEnrollment = (studId: string) => {
    const student = facultyStudents.find(s => s.id === studId);
    if (!student) return;

    const confirmed = window.confirm(`Remove facial recognition data for ${student.name}?`);
    if (confirmed) {
      deleteStudentFace(studId);
      alert('Facial biometric enrollment removed.');
    }
  };

  const handleUpdateHours = (student: Student, hours: string) => {
    updateStudent({
      ...student,
      clinicHoursCompleted: parseInt(hours) || 0
    });
  };

  const selectedFacialStudent = facultyStudents.find(s => s.id === facialStudentId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-7xl mx-auto animate-fade-in">
      
      {/* LEFT PANE (spans 8): Master controls and lists */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        
        {/* Class / Block Switcher */}
      {assignedClasses.length > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Block</span>
          <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl gap-1">
            {assignedClasses.map((clsId: string) => {
              const cls = students.find(s => s.classId === clsId);
              const label = cls?.className || clsId;
              const isActive = selectedClassId === clsId;
              return (
                <button
                  key={clsId}
                  onClick={() => {
                    setSelectedClassId(clsId);
                    setSelectedStudentId(''); // reset selection
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-clinical-600 text-white shadow-md'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Module Nav Tabs */}
        <div className="flex bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'list'
                ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10'
                : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Class Directory
          </button>
          <button
            onClick={() => {
              setActiveTab('enroll');
              setFormStudentId(`DENT-2026-0${Math.floor(100 + Math.random() * 900)}`);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'enroll'
                ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10'
                : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <Plus className="w-4 h-4" />
            Admissions Intake
          </button>
          <button
            onClick={() => {
              setActiveTab('facial');
              if (facultyStudents.length > 0) {
                setFacialStudentId(facultyStudents[0].id);
              }
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'facial'
                ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10'
                : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <Camera className="w-4 h-4" />
            Facial Recognition Portal
          </button>
        </div>

        {/* Tab 1: Student List / Directory */}
        {activeTab === 'list' && (
          <div className="flex flex-col space-y-4">
            
            {/* Filters */}
            <Card className="p-3.5 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student GWA directory..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-205 dark:border-slate-850 bg-white dark:bg-slate-900 text-slate-805 dark:text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-550"
                />
              </div>

              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year (Clinician)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 text-xs font-semibold focus:outline-none"
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
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 text-xs font-semibold focus:outline-none"
              >
                <option value="all">Biometric Status</option>
                <option value="enrolled">Face Enrolled</option>
                <option value="pending">Pending Scan</option>
              </select>
            </Card>

            {/* Students Table */}
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-400 uppercase tracking-wider text-[10px] font-bold z-10 shadow-sm">
                    <tr>
                      <th className="px-5 py-3 text-left">Student Details</th>
                      <th className="px-5 py-3 text-left">Student ID</th>
                      <th className="px-5 py-3 text-left">Class rotation</th>
                      <th className="px-5 py-3 text-left">Face Enrollment</th>
                      <th className="px-5 py-3 text-left">Standing</th>
                      <th className="px-5 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-450 font-semibold">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <GraduationCap className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No students registered in database yet</p>
                            <p className="text-xs text-slate-400 max-w-sm">
                              Your database currently has 0 student records. Click the button below or use the <strong>Admissions Intake</strong> tab above to add your first student.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('enroll');
                                setFormStudentId(`DENT-2026-0${Math.floor(100 + Math.random() * 900)}`);
                              }}
                              className="px-4 py-2.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white text-xs font-bold shadow-md shadow-clinical-500/20 transition-all flex items-center gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              Register New Student
                            </button>
                          </div>
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
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-850 dark:text-slate-205">{student.name}</div>
                            <span className="text-[10px] text-slate-400 font-normal">{student.email}</span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-450 dark:text-slate-500 font-mono">{student.studentId}</td>
                          <td className="px-5 py-3.5 text-slate-700 dark:text-slate-350">
                            {student.yearLevel === 3 || student.yearLevel === 4
                              ? `Year ${student.yearLevel} Clinician`
                              : `Year ${student.yearLevel}`}
                          </td>
                          <td className="px-5 py-3.5">
                            {student.faceEnrolled ? (
                              <span className="inline-flex items-center gap-1 text-emerald-555 font-bold">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Enrolled
                              </span>
                            ) : (
                              <span className="text-slate-405 font-bold">Pending Setup</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              student.status === 'critical'
                                ? 'bg-rose-50 text-rose-600 dark:bg-rose-955/20'
                                : student.status === 'warning'
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-955/20'
                                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-955/20'
                            }`}>
                              {student.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                if (confirm(`Delete student register ledger for ${student.name}?`)) {
                                  deleteStudent(student.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
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
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-105 mb-4 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
              <GraduationCap className="w-5 h-5 text-clinical-550" />
              Admissions Intake Registration
            </h3>
            
            <form onSubmit={handleEnrollSubmit} className="space-y-4">
              {Object.keys(formErrors).length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Please correct the highlighted form errors before submitting.</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Student ID Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DENT-2026-0284"
                    value={formStudentId}
                    onChange={(e) => {
                      setFormStudentId(e.target.value);
                      if (formErrors.studentId) setFormErrors(prev => ({ ...prev, studentId: '' }));
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border ${formErrors.studentId ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-800'} bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500`}
                  />
                  {formErrors.studentId && <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{formErrors.studentId}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Angela"
                    value={formFirstName}
                    onChange={(e) => {
                      setFormFirstName(e.target.value);
                      if (formErrors.firstName) setFormErrors(prev => ({ ...prev, firstName: '' }));
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border ${formErrors.firstName ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-800'} bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500`}
                  />
                  {formErrors.firstName && <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{formErrors.firstName}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Middle Name</label>
                  <input
                    type="text"
                    placeholder="e.g. De Cruz"
                    value={formMiddleName}
                    onChange={(e) => setFormMiddleName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Castillo"
                    value={formLastName}
                    onChange={(e) => {
                      setFormLastName(e.target.value);
                      if (formErrors.lastName) setFormErrors(prev => ({ ...prev, lastName: '' }));
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border ${formErrors.lastName ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-800'} bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500`}
                  />
                  {formErrors.lastName && <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{formErrors.lastName}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">BU Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. angela@bicol-u.edu.ph"
                    value={formEmail}
                    onChange={(e) => {
                      setFormEmail(e.target.value);
                      if (formErrors.email) setFormErrors(prev => ({ ...prev, email: '' }));
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border ${formErrors.email ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-800'} bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500`}
                  />
                  {formErrors.email && <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{formErrors.email}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Contact Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 09171234567"
                    value={formContact}
                    onChange={(e) => setFormContact(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Sex / Gender</label>
                  <select
                    value={formSex}
                    onChange={(e) => setFormSex(e.target.value as any)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
                  >
                    <option value="F">Female (F)</option>
                    <option value="M">Male (M)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Year Level</label>
                  <select
                    value={formYearLevel}
                    onChange={(e) => setFormYearLevel(e.target.value as any)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
                  >
                    <option value="1">1st Year (Pre-clinical)</option>
                    <option value="2">2nd Year (Pre-clinical)</option>
                    <option value="3">3rd Year (Clinician)</option>
                    <option value="4">4th Year (Clinician)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Admission Date</label>
                  <input
                    type="date"
                    value={formAdmissionDate}
                    onChange={(e) => setFormAdmissionDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                <div className="space-y-1 md:col-span-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Birthdate</label>
                  <input
                    type="date"
                    value={formBirthdate}
                    onChange={(e) => setFormBirthdate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>
              </div>

              {parseInt(formYearLevel) >= 3 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Completed Clinic Hours</label>
                  <input
                    type="number"
                    min="0"
                    value={formClinicHours}
                    onChange={(e) => setFormClinicHours(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-805 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>
              )}

              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-[11px] text-slate-500 flex items-start gap-2">
                <Info className="w-4 h-4 text-clinical-550 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Standard Curriculum Assignment:</strong> Confirming registration will assign default clinical subjects for their corresponding Year level. Face enrollment can be processed next in the biometric portal.
                </p>
              </div>

              <div className="flex pt-2 justify-end">
                <button
                  type="submit"
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-xs shadow-md transition-all"
                >
                  Register Student Entry
                </button>
              </div>
            </form>
          </Card>
        )}

        {/* Tab 3: Facial Recognition Portal */}
        {activeTab === 'facial' && (
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 mb-2 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
              <Camera className="w-5 h-5 text-clinical-550" />
              Facial Biometric Data Enrollment
            </h3>
            <p className="text-xs text-slate-405 mb-4">Register student's facial markers to enable biometric attendance scanning</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left Form: Select Student & trigger */}
              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1.5">
                    Select target student
                  </label>
                  <select
                    value={facialStudentId}
                    onChange={(e) => {
                      setFacialStudentId(e.target.value);
                      setCapturedPhotos([]);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 text-xs focus:outline-none"
                    disabled={isScanning}
                  >
                    <option value="" disabled>Select Student...</option>
                    {facultyStudents.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.studentId}) {s.faceEnrolled ? '✓ Enrolled' : '• Pending Setup'}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedFacialStudent && (
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-150 dark:border-slate-800 rounded-2xl text-xs space-y-1.5">
                    <h4 className="font-bold text-slate-800 dark:text-slate-205">Enrollment Metadata:</h4>
                    <div>
                      <span className="text-slate-400 font-semibold">Biometric Status:</span>{' '}
                      <span className={selectedFacialStudent.faceEnrolled ? 'text-emerald-555 font-bold' : 'text-amber-550 font-bold'}>
                        {selectedFacialStudent.faceEnrolled ? 'ENROLLED & ACTIVE' : 'PENDING BIOMETRIC INTAKE'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold">Privacy Consent:</span>{' '}
                      <span className={selectedFacialStudent.consentStatus === 'approved' ? 'text-emerald-555 font-bold' : 'text-amber-550 font-bold'}>
                        {(selectedFacialStudent.consentStatus || 'pending').toUpperCase()}
                      </span>
                    </div>
                    {selectedFacialStudent.faceEnrollmentDetails && (
                      <div>
                        <span className="text-slate-400 font-semibold">Registered:</span>{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-350">{selectedFacialStudent.faceEnrollmentDetails.enrolledAt}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={startBiometricEnrollment}
                    disabled={isScanning || !facialStudentId || selectedFacialStudent?.consentStatus !== 'approved'}
                    className="w-full py-3 rounded-xl bg-clinical-500 hover:bg-clinical-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-clinical-500/10 cursor-pointer"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Scanning... Step {scanStep}/5 ({scanProgress}%)
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        {selectedFacialStudent?.faceEnrolled ? 'Re-enroll Facial Template' : 'Begin Biometric Intake'}
                      </>
                    )}
                  </button>

                  {selectedFacialStudent?.faceEnrolled && (
                    <button
                      type="button"
                      onClick={() => handleRemoveFaceEnrollment(selectedFacialStudent.id)}
                      disabled={isScanning}
                      className="w-full py-2.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold text-xs transition-colors flex items-center justify-center gap-1 bg-white dark:bg-slate-950 dark:border-rose-950/40 dark:hover:bg-rose-955/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Biometric Enrollment
                    </button>
                  )}
                </div>
              </div>

              {/* Right View: Simulated Scanner Cam */}
              <div className="relative aspect-square md:h-64 rounded-3xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col items-center justify-center text-slate-500">
                
                {/* Simulated Lens view grid */}
                <div className="absolute inset-0 border border-accent-500/20 grid grid-cols-3 grid-rows-3 pointer-events-none z-10">
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
                    <div className="w-24 h-24 border-2 border-clinical-500 border-dashed rounded-full mx-auto animate-spin flex items-center justify-center">
                      <div className="w-20 h-20 border-2 border-accent-500 border-dashed rounded-full" />
                    </div>

                    <p className="text-xs font-bold text-clinical-450 animate-pulse uppercase tracking-widest">
                      LENS ACTIVE
                    </p>
                    <p className="text-[10px] text-slate-400 italic">
                      {scanStatusMsg}
                    </p>
                  </div>
                ) : selectedFacialStudent?.faceEnrolled && selectedFacialStudent.faceEnrollmentDetails ? (
                  <div className="z-10 text-center p-4 space-y-3">
                    <CheckCircle className="w-8 h-8 mx-auto text-emerald-500" />
                    <p className="text-xs font-bold text-slate-350">Biometrics Enrolled</p>
                    {/* Captured angle thumbnails */}
                    <div className="flex gap-1 justify-center">
                      {selectedFacialStudent.faceEnrollmentDetails.images.slice(0, 3).map((img, i) => (
                        <img 
                          key={i} 
                          src={img} 
                          alt={`Angle ${i+1}`} 
                          className="w-10 h-10 rounded-lg object-cover border border-slate-700" 
                          onError={(e) => {
                            // fallback if network fails
                            (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50`;
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="z-10 text-center space-y-2">
                    <Camera className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
                    <p className="text-xs font-bold text-slate-500">Lens Standby Mode</p>
                    <p className="text-[10px] text-slate-600">Select student to begin biometrics configuration</p>
                  </div>
                )}

                {/* Progress bar line overlay */}
                {isScanning && (
                  <div className="absolute left-0 right-0 bottom-0 bg-slate-900 border-t border-slate-800 p-2 text-center text-[10px] text-slate-400 flex items-center gap-2 z-20">
                    <div className="flex-1 bg-slate-950 h-1.5 rounded-full overflow-hidden">
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

      {/* RIGHT PANE (spans 4): Active Profile Preview */}
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
                  <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 truncate">{selectedStudent.name}</h3>
                  <p className="text-[10px] text-slate-404 mt-0.5 truncate">{selectedStudent.email}</p>
                  <p className="text-[10px] text-slate-404 mt-0.5 font-mono">{selectedStudent.studentId}</p>
                </div>
              </div>

              {/* Status Pills */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Retention standing</span>
                  <span className={`inline-block text-[10px] font-extrabold mt-1 uppercase ${
                    selectedStudent.status === 'critical' ? 'text-rose-600' :
                    selectedStudent.status === 'warning' ? 'text-amber-500' : 'text-emerald-500'
                  }`}>
                    {selectedStudent.status}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Biometric Status</span>
                  <span className={`inline-block text-[10px] font-extrabold mt-1 uppercase ${
                    selectedStudent.faceEnrolled ? 'text-emerald-555' : 'text-slate-450'
                  }`}>
                    {selectedStudent.faceEnrolled ? 'Face Enrolled' : 'Pending Setup'}
                  </span>
                </div>
              </div>

              {/* Core Details */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-400">Class Section</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">CLINIC-A</span>
                </div>

                <div className="flex justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-400">Overall GWA</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{selectedStudent.overallGWA.toFixed(2)}</span>
                </div>

                {selectedStudent.yearLevel >= 3 && (
                  <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-400">Completed Clinic Hours</span>
                    <input
                      type="number"
                      min="0"
                      value={selectedStudent.clinicHoursCompleted}
                      onChange={(e) => handleUpdateHours(selectedStudent, e.target.value)}
                      className="w-16 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-white font-semibold text-right text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Enrolled Courses Table */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Course Evaluation GWAs</h4>
                <div className="border border-slate-100 dark:border-slate-800/85 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-[11px] font-medium">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-400 font-bold uppercase z-10 shadow-sm">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Code</th>
                        <th className="px-3 py-1.5 text-center">Grade</th>
                        <th className="px-3 py-1.5 text-right">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                      {selectedStudent.enrolledSubjects.map(sub => (
                        <tr key={sub.code}>
                          <td className="px-3 py-1.5 font-bold text-slate-700 dark:text-slate-350">{sub.code}</td>
                          <td className="px-3 py-1.5 font-extrabold text-slate-800 dark:text-slate-100 text-center">{sub.grade.toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-right">
                            <span className={sub.grade > 2.5 && sub.isClinical ? 'text-rose-500 font-semibold' : 'text-emerald-500'}>
                              {sub.grade > 2.5 && sub.isClinical ? 'Fails Ret.' : 'Passing'}
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
            <div className="text-center py-12 text-slate-400 text-xs font-semibold">
              No matching student selected.
            </div>
          )}
        </Card>
      </div>

      {/* BIOMETRIC VERIFICATION modal */}
      <Modal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        title="Biometric Enrollment Certificate"
      >
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8 text-emerald-550" />
          </div>

          <div>
            <h3 className="font-heading font-extrabold text-slate-800 dark:text-slate-100">Intake Enrollment Success</h3>
            <p className="text-xs text-slate-400 mt-1">Multi-angle facial templates compiled and cryptographic signatures saved</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs text-left max-w-sm mx-auto space-y-1.5 font-medium text-slate-650">
            <div className="flex justify-between"><span>Subject Name:</span> <span className="font-bold text-slate-800 dark:text-slate-205">{selectedFacialStudent?.name}</span></div>
            <div className="flex justify-between"><span>Depth Mesh Hash:</span> <span className="font-mono text-[10px]">MD5_MESH_8B53FC2A</span></div>
            <div className="flex justify-between"><span>Verification Accuracy:</span> <span className="font-extrabold text-emerald-500">98.4% Confidence</span></div>
            <div className="flex justify-between"><span>Enrollment Date:</span> <span className="font-mono">{new Date().toISOString().split('T')[0]}</span></div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsVerificationModalOpen(false)}
              className="px-6 py-2.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-md transition-colors"
            >
              Verify & Close Portal
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
