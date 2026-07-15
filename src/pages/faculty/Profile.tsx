import React, { useState } from 'react';
import { BookOpen, BriefcaseBusiness, CheckCircle2, Mail, Phone, Save, Stethoscope, UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { recordAudit } from '../../services/auditService';

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-clinical-500';

export const Profile: React.FC = () => {
  const user = JSON.parse(localStorage.getItem('dentisys_user') || '{}');
  const [name, setName] = useState(user.name || 'Faculty Member');
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('Clinical Dentistry');
  const [saved, setSaved] = useState(false);
  const subjects: string[] = user.assignedSubjects || ['CLIN401', 'CLIN402'];
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'F';
  const save = (event: React.FormEvent) => { event.preventDefault(); recordAudit({ action: 'Updated profile', module: 'Profile', description: 'Updated faculty professional profile details.', status: 'Success' }); setSaved(true); setTimeout(() => setSaved(false), 3000); };

  return <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
      <div><h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Faculty Profile</h1><p className="text-xs text-slate-400 mt-1">Maintain your professional details and review your assigned academic scope.</p></div>
      <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-clinical-650 dark:text-clinical-400 bg-clinical-50 dark:bg-clinical-950/30 px-3 py-2 rounded-xl"><CheckCircle2 className="w-3.5 h-3.5" />Faculty access active</div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-4 space-y-5"><Card className="p-0 overflow-hidden"><div className="h-20 bg-gradient-to-r from-clinical-600 to-accent-500" /><CardContent className="relative pt-0 pb-5"><div className="-mt-10 w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 p-1 shadow-lg"><div className="w-full h-full rounded-xl bg-gradient-to-tr from-clinical-200 to-accent-200 dark:from-clinical-800 dark:to-accent-900 flex items-center justify-center text-xl font-extrabold text-clinical-700 dark:text-clinical-300">{initials}</div></div><h2 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-100">{name}</h2><p className="text-xs text-clinical-600 dark:text-clinical-400 font-semibold mt-0.5">{user.title || 'Faculty Clinician'}</p><p className="text-xs text-slate-400 mt-3">{specialty}</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BookOpen className="w-4.5 h-4.5 text-accent-500" />Assigned subjects</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{subjects.map((subject: string) => <span key={subject} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-[10px] font-extrabold text-slate-600 dark:text-slate-400">{subject}</span>)}</CardContent></Card></div>
      <Card className="lg:col-span-8 p-0 overflow-hidden"><CardHeader className="border-b border-slate-100 dark:border-slate-800/80"><CardTitle className="flex items-center gap-2 text-sm"><UserRound className="w-4.5 h-4.5 text-clinical-550" />Professional information</CardTitle></CardHeader><CardContent className="p-5"><form onSubmit={save} className="space-y-5"><div className="grid sm:grid-cols-2 gap-4"><Field label="Full faculty name" value={name} setValue={setName} /><Field label="Email address" value={email} setValue={setEmail} type="email" icon={<Mail className="w-4 h-4" />} /><Field label="Contact number" value={phone} setValue={setPhone} icon={<Phone className="w-4 h-4" />} /><Field label="Clinical specialty" value={specialty} setValue={setSpecialty} icon={<BriefcaseBusiness className="w-4 h-4" />} /></div><div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800"><button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white text-xs font-bold shadow-md shadow-clinical-500/10 transition-all"><Save className="w-4 h-4" />{saved ? 'Profile saved' : 'Save profile'}</button></div></form></CardContent></Card>
    </div>
  </div>;
};
const Field = ({ label, value, setValue, type = 'text', icon }: { label: string; value: string; setValue: (value: string) => void; type?: string; icon?: React.ReactNode }) => <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}<span className="relative block">{icon && <span className="absolute left-3.5 top-4 text-slate-400">{icon}</span>}<input type={type} required={type === 'email'} value={value} onChange={event => setValue(event.target.value)} className={`${inputClass} ${icon ? 'pl-10' : ''}`} /></span></label>;
