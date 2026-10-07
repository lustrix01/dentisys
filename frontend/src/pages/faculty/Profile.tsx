import { emptyNameParts, type PersonNameParts } from '../../components/PersonNameFields';
import React, { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Mail, UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { MfaSettingsCard } from '../../components/MfaSettingsCard';
import { ChangeNameDialog, type NameChangeResponse } from '../../components/ChangeNameDialog';
import { GoogleLinkCard } from '../../components/GoogleLinkCard';
import { PasswordChangeCard } from '../../components/PasswordChangeCard';
import { useAuth } from '../../context/AuthContext';
import { getFacultyProfileApi, updateFacultyProfileApi, getFacultyClassesApi } from '../../services/apiClient';

export const Profile: React.FC = () => {
  const [nameParts, setNameParts] = useState(emptyNameParts);
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.display_name || 'Faculty Member');
  const [email, setEmail] = useState(user?.login_email || '');
  const [authenticatorEnabled, setAuthenticatorEnabled] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);

  useEffect(() => {
    getFacultyProfileApi()
      .then((res) => {
        if (res.profile) {
          setNameParts({ prefix: res.profile.prefix || '', firstName: res.profile.firstName || '', middleName: res.profile.middleName || '', lastName: res.profile.lastName || '', suffix: res.profile.suffix || '' });
          if (res.profile.name) setName(res.profile.name);
          if (res.profile.email) setEmail(res.profile.email);
        }
      })
      .catch(() => {});

    getFacultyClassesApi()
      .then((res) => {
        if (res?.classes && Array.isArray(res.classes)) {
          setSubjects(Array.from(new Set(res.classes.map(c => c.courseCode).filter(Boolean))));
        }
      })
      .catch(() => {});
  }, []);
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'F';

  const saveName = (parts: PersonNameParts, code?: string) => updateFacultyProfileApi({ ...parts, ...(code ? { code } : {}) });
  const applyName = (response: NameChangeResponse) => {
    const parts = {
      prefix: response.prefix || '',
      firstName: response.firstName || '',
      middleName: response.middleName || '',
      lastName: response.lastName || '',
      suffix: response.suffix || '',
    };
    setName(response.name);
    setNameParts(parts);
    if (user) setUser({ ...user, display_name: response.name });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div><h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">My Profile</h1><p className="text-xs text-slate-400 mt-1">Maintain your professional details and review your assigned academic scope.</p></div>
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-clinical-650 dark:text-clinical-400 bg-clinical-50 dark:bg-clinical-950/30 px-3 py-2 rounded-xl"><CheckCircle2 className="w-3.5 h-3.5" />Faculty access active</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-5">
          <Card className="p-0 overflow-hidden"><div className="h-20 bg-gradient-to-r from-clinical-600 to-accent-500" /><CardContent className="relative pt-0 pb-5"><div className="-mt-10 w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 p-1 shadow-lg"><div className="w-full h-full rounded-xl bg-gradient-to-tr from-clinical-200 to-accent-200 dark:from-clinical-800 dark:to-accent-900 flex items-center justify-center text-xl font-extrabold text-clinical-700 dark:text-clinical-300">{initials}</div></div><h2 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-100">{name}</h2><ChangeNameDialog currentParts={nameParts} authenticatorEnabled={authenticatorEnabled} onSave={saveName} onSuccess={applyName} /><p className="text-xs text-clinical-600 dark:text-clinical-400 font-semibold mt-0.5">{'Faculty Clinician'}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BookOpen className="w-4.5 h-4.5 text-accent-500" />Assigned subjects</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{subjects.length === 0 ? <span className="text-xs text-slate-400">No assigned subjects.</span> : subjects.map((subject: string) => <span key={subject} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-[10px] font-extrabold text-slate-600 dark:text-slate-400">{subject}</span>)}</CardContent></Card>
        </div>
        <div className="lg:col-span-8 space-y-5">
          <Card className="p-0 overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800/80"><CardTitle className="flex items-center gap-2 text-sm"><UserRound className="w-4.5 h-4.5 text-clinical-550" />Professional information</CardTitle></CardHeader>
            <CardContent className="p-5"><ReadOnlyEmail value={email} /></CardContent>
          </Card>
          <MfaSettingsCard userEmail={email || 'faculty@bicol-u.edu.ph'} roleName="Faculty Member" onAuthenticatorStatusChange={setAuthenticatorEnabled} />
          <GoogleLinkCard />
          <PasswordChangeCard />
        </div>
      </div>
    </div>
  );
};

/** The login email is permanent after activation (REG-009), so it is shown, not edited. */
const ReadOnlyEmail = ({ value }: { value: string }) => (
  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
    Email address
    <span className="relative block">
      <span className="absolute left-3.5 top-4 text-slate-400"><Mail className="w-4 h-4" /></span>
      <input type="text" value={value} readOnly aria-readonly="true" className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 pl-10 px-3.5 py-2.5 text-sm text-slate-600 dark:text-slate-300 outline-none cursor-not-allowed" />
    </span>
    <span className="mt-1 block normal-case tracking-normal font-medium">Your login email cannot be changed.</span>
  </div>
);
