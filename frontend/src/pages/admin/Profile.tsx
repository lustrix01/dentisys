import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Mail, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { MfaSettingsCard } from '../../components/MfaSettingsCard';
import { useAuth } from '../../context/AuthContext';
import { recordAudit } from '../../services/auditService';
import { getAdminProfileApi, updateAdminProfileApi } from '../../services/apiClient';
import { normalizePersonName } from '../../utils/nameNormalization';

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-accent-500';
export const Profile: React.FC = () => {
  const { user } = useAuth();
  const [name, setName] = useState(user?.display_name || 'Academic Dean');
  const [email, setEmail] = useState(user?.login_email || '');
  const [office, setOffice] = useState('Dean Office');
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getAdminProfileApi()
      .then((res) => {
        if (res.profile) {
          if (res.profile.name) setName(res.profile.name);
          if (res.profile.email) setEmail(res.profile.email);
          if (res.profile.office) setOffice(res.profile.office);
        }
      })
      .catch(() => {});
  }, []);

  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'D';
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      const normalizedName = normalizePersonName(name);
      await updateAdminProfileApi({ name: normalizedName, email, office });
      setName(normalizedName);
      recordAudit({ action: 'Updated profile', module: 'Profile', description: 'Updated Dean executive profile details.', status: 'Success' });
      setSaved(true);
      setMessage({ type: 'success', text: 'Profile saved successfully.' });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to update profile', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update profile.' });
    }
  };
  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Dean Profile</h1>
          <p className="text-xs text-slate-400 mt-1">Executive identity and institutional administration details.</p>
        </div>
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/30 px-3 py-2 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5" />Administrator access
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-5">
          <Card className="p-0 overflow-hidden">
            <div className="h-20 bg-gradient-to-r from-accent-600 to-violet-500" />
            <CardContent className="relative pt-0 pb-5">
              <div className="-mt-10 w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 p-1 shadow-lg">
                <div className="w-full h-full rounded-xl bg-gradient-to-tr from-accent-200 to-violet-200 dark:from-accent-850 dark:to-violet-900 flex items-center justify-center text-xl font-extrabold text-accent-700 dark:text-accent-300">{initials}</div>
              </div>
              <h2 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-100">{name}</h2>
              <p className="text-xs text-accent-600 dark:text-accent-400 font-semibold mt-0.5">{'Academic Dean'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="w-4.5 h-4.5 text-accent-500" />Role capabilities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <p>Academic policy configuration</p>
              <p>Retention standard oversight</p>
              <p>System data administration</p>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-8 space-y-5">
          <Card className="p-0 overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
              <CardTitle className="flex items-center gap-2 text-sm"><UserRound className="w-4.5 h-4.5 text-accent-500" />Executive contact information</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={save} className="space-y-5">
                {message && <div className={`p-3.5 rounded-xl text-xs font-semibold ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'}`}>{message.text}</div>}
                <div className="grid sm:grid-cols-2 gap-4">
                  <Label label="Full name"><input required value={name} onChange={event => setName(event.target.value.replace(/[0-9]/g, ''))} onBlur={() => setName(normalizePersonName(name))} className={inputClass} /></Label>
                  <Label label="Email address" icon={<Mail className="w-4 h-4" />}><input required type="email" value={email} onChange={event => setEmail(event.target.value)} className={`${inputClass} pl-10`} /></Label>
                  <Label label="Office location" icon={<Building2 className="w-4 h-4" />}><input value={office} onChange={event => setOffice(event.target.value)} className={`${inputClass} pl-10`} /></Label>
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold shadow-md transition-all"><Save className="w-4 h-4" />{saved ? 'Profile saved' : 'Save profile'}</button>
                </div>
              </form>
            </CardContent>
          </Card>
          <MfaSettingsCard userEmail={email || 'dean@bicol-u.edu.ph'} roleName="Administrator" />
        </div>
      </div>
    </div>
  );
};
const Label = ({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) => <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider"><span className="relative block">{icon && <span className="absolute left-3.5 top-4 z-10 text-slate-400">{icon}</span>}{label}{children}</span></label>;

