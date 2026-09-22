import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pencil, Plus, Search } from 'lucide-react';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import {
  getFacultyRetentionApi,
  saveFacultyRemedialApi,
  updateFacultyRetentionStatusApi,
} from '../../services/apiClient';
import type {
  FacultyRetentionRecord,
  FacultyRetentionState,
} from '../../services/apiClient';

interface RetentionRemedialRecord {
  status: 'pending' | 'passed' | 'failed' | 'unavailable';
  remedialScore: number | null;
  examDate: string | null;
  notes: string | null;
}

interface RetentionRemedialRow {
  record: FacultyRetentionRecord;
  remedial: RetentionRemedialRecord;
}

type Notification = {
  type: 'success' | 'info';
  message: string;
};

const isPersistedText = (value: string | null | undefined): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isFiniteNumber = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const hasPersistedIdentifiers = (record: FacultyRetentionRecord): boolean => (
  isPersistedText(record.enrollmentId)
  && isPersistedText(record.studentId)
  && isPersistedText(record.classId)
);

const canScheduleRecord = (record: FacultyRetentionRecord): boolean => (
  hasPersistedIdentifiers(record)
  && record.state !== 'archived'
  && isPersistedText(record.subjectCode)
);

const canOverrideRecord = (record: FacultyRetentionRecord): boolean => (
  hasPersistedIdentifiers(record) && record.state !== 'archived'
);

const textOrUnavailable = (value: string | null | undefined, label: string): string => (
  isPersistedText(value) ? value : label
);

const readRemedialRecord = (value: Record<string, unknown> | null): RetentionRemedialRecord | null => {
  if (!value) return null;

  const status = value.status;
  const legacyPendingExams = value.pendingExams;
  const hasRemedialShape = status === 'pending'
    || status === 'passed'
    || status === 'failed'
    || Object.prototype.hasOwnProperty.call(value, 'status')
    || typeof legacyPendingExams === 'number'
    || typeof value.examDate === 'string'
    || typeof value.dueDate === 'string'
    || typeof value.remedialScore === 'number'
    || typeof value.notes === 'string'
    || typeof value.subjectCode === 'string'
    || typeof value.completedRemedials === 'number';
  if (!hasRemedialShape) return null;

  const normalizedStatus = status === 'pending' || status === 'passed' || status === 'failed'
    ? status
    : typeof legacyPendingExams === 'number' && Number.isFinite(legacyPendingExams) && legacyPendingExams > 0
      ? 'pending'
      : 'unavailable';

  const rawScore = value.remedialScore;
  const remedialScore = typeof rawScore === 'number' && Number.isFinite(rawScore)
    ? rawScore
    : null;
  const persistedExamDate = typeof value.examDate === 'string' && value.examDate.trim().length > 0
    ? value.examDate
    : typeof value.dueDate === 'string' && value.dueDate.trim().length > 0
      ? value.dueDate
    : null;
  const notes = typeof value.notes === 'string' && value.notes.trim().length > 0
    ? value.notes
    : null;

  return { status: normalizedStatus, remedialScore, examDate: persistedExamDate, notes };
};

const buildRemedialPayload = (
  record: FacultyRetentionRecord,
  status: 'pending' | 'passed' | 'failed',
  options: { examDate?: string; notes?: string; remedialScore?: number },
  existing: Record<string, unknown> | null,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    status,
    studentId: record.studentId,
    classId: record.classId,
  };

  if (isPersistedText(record.subjectCode)) payload.subjectCode = record.subjectCode;
  if (isPersistedText(record.studentName)) payload.studentName = record.studentName;
  if (isPersistedText(record.studentNumber)) payload.studentNumber = record.studentNumber;
  if (isPersistedText(record.className)) payload.className = record.className;
  if (isFiniteNumber(record.gwa)) payload.originalGrade = record.gwa;

  const persistedExamDate = existing && typeof existing.examDate === 'string' && existing.examDate.trim().length > 0
    ? existing.examDate.trim()
    : existing && typeof existing.dueDate === 'string' && existing.dueDate.trim().length > 0
      ? existing.dueDate.trim()
      : '';
  const examDate = typeof options.examDate === 'string' && options.examDate.trim().length > 0
    ? options.examDate.trim()
    : persistedExamDate;
  if (examDate.length > 0) payload.examDate = examDate;

  const notes = typeof options.notes === 'string' && options.notes.trim().length > 0
    ? options.notes.trim()
    : existing && typeof existing.notes === 'string' && existing.notes.trim().length > 0
      ? existing.notes.trim()
      : '';
  if (notes.length > 0) payload.notes = notes;

  if (isFiniteNumber(options.remedialScore)) payload.remedialScore = options.remedialScore;

  return payload;
};

const retentionStateLabel = (state: FacultyRetentionState): string => {
  switch (state) {
    case 'active': return 'Active';
    case 'warning': return 'Warning';
    case 'critical': return 'Critical';
    case 'remedial': return 'Remedial';
    case 'archived': return 'Archived';
    default: return 'Unavailable';
  }
};

const statusBadgeClasses = (state: FacultyRetentionState): string => {
  switch (state) {
    case 'critical': return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60';
    case 'warning': return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60';
    case 'remedial': return 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-200/60';
    case 'active': return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60';
    case 'archived': return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
    default: return 'bg-slate-100 text-slate-500 border border-slate-200';
  }
};

export const RetentionMonitoring: React.FC = () => {
  const [retentionRecords, setRetentionRecords] = useState<FacultyRetentionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState('all');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('all');
  const [activeTab, setActiveTab] = useState<'watchlist' | 'remedials' | 'risk-rules'>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');

  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedScheduleEnrollmentId, setSelectedScheduleEnrollmentId] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  const [selectedResolveEnrollmentId, setSelectedResolveEnrollmentId] = useState<string | null>(null);
  const [remedialScore, setRemedialScore] = useState('');
  const [remedialNotes, setRemedialNotes] = useState('');

  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [selectedOverrideEnrollmentId, setSelectedOverrideEnrollmentId] = useState<string | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<'active' | 'warning' | 'critical' | 'remedial'>('warning');
  const [overrideRemarks, setOverrideRemarks] = useState('');

  const refreshRetention = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await getFacultyRetentionApi();
      setRetentionRecords(Array.isArray(response.retention) ? response.retention : []);
      setLoadError(null);
      return true;
    } catch (requestError) {
      setRetentionRecords([]);
      setLoadError(requestError instanceof Error ? requestError.message : 'Authoritative retention data is unavailable.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRetention();
  }, [refreshRetention]);

  const usableRecords = useMemo(
    () => retentionRecords.filter(hasPersistedIdentifiers),
    [retentionRecords],
  );

  const unavailableRecordCount = retentionRecords.length - usableRecords.length;

  const subjectOptions = useMemo(() => (
    Array.from(new Set(
      usableRecords
        .map(record => record.subjectCode)
        .filter(isPersistedText),
    )).sort((left, right) => left.localeCompare(right))
  ), [usableRecords]);

  const classOptions = useMemo(() => {
    const labels = new Map<string, string>();
    usableRecords.forEach(record => {
      if (!labels.has(record.classId)) {
        labels.set(
          record.classId,
          isPersistedText(record.className)
            ? record.className
            : `Class name unavailable (${record.classId})`,
        );
      }
    });
    return Array.from(labels.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [usableRecords]);

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return usableRecords.filter(record => {
      if (selectedClassId !== 'all' && record.classId !== selectedClassId) return false;
      if (selectedSubjectCode !== 'all' && record.subjectCode !== selectedSubjectCode) return false;
      if (query.length === 0) return true;

      return [
        record.studentName,
        record.studentNumber,
        record.className,
        record.subjectCode,
        record.enrollmentId,
      ].some(value => isPersistedText(value) && value.toLowerCase().includes(query));
    });
  }, [searchQuery, selectedClassId, selectedSubjectCode, usableRecords]);

  const watchlistRecords = useMemo(
    () => filteredRecords.filter(record => record.state !== 'active'),
    [filteredRecords],
  );

  const remedialRows = useMemo<RetentionRemedialRow[]>(() => {
    const rows: RetentionRemedialRow[] = [];
    filteredRecords.forEach(record => {
      const remedial = readRemedialRecord(record.remedial);
      if (remedial) rows.push({ record, remedial });
    });
    return rows;
  }, [filteredRecords]);

  const scheduleCandidates = useMemo(
    () => filteredRecords.filter(canScheduleRecord),
    [filteredRecords],
  );

  const selectedScheduleRecord = useMemo(
    () => usableRecords.find(record => record.enrollmentId === selectedScheduleEnrollmentId) ?? null,
    [selectedScheduleEnrollmentId, usableRecords],
  );

  const selectedResolveRecord = useMemo(
    () => usableRecords.find(record => record.enrollmentId === selectedResolveEnrollmentId) ?? null,
    [selectedResolveEnrollmentId, usableRecords],
  );

  const selectedOverrideRecord = useMemo(
    () => usableRecords.find(record => record.enrollmentId === selectedOverrideEnrollmentId) ?? null,
    [selectedOverrideEnrollmentId, usableRecords],
  );

  const pendingRemedialCount = remedialRows.filter(row => row.remedial.status === 'pending').length;

  const openSchedule = (preferredRecord?: FacultyRetentionRecord) => {
    const candidate = preferredRecord && canScheduleRecord(preferredRecord)
      ? preferredRecord
      : scheduleCandidates[0];
    if (!candidate) {
      showFeedback('Scheduling is unavailable because no persisted enrollment, student, class, and subject identifiers are available.', 'info');
      return;
    }
    setSelectedScheduleEnrollmentId(candidate.enrollmentId);
    setScheduleDate('');
    setScheduleNotes('');
    setIsScheduleOpen(true);
  };

  const openResolve = (row: RetentionRemedialRow) => {
    setSelectedResolveEnrollmentId(row.record.enrollmentId);
    setRemedialScore('');
    setRemedialNotes(row.remedial.notes ?? '');
  };

  const openOverride = (record: FacultyRetentionRecord) => {
    if (!canOverrideRecord(record)) {
      if (record.state === 'archived') {
        showFeedback('Status override is unavailable for archived enrollments.', 'info');
        return;
      }
      showFeedback('Status override is unavailable because persisted identifiers are missing.', 'info');
      return;
    }
    setSelectedOverrideEnrollmentId(record.enrollmentId);
    setOverrideStatus(record.state === 'archived' ? 'warning' : record.state);
    setOverrideRemarks('');
    setIsOverrideOpen(true);
  };

  const resetScheduleForm = () => {
    setIsScheduleOpen(false);
    setSelectedScheduleEnrollmentId('');
    setScheduleDate('');
    setScheduleNotes('');
  };

  const resetResolveForm = () => {
    setSelectedResolveEnrollmentId(null);
    setRemedialScore('');
    setRemedialNotes('');
  };

  const resetOverrideForm = () => {
    setIsOverrideOpen(false);
    setSelectedOverrideEnrollmentId(null);
    setOverrideRemarks('');
  };

  const handleScheduleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedScheduleRecord || !canScheduleRecord(selectedScheduleRecord)) {
      showFeedback('Scheduling is unavailable because the selected record lacks persisted identifiers.', 'info');
      return;
    }
    if (scheduleDate.trim().length === 0) {
      showFeedback('Select a remedial exam date.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveFacultyRemedialApi({
        enrollmentId: selectedScheduleRecord.enrollmentId,
        studentId: selectedScheduleRecord.studentId,
        classId: selectedScheduleRecord.classId,
        remedial: buildRemedialPayload(
          selectedScheduleRecord,
          'pending',
          { examDate: scheduleDate, notes: scheduleNotes },
          null,
        ),
      });
      const refreshed = await refreshRetention();
      resetScheduleForm();
      setNotification({
        type: refreshed ? 'success' : 'info',
        message: refreshed
          ? 'Remedial exam persisted successfully.'
          : 'Remedial exam persisted, but the authoritative list could not be refreshed.',
      });
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to persist the remedial exam.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveRemedial = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedResolveRecord || !hasPersistedIdentifiers(selectedResolveRecord)) {
      showFeedback('Remedial resolution is unavailable because the persisted enrollment identifiers are missing.', 'info');
      return;
    }
    if (selectedResolveRecord.state === 'archived') {
      showFeedback('Remedial resolution is unavailable for archived enrollments.', 'info');
      return;
    }

    const score = Number(remedialScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      showFeedback('Enter a valid percentage score from 0 to 100.', 'error');
      return;
    }

    const status = score >= 75 ? 'passed' : 'failed';
    setIsSubmitting(true);
    try {
      await saveFacultyRemedialApi({
        enrollmentId: selectedResolveRecord.enrollmentId,
        studentId: selectedResolveRecord.studentId,
        classId: selectedResolveRecord.classId,
        remedial: buildRemedialPayload(
          selectedResolveRecord,
          status,
          { notes: remedialNotes, remedialScore: score },
          selectedResolveRecord.remedial,
        ),
      });
      const refreshed = await refreshRetention();
      resetResolveForm();
      setNotification({
        type: refreshed ? 'success' : 'info',
        message: refreshed
          ? 'Remedial result persisted successfully.'
          : 'Remedial result persisted, but the authoritative list could not be refreshed.',
      });
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to persist the remedial result.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverrideSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOverrideRecord || !canOverrideRecord(selectedOverrideRecord)) {
      if (selectedOverrideRecord?.state === 'archived') {
        showFeedback('Status override is unavailable for archived enrollments.', 'info');
        return;
      }
      showFeedback('Status override is unavailable because the persisted identifiers are missing.', 'info');
      return;
    }
    if (overrideRemarks.trim().length < 8) {
      showFeedback('Enter at least eight characters explaining the override.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateFacultyRetentionStatusApi({
        studentId: selectedOverrideRecord.studentId,
        classId: selectedOverrideRecord.classId,
        status: overrideStatus,
        reason: overrideRemarks.trim(),
      });
      const refreshed = await refreshRetention();
      resetOverrideForm();
      setNotification({
        type: refreshed ? 'success' : 'info',
        message: refreshed
          ? 'Retention status persisted successfully.'
          : 'Retention status persisted, but the authoritative list could not be refreshed.',
      });
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to persist the retention status.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStatusBadge = (state: FacultyRetentionState) => (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${statusBadgeClasses(state)}`}>
      {retentionStateLabel(state)}
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Retention & Remedial Monitoring</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">View persisted Faculty retention records and submit authorized remedial or status updates.</p>
        </div>
        <button type="button" onClick={() => openSchedule()} disabled={scheduleCandidates.length === 0 || isLoading} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all" title={scheduleCandidates.length === 0 ? 'Scheduling is unavailable without persisted enrollment identifiers.' : 'Schedule remedial exam'}>
          <Plus className="w-4 h-4" />
          <span>Schedule Remedial</span>
        </button>
      </div>

      {notification && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /><span>{notification.message}</span></div>
          <button type="button" onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">Dismiss</button>
        </div>
      )}

      {loadError && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={() => { void refreshRetention(); }} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold">Retry</button>
        </div>
      )}

      {unavailableRecordCount > 0 && !loadError && (
        <div className="p-4 rounded-2xl bg-slate-500/10 border border-slate-500/20 text-slate-700 dark:text-slate-300 text-xs font-semibold">{unavailableRecordCount} retention record(s) are unavailable because the server did not provide all persisted identifiers required for actions.</div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button type="button" onClick={() => { setActiveTab('watchlist'); setSearchQuery(''); }} className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'watchlist' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>Retention Watchlist ({watchlistRecords.length})</button>
          <button type="button" onClick={() => { setActiveTab('remedials'); setSearchQuery(''); }} className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'remedials' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>Remedial Exams ({pendingRemedialCount} Pending)</button>
          <button type="button" onClick={() => { setActiveTab('risk-rules'); setSearchQuery(''); }} className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'risk-rules' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>Midterm Evaluation Rules</button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs">
            <select value={selectedSubjectCode} onChange={(event) => setSelectedSubjectCode(event.target.value)} className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1">
              <option value="all">All Subjects</option>
              {subjectOptions.map(subjectCode => <option key={subjectCode} value={subjectCode}>{subjectCode}</option>)}
            </select>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs">
            <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1">
              <option value="all">All Class Sections</option>
              {classOptions.map(([classId, label]) => <option key={classId} value={classId}>{label}</option>)}
            </select>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs" />
          </div>
        </div>
      </div>

      {activeTab === 'watchlist' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div><h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">Retention Watchlist ({watchlistRecords.length})</h2><p className="text-xs text-slate-400">Only server-persisted retention states and academic values are shown.</p></div>
            <button type="button" onClick={() => openSchedule()} disabled={scheduleCandidates.length === 0 || isLoading} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"><Plus className="w-3.5 h-3.5" /><span>Schedule Remedial Exam</span></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]"><th className="py-3 px-4">Student</th><th className="py-3 px-4">Student Number</th><th className="py-3 px-4">Subject</th><th className="py-3 px-4">Class</th><th className="py-3 px-4 text-center">Persisted GWA / %</th><th className="py-3 px-4">State</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {watchlistRecords.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-slate-400">{isLoading ? 'Loading authoritative retention records...' : 'No persisted retention records match the selected filters.'}</td></tr> : watchlistRecords.map(record => (
                  <tr key={record.enrollmentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">{textOrUnavailable(record.studentName, 'Student name unavailable')}</td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono">{textOrUnavailable(record.studentNumber, 'Student number unavailable')}</td>
                    <td className="py-3.5 px-4 font-mono">{textOrUnavailable(record.subjectCode, 'Subject code unavailable')}</td>
                    <td className="py-3.5 px-4">{textOrUnavailable(record.className, `Class name unavailable (${record.classId})`)}</td>
                    <td className="py-3.5 px-4 text-center font-mono">{isFiniteNumber(record.gwa) ? record.gwa.toFixed(2) : 'GWA unavailable'}<span className="block text-[10px] text-slate-400">{isFiniteNumber(record.percentage) ? `${record.percentage.toFixed(2)}%` : 'Percentage unavailable'}</span></td>
                    <td className="py-3.5 px-4">{renderStatusBadge(record.state)}</td>
                    <td className="py-3.5 px-4 text-right"><div className="flex items-center justify-end gap-1.5"><button type="button" onClick={() => openSchedule(record)} disabled={!canScheduleRecord(record)} title={!canScheduleRecord(record) ? (record.state === 'archived' ? 'Scheduling unavailable for archived enrollments.' : 'Scheduling unavailable: persisted subject data is missing.') : 'Schedule remedial exam'} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[11px] font-bold transition-all shadow-xs"><Plus className="w-3 h-3" /><span>Remedial</span></button><button type="button" onClick={() => openOverride(record)} disabled={!canOverrideRecord(record)} title={!canOverrideRecord(record) ? (record.state === 'archived' ? 'Status override unavailable for archived enrollments.' : 'Status override unavailable: persisted identifiers are missing.') : 'Override retention status'} className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 text-[11px] font-bold"><Pencil className="w-3.5 h-3.5" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'remedials' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div><h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">Persisted Remedial Records ({remedialRows.length})</h2><p className="text-xs text-slate-400">Remedial state is read from the authoritative retention API. Removal is unavailable because no approved authoritative delete contract exists.</p></div>
            <button type="button" onClick={() => openSchedule()} disabled={scheduleCandidates.length === 0 || isLoading} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"><Plus className="w-3.5 h-3.5" /><span>Schedule Remedial Exam</span></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead><tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]"><th className="py-3 px-4">Student</th><th className="py-3 px-4">Subject / Class</th><th className="py-3 px-4">Exam Date</th><th className="py-3 px-4">Score & Outcome</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {remedialRows.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-slate-400">{isLoading ? 'Loading authoritative remedial records...' : 'No persisted remedial records match the selected filters.'}</td></tr> : remedialRows.map(row => (
                  <tr key={row.record.enrollmentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">{textOrUnavailable(row.record.studentName, 'Student name unavailable')}<span className="block text-[10px] text-slate-400 font-mono">{textOrUnavailable(row.record.studentNumber, 'Student number unavailable')}</span></td>
                    <td className="py-3.5 px-4"><span className="font-mono font-bold text-[10px]">{textOrUnavailable(row.record.subjectCode, 'Subject code unavailable')}</span><span className="block text-[10px] text-slate-400">{textOrUnavailable(row.record.className, `Class name unavailable (${row.record.classId})`)}</span></td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">{row.remedial.examDate ?? 'Exam date unavailable'}</td>
                    <td className="py-3.5 px-4">{row.remedial.status === 'passed' ? <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200/60">PASSED ({isFiniteNumber(row.remedial.remedialScore) ? `${row.remedial.remedialScore}%` : 'Score unavailable'})</span> : row.remedial.status === 'failed' ? <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200/60">FAILED ({isFiniteNumber(row.remedial.remedialScore) ? `${row.remedial.remedialScore}%` : 'Score unavailable'})</span> : row.remedial.status === 'pending' ? <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200/60">Scheduled / Pending Exam</span> : <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold text-[11px] border border-slate-200">Outcome unavailable</span>}</td>
                    <td className="py-3.5 px-4 text-right"><div className="flex items-center justify-end gap-2">{row.remedial.status === 'pending' && row.record.state !== 'archived' && <button type="button" onClick={() => openResolve(row)} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs">Grade Exam</button>}{row.remedial.status === 'unavailable' && <span className="text-[10px] text-amber-600" title="Persisted remedial data does not include an actionable status">Outcome unavailable</span>}<span className="text-[10px] text-slate-400" title="No approved authoritative delete endpoint exists">Removal unavailable</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'risk-rules' && <Card className="p-6"><h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">Midterm Academic Warning Evaluation Rules</h2><p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Unavailable: the authoritative retention endpoint does not expose the attendance components or rule-factor detail required for this view. No client-derived risk results are shown.</p></Card>}

      {isScheduleOpen && (
        <Modal isOpen={isScheduleOpen} onClose={resetScheduleForm} title="Schedule Remedial Exam">
          <form onSubmit={handleScheduleSubmit} className="space-y-4 text-xs">
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select persisted enrollment</label><select required value={selectedScheduleEnrollmentId} onChange={(event) => setSelectedScheduleEnrollmentId(event.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer">{scheduleCandidates.map(record => <option key={record.enrollmentId} value={record.enrollmentId}>{textOrUnavailable(record.studentName, 'Student name unavailable')} — {textOrUnavailable(record.studentNumber, 'Student number unavailable')} · {textOrUnavailable(record.subjectCode, 'Subject code unavailable')} · {textOrUnavailable(record.className, `Class name unavailable (${record.classId})`)}</option>)}</select>{scheduleCandidates.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Scheduling unavailable: no persisted enrollment with a subject code is available.</p>}</div>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Remedial Exam Date</label><input type="date" required value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium" /></div>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Remedial Notes / Instructions</label><textarea rows={3} value={scheduleNotes} onChange={(event) => setScheduleNotes(event.target.value)} placeholder="Optional faculty notes..." className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium" /></div>
            <div className="pt-2 flex justify-end gap-2"><button type="button" onClick={resetScheduleForm} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">Cancel</button><button type="submit" disabled={isSubmitting || !selectedScheduleRecord || !canScheduleRecord(selectedScheduleRecord)} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold shadow-md shadow-emerald-600/20">{isSubmitting ? 'Saving...' : 'Confirm & Schedule Exam'}</button></div>
          </form>
        </Modal>
      )}

      {selectedResolveRecord && (
        <Modal isOpen={Boolean(selectedResolveRecord)} onClose={resetResolveForm} title="Grade Remedial Exam Result">
          <form onSubmit={handleResolveRemedial} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-300">{textOrUnavailable(selectedResolveRecord.studentName, 'Student name unavailable')} · {textOrUnavailable(selectedResolveRecord.subjectCode, 'Subject code unavailable')}</p>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Percentage Score (%)</label><input type="number" min="0" max="100" required value={remedialScore} onChange={(event) => setRemedialScore(event.target.value)} placeholder="Enter score" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold text-sm" /><span className="text-[11px] text-slate-400 block mt-1">Scores at or above 75% are submitted as passed.</span></div>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Faculty Remarks</label><textarea rows={3} value={remedialNotes} onChange={(event) => setRemedialNotes(event.target.value)} placeholder="Optional faculty notes..." className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium" /></div>
            <div className="pt-2 flex justify-end gap-2"><button type="button" onClick={resetResolveForm} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">Cancel</button><button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold shadow-md shadow-emerald-600/20">{isSubmitting ? 'Saving...' : 'Save Exam Grade'}</button></div>
          </form>
        </Modal>
      )}

      {isOverrideOpen && selectedOverrideRecord && (
        <Modal isOpen={isOverrideOpen} onClose={resetOverrideForm} title="Override Retention Status">
          <form onSubmit={handleOverrideSubmit} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-300">{textOrUnavailable(selectedOverrideRecord.studentName, 'Student name unavailable')} · {textOrUnavailable(selectedOverrideRecord.subjectCode, 'Subject code unavailable')}</p>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select New Status</label><select value={overrideStatus} onChange={(event) => setOverrideStatus(event.target.value as 'active' | 'warning' | 'critical' | 'remedial')} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"><option value="active">Active / Cleared</option><option value="warning">Retention Warning</option><option value="critical">Critical Watchlist</option><option value="remedial">Remedial Assigned</option></select></div>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Reason for Override</label><textarea rows={3} required value={overrideRemarks} onChange={(event) => setOverrideRemarks(event.target.value)} placeholder="Enter at least eight characters..." className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium" /></div>
            <div className="pt-2 flex justify-end gap-2"><button type="button" onClick={resetOverrideForm} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">Cancel</button><button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold shadow-md shadow-emerald-600/20">{isSubmitting ? 'Saving...' : 'Save Override'}</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
};
