import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, History, Mail, Send, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { EmailHistoryTable, EmailLog } from '../../components/email/EmailHistoryTable';
import { EmailPreviewModal } from '../../components/email/EmailPreviewModal';

type Tab = 'consent' | 'risk' | 'history';
const initialLogs: EmailLog[] = [
  { id: 'mail-1', recipient: 'Sarah Jane V. Ramos', subject: 'Privacy Consent for Facial Recognition', type: 'Privacy Consent', sentAt: 'Jul 15, 2026, 9:42 AM', status: 'Sent' },
  { id: 'mail-2', recipient: 'Bianca S. Cruz', subject: 'Academic Support & At-Risk Notification', type: 'At-Risk Notification', sentAt: 'Jul 14, 2026, 2:18 PM', status: 'Sent' },
  { id: 'mail-3', recipient: 'Diana G. Rivera', subject: 'Privacy Consent for Facial Recognition', type: 'Privacy Consent', sentAt: 'Jul 13, 2026, 10:05 AM', status: 'Pending' },
  { id: 'mail-4', recipient: 'Jude Christian D. Reyes', subject: 'Academic Support & At-Risk Notification', type: 'At-Risk Notification', sentAt: 'Jul 12, 2026, 4:31 PM', status: 'Failed' },
];

export const EmailManagement: React.FC = () => {
  const { students, updateFaceConsent } = useApp();
  const user = JSON.parse(localStorage.getItem('dentisys_user') || '{"name":"Dr. Eleanor Vance"}');
  const [tab, setTab] = useState<Tab>('consent');
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [previewStudent, setPreviewStudent] = useState('');
  const [logs, setLogs] = useState<EmailLog[]>(initialLogs);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all');
  const isConsent = tab === 'consent';
  const available = useMemo(() => isConsent ? students.filter(s => !s.faceEnrolled) : students.filter(s => s.status !== 'active'), [students, isConsent]);
  const consentCounts = students.reduce((count, s) => ({ ...count, [s.consentStatus || 'pending']: count[s.consentStatus || 'pending'] + 1 }), { pending: 0, approved: 0, declined: 0 } as Record<string, number>);
  const atRiskReason = (id: string) => { const s = students.find(x => x.id === id); return s?.remedialExams.length ? 'Pending remedial requirement' : `Retention standing: ${s?.status}`; };
  const toggle = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const send = () => {
    if (!selected.length) return setNotice('Select at least one student before sending.');
    const now = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    setLogs(prev => [...selected.map(id => { const student = students.find(s => s.id === id)!; return { id: `mail-${Date.now()}-${id}`, recipient: student.name, subject: isConsent ? 'Privacy Consent for Facial Recognition' : 'Academic Support & At-Risk Notification', type: isConsent ? 'Privacy Consent' as const : 'At-Risk Notification' as const, sentAt: now, status: 'Sent' as const }; }), ...prev]);
    setNotice(`${isConsent ? 'Consent request' : 'At-risk notification'} sent to ${selected.length} student${selected.length > 1 ? 's' : ''}.`); setSelected([]);
  };
  const respond = (status: 'approved' | 'declined') => { if (!previewStudent) return; updateFaceConsent(previewStudent, status); setNotice(`Consent ${status} and response time recorded.`); setPreview(false); };
  const previewName = students.find(s => s.id === previewStudent)?.name || (selected.length === 1 ? students.find(s => s.id === selected[0])?.name || 'Selected student' : `${selected.length} selected students`);
  const previewStudentData = students.find(s => s.id === previewStudent) || (selected.length === 1 ? students.find(s => s.id === selected[0]) : undefined);
  const subjectConcerns = previewStudentData?.enrolledSubjects.filter(subject => subject.grade > 2.5 || subject.hasRemedial).map(subject => `${subject.code} — ${subject.name}`).join('; ');

  return <div className="space-y-6 pb-8">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-clinical-600">Faculty communications</p><h2 className="text-3xl font-heading font-bold text-slate-800 dark:text-slate-100">Email Management</h2><p className="mt-1 text-sm text-slate-500">Send secure academic communications and track delivery in one place.</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><Mail className="w-4 h-4 text-clinical-600" /> Mock email service — ready to connect to a provider</div></div>
    {notice && <div role="status" className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm"><CheckCircle2 className="w-4 h-4" />{notice}<button className="ml-auto font-bold" onClick={() => setNotice('')}>×</button></div>}
    <div className="flex gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800">{([{ id: 'consent', label: 'Privacy Consent', icon: ShieldCheck }, { id: 'risk', label: 'At-Risk Notices', icon: TriangleAlert }, { id: 'history', label: 'Email History', icon: History }] as const).map(item => <button key={item.id} onClick={() => { setTab(item.id); setSelected([]); }} className={`shrink-0 px-4 py-3 text-sm font-bold border-b-2 flex gap-2 items-center ${tab === item.id ? 'border-clinical-600 text-clinical-700 dark:text-clinical-400' : 'border-transparent text-slate-500'}`}><item.icon className="w-4 h-4" />{item.label}</button>)}</div>
    {tab === 'history' ? <Card><EmailHistoryTable logs={logs} search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} /></Card> : <>
      {isConsent && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[['Pending', consentCounts.pending, 'text-amber-600'], ['Approved', consentCounts.approved, 'text-emerald-600'], ['Declined', consentCounts.declined, 'text-rose-600']].map(([label, value, color]) => <Card key={String(label)} className="p-4"><p className="text-xs text-slate-500">{label} Consent</p><p className={`text-2xl font-bold ${color}`}>{value}</p></Card>)}</div>}
      <Card className="p-0 overflow-hidden"><div className="p-5 flex flex-col md:flex-row justify-between gap-4 border-b border-slate-100 dark:border-slate-800"><div><h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">{isConsent ? 'Facial recognition consent requests' : 'Students requiring academic support'}</h3><p className="text-xs text-slate-500 mt-1">Select recipients for individual or bulk sending.</p></div><div className="flex gap-2"><button onClick={() => { setPreviewStudent(selected.length === 1 ? selected[0] : ''); setPreview(true); }} disabled={!selected.length} className="px-3 py-2 rounded-xl border border-clinical-200 text-clinical-700 disabled:opacity-40 text-xs font-bold">Preview</button><button onClick={send} disabled={!selected.length} className="px-3 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 disabled:bg-slate-300 text-white text-xs font-bold flex gap-1.5 items-center"><Send className="w-3.5 h-3.5" />Send {selected.length ? `(${selected.length})` : ''}</button></div></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-400 uppercase tracking-wide"><th className="p-4"><input aria-label="Select all" type="checkbox" checked={available.length > 0 && selected.length === available.length} onChange={e => setSelected(e.target.checked ? available.map(s => s.id) : [])} /></th><th className="p-4">Student</th><th className="p-4">Academic details</th>{isConsent ? <><th className="p-4">Consent</th><th className="p-4">Enrollment eligibility</th></> : <th className="p-4">Reason</th>}<th className="p-4">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{available.map(s => { const consent = s.consentStatus || 'pending'; return <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20"><td className="p-4"><input aria-label={`Select ${s.name}`} type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} /></td><td className="p-4"><p className="font-bold text-slate-700 dark:text-slate-200">{s.name}</p><p className="text-slate-400">{s.studentId} · {s.email}</p></td><td className="p-4 text-slate-500">Year {s.yearLevel} · GWA {s.overallGWA.toFixed(2)}<br /><span className="capitalize">{s.status} standing</span></td>{isConsent ? <><td className="p-4"><span className={`px-2 py-1 rounded-full font-bold ${consent === 'approved' ? 'bg-emerald-100 text-emerald-700' : consent === 'declined' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{consent}</span>{s.consentRespondedAt && <p className="mt-1 text-slate-400"><Clock3 className="inline w-3 h-3" /> {s.consentRespondedAt}</p>}</td><td className="p-4 font-semibold">{consent === 'approved' ? <span className="text-emerald-600">Eligible</span> : <span className="text-rose-600">Not eligible</span>}</td></> : <td className="p-4 text-rose-600 font-medium">{atRiskReason(s.id)}</td>}<td className="p-4"><button onClick={() => { setPreviewStudent(s.id); setPreview(true); }} className="text-clinical-700 font-bold hover:underline">Preview</button></td></tr>; })}</tbody></table>{available.length === 0 && <div className="py-12 text-center text-slate-400"><Users className="w-6 h-6 mx-auto mb-2" />No students need this communication right now.</div>}</div></Card>
    </>}
    <EmailPreviewModal isOpen={preview} onClose={() => setPreview(false)} type={isConsent ? 'consent' : 'risk'} recipientName={previewName} facultyName={user.name} academicSummary={previewStudentData ? `${previewStudentData.status} standing, GWA ${previewStudentData.overallGWA.toFixed(2)}` : undefined} subjectsOfConcern={subjectConcerns} onConsentAction={isConsent && previewStudent ? respond : undefined} />
  </div>;
};
