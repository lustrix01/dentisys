import { emptyNameParts, type PersonNameParts } from '../../components/PersonNameFields';
import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Mail, MapPin, ShieldCheck, UserRound, Users, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { MfaSettingsCard } from '../../components/MfaSettingsCard';
import { ChangeNameDialog, type NameChangeResponse } from '../../components/ChangeNameDialog';
import { GoogleLinkCard } from '../../components/GoogleLinkCard';
import { PasswordChangeCard } from '../../components/PasswordChangeCard';
import { useAuth } from '../../context/AuthContext';
import { getSecretaryProfileApi, updateSecretaryProfileApi } from '../../services/apiClient';

export const Profile: React.FC = () => {
  const [nameParts, setNameParts] = useState(emptyNameParts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authenticatorEnabled, setAuthenticatorEnabled] = useState(false);
  const { user, setUser } = useAuth();

  const [profile, setProfile] = useState<{
    id: string;
    name: string;
    email: string;
    title: string;
    assignedClassName: string;
    classroomName: string;
  }>({
    id: '',
    name: '',
    email: '',
    title: '',
    assignedClassName: '',
    classroomName: '',
  });

  useEffect(() => {
    setLoading(true);
    getSecretaryProfileApi()
      .then(res => {
        if (res.profile) {
          setNameParts({ prefix: res.profile.prefix || '', firstName: res.profile.firstName || '', middleName: res.profile.middleName || '', lastName: res.profile.lastName || '', suffix: res.profile.suffix || '' });
          setProfile(res.profile);
        }
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Unable to fetch profile from server.');
      })
      .finally(() => setLoading(false));
  }, []);

  const saveName = (parts: PersonNameParts, code?: string) => updateSecretaryProfileApi({ ...parts, ...(code ? { code } : {}) });
  const applyName = (response: NameChangeResponse) => {
    const parts = {
      prefix: response.prefix || '',
      firstName: response.firstName || '',
      middleName: response.middleName || '',
      lastName: response.lastName || '',
      suffix: response.suffix || '',
    };
    setNameParts(parts);
    setProfile(prev => ({ ...prev, name: response.name }));
    if (user) setUser({ ...user, display_name: response.name });
  };

  const name = profile.name || 'Secretary';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'S';

  const details = [
    { label: 'Email address', value: profile.email || 'Not available', icon: Mail },
    { label: 'Assigned class', value: profile.assignedClassName || 'Not assigned', icon: Users },
    { label: 'Classroom', value: profile.classroomName || 'Not assigned', icon: MapPin },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Profile
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Review and update the account and classroom scope assigned to your attendance role.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Assigned access active
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading profile details...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-5">
            <Card className="p-0 overflow-hidden">
              <div className="h-20 bg-gradient-to-r from-blue-600 to-sky-500" />
              <CardContent className="relative pt-0 pb-5">
                <div className="-mt-10 w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 p-1 shadow-lg">
                  <div className="w-full h-full rounded-xl bg-gradient-to-tr from-blue-200 to-sky-200 dark:from-blue-800 dark:to-sky-900 flex items-center justify-center text-xl font-extrabold text-blue-700 dark:text-blue-300">
                    {initials}
                  </div>
                </div>
                <h2 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-100">{name}</h2>
                <ChangeNameDialog currentParts={nameParts} authenticatorEnabled={authenticatorEnabled} onSave={saveName} onSuccess={applyName} />
                <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">{profile.title}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4.5 h-4.5 text-blue-500" />
                  Access scope
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                You can review class attendance, submit manual overrides, and view your assigned classroom camera. Class assignment changes require an administrator.
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8 space-y-5">
            <Card className="p-0 overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <UserRound className="w-4.5 h-4.5 text-blue-500" />
                  Assignment details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid sm:grid-cols-2 gap-3">
                  {details.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-150 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Icon className="w-4 h-4 text-blue-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {/* Facial Biometric Information & Data Privacy Audit Card */}
      <Card className="p-6 space-y-4">
        <CardHeader className="p-0 border-b border-slate-100 dark:border-slate-800 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Camera className="w-4.5 h-4.5 text-blue-600" />
            Facial Biometric & Data Privacy Information
          </CardTitle>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-slate-800 dark:text-slate-100">Secretary Attendance Operations</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Class Secretaries supervise room attendance and manual overrides. Student self-service biometrics are managed under Student view.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              Role Scoped
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-2">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Data Privacy Act of 2012 (RA 10173) Compliance</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
              Your consent record is retained for audit compliance. Attendance records and manual overrides are cryptographically signed and immutable.
            </p>
          </div>
        </div>
      </Card>

      <PasswordChangeCard />

      <MfaSettingsCard userEmail={profile.email || 'secretary@bicol-u.edu.ph'} roleName="Class Secretary" onAuthenticatorStatusChange={setAuthenticatorEnabled} />
      <GoogleLinkCard />
    </div>
  );
};
