import React, { useEffect, useState } from 'react';
import { AlertCircle, Camera, ShieldCheck, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { getSecretaryProfileApi } from '../../services/apiClient';

type Profile = {
  name: string;
  email: string;
  assignedClassName: string;
  classroomName: string;
};

export const CCTVFeed: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSecretaryProfileApi()
      .then((response) => setProfile(response.profile))
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the assigned class.',
        );
      });
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
          Biometric & Geofence System Architecture
        </p>
        <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">
          Student Verification Monitoring
        </h1>
        <p className="text-xs text-slate-400">
          {profile?.assignedClassName || 'Assigned class'}
          {profile?.classroomName ? ` — ${profile.classroomName}` : ''}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-600" />
              Student-Facing Facial Recognition & Geofence Architecture
            </CardTitle>
            <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Active System
            </span>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-2xl border border-dashed border-slate-300 bg-slate-950 p-8 flex items-center justify-center dark:border-slate-800 text-center">
              <div className="max-w-md space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/30">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <h2 className="text-base font-bold text-slate-100">
                  Self-Service Student Facial & Location Verification
                </h2>
                <p className="text-xs leading-relaxed text-slate-400">
                  External CCTV cameras and IoT sensors have been replaced. Students initiate attendance verification directly from their personal devices using facial recognition biometrics and BU Dental Clinic geofencing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Attendance Management Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200/60 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Class Secretary Scope
              </p>
              <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                {profile?.name || 'Loading assigned secretary…'}
              </p>
              <p className="text-xs text-slate-400">{profile?.email || ''}</p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-800 dark:text-blue-300">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                As Class Secretary, you monitor verified student check-in entries and handle manual attendance overrides with complete security audit trails.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
