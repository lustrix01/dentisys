import React from 'react';
import { Mail, ShieldCheck, UserCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { MfaSettingsCard } from '../../components/MfaSettingsCard';

const unavailableCopy = 'Academic services are unavailable for real Student accounts until the authoritative Student APIs are enabled.';

export const StudentUnavailable: React.FC<{ title: string }> = ({ title }) => (
  <section className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100" role="status">
    <ShieldCheck className="h-8 w-8 text-amber-600 dark:text-amber-300" />
    <h1 className="mt-4 text-2xl font-extrabold">{title}</h1>
    <p className="mt-2 text-sm leading-relaxed">{unavailableCopy}</p>
  </section>
);

function StudentIdentityFields() {
  const { user } = useAuth();
  const student = user?.student;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Display name</p>
        <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{user?.display_name}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Login email</p>
        <p className="mt-1 break-all text-sm font-bold text-slate-800 dark:text-slate-100">{user?.login_email}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Student number</p>
        <p className="mt-1 text-sm font-mono font-bold text-slate-800 dark:text-slate-100">{student?.student_number}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Student status</p>
        <p className="mt-1 text-sm font-bold capitalize text-slate-800 dark:text-slate-100">{student?.status}</p>
      </div>
    </div>
  );
}

export const RealStudentDashboard: React.FC = () => (
  <section className="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Student Dashboard</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Your authenticated Student identity is shown below.</p>
    </div>
    <StudentIdentityFields />
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100" role="status">
      <h2 className="font-bold">Academic services unavailable</h2>
      <p className="mt-2 leading-relaxed">{unavailableCopy}</p>
    </div>
  </section>
);

export const RealStudentProfile: React.FC = () => (
  <section className="mx-auto max-w-5xl space-y-6">
    <div className="flex items-center gap-3">
      <UserCircle className="h-8 w-8 text-blue-600 dark:text-blue-300" />
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Authoritative account and Student identity details.</p>
      </div>
    </div>
    <StudentIdentityFields />
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Mail className="h-4 w-4" />Role</p>
      <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Student</p>
    </div>
    <MfaSettingsCard userEmail={undefined} roleName="Student" />
  </section>
);
