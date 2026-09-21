import React from 'react';
import { Mail, ShieldCheck, UserCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';
import { MfaSettingsCard } from '../../components/MfaSettingsCard';

const unavailableCopy = 'Academic services are unavailable for real Student accounts until the authoritative Student APIs are enabled.';

export const StudentUnavailable: React.FC<{ title: string }> = ({ title }) => (
  <div className="max-w-3xl mx-auto pt-6 animate-fade-in" role="status">
    <Card className="p-8 border-amber-200/70 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
      <ShieldCheck className="h-8 w-8 text-amber-600 dark:text-amber-400" />
      <h1 className="mt-4 font-heading font-extrabold text-2xl text-amber-950 dark:text-amber-100">{title}</h1>
      <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80 leading-relaxed">{unavailableCopy}</p>
    </Card>
  </div>
);

function StudentIdentityFields() {
  const { user } = useAuth();
  const student = user?.student;

  return (
    <Card className="p-6 space-y-4">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
        <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Authoritative Student Identity
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Display name</span>
          <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{user?.display_name}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Login email</span>
          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm break-all">{user?.login_email}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Student number</span>
          <p className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">{student?.student_number}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Student status</span>
          <p className="font-bold capitalize text-slate-800 dark:text-slate-100 text-sm">{student?.status}</p>
        </div>
      </div>
    </Card>
  );
}

export const RealStudentDashboard: React.FC = () => (
  <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">
    <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5">
      <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-slate-100">Student Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your authenticated Student identity is shown below.</p>
    </div>
    <StudentIdentityFields />
    <div role="status">
      <Card className="p-6 border-amber-200/70 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-heading font-bold text-base text-amber-950 dark:text-amber-100">Academic services unavailable</h2>
            <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80 leading-relaxed">{unavailableCopy}</p>
          </div>
        </div>
      </Card>
    </div>
  </div>
);

export const RealStudentProfile: React.FC = () => (
  <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">
    <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5">
      <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-slate-100">My Profile</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Authoritative account and Student identity details.</p>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-6">
        <StudentIdentityFields />
        <Card className="p-6 space-y-3">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Mail className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              Account Role
            </h3>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">System Role</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40">
              Student
            </span>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-5 space-y-6">
        <MfaSettingsCard userEmail={undefined} roleName="Student" />
      </div>
    </div>
  </div>
);
