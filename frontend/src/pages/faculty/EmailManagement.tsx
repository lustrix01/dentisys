import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  Clock3,
  History,
  Send,
  Users,
  Briefcase,
  Copy,
  AlertCircle,
  XCircle,
  Search,
  BookMarked,
  UserPlus,
  CalendarDays,
  Filter
} from 'lucide-react';
import { Card } from '../../components/Card';
import Tabs from '../../components/Tabs';
import { showFeedback, requestConfirmation } from '../../components/FeedbackCenter';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { EmailHistoryTable } from '../../components/email/EmailHistoryTable';
import type { EmailAction } from '../../components/email/emailHistory';
import { EmailPreviewModal, EmailPreviewType } from '../../components/email/EmailPreviewModal';
import {
  createSecretaryInvitation,
  fetchSecretaryInvitations,
  revokeSecretaryInvitation,
  SecretaryInvitation,
  validateBicolUEmail,
} from '../../services/authService';
import { createStudentInvitation, removeSecretaryAppointmentApi, getFacultyRetentionApi, saveFacultyRemedialApi, sendFacultyEmailApi, type FacultyRetentionRecord } from '../../services/apiClient';
import { Student } from '../../types';
import { getFacultyStudentsApi, getFacultyClassesApi, getFacultyEmailLogsApi } from '../../services/apiClient';

type Tab = 'student_invites' | 'secretary' | 'midterm_advisory' | 'remedial' | 'history';

const initialLogs: EmailAction[] = [];
const isOfficialBicolEmail = (email: string): boolean => validateBicolUEmail(email, ['bicol-u.edu.ph']).isValid;

const remedialDateLabel = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
};

const manilaToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export const EmailManagement: React.FC = () => {
  const { user } = useAuth();

  const [dbStudents, setDbStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [retentionRecords, setRetentionRecords] = useState<FacultyRetentionRecord[]>([]);
  const [currentSchoolYear, setCurrentSchoolYear] = useState<string>('');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>('all');
  const syInitializedRef = useRef(false);

  useEffect(() => {
    Promise.all([
      getFacultyStudentsApi().catch(() => []),
      getFacultyClassesApi().catch(() => ({ status: 'success', currentSchoolYear: '', classes: [] })),
    ]).then(([stRes, clsRes]) => {
      if (Array.isArray(stRes)) {
        setDbStudents(stRes as unknown as Student[]);
      }
      if (clsRes?.classes && Array.isArray(clsRes.classes)) {
        // CLS-003: Cancelled and Created-by-mistake classes are hidden.
        setClasses(clsRes.classes.filter((c: any) => c.archiveReason !== 'cancelled' && c.archiveReason !== 'mistake'));
      }
      const curSy = clsRes?.currentSchoolYear || '';
      if (curSy) {
        setCurrentSchoolYear(curSy);
        if (!syInitializedRef.current) {
          setSelectedSchoolYear(curSy);
          syInitializedRef.current = true;
        }
      } else if (!syInitializedRef.current && clsRes?.classes && clsRes.classes.length > 0) {
        const syOptions = Array.from(new Set(clsRes.classes.map((c: any) => c.schoolYear).filter(Boolean))).sort().reverse();
        if (syOptions.length > 0) {
          setSelectedSchoolYear(syOptions[0] as string);
          syInitializedRef.current = true;
        }
      }
    });
  }, []);

  const classSchoolYearMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach(c => {
      if (c.schoolYear) {
        map.set(String(c.id), c.schoolYear);
        map.set(String(c.csId), c.schoolYear);
        if (c.csName) map.set(c.csName, c.schoolYear);
        if (c.block) map.set(c.block, c.schoolYear);
      }
    });
    return map;
  }, [classes]);

  const availableSchoolYears = useMemo(() => {
    const years = new Set<string>();
    if (currentSchoolYear) years.add(currentSchoolYear);
    classes.forEach(c => {
      if (c.schoolYear) years.add(c.schoolYear);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [classes, currentSchoolYear]);

  const assignedClasses = useMemo(() => {
    const filtered = selectedSchoolYear === 'all'
      ? classes
      : classes.filter(c => c.schoolYear === selectedSchoolYear);
    return filtered;
  }, [classes, selectedSchoolYear]);

  const classIdOf = (classItem: any) => String(classItem.csId || classItem.id || '');

  const [tab, setTab] = useState<Tab>('student_invites');
  const [selected, setSelected] = useState<string[]>([]);

  // Filter Dropdown States
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const selectedClass = useMemo(
    () => classes.find(classItem => classIdOf(classItem) === selectedClassId) ?? null,
    [classes, selectedClassId],
  );
  // Email History has its own type filter; it is not the class selector.
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (selectedClassId !== 'all' && !assignedClasses.some(classItem => classIdOf(classItem) === selectedClassId)) {
      setSelectedClassId('all');
    }
  }, [assignedClasses, selectedClassId]);

  const [preview, setPreview] = useState(false);
  const [previewType, setPreviewType] = useState<EmailPreviewType>('consent');
  const [previewStudentId, setPreviewStudentId] = useState('');

  const [logs, setLogs] = useState<EmailAction[]>(initialLogs);
  const [studentInvitationStates, setStudentInvitationStates] = useState<Record<string, { status: 'Sent' | 'Failed' | 'Pending' | 'Suppressed'; sentAt: string }>>({});
  const [secretaryInvs, setSecretaryInvs] = useState<SecretaryInvitation[]>([]);
  // Development-only activation links, returned once when an invitation is issued.
  const [secretaryDevLinks, setSecretaryDevLinks] = useState<Record<string, string>>({});

  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  // Also raise the corner notice: the banner is off-screen when the page is scrolled.
  const notify = useCallback((n: { type: 'success' | 'error' | 'warning'; message: string }) => {
    setNotice(n);
    showFeedback(n.message, n.type === 'warning' ? 'info' : n.type);
  }, []);
  const [isSending, setIsSending] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingRetention, setLoadingRetention] = useState(false);
  const [editingRemedialId, setEditingRemedialId] = useState<string | null>(null);
  const [remedialDateDraft, setRemedialDateDraft] = useState('');
  const [savingRemedialId, setSavingRemedialId] = useState<string | null>(null);

  const safeStudents = useMemo(() => dbStudents || [], [dbStudents]);

  const loadSecretaryInvitations = useCallback(async () => {
    try {
      setSecretaryInvs(await fetchSecretaryInvitations());
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Unable to load invitations.' });
    }
  }, []);

  const fetchEmailLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await getFacultyEmailLogsApi();
        if (Array.isArray(res.actions)) {
          setLogs(res.actions);
          const latestByEmail: Record<string, { status: 'Sent' | 'Failed' | 'Pending' | 'Suppressed'; sentAt: string }> = {};
          for (const action of res.actions) {
            if (action.type !== 'Student Invitation') continue;
            for (const recipient of action.recipients) {
              const key = recipient.email.toLowerCase();
              if (!latestByEmail[key]) latestByEmail[key] = { status: recipient.status, sentAt: action.sentAt };
            }
          }
          setStudentInvitationStates(latestByEmail);
        }
    } catch {
      // The immediate invitation result remains visible if a later refresh fails.
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const loadRetentionRecords = useCallback(async () => {
    setLoadingRetention(true);
    try {
      const response = await getFacultyRetentionApi();
      setRetentionRecords(Array.isArray(response.retention) ? response.retention : []);
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load the current Midterm and Remedial eligibility list.' });
    } finally {
      setLoadingRetention(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadSecretaryInvitations();
    void fetchEmailLogs();
    void loadRetentionRecords();
  }, [dbStudents, loadSecretaryInvitations, fetchEmailLogs, loadRetentionRecords]);

  // Filter students based on selected School Year, Class Section filter & search
  const filteredStudents = useMemo(() => {
    return safeStudents.filter((s) => {
      const matchesSchoolYear = selectedSchoolYear === 'all' ||
        (s.classSections && s.classSections.some(sec => classSchoolYearMap.get(String(sec.classId)) === selectedSchoolYear || classSchoolYearMap.get(sec.className || '') === selectedSchoolYear)) ||
        (s.classId && classSchoolYearMap.get(String(s.classId)) === selectedSchoolYear);

      const matchesClass = selectedClassId === 'all'
        || s.classSections?.some(cs => String(cs.classId) === selectedClassId
          || cs.className === selectedClass?.csName
          || cs.className === selectedClass?.block);
      const matchesSearch = (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
                            (s.studentId || '').toLowerCase().includes(search.toLowerCase()) ||
                            (s.email || '').toLowerCase().includes(search.toLowerCase());
      return matchesSchoolYear && matchesClass && matchesSearch;
    });
  }, [safeStudents, selectedClassId, selectedClass, selectedSchoolYear, search, classSchoolYearMap]);
  const invitationEligibleStudents = useMemo(
    () => filteredStudents.filter(student => isOfficialBicolEmail(student.email)),
    [filteredStudents],
  );

  // REG-006: Secretary tab lists one row per (student, section) so a Student can hold several appointments.
  const secretaryRows = useMemo(() => filteredStudents.flatMap((student) =>
    (student.classSections ?? [])
      .filter((sec) =>
        (selectedClassId === 'all' || String(sec.classId) === selectedClassId || sec.className === selectedClass?.csName || sec.className === selectedClass?.block) &&
        (selectedSchoolYear === 'all' || classSchoolYearMap.get(String(sec.classId)) === selectedSchoolYear || classSchoolYearMap.get(sec.className || '') === selectedSchoolYear))
      .map((section) => ({ key: `${student.id}|${section.classId}`, student, section }))
  ), [filteredStudents, selectedClassId, selectedClass, selectedSchoolYear, classSchoolYearMap]);

  const noticeRows = useMemo(() => retentionRecords.flatMap(record => {
    const student = safeStudents.find(candidate => String(candidate.id) === String(record.studentId) || String(candidate.studentId) === String(record.studentId));
    const classId = String(record.classId);
    const matchesClass = selectedClassId === 'all' || classId === selectedClassId;
    const matchesYear = selectedSchoolYear === 'all' || record.schoolYear === selectedSchoolYear;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${record.studentName ?? ''} ${record.studentNumber ?? ''} ${student?.email ?? ''} ${record.subjectCode ?? ''} ${record.className ?? ''}`.toLowerCase().includes(query);
    const pendingAttempt = tab === 'remedial'
      ? record.remedialProgression?.attempts.find(attempt => attempt.outcome === 'pending')
      : undefined;
    // Keep persisted pending attempts visible, including ones that still need
    // a date, so Faculty can see what is preventing an email from being sent.
    const eligible = tab === 'midterm_advisory' ? record.midtermAtRisk === true : Boolean(pendingAttempt);
    if (!eligible || !matchesClass || !matchesYear || !matchesSearch) return [];
    return [{ ...record, email: record.email || student?.email || '', pendingAttempt }];
  }), [retentionRecords, safeStudents, selectedClassId, selectedSchoolYear, search, tab]);

  const selectableNoticeRows = noticeRows.filter(row =>
    isOfficialBicolEmail(row.email) && (tab !== 'remedial' || Boolean(row.pendingAttempt?.scheduledDate))
  );
  const selectedNoticeRows = selectableNoticeRows.filter(row => selected.includes(row.enrollmentId));

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // A section has one Secretary: choosing a student unticks the others of that section.
  const toggleSecretarySelect = (key: string) => {
    const classId = key.split('|')[1];
    setSelected((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev.filter((x) => x.split('|')[1] !== classId), key]));
  };

  // Spec: one Secretary per section, counting a pending invitation.
  const sectionHasSecretary = (classId: string, className: string) =>
    safeStudents.some((st) => st.classSections?.some((sec) => String(sec.classId) === String(classId) && sec.isSecretary))
    || secretaryInvs.some((inv) => inv.status === 'Pending' && inv.className === className);

  const toggleSelectAll = () => {
    if (invitationEligibleStudents.length > 0 && selected.length === invitationEligibleStudents.length) {
      setSelected([]);
    } else {
      setSelected(invitationEligibleStudents.map(s => s.id));
    }
  };

  const invitationClassId = (student: Student): string | null => {
    if (!/^\d+$/.test(student.id)) return null;
    const sections = student.classSections ?? [];
    const target = selectedClassId === 'all'
      ? sections[0]
      : sections.find(section => String(section.classId) === selectedClassId || section.className === selectedClass?.csName || section.className === selectedClass?.block);
    return target && /^\d+$/.test(target.classId) ? target.classId : null;
  };

  // Send Email Action (Student Invites & Secretary Invites)
  const handleSendEmails = async () => {
    if (!selected.length) {
      notify({ type: 'error', message: 'Please select at least one student recipient.' });
      return;
    }

    setIsSending(true);
    setNotice(null);

    const emailActionId = crypto.randomUUID(); // one id per click, shared by every request below
    if (tab === 'secretary') {
      // Send Secretary Invitations for selected students
      let count = 0;
      const refusals: string[] = [];
      for (const key of selected) {
        const [studentId, rowClassId] = key.split('|');
        const student = safeStudents.find((s) => s.id === studentId || s.studentId === studentId);
        if (!student) continue;
        if (!isOfficialBicolEmail(student.email)) {
          refusals.push(`${student.name}: only @bicol-u.edu.ph addresses can receive invitations.`);
          continue;
        }
        const classId = /^\d+$/.test(student.id) && /^\d+$/.test(rowClassId ?? '') ? rowClassId : null;
        if (!classId) {
          notify({ type: 'error', message: `No class section found for ${student.name}.` });
          continue;
        }

        const res = await createSecretaryInvitation({
          studentId: student.studentId,
          studentName: student.name,
          email: student.email,
          facultyName: user?.display_name || 'Faculty Member',
          className: student.classSections?.find(section => section.classId === classId)?.className ?? '',
          classId,
          emailActionId,
        });

        if (res.success) {
          count++;
          const issued = res.invitation;
          if (issued?.devLink) {
            setSecretaryDevLinks(prev => ({ ...prev, [issued.id]: issued.devLink as string }));
          }
        } else {
          refusals.push(`${student.name}: ${res.message}`);
        }
      }

      await loadSecretaryInvitations();
      await fetchEmailLogs();
      setSelected([]);
      setIsSending(false);
      // Green when all succeeded; amber (not red) listing each refusal.
      if (count > 0 || refusals.length > 0) {
        notify({
          type: refusals.length ? 'warning' : 'success',
          message: (count > 0
            ? `Class Secretary appointment processed for ${count} student${count === 1 ? '' : 's'}: students with an account are appointed now; others receive an invitation that activates their Student account.`
            : '')
            + (refusals.length ? ` Not appointed: ${refusals.join(' ')}` : ''),
        });
      }
      const refreshed = await getFacultyStudentsApi();
      if (Array.isArray(refreshed)) setDbStudents(refreshed as unknown as Student[]);
    } else if (tab === 'student_invites') {
      let successCount = 0;
      let failedCount = 0;
      let deliveryFailedCount = 0;
      let registeredCount = 0;
      let unsupportedEmailCount = 0;
      for (const studentId of selected) {
        const student = safeStudents.find((candidate) => candidate.id === studentId);
        if (student && !isOfficialBicolEmail(student.email)) {
          unsupportedEmailCount++;
          continue;
        }
        const accountStatus = student?.accountStatus ?? 'none';
        if (student && accountStatus !== 'none' && accountStatus !== 'pending') {
          registeredCount++;
          continue;
        }
        const classId = student ? invitationClassId(student) : null;
        if (!student || !classId) {
          failedCount++;
          continue;
        }
        try {
          const response = await createStudentInvitation({ studentId: student.id, classId, emailActionId });
          successCount++;
          if (response.delivery_status === 'Failed') deliveryFailedCount++;
        } catch {
          failedCount++;
        }
      }

      setSelected([]);
      await fetchEmailLogs();
      setIsSending(false);
      notify({
        type: failedCount > 0 ? 'error' : deliveryFailedCount > 0 ? 'warning' : 'success',
        message: (deliveryFailedCount > 0
          ? `Student invitations: ${successCount} issued, ${deliveryFailedCount} email deliveries failed, ${failedCount} failed or skipped.`
          : `Student invitations: ${successCount} issued, ${failedCount} failed or skipped.`)
          + (registeredCount > 0 ? ` ${registeredCount} already registered (not re-invited).` : '')
          + (unsupportedEmailCount > 0 ? ` ${unsupportedEmailCount} skipped: only @bicol-u.edu.ph addresses can receive invitations.` : ''),
      });
    }
  };

  const handleSendNotices = async () => {
    if (!selectedNoticeRows.length || (previewType !== 'midterm_advisory' && previewType !== 'remedial_notice')) return;
    setIsSending(true);
    setNotice(null);
    try {
      const result = await sendFacultyEmailApi({
        enrollmentIds: selectedNoticeRows.map(row => row.enrollmentId),
        emailType: previewType === 'midterm_advisory' ? 'Midterm Advisory' : 'Remedial Notice',
      });
      setPreview(false);
      setSelected([]);
      await Promise.all([fetchEmailLogs(), loadRetentionRecords()]);
      notify({ type: result.failedCount ? 'warning' : 'success', message: result.message });
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send the selected student notices.' });
      await loadRetentionRecords();
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveRemedialDate = async (row: FacultyRetentionRecord & { pendingAttempt?: { attemptNumber: 1 | 2; scheduledDate: string | null } }) => {
    const scheduledDate = remedialDateDraft.trim();
    if (!scheduledDate) {
      notify({ type: 'error', message: 'Choose a remedial exam date before saving. The date is required to send the student email.' });
      return;
    }
    if (scheduledDate < manilaToday()) {
      notify({ type: 'error', message: 'Choose today or a future date for the remedial exam.' });
      return;
    }
    if (!row.pendingAttempt) {
      notify({ type: 'error', message: 'This attempt is no longer pending. Refresh the Remedial Notices list and try again.' });
      return;
    }

    setSavingRemedialId(row.enrollmentId);
    try {
      const result = await saveFacultyRemedialApi({
        enrollmentId: row.enrollmentId,
        attemptNumber: row.pendingAttempt.attemptNumber,
        scheduledDate,
      });
      setEditingRemedialId(null);
      setRemedialDateDraft('');
      await Promise.all([loadRetentionRecords(), fetchEmailLogs()]);
      const delivery = result.emailDelivery;
      notify({
        type: delivery && delivery.status !== 'Sent' ? 'warning' : 'success',
        message: delivery?.message ?? 'Remedial exam date saved successfully.',
      });
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save the remedial exam date.' });
    } finally {
      setSavingRemedialId(null);
    }
  };


  const handleRemoveSecretary = async (student: Student, classId: string, className: string) => {
    if (!(await requestConfirmation(`Remove ${student.name} as Class Secretary of ${className}? Their Student access stays the same.`, 'Remove Class Secretary', 'Remove'))) return;
    setIsSending(true);
    setNotice(null);
    try {
      const response = await removeSecretaryAppointmentApi(student.id, classId);
      notify({ type: 'success', message: response.message });
      const refreshed = await getFacultyStudentsApi();
      if (Array.isArray(refreshed)) setDbStudents(refreshed as unknown as Student[]);
    } catch (error) {
      notify({ type: 'error', message: error instanceof Error ? error.message : 'Unable to remove the appointment.' });
      try {
        const refreshed = await getFacultyStudentsApi();
        if (Array.isArray(refreshed)) setDbStudents(refreshed as unknown as Student[]);
      } catch { /* keep the original error notice */ }
    } finally {
      setIsSending(false);
    }
  };

  const handleRevoke = async (id: string, studentId: string) => {
    const res = await revokeSecretaryInvitation(id, studentId);
    if (res.success) {
      notify({ type: 'success', message: 'Class Secretary invitation revoked.' });
      await loadSecretaryInvitations();
      await fetchEmailLogs();
    } else {
      notify({ type: 'error', message: res.message });
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    notify({ type: 'success', message: 'Secretary invitation link copied to clipboard.' });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {notice && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : notice.type === 'warning'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className={`w-4 h-4 flex-shrink-0 ${notice.type === 'warning' ? 'text-amber-500' : 'text-rose-500'}`} />
            )}
            <span>{notice.message}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-500 dark:text-slate-400 hover:text-slate-600 text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Control Bar: Tabs & Pill Filter Dropdowns Below */}
      <div className="flex flex-col gap-4">
        {/* Tabs Navigation */}
        <Tabs
          variant="section"
          color="clinical"
          label="Email sections"
          value={tab}
          onChange={id => {
            setTab(id);
            setSelected([]);
            if (id === 'midterm_advisory' || id === 'remedial') void loadRetentionRecords();
          }}
          className="order-2 min-w-0 max-w-full w-full no-print"
          tabs={[
            { id: 'student_invites', label: 'Student Class Invitations', shortLabel: 'Students' },
            { id: 'secretary', label: 'Class Secretary Invitations', shortLabel: 'Secretary' },
            { id: 'midterm_advisory', label: 'Midterm Advisory', shortLabel: 'Midterm' },
            { id: 'remedial', label: 'Remedial Notices', shortLabel: 'Remedial' },
            { id: 'history', label: 'Email History Log', shortLabel: 'History', count: logs.length },
          ]}
        />

        {/* Filters & Search Bar Positioned Below */}
        <Card className="order-1 no-print p-4 flex flex-col xl:flex-row gap-4 xl:items-center">
          {/* Class Section Filter Dropdown */}
          <div className="w-full xl:flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 flex items-center gap-2 focus-within:ring-2 focus-within:ring-clinical-500">
            <Filter className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              aria-label="Class: course code, section, and course title"
              className="min-w-0 flex-1 pr-6 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="all">All class sections</option>
              {assignedClasses.map((classItem: any) => {
                const classId = classIdOf(classItem);
                const courseCode = classItem.courseCode || 'Course';
                const courseTitle = classItem.courseTitle || classItem.courseName || courseCode;
                const section = classItem.csName || classItem.block || 'Section';
                return <option key={classId} value={classId}>{courseCode} · {section} · {courseTitle}</option>;
              })}
            </select>
          </div>

          {/* School Year Selector Filter Dropdown */}
          <div className="w-full xl:w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 flex items-center gap-2 focus-within:ring-2 focus-within:ring-clinical-500">
            <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <select
              value={selectedSchoolYear}
              onChange={(e) => setSelectedSchoolYear(e.target.value)}
              aria-label="School year"
              className="min-w-0 flex-1 pr-6 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="all">All school years</option>
              {availableSchoolYears.map(sy => (
                <option key={sy} value={sy}>
                  S.Y. {sy}{sy === currentSchoolYear ? ' (Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Search Bar (hidden on History: the history list has its own search) */}
          {tab !== 'history' && <div className="relative w-full xl:w-56">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student ID, name..."
              aria-label="Search students by ID, name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
            />
          </div>}
        </Card>
      </div>

      {/* ----------------------------------------------------
          TAB 1: STUDENT CLASS INVITATIONS
      ---------------------------------------------------- */}
      {tab === 'student_invites' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="sm:flex-1 sm:basis-64">
              <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Student Class Roster Invitations ({filteredStudents.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select enrolled dental students to dispatch class onboarding invitations & activation instructions via email.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewType('class_invitation');
                  setPreviewStudentId(selected[0] || filteredStudents[0]?.id || '');
                  setPreview(true);
                }}
                className="whitespace-nowrap px-4 max-sm:px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer"
              >
                Preview email
              </button>

              <button
                type="button"
                disabled={isSending || selected.length === 0}
                onClick={handleSendEmails}
                className="inline-flex whitespace-nowrap items-center gap-2 px-5 max-sm:px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Sending emails...' : `Send invitations (${selected.length})`}</span>
              </button>
            </div>
          </div>

          {/* Phones (<768px): each row is shown as a stacked block (name first, then section, status and preview). */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse max-md:block">
              <thead className="max-md:block">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] max-md:block">
                  <th className="py-3 px-4 w-10 max-md:block max-md:w-auto max-md:px-0">
                    <label className="inline-flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invitationEligibleStudents.length > 0 && selected.length === invitationEligibleStudents.length}
                        onChange={toggleSelectAll}
                        aria-label="Select all students"
                        className="w-4 h-4 accent-emerald-600 cursor-pointer"
                      />
                      <span className="md:hidden">Select all</span>
                    </label>
                  </th>
                  <th className="py-3 px-4 max-md:hidden">Student Details</th>
                  <th className="py-3 px-4 max-md:hidden">Enrolled Class Section</th>
                  <th className="py-3 px-4 text-center max-md:hidden">Roster Invitation Status</th>
                  <th className="py-3 px-4 text-right max-md:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium max-md:block">
                {filteredStudents.length === 0 ? (
                  <tr className="max-md:block">
                    <td colSpan={5} className="py-10 text-center text-slate-500 dark:text-slate-400 max-md:block">
                      No enrolled students match current section filter.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map(student => {
                    const isChecked = selected.includes(student.id);
                    return (
                      <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors max-md:relative max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:py-3.5 max-md:pl-7">
                        <td className="py-3.5 px-4 max-md:p-0 max-md:absolute max-md:left-0 max-md:top-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isOfficialBicolEmail(student.email)}
                            onChange={() => toggleSelect(student.id)}
                            aria-label={`Select ${student.name}`}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer"
                          />
                        </td>

                        <td className="py-3.5 px-4 max-md:p-0 max-md:w-full max-md:min-w-0">
                          <span className="sr-only md:hidden">Student Details: </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 block">{student.name}</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{student.studentId}<span className="max-md:hidden"> • </span><span className="max-md:block max-md:break-words">{student.email}</span></span>
                          {!isOfficialBicolEmail(student.email) && <span className="mt-1 block text-[10px] font-semibold text-rose-600 dark:text-rose-300">Only @bicol-u.edu.ph addresses can receive invitations.</span>}
                        </td>

                        <td className="py-3.5 px-4 max-md:p-0">
                          <span className="sr-only md:hidden">Enrolled Class Section: </span>
                          <span className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-[11px] text-slate-700 dark:text-slate-300">
                            {student.classSections?.[0]?.className || 'Section 4-A'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center max-md:p-0">
                          <span className="sr-only md:hidden">Roster Invitation Status: </span>
                          {(() => {
                            const invitation = studentInvitationStates[student.email.toLowerCase()];
                            const accountStatus = student.accountStatus ?? 'none';
                            if (accountStatus === 'active' || accountStatus === 'secretary' || accountStatus === 'disabled') {
                              const registeredLabel = accountStatus === 'active' ? 'Registered' : accountStatus === 'secretary' ? 'Secretary account' : 'Account disabled';
                              return <span className="whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60">{registeredLabel}</span>;
                            }
                            const label = !isOfficialBicolEmail(student.email) ? 'Unsupported email domain' : invitation
                              ? invitation.status === 'Sent' ? 'Invitation sent'
                                : invitation.status === 'Failed' ? 'Invitation issued · Delivery failed'
                                  : 'Invitation pending'
                              : accountStatus === 'pending' ? 'Invitation pending' : 'Enrolled & ready';
                            const tone = !isOfficialBicolEmail(student.email)
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200/60'
                              : invitation?.status === 'Failed'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60'
                              : invitation
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/60'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60';
                            return <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${tone}`}>{label}</span>;
                          })()}
                        </td>

                        <td className="py-3.5 px-4 text-right max-md:p-0 max-md:ml-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewType('class_invitation');
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A Class Secretary can start attendance sessions and mark attendance for this section.
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
            <table className="w-full text-left text-xs border-collapse max-md:block">
              <thead className="max-md:hidden">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-10">Select</th>
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Class Section</th>
                  <th className="py-3 px-4 text-center">Role Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium max-md:block">
                {secretaryRows.map(({ key, student, section }) => {
                  const isChecked = selected.includes(key);
                  const sectionTaken = sectionHasSecretary(section.classId, section.className);
                  return (
                    <tr key={key} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors max-md:relative max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:py-3.5 max-md:pl-7">
                      <td className="py-3.5 px-4 max-md:p-0 max-md:absolute max-md:left-0 max-md:top-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={sectionTaken || !isOfficialBicolEmail(student.email)}
                          onChange={() => toggleSecretarySelect(key)}
                          aria-label={`Select ${student.name} for ${section.className || 'this section'}`}
                          className="w-4 h-4 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>

                      <td className="py-3.5 px-4 max-md:p-0 max-md:w-full max-md:min-w-0">
                        <span className="sr-only md:hidden">Student Details: </span>
                        <span className="font-bold text-slate-800 dark:text-slate-100 block">{student.name}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{student.studentId}<span className="max-md:hidden"> • </span><span className="max-md:block max-md:break-words">{student.email}</span></span>
                      </td>

                      <td className="py-3.5 px-4 max-md:p-0">
                        <span className="sr-only md:hidden">Class Section: </span>
                        <span className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-[11px] text-slate-700 dark:text-slate-300">
                          {section.className || '—'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center max-md:p-0 max-md:text-left">
                        <span className="sr-only md:hidden">Role Standing: </span>
                        {section.isSecretary ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Class Secretary</span>
                            <button type="button" disabled={isSending} onClick={() => void handleRemoveSecretary(student, section.classId, section.className)} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold text-[10px] hover:bg-rose-100 disabled:opacity-50 cursor-pointer">Remove</button>
                          </span>
                        ) : (
                          <span className="whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {student.accountStatus === 'active' || student.accountStatus === 'secretary' ? 'Student (has account)' : 'Student (no account yet)'}
                          </span>
                        )}
                        {!isOfficialBicolEmail(student.email) && <span className="block mt-1 text-[10px] font-semibold text-rose-600 dark:text-rose-300">Only @bicol-u.edu.ph addresses can receive invitations.</span>}
                        {sectionTaken && !section.isSecretary && (
                          <span className="block mt-1 text-[10px] text-slate-500 dark:text-slate-400">Section already has a Class Secretary</span>
                        )}
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
              Pending Secretary Invitations ({secretaryInvs.length})
            </h3>

            {secretaryInvs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No pending Secretary invitations.</p>
            ) : (
              <div className="space-y-2">
                {secretaryInvs.map(inv => (
                  <div key={inv.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-100 block">{inv.studentName} ({inv.email})</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Status: {inv.status.toUpperCase()}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {inv.status === 'Pending' && secretaryDevLinks[inv.id] && (
                        <button
                          type="button"
                          onClick={() => handleCopyLink(secretaryDevLinks[inv.id])}
                          className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          Copy dev link
                        </button>
                      )}

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

      {(tab === 'midterm_advisory' || tab === 'remedial') && (
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                {tab === 'midterm_advisory' ? `Midterm Advisory (${noticeRows.length})` : `Scheduled Remedial Notices (${noticeRows.length})`}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {tab === 'midterm_advisory'
                  ? 'Students currently on the Midterm Watchlist are listed with their weighted midterm grade. The email remains informational and does not include grades.'
                  : 'Pending attempts are listed. Add or change a date to email the student automatically; use Preview & resend for a manual retry.'}
                {tab === 'midterm_advisory' && ' Emails are sent only after you preview and confirm.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
              <button
                type="button"
                disabled={loadingRetention || selectableNoticeRows.length === 0}
                onClick={() => setSelected(selectedNoticeRows.length === selectableNoticeRows.length ? [] : selectableNoticeRows.map(row => row.enrollmentId))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
              >
                {selectedNoticeRows.length === selectableNoticeRows.length && selectableNoticeRows.length > 0 ? 'Clear selection' : 'Select all eligible'}
              </button>
              <button
                type="button"
                disabled={isSending || selectedNoticeRows.length === 0}
                onClick={() => {
                  setPreviewType(tab === 'midterm_advisory' ? 'midterm_advisory' : 'remedial_notice');
                  setPreviewStudentId(selectedNoticeRows[0]?.enrollmentId ?? '');
                  setPreview(true);
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-clinical-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-clinical-700 disabled:opacity-50 sm:w-auto"
              >
                <Send className="h-3.5 w-3.5" /> Preview &amp; send ({selectedNoticeRows.length})
              </button>
            </div>
          </div>

          {loadingRetention ? (
            <p role="status" className="py-8 text-center text-sm text-slate-500">Loading current eligibility…</p>
          ) : noticeRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {tab === 'midterm_advisory' ? 'No students currently qualify for a Midterm Advisory.' : 'No scheduled pending remedial attempts match these filters.'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try another class, school year, or search term.</p>
            </div>
          ) : tab === 'midterm_advisory' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse max-md:block">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 max-md:block">
                  <tr className="max-md:block">
                    <th className="w-24 border-b border-slate-200 px-4 py-4 dark:border-slate-800 max-md:hidden">Select</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Student details</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Class section</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Midterm grade</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Midterm GWA</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Advisory email</th>
                  </tr>
                </thead>
                <tbody className="max-md:block">
                  {noticeRows.map(row => {
                    const isChecked = selected.includes(row.enrollmentId);
                    return (
                      <tr key={row.enrollmentId} className="border-b border-slate-100 last:border-0 dark:border-slate-800 max-md:relative max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:py-3.5 max-md:pl-7">
                        <td className="px-4 py-5 align-middle max-md:p-0 max-md:absolute max-md:left-0 max-md:top-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isOfficialBicolEmail(row.email)}
                            onChange={() => toggleSelect(row.enrollmentId)}
                            aria-label={`Select ${row.studentName ?? 'student'} for Midterm Advisory`}
                            className="mt-0.5 h-4 w-4 accent-emerald-600 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-5 max-md:p-0 max-md:w-full max-md:min-w-0">
                          <span className="sr-only md:hidden">Student details: </span>
                          <span className="block font-bold text-slate-800 dark:text-slate-100">{row.studentName || 'Student name unavailable'}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                            {row.studentNumber && <>{row.studentNumber}<span className="px-1.5">•</span></>}
                            <span className="break-all">{row.email || 'No valid institutional email on file'}</span>
                          </span>
                          {row.email && !isOfficialBicolEmail(row.email) && <span className="mt-1 block text-[10px] font-semibold text-rose-600 dark:text-rose-300">Update to an @bicol-u.edu.ph address before sending.</span>}
                        </td>
                        <td className="px-3 py-5 max-md:p-0">
                          <span className="sr-only md:hidden">Class section: </span>
                          <span className="inline-flex rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{row.className || 'Class section'}</span>
                        </td>
                        <td className="px-3 py-5 font-semibold text-slate-700 dark:text-slate-300 max-md:p-0">
                          <span className="sr-only md:hidden">Midterm grade: </span>
                          {row.midtermPercentage == null ? 'Unavailable' : `${Number(row.midtermPercentage).toFixed(0)}%`}
                        </td>
                        <td className="px-3 py-5 font-semibold text-slate-700 dark:text-slate-300 max-md:p-0">
                          <span className="sr-only md:hidden">Midterm GWA: </span>
                          {row.midtermGwa == null ? 'Unavailable' : Number(row.midtermGwa).toFixed(1)}
                        </td>
                        <td className="px-3 py-5 max-md:p-0">
                          <span className="sr-only md:hidden">Advisory email: </span>
                          <span className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold ${row.midtermAdvisorySent ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {row.midtermAdvisorySent ? 'Sent' : 'Not sent'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse max-md:block">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 max-md:block">
                  <tr className="max-md:block">
                    <th className="w-24 border-b border-slate-200 px-4 py-4 dark:border-slate-800 max-md:hidden">Select</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Student details</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Class section</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Attempt / date</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Email status</th>
                    <th className="border-b border-slate-200 px-3 py-4 dark:border-slate-800 max-md:hidden">Schedule</th>
                  </tr>
                </thead>
                <tbody className="max-md:block">
                  {noticeRows.map(row => {
                    const isChecked = selected.includes(row.enrollmentId);
                    const hasScheduledDate = Boolean(row.pendingAttempt?.scheduledDate);
                    const isEditing = editingRemedialId === row.enrollmentId;
                    const isSaving = savingRemedialId === row.enrollmentId;
                    const statusClass = row.remedialNoticeStatus === 'Sent'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : row.remedialNoticeStatus === 'Failed'
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                        : row.remedialNoticeStatus === 'Suppressed'
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
                    const statusLabel = !hasScheduledDate
                      ? 'Waiting for date'
                      : row.remedialNoticeStatus === 'Sent'
                        ? 'Email sent'
                        : row.remedialNoticeStatus === 'Failed'
                          ? 'Email failed · retry available'
                          : row.remedialNoticeStatus === 'Suppressed'
                            ? 'Mailpit only'
                            : row.remedialNoticeStatus === 'Pending'
                              ? 'Email pending'
                              : 'Email not sent';
                    return (
                      <tr key={row.enrollmentId} className="border-b border-slate-100 last:border-0 dark:border-slate-800 max-md:relative max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:py-3.5 max-md:pl-7">
                        <td className="px-4 py-5 align-middle max-md:p-0 max-md:absolute max-md:left-0 max-md:top-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isOfficialBicolEmail(row.email) || !hasScheduledDate}
                            onChange={() => toggleSelect(row.enrollmentId)}
                            aria-label={`Select ${row.studentName ?? 'student'} for Remedial Notice`}
                            className="h-4 w-4 accent-emerald-600 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-5 max-md:p-0 max-md:w-full max-md:min-w-0">
                          <span className="sr-only md:hidden">Student details: </span>
                          <span className="block font-bold text-slate-800 dark:text-slate-100">{row.studentName || 'Student name unavailable'}</span>
                          <span className="mt-0.5 block break-all text-[11px] text-slate-500 dark:text-slate-400">{row.email || 'No valid institutional email on file'}</span>
                          {row.email && !isOfficialBicolEmail(row.email) && <span className="mt-1 block text-[10px] font-semibold text-rose-600 dark:text-rose-300">Update to an @bicol-u.edu.ph address before sending.</span>}
                        </td>
                        <td className="px-3 py-5 max-md:p-0">
                          <span className="sr-only md:hidden">Class section: </span>
                          <span className="inline-flex rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{row.className || 'Class section'}</span>
                        </td>
                        <td className="px-3 py-5 font-semibold text-slate-700 dark:text-slate-300 max-md:p-0">
                          <span className="sr-only md:hidden">Attempt / date: </span>
                          <span className="block">Attempt {row.pendingAttempt?.attemptNumber ?? '—'}</span>
                          <span className="mt-0.5 block text-[11px] font-normal text-slate-500 dark:text-slate-400">{remedialDateLabel(row.pendingAttempt?.scheduledDate) ?? 'Date not set'}</span>
                        </td>
                        <td className="px-3 py-5 max-md:p-0">
                          <span className="sr-only md:hidden">Email status: </span>
                          <span className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold ${statusClass}`}>{statusLabel}</span>
                        </td>
                        <td className="px-3 py-5 max-md:w-full max-md:p-0">
                          <span className="sr-only md:hidden">Schedule: </span>
                          {isEditing ? (
                            <div className="flex min-w-[300px] max-md:min-w-0 max-md:w-full flex-wrap items-center gap-2">
                              <input
                                type="date"
                                aria-label={`Remedial exam date for ${row.studentName ?? 'student'}`}
                                min={manilaToday()}
                                value={remedialDateDraft}
                                onChange={(event) => setRemedialDateDraft(event.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-clinical-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              />
                              <button
                                type="button"
                                disabled={isSaving || !remedialDateDraft}
                                onClick={() => void handleSaveRemedialDate(row)}
                                className="rounded-lg bg-clinical-600 px-3 py-2 text-xs font-bold text-white hover:bg-clinical-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >{isSaving ? 'Saving…' : 'Save date'}</button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => { setEditingRemedialId(null); setRemedialDateDraft(''); }}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >Cancel</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRemedialId(row.enrollmentId);
                                setRemedialDateDraft(row.pendingAttempt?.scheduledDate ?? '');
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >{hasScheduledDate ? 'Edit date' : 'Add date'}</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
            <p className="text-xs text-slate-500 dark:text-slate-400">Complete transmission audit ledger for student notifications & invitations.</p>
          </div>

          <EmailHistoryTable actions={logs} search={search} onSearch={setSearch} filter={historyTypeFilter} onFilter={setHistoryTypeFilter} />
        </Card>
      )}

      {/* Email Preview Modal */}
      {preview && (() => {
        const isNoticePreview = previewType === 'midterm_advisory' || previewType === 'remedial_notice';
        const noticePreviewRow = isNoticePreview ? selectedNoticeRows.find(row => row.enrollmentId === previewStudentId) ?? selectedNoticeRows[0] : null;
        const previewStudent = safeStudents.find(s => s.id === previewStudentId) || filteredStudents[0] || null;
        const targetClass = noticePreviewRow
          ? `${noticePreviewRow.subjectCode || 'Course'} · ${noticePreviewRow.className || 'Class Section'}`
          : previewStudent?.classSections?.[0]?.className || previewStudent?.className || (selectedClassId !== 'all' ? selectedClassId : 'Class Section');
        const classSection = noticePreviewRow?.className || 'Class Section';
        const courseCode = noticePreviewRow?.subjectCode || '';
        const sectionRepeatsCourse = Boolean(courseCode) && classSection.toLowerCase().startsWith(courseCode.toLowerCase());
        const emailClassName = noticePreviewRow && (previewType === 'midterm_advisory' || sectionRepeatsCourse)
          ? classSection
          : targetClass;
        const tokenSnippet = (previewStudent?.studentId || 'sample').toLowerCase().replace(/[^a-z0-9]/g, '');
        return (
          <EmailPreviewModal
            isOpen={preview}
            onClose={() => setPreview(false)}
            type={previewType}
            recipientName={noticePreviewRow?.studentName || previewStudent?.name || 'Dental Student'}
            recipientEmail={noticePreviewRow?.email || previewStudent?.email}
            facultyName={user?.display_name || 'Dr. Roberto Santos, DMD'}
            className={emailClassName}
            schoolYear={noticePreviewRow?.schoolYear || (selectedSchoolYear !== 'all' ? selectedSchoolYear : currentSchoolYear || '2026-2027')}
            invitationLink={`https://dentisys.bicol-u.edu.ph/activate-student?token=inv_${tokenSnippet}_act`}
            recipientCount={isNoticePreview ? selectedNoticeRows.length : 1}
            recipientList={isNoticePreview ? selectedNoticeRows.map(row => `${row.studentName || 'Student'} <${row.email}>`) : []}
            remedialAttempt={noticePreviewRow?.pendingAttempt?.attemptNumber}
            scheduledDate={remedialDateLabel(noticePreviewRow?.pendingAttempt?.scheduledDate)}
            onSend={isNoticePreview ? () => void handleSendNotices() : undefined}
            isSending={isSending}
          />
        );
      })()}

    </div>
  );
};
