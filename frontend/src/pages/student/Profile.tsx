import React, { useState } from 'react';
import { 
  UserCircle, 
  Camera, 
  ShieldCheck, 
  CheckCircle2, 
  Mail, 
  Award, 
  Calendar,
  FileText,
  Lock
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { MfaSettingsCard } from '../../components/MfaSettingsCard';

export const Profile: React.FC = () => {
  const { user } = useAuth();
  const { students } = useApp();

  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentName = currentStudent?.name || user?.display_name || 'Dental Student';
  const studentEmail = currentStudent?.email || user?.login_email || 'student@bicol-u.edu.ph';
  const studentIdNum = currentStudent?.studentId || '2023-BU-0142';

  const isFaceRegistered = localStorage.getItem(`dentisys_face_registered_${currentStudent?.id || '1'}`) === 'true';

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-clinical-50 text-clinical-700 dark:bg-clinical-950/40 dark:text-clinical-300 text-[10px] font-extrabold uppercase tracking-wider mb-2">
          <UserCircle className="w-3.5 h-3.5" />
          My Profile
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
          Student Profile & Biometric Privacy
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          View your academic record, biometric facial registration audit, and security settings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Student Details Card */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-clinical-600 to-accent-600 text-white flex items-center justify-center font-extrabold text-xl shadow-lg">
                {studentName.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{studentName}</h2>
                <p className="text-xs text-slate-400">{studentEmail}</p>
                <div className="inline-flex items-center gap-2 mt-2 px-2.5 py-0.5 rounded-full bg-clinical-50 text-clinical-700 dark:bg-clinical-950/40 dark:text-clinical-300 text-[10px] font-extrabold">
                  <Award className="w-3 h-3 text-accent-500" />
                  Doctor of Dental Medicine (DDM IV)
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Student ID Number</span>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm mt-0.5">{studentIdNum}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Assigned Section</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-0.5">CLINIC-A (Section 4-1)</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Academic Status</span>
                <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">Regular Student</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase">College Institution</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-0.5">BU College of Dentistry</p>
              </div>
            </div>
          </Card>

          {/* Biometric Registration & Data Privacy Audit Card */}
          <Card className="p-6 space-y-4">
            <CardHeader className="p-0 border-b border-slate-100 dark:border-slate-800 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Camera className="w-4.5 h-4.5 text-clinical-600" />
                Facial Biometric Registration & Data Privacy Audit
              </CardTitle>
            </CardHeader>

            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100">Face Biometric Status</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isFaceRegistered ? 'Registered and active for attendance check-ins' : 'Registration pending consent agreement'}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                  isFaceRegistered ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                }`}>
                  {isFaceRegistered ? 'Active ✓' : 'Pending'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-clinical-50/60 dark:bg-clinical-950/30 border border-clinical-200 dark:border-clinical-800/60 space-y-2">
                <div className="flex items-center gap-2 text-clinical-700 dark:text-clinical-300 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Data Privacy Act of 2012 (RA 10173) Agreement Record</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                  Your consent record is retained for audit compliance. Facial biometric descriptors are processed strictly for student attendance verification in DentiSys.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: MFA Security Settings */}
        <div className="lg:col-span-5 space-y-6">
          <MfaSettingsCard userEmail={studentEmail} roleName="Dental Student" />
        </div>
      </div>
    </div>
  );
};
