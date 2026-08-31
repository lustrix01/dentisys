import React from 'react';
import { 
  UserCircle, 
  Camera, 
  ShieldCheck, 
  CheckCircle2, 
  Mail, 
  Award, 
  Calendar,
  FileText,
  Lock,
  Phone,
  MapPin,
  BookOpen,
  User,
  Activity
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle } from '../../components/Card';
import { MfaSettingsCard } from '../../components/MfaSettingsCard';

export const Profile: React.FC = () => {
  const { user } = useAuth();
  const { students } = useApp();

  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentName = currentStudent?.name || user?.display_name || 'Juan Dela Cruz';
  const studentEmail = currentStudent?.email || user?.login_email || 'student@bicol-u.edu.ph';
  const studentIdNum = currentStudent?.studentId || '2024-DENT-0004';
  const enrolledSubjects = currentStudent?.enrolledSubjects || [];

  const isFaceRegistered = localStorage.getItem(`dentisys_face_registered_${currentStudent?.id || '1'}`) === 'true';

  const initials = studentName
    .replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s+/i, '')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Profile
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            View your academic standing, personal enrollment record, biometric facial verification status, and security settings.
          </p>
        </div>

        <div className="text-right hidden sm:block">
          <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
          <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentIdNum}</span>
        </div>
      </div>

      {/* 2. Main Profile Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Student Details & Academic Standing */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Primary Header Card */}
          <Card className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 border-b border-slate-100 dark:border-slate-800 pb-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-lg shadow-blue-500/20 shrink-0">
                {initials}
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 truncate">
                    {studentName}
                  </h2>
                  <span className="px-3 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 text-[10px] font-extrabold uppercase">
                    Active Standing ✓
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="truncate">{studentEmail}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[11px] font-bold">
                    <Award className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Doctor of Dental Medicine (DDM IV)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                    Section 4-A
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">Enrolled Subjects</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{enrolledSubjects.length || 3}</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">Attendance Rate</span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">96%</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">Retention Status</span>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 block mt-1">Cleared</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">Biometric Face</span>
                <span className={`text-xs font-extrabold block mt-1 ${isFaceRegistered ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {isFaceRegistered ? 'Active ✓' : 'Pending'}
                </span>
              </div>
            </div>
          </Card>

          {/* Academic & Enrollment Information */}
          <Card className="p-6 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                Academic & Enrollment Details
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Student Number</span>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">{studentIdNum}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Degree Program</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">Doctor of Dental Medicine</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current Year & Section</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">4th Year — Section 4-A</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Academic Term</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">1st Semester, AY 2025-2026</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">College & Campus</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">BU College of Dental Medicine (Main)</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Enrollment Status</span>
                <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">Regular Enrolled Student</p>
              </div>
            </div>
          </Card>

          {/* Personal & Emergency Contact Card */}
          <Card className="p-6 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <User className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                Personal & Emergency Contact Details
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Official Email</span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{studentEmail}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contact Phone Number</span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">+63 (917) 555-0192</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1 sm:col-span-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Home Address</span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Barangay Washington, Legazpi City, Albay 4500</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Emergency Contact Person</span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Maria Dela Cruz (Parent / Guardian)</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Emergency Contact Phone</span>
                <p className="font-semibold text-slate-800 dark:text-slate-100">+63 (920) 888-4321</p>
              </div>
            </div>
          </Card>

        </div>

        {/* Right Column: Biometric Privacy Audit & Security Settings */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Biometric Privacy Audit */}
          <Card className="p-6 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Camera className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                Biometric Registration & Privacy Audit
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100">Facial Recognition Descriptor</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isFaceRegistered ? 'Template registered and verified for attendance' : 'Registration pending student consent'}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                  isFaceRegistered ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                }`}>
                  {isFaceRegistered ? 'Active ✓' : 'Pending'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 space-y-2">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Data Privacy Act of 2012 (RA 10173) Compliance</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                  Your facial biometric descriptor is encrypted and processed strictly for verifying clinical session attendance. Original video frames are not saved or published.
                </p>
              </div>
            </div>
          </Card>

          {/* MFA Security & Account Credentials Card */}
          <MfaSettingsCard userEmail={studentEmail} roleName="Dental Student" />

        </div>

      </div>

    </div>
  );
};
