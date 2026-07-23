import React, { useEffect, useState } from 'react';
import { AlertCircle, MonitorOff, Video } from 'lucide-react';
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
          Optional Classroom Integration
        </p>
        <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">
          CCTV Monitoring
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
              <Video className="w-5 h-5 text-slate-400" />
              Camera Integration
            </CardTitle>
            <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Not configured
            </span>
          </CardHeader>
          <CardContent>
            <div className="aspect-video rounded-2xl border border-dashed border-slate-300 bg-slate-950 flex items-center justify-center dark:border-slate-700">
              <div className="max-w-md p-8 text-center">
                <MonitorOff className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <h2 className="text-sm font-bold text-slate-200">
                  CCTV integration not configured
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  DentiSys has no connected camera provider. This page does not
                  access the device webcam or simulate an institutional feed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Available Attendance Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200/60 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Secretary
              </p>
              <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                {profile?.name || 'Loading assigned secretary…'}
              </p>
              <p className="text-xs text-slate-400">{profile?.email || ''}</p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-800 dark:text-blue-300">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Manual attendance and audited attendance overrides remain
                available for the assigned section.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
