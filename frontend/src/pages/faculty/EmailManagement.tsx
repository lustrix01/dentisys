import React, { useMemo, useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock3,
  History,
  Mail,
  Send,
  ShieldCheck,
  TriangleAlert,
  Users,
  Briefcase,
  Copy,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { EmailHistoryTable, EmailLog } from '../../components/email/EmailHistoryTable';
import { EmailPreviewModal, EmailPreviewType } from '../../components/email/EmailPreviewModal';
import {
  createSecretaryInvitation,
  getSecretaryInvitations,
  revokeSecretaryInvitation,
  SecretaryInvitation,
} from '../../services/authService';

type Tab = 'consent' | 'risk' | 'secretary' | 'history';

const initialLogs: EmailLog[] = [
  { id: 'mail-1', recipient: 'Sarah Jane V. Ramos', subject: 'Privacy Consent for Facial Recognition', type: 'Privacy Consent', sentAt: 'Jul 15, 2026, 9:42 AM', status: 'Sent' },
  { id: 'mail-2', recipient: 'Bianca S. Cruz', subject: 'Academic Support & At-Risk Notification', type: 'At-Risk Notification', sentAt: 'Jul 14, 2026, 2:18 PM', status: 'Sent' },
  { id: 'mail-3', recipient: 'Diana G. Rivera', subject: 'Privacy Consent for Facial Recognition', type: 'Privacy Consent', sentAt: 'Jul 13, 2026, 10:05 AM', status: 'Pending' },
  { id: 'mail-4', recipient: 'Jude Christian D. Reyes', subject: 'Academic Support & At-Risk Notification', type: 'At-Risk Notification', sentAt: 'Jul 12, 2026, 4:31 PM', status: 'Failed' },
];

export const EmailManagement: React.FC = () => {
  const { students, updateFaceConsent } = useApp();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('consent');
  const [selected, setSelected] = useState<string[]>([]);
  
  const [preview, setPreview] = useState(false);
  const [previewType, setPreviewType] = useState<EmailPreviewType>('consent');
  const [previewStudentId, setPreviewStudentId] = useState('');
  
  const [logs, setLogs] = useState<EmailLog[]>(initialLogs);
  const [secretaryInvs, setSecretaryInvs] = useState<SecretaryInvitation[]>([]);
  
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const loadSecretaryInvitations = () => {
    setSecretaryInvs(getSecretaryInvitations());
  };

  useEffect(() => {
    loadSecretaryInvitations();
    // Load stored email logs if present
    try {
      const storedLogs = JSON.parse(localStorage.getItem('dentisys_email_logs') || '[]');
      if (Array.isArray(storedLogs) && storedLogs.length > 0) {
        setLogs((prev) => {
          const combined = [...storedLogs, ...prev];
          const unique = Array.from(new Set(combined.map((a) => a.id))).map((id) =>
            combined.find((a) => a.id === id)!
          );
          return unique;
        });
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const isConsent = tab === 'consent';
  const isRisk = tab === 'risk';
  const isSecretary = tab === 'secretary';

  const availableStudents = useMemo(() => {
    if (isConsent) return students.filter((s) => !s.faceEnrolled);
    if (isRisk) return students.filter((s) => s.status !== 'active');
    if (isSecretary) return students;
    return [];
  }, [students, isConsent, isRisk, isSecretary]);

  const consentCounts = students.reduce(
    (count, s) => ({
      ...count,
      [s.consentStatus || 'pending']: count[s.consentStatus || 'pending'] + 1,
    }),
    { pending: 0, approved: 0, declined: 0 } as Record<string, number>
  );

  const atRiskReason = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s?.remedialExams.length ? 'Pending remedial requirement' : `Retention standing: ${s?.status}`;
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Send Email Action
  const handleSendEmails = async () => {
    if (!selected.length) {
      setNotice({ type: 'error', message: 'Please select at least one student before sending.' });
      return;
    }

    const nowStr = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

    if (isSecretary) {
      // Send Secretary Invitations for selected students
      let count = 0;
      for (const studentId of selected) {
        const student = students.find((s) => s.id === studentId);
        if (!student) continue;

        const res = await createSecretaryInvitation({
          studentId: student.id,
          studentName: student.name,
          email: student.email,
          facultyName: user?.display_name || '',
          className: student.className || 'Clinical Rotation A',
          classId: student.classId || 'CLINIC-A',
        });

        if (res.success) count++;
      }

      loadSecretaryInvitations();
      setSelected([]);
      setNotice({
        type: 'success',
        message: `Class Secretary invitation email issued to ${count} student${count > 1 ? 's' : ''}.`,
      });
    } else {
      // Send Consent or Risk Emails
      const newLogs: EmailLog[] = selected.map((id) => {
        const student = students.find((s) => s.id === id)!;
        return {
          id: `mail-${Date.now()}-${id}`,
          recipient: student.name,
          subject: isConsent
            ? 'Privacy Consent for Facial Recognition'
            : 'Academic Support & At-Risk Notification',
          type: isConsent ? 'Privacy Consent' : 'At-Risk Notification',
          sentAt: nowStr,
          status: 'Sent',
        };
      });

      setLogs((prev) => [...newLogs, ...prev]);
      setSelected([]);
      setNotice({
        type: 'success',
        message: `${isConsent ? 'Consent request' : 'At-risk notification'} sent to ${
          selected.length
        } student${selected.length > 1 ? 's' : ''}.`,
      });
    }
  };

  const handleRevokeInvitation = async (invId: string) => {
    const res = await revokeSecretaryInvitation(invId, user?.display_name || '');
    if (res.success) {
      setNotice({ type: 'success', message: res.message });
      loadSecretaryInvitations();
    }
  };

  const handleCopyLink = (token: string) => {
    const origin = window.location.origin;
    const link = `${origin}/activate-secretary?token=${token}`;
    navigator.clipboard.writeText(link);
    setNotice({ type: 'success', message: 'Class Secretary activation link copied to clipboard!' });
  };

  const respondConsent = (status: 'approved' | 'declined') => {
    if (!previewStudentId) return;
    updateFaceConsent?.(previewStudentId, status);
    setNotice({ type: 'success', message: `Consent ${status} and response recorded.` });
    setPreview(false);
  };

  const previewStudent = students.find((s) => s.id === previewStudentId) || (selected.length === 1 ? students.find((s) => s.id === selected[0]) : undefined);
  const previewStudentName = previewStudent?.name || (selected.length === 1 ? students.find((s) => s.id === selected[0])?.name || 'Selected student' : `${selected.length} selected students`);
  const previewSubjectConcerns = previewStudent?.enrolledSubjects
    .filter((subject) => subject.grade > 2.5 || subject.hasRemedial)
    .map((subject) => `${subject.code} — ${subject.name}`)
    .join('; ');

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-clinical-600">
            Faculty Communications Portal
          </p>
          <h2 className="text-3xl font-heading font-bold text-slate-800 dark:text-slate-100">
            Email Management & Appointments
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Issue official academic notifications, privacy consent requests, and Class Secretary appointment invitations.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Mail className="w-4 h-4 text-clinical-600" /> Mock Email Gateway — Automated sending & tracking
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          role="status"
          className={`flex items-center justify-between gap-2 p-3.5 rounded-xl border text-sm font-semibold animate-in fade-in ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{notice.message}</span>
          </div>
          <button className="font-bold text-xs hover:underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {(
          [
            { id: 'consent', label: 'Privacy Consent', icon: ShieldCheck },
            { id: 'risk', label: 'At-Risk Notices', icon: TriangleAlert },
            { id: 'secretary', label: 'Class Secretary Invitations', icon: Briefcase },
            { id: 'history', label: 'Email History Log', icon: History },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              setSelected([]);
            }}
            className={`shrink-0 px-4 py-3 text-sm font-bold border-b-2 flex gap-2 items-center cursor-pointer transition-colors ${
              tab === item.id
                ? 'border-clinical-600 text-clinical-700 dark:text-clinical-400 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Email History Tab View */}
      {tab === 'history' ? (
        <Card>
          <EmailHistoryTable
            logs={logs}
            search={search}
            onSearch={setSearch}
            filter={filter}
            onFilter={setFilter}
          />
        </Card>
      ) : isSecretary ? (
        /* Class Secretary Invitations Management Tab */
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  Appoint Class Secretary
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Select a student to issue an official Class Secretary invitation email with a unique activation link.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPreviewType('secretary');
                    setPreviewStudentId(selected.length === 1 ? selected[0] : '');
                    setPreview(true);
                  }}
                  disabled={!selected.length}
                  className="px-3 py-2 rounded-xl border border-blue-200 text-blue-700 disabled:opacity-40 text-xs font-bold"
                >
                  Preview Invitation
                </button>
                <button
                  onClick={handleSendEmails}
                  disabled={!selected.length}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold flex gap-1.5 items-center cursor-pointer shadow-md"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send Invitation {selected.length ? `(${selected.length})` : ''}
                </button>
              </div>
            </div>

            {/* Student Selection Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                    <th className="p-3">
                      <input
                        type="checkbox"
                        aria-label="Select all students"
                        checked={availableStudents.length > 0 && selected.length === availableStudents.length}
                        onChange={(e) =>
                          setSelected(e.target.checked ? availableStudents.map((s) => s.id) : [])
                        }
                      />
                    </th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">BU Email Address</th>
                    <th className="p-3">Class & Year</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {availableStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.name}`}
                          checked={selected.includes(s.id)}
                          onChange={() => toggleSelect(s.id)}
                        />
                      </td>
                      <td className="p-3 font-bold text-slate-700 dark:text-slate-200">{s.name}</td>
                      <td className="p-3 text-slate-500">{s.email}</td>
                      <td className="p-3 text-slate-500">
                        {s.className || 'Clinical Rotation A'} · Year {s.yearLevel}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setPreviewType('secretary');
                            setPreviewStudentId(s.id);
                            setPreview(true);
                          }}
                          className="text-blue-600 font-bold hover:underline"
                        >
                          Preview
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Active Invitations Tracker */}
          <Card className="p-5">
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 mb-1">
              Issued Secretary Invitations Tracker
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Track activation status (Pending, Accepted, Expired, Revoked) and copy invitation activation links.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                    <th className="p-3">Student Recipient</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Expires On</th>
                    <th className="p-3 text-right">Invitation Link & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {secretaryInvs.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                      <td className="p-3">
                        <p className="font-bold text-slate-800 dark:text-slate-200">{inv.studentName}</p>
                        <p className="text-slate-400">{inv.email}</p>
                      </td>
                      <td className="p-3 text-slate-500 font-medium">{inv.className}</td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.status === 'Accepted'
                              ? 'bg-emerald-100 text-emerald-700'
                              : inv.status === 'Revoked'
                              ? 'bg-rose-100 text-rose-700'
                              : inv.status === 'Expired'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-100 text-amber-800 animate-pulse'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">
                        {new Date(inv.expiresAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCopyLink(inv.token)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3 text-blue-600" /> Copy Link
                          </button>

                          {inv.status === 'Pending' && (
                            <button
                              onClick={() => handleRevokeInvitation(inv.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" /> Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {secretaryInvs.length === 0 && (
                <div className="py-8 text-center text-slate-400">
                  <Briefcase className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  No Class Secretary invitations issued yet.
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : (
        /* Consent & At-Risk Tabs */
        <>
          {isConsent && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                ['Pending', consentCounts.pending, 'text-amber-600'],
                ['Approved', consentCounts.approved, 'text-emerald-600'],
                ['Declined', consentCounts.declined, 'text-rose-600'],
              ].map(([label, value, color]) => (
                <Card key={String(label)} className="p-4">
                  <p className="text-xs text-slate-500">{label} Consent</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </Card>
              ))}
            </div>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="p-5 flex flex-col md:flex-row justify-between gap-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100">
                  {isConsent ? 'Facial recognition consent requests' : 'Students requiring academic support'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">Select recipients for individual or bulk sending.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPreviewType(isConsent ? 'consent' : 'risk');
                    setPreviewStudentId(selected.length === 1 ? selected[0] : '');
                    setPreview(true);
                  }}
                  disabled={!selected.length}
                  className="px-3 py-2 rounded-xl border border-clinical-200 text-clinical-700 disabled:opacity-40 text-xs font-bold cursor-pointer"
                >
                  Preview
                </button>
                <button
                  onClick={handleSendEmails}
                  disabled={!selected.length}
                  className="px-4 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 disabled:bg-slate-300 text-white text-xs font-bold flex gap-1.5 items-center cursor-pointer shadow-md"
                >
                  <Send className="w-3.5 h-3.5" /> Send {selected.length ? `(${selected.length})` : ''}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-400 uppercase tracking-wide">
                    <th className="p-4">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={availableStudents.length > 0 && selected.length === availableStudents.length}
                        onChange={(e) =>
                          setSelected(e.target.checked ? availableStudents.map((s) => s.id) : [])
                        }
                      />
                    </th>
                    <th className="p-4">Student</th>
                    <th className="p-4">Academic details</th>
                    {isConsent ? (
                      <>
                        <th className="p-4">Consent</th>
                        <th className="p-4">Enrollment eligibility</th>
                      </>
                    ) : (
                      <th className="p-4">Reason</th>
                    )}
                    <th className="p-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {availableStudents.map((s) => {
                    const consent = s.consentStatus || 'pending';
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${s.name}`}
                            checked={selected.includes(s.id)}
                            onChange={() => toggleSelect(s.id)}
                          />
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-slate-700 dark:text-slate-200">{s.name}</p>
                          <p className="text-slate-400">
                            {s.studentId} · {s.email}
                          </p>
                        </td>
                        <td className="p-4 text-slate-500">
                          Year {s.yearLevel} · GWA {s.overallGWA.toFixed(2)}
                          <br />
                          <span className="capitalize">{s.status} standing</span>
                        </td>
                        {isConsent ? (
                          <>
                            <td className="p-4">
                              <span
                                className={`px-2 py-1 rounded-full font-bold ${
                                  consent === 'approved'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : consent === 'declined'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {consent}
                              </span>
                              {s.consentRespondedAt && (
                                <p className="mt-1 text-slate-400">
                                  <Clock3 className="inline w-3 h-3" /> {s.consentRespondedAt}
                                </p>
                              )}
                            </td>
                            <td className="p-4 font-semibold">
                              {consent === 'approved' ? (
                                <span className="text-emerald-600">Eligible</span>
                              ) : (
                                <span className="text-rose-600">Not eligible</span>
                              )}
                            </td>
                          </>
                        ) : (
                          <td className="p-4 text-rose-600 font-medium">{atRiskReason(s.id)}</td>
                        )}
                        <td className="p-4">
                          <button
                            onClick={() => {
                              setPreviewType(isConsent ? 'consent' : 'risk');
                              setPreviewStudentId(s.id);
                              setPreview(true);
                            }}
                            className="text-clinical-700 font-bold hover:underline"
                          >
                            Preview
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {availableStudents.length === 0 && (
                <div className="py-12 text-center text-slate-400">
                  <Users className="w-6 h-6 mx-auto mb-2" />
                  No students need this communication right now.
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Email Preview Modal */}
      <EmailPreviewModal
        isOpen={preview}
        onClose={() => setPreview(false)}
        type={previewType}
        recipientName={previewStudentName}
        facultyName={user?.display_name || ''}
        academicSummary={
          previewStudent ? `${previewStudent.status} standing, GWA ${previewStudent.overallGWA.toFixed(2)}` : undefined
        }
        subjectsOfConcern={previewSubjectConcerns}
        className={previewStudent?.className || 'Clinical Rotation A'}
        invitationLink={
          selected.length === 1 && isSecretary
            ? `${window.location.origin}/activate-secretary?token=demo`
            : undefined
        }
        onConsentAction={isConsent && previewStudentId ? respondConsent : undefined}
      />
    </div>
  );
};
