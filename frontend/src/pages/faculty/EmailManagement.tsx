import React, { useMemo, useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock3,
  History,
  Mail,
  Send,
  Users,
  Briefcase,
  Copy,
  AlertCircle,
  XCircle,
  Search,
  BookMarked,
  CalendarDays,
  UserPlus
} from 'lucide-react';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { EmailHistoryTable, EmailLog } from '../../components/email/EmailHistoryTable';
import { EmailPreviewModal, EmailPreviewType } from '../../components/email/EmailPreviewModal';
import {
  createSecretaryInvitation,
  fetchSecretaryInvitations,
  revokeSecretaryInvitation,
  SecretaryInvitation,
} from '../../services/authService';

type Tab = 'student_invites' | 'secretary' | 'history';

const initialLogs: EmailLog[] = [];

export const EmailManagement: React.FC = () => {
  const { students = [] } = useApp();
  const { user } = useAuth();

  const assignedClasses = ['Section 4-A', 'Section 4-B'];

  const [tab, setTab] = useState<Tab>('student_invites');
  const [selected, setSelected] = useState<string[]>([]);
  
  // Filter Dropdown States
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>('2025-2026');
  const [search, setSearch] = useState('');

  const [preview, setPreview] = useState(false);
  const [previewType, setPreviewType] = useState<EmailPreviewType>('consent');
  const [previewStudentId, setPreviewStudentId] = useState('');
  
  const [logs, setLogs] = useState<EmailLog[]>(initialLogs);
  const [secretaryInvs, setSecretaryInvs] = useState<SecretaryInvitation[]>([]);
  
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const safeStudents = useMemo(() => students || [], [students]);

  const loadSecretaryInvitations = async () => {
    try {
      setSecretaryInvs(await fetchSecretaryInvitations());
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Unable to load invitations.' });
    }
  };

  const fetchEmailLogs = () => {
    setLoadingLogs(true);
    import('../../services/apiClient')
      .then(m => m.getFacultyEmailLogsApi())
      .then(res => {
        if (Array.isArray(res.logs)) {
          setLogs(res.logs as EmailLog[]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  };

  useEffect(() => {
    void loadSecretaryInvitations();
    fetchEmailLogs();
  }, [students]);

  // Filter students based on selected Class Section filter & search
  const filteredStudents = useMemo(() => {
    return safeStudents.filter((s) => {
      const matchesClass = selectedClassId === 'all' || 
        s.classSections?.some(cs => cs.classId === selectedClassId || cs.className?.includes(selectedClassId));
      const matchesSearch = (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
                            (s.studentId || '').toLowerCase().includes(search.toLowerCase()) ||
                            (s.email || '').toLowerCase().includes(search.toLowerCase());
      return matchesClass && matchesSearch;
    });
  }, [safeStudents, selectedClassId, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selected.length === filteredStudents.length) {
      setSelected([]);
    } else {
      setSelected(filteredStudents.map(s => s.id));
    }
  };

  // Send Email Action (Student Invites & Secretary Invites)
  const handleSendEmails = async () => {
    if (!selected.length) {
      setNotice({ type: 'error', message: 'Please select at least one student recipient.' });
      return;
    }

    setIsSending(true);
    setNotice(null);

    if (tab === 'secretary') {
      // Send Secretary Invitations for selected students
      let count = 0;
      for (const studentId of selected) {
        const student = safeStudents.find((s) => s.id === studentId || s.studentId === studentId);
        if (!student) continue;

        const res = await createSecretaryInvitation({
          studentId: student.studentId,
          studentName: student.name,
          email: student.email,
          facultyName: user?.display_name || 'Faculty Member',
          className: student.classSections?.[0]?.className || 'Section 4-A',
          classId: student.classSections?.[0]?.classId || 'cls-1',
        });

        if (res.success) {
          count++;
        } else {
          setNotice({ type: 'error', message: res.message });
        }
      }

      await loadSecretaryInvitations();
      fetchEmailLogs();
      setSelected([]);
      setIsSending(false);
      if (count > 0) {
        setNotice({
          type: 'success',
          message: `Class Secretary invitation issued to ${count} student${count === 1 ? '' : 's'}.`,
        });
      }
    } else if (tab === 'student_invites') {
      // Send Student Class Enrollment Invitations
      let count = selected.length;
      setTimeout(() => {
        setIsSending(false);
        setSelected([]);
        fetchEmailLogs();
        setNotice({
          type: 'success',
          message: `Student class enrollment invitation dispatched to ${count} student${count === 1 ? '' : 's'} via email!`
        });
      }, 800);
    }
  };

  const handleRevoke = async (id: string, studentId: string) => {
    const res = await revokeSecretaryInvitation(id, studentId);
    if (res.success) {
      setNotice({ type: 'success', message: 'Class Secretary invitation revoked.' });
      await loadSecretaryInvitations();
      fetchEmailLogs();
    } else {
      setNotice({ type: 'error', message: res.message });
    }
  };

  const handleCopyLink = (token: string) => {
    const link = `${window.location.origin}/activate-secretary?token=${token}`;
    navigator.clipboard.writeText(link);
    setNotice({ type: 'success', message: 'Secretary invitation link copied to clipboard.' });
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Email Management & Class Invitations
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Dispatch official class roster invitations, manage Class Secretary appointments, and track email transmission logs.
          </p>
        </div>

        <div className="text-right hidden sm:block">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 inline-flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            Live Email Gateway • Auto Sending
          </span>
        </div>
      </div>

      {notice && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Control Bar: Tabs & Pill Filter Dropdowns Below */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        {/* Tabs Navigation */}
        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => { setTab('student_invites'); setSelected([]); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              tab === 'student_invites'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Student Class Invitations
          </button>

          <button
            onClick={() => { setTab('secretary'); setSelected([]); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              tab === 'secretary'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Class Secretary Invitations
          </button>

          <button
            onClick={() => { setTab('history'); setSelected([]); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              tab === 'history'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Email History Log ({logs.length})
          </button>
        </div>

        {/* Filters & Search Bar Positioned Below */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          {/* Class Section Filter Dropdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Class Sections</option>
              {assignedClasses.map((clsLabel: string) => (
                <option key={clsLabel} value={clsLabel}>{clsLabel}</option>
              ))}
            </select>
          </div>

          {/* School Year Selector Filter Dropdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors">
            <select
              value={selectedSchoolYear}
              onChange={(e) => setSelectedSchoolYear(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="2025-2026">S.Y. 2025-2026 (Current)</option>
              <option value="2024-2025">S.Y. 2024-2025</option>
            </select>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student ID, name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------
          TAB 1: STUDENT CLASS INVITATIONS
      ---------------------------------------------------- */}
      {tab === 'student_invites' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Student Class Roster Invitations ({filteredStudents.length})
              </h2>
              <p className="text-xs text-slate-400">
                Select enrolled dental students to dispatch class onboarding invitations & activation instructions via email.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewType('consent');
                  setPreviewStudentId(selected[0] || filteredStudents[0]?.id || '');
                  setPreview(true);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer"
              >
                Preview Email
              </button>

              <button
                type="button"
                disabled={isSending || selected.length === 0}
                onClick={handleSendEmails}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Sending Emails...' : `Send Invitations (${selected.length})`}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selected.length > 0 && selected.length === filteredStudents.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Enrolled Class Section</th>
                  <th className="py-3 px-4 text-center">Roster Invitation Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      No enrolled students match current section filter.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map(student => {
                    const isChecked = selected.includes(student.id);
                    return (
                      <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(student.id)}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer"
                          />
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 dark:text-slate-100 block">{student.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{student.studentId} • {student.email}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-[11px] text-slate-700 dark:text-slate-300">
                            {student.classSections?.[0]?.className || 'Section 4-A'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60">
                            Enrolled & Ready
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewType('consent');
                              setPreviewStudentId(student.id);
                              setPreview(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-all cursor-pointer"
                          >
                            Preview
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ----------------------------------------------------
          TAB 2: CLASS SECRETARY INVITATIONS
      ---------------------------------------------------- */}
      {tab === 'secretary' && (
        <Card className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Class Secretary Appointment Invitations
              </h2>
              <p className="text-xs text-slate-400">
                Designate a student as Class Secretary with elevated attendance override & session logging privileges.
              </p>
            </div>

            <button
              type="button"
              disabled={isSending || selected.length === 0}
              onClick={handleSendEmails}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>{isSending ? 'Issuing...' : `Appoint Secretary (${selected.length})`}</span>
            </button>
          </div>

          {/* Student selection for Secretary appointment */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-10">Select</th>
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Class Section</th>
                  <th className="py-3 px-4 text-center">Role Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredStudents.map(student => {
                  const isChecked = selected.includes(student.id);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(student.id)}
                          className="w-4 h-4 accent-emerald-600 cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-800 dark:text-slate-100 block">{student.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{student.studentId} • {student.email}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-[11px] text-slate-700 dark:text-slate-300">
                          {student.classSections?.[0]?.className || 'Section 4-A'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Student Candidate
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Active Secretary Invitations Ledger */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
              Active Secretary Invitation Tokens ({secretaryInvs.length})
            </h3>
            
            {secretaryInvs.length === 0 ? (
              <p className="text-xs text-slate-400">No active Secretary invitation tokens issued yet.</p>
            ) : (
              <div className="space-y-2">
                {secretaryInvs.map(inv => (
                  <div key={inv.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-100 block">{inv.studentName} ({inv.email})</span>
                      <span className="text-[10px] text-slate-400 font-mono">Token: {inv.token} • Status: {inv.status.toUpperCase()}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(inv.token)}
                        className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        Copy Link
                      </button>

                      {inv.status === 'Pending' && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(inv.id, inv.studentId)}
                          className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold text-[11px] hover:bg-rose-100 transition-colors cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ----------------------------------------------------
          TAB 3: EMAIL HISTORY LOG
      ---------------------------------------------------- */}
      {tab === 'history' && (
        <Card className="p-6">
          <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Email Dispatch History ({logs.length})
            </h2>
            <p className="text-xs text-slate-400">Complete transmission audit ledger for student notifications & invitations.</p>
          </div>

          <EmailHistoryTable logs={logs} search={search} onSearch={setSearch} filter={selectedClassId} onFilter={setSelectedClassId} />
        </Card>
      )}

      {/* Email Preview Modal */}
      {preview && (
        <EmailPreviewModal
          isOpen={preview}
          onClose={() => setPreview(false)}
          type={previewType}
          recipientName={safeStudents.find(s => s.id === previewStudentId)?.name || 'Student'}
        />
      )}

    </div>
  );
};
