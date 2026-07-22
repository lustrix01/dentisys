import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Mail, MapPin, Save, ShieldCheck, UserRound, Users, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { getSecretaryProfileApi, updateSecretaryProfileApi } from '../../services/apiClient';
import { getCurrentSecretary } from './utils';

export const Profile: React.FC = () => {
  const secretary = getCurrentSecretary();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [profile, setProfile] = useState<{
    id: string;
    name: string;
    email: string;
    title: string;
    assignedClassName: string;
    classroomName: string;
    cctvCameraId: string;
  }>({
    id: '',
    name: secretary?.name || 'Class Secretary',
    email: secretary?.email || '',
    title: secretary?.title || 'Class Secretary',
    assignedClassName: secretary?.assignedClassName || 'Clinical Rotation A (Section 4A)',
    classroomName: secretary?.classroomName || 'Dental Clinic B - Room 402',
    cctvCameraId: secretary?.cctvCameraId || 'CCTV-CLINIC-A-01',
  });

  const [editName, setEditName] = useState(profile.name);
  const [editEmail, setEditEmail] = useState(profile.email);

  useEffect(() => {
    setLoading(true);
    getSecretaryProfileApi()
      .then(res => {
        if (res.profile) {
          setProfile(res.profile);
          setEditName(res.profile.name);
          setEditEmail(res.profile.email);
        }
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Unable to fetch profile from server.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();

    if (trimmedName.length < 2) {
      setMessage({ type: 'error', text: 'Name must be at least 2 characters long.' });
      return;
    }

    if (!trimmedEmail.endsWith('@bicol-u.edu.ph')) {
      setMessage({ type: 'error', text: 'Official Bicol University email address (@bicol-u.edu.ph) required.' });
      return;
    }

    setSaving(true);
    try {
      const res = await updateSecretaryProfileApi({ name: trimmedName, email: trimmedEmail });
      setProfile(prev => ({ ...prev, name: trimmedName, email: trimmedEmail }));
      setMessage({ type: 'success', text: res.message || 'Profile updated successfully.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const name = profile.name || 'Class Secretary';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'S';

  const details = [
    { label: 'Email address', value: profile.email || 'Not available', icon: Mail },
    { label: 'Assigned class', value: profile.assignedClassName || 'Clinical Rotation A', icon: Users },
    { label: 'Classroom', value: profile.classroomName || 'Dental Clinic B - Room 402', icon: MapPin },
    { label: 'CCTV assignment', value: profile.cctvCameraId || 'CCTV-CLINIC-A-01', icon: Camera },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Class Secretary Profile
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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <UserRound className="w-4.5 h-4.5 text-blue-500" />
                  Update Profile Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdate} className="space-y-4">
                  {message && (
                    <div className={`p-3.5 rounded-xl text-xs font-semibold ${
                      message.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                    }`}>
                      {message.text}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Display Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value.replace(/[0-9]/g, ''))}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Institutional Email</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/10 disabled:opacity-50"
                    >
                      {saving ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {saving ? 'Saving...' : 'Save Profile Changes'}
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

