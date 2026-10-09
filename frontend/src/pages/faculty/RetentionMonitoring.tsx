import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, Pencil, Plus, Search, Calculator, Filter } from 'lucide-react';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import {
  getFacultyRetentionApi,
  saveFacultyRemedialApi,
  saveFacultyCostRecoveryApi,
  updateFacultyRetentionStatusApi,
  unlockFacultyWatchlistApi,
} from '../../services/apiClient';
import { percentageToGWA } from '../../utils/gradeHelper';
import type {
  FacultyRetentionRecord,
  FacultyRetentionState,
} from '../../services/apiClient';

type RemedialStage =
  | 'none'
  | 'attempt_1_pending'
  | 'attempt_2_available'
  | 'attempt_2_pending'
  | 'passed'
  | 'cost_recovery_required'
  | 'cost_recovery_passed'
  | 'cost_recovery_failed'
  | 'legacy_unclassified';

type RemedialAttemptStatus = 'pending' | 'passed' | 'failed';

interface RemedialAttemptView {
  attemptNumber: 1 | 2;
  scheduledDate: string | null;
  percentage: number | null;
  status: RemedialAttemptStatus | null;
  notes: string | null;
  updatedAt: string | null;
}

interface RemedialProgressionView {
  stage: RemedialStage;
  attempts: RemedialAttemptView[];
  passedAttempt: 1 | 2 | null;
  legacyUnclassified: boolean;
  costRecoveryGrade?: number | null;
  /** When the student was cleared: a passing attempt or a passing cost recovery. */
  clearedAt?: string | null;
}

function RiskBadge({ risk }: { risk: FacultyRetentionRecord['risk'] }) {
  if (!risk) return <span className="text-[10px] text-slate-400">Not enough data</span>;
  const tone = risk.level === 'High'
    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
    : risk.level === 'At Risk' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  const detail = risk.assumedAssessments === null
    ? 'Five or more below-passing (75%) assessments would still keep the grade better than 2.50.'
    : risk.assumedAssessments === 0
      ? 'The current grade is already 2.50 or worse.'
      : `${risk.assumedAssessments} more below-passing (75%) assessment${risk.assumedAssessments === 1 ? '' : 's'} would bring the grade to 2.50 or worse.`;
  return <span title={`${detail} (${risk.period} grade; informational only)`} className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${tone}`}>{risk.level}</span>;
}

const isMidtermRiskVisible = (record: FacultyRetentionRecord): boolean => (
  record.midtermComplete === true || record.watchlistUnlocked === true
);

const hasVisibleMidtermRisk = (record: FacultyRetentionRecord): boolean => (
  isMidtermRiskVisible(record) && (record.risk?.level === 'High' || record.risk?.level === 'At Risk')
);

// Use the same cells and actions as stacked cards on phones and a table from sm up.
const RETENTION_TABLE_LAYOUT = 'max-sm:block max-sm:[&_thead]:hidden max-sm:[&_tbody]:block max-sm:[&_tr]:grid max-sm:[&_tr]:grid-cols-1 max-sm:[&_tr]:mb-4 max-sm:[&_tr]:rounded-xl max-sm:[&_tr]:border max-sm:[&_tr]:border-slate-200 dark:max-sm:[&_tr]:border-slate-800 max-sm:[&_td]:block max-sm:[&_td]:min-w-0 max-sm:[&_td]:px-3 max-sm:[&_td]:py-2 max-sm:[&_td]:text-left max-sm:[&_td]:whitespace-normal max-sm:[&_td]:[overflow-wrap:anywhere] max-sm:[&_td>div]:flex-wrap max-sm:[&_td>div]:justify-start max-sm:[&_button]:min-h-10 max-sm:[&_button]:min-w-10';

function PhoneFieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="block sm:hidden text-[10px] font-normal uppercase text-slate-400 mb-1">{children}</span>;
}

interface RetentionRemedialRow {
  record: FacultyRetentionRecord;
  progression: RemedialProgressionView;
}

type AllowedAttempt = 1 | 2;
type RemedialDisplayStatus = RemedialAttemptStatus | 'available' | 'not_started';

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

const canOverrideRecord = (record: FacultyRetentionRecord): boolean => (
  hasPersistedIdentifiers(record) && record.state !== 'archived'
);

const textOrUnavailable = (value: string | null | undefined, label: string): string => (
  isPersistedText(value) ? value : label
);

const isRecordValue = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasRemedialShape = (value: unknown): value is Record<string, unknown> => (
  isRecordValue(value)
);

const legacyEvidenceLabel = (value: unknown): string | null => {
  if (!hasRemedialShape(value)) return null;
  const row = { remedial: value };
  const existing = {
    examDate: typeof value.examDate === 'string' ? value.examDate : '',
    dueDate: typeof value.dueDate === 'string' ? value.dueDate : '',
  };
  const hasLegacyDates = existing.examDate.trim().length > 0 || existing.dueDate.trim().length > 0;
  const legacyPending = row.remedial.status === 'pending';
  return hasLegacyDates || legacyPending ? 'Outcome unavailable pending reconciliation.' : null;
};

const REMEDIAL_STAGES: RemedialStage[] = [
  'none',
  'attempt_1_pending',
  'attempt_2_available',
  'attempt_2_pending',
  'passed',
  'cost_recovery_required',
  'cost_recovery_passed',
  'cost_recovery_failed',
  'legacy_unclassified',
];

const readRemedialStage = (value: unknown): RemedialStage | null => (
  typeof value === 'string' && REMEDIAL_STAGES.includes(value as RemedialStage)
    ? value as RemedialStage
    : null
);

const readAttemptNumber = (value: unknown): AllowedAttempt | null => (
  value === 1 || value === 2 || value === '1' || value === '2'
    ? Number(value) as AllowedAttempt
    : null
);

const readAttemptStatus = (value: unknown): RemedialAttemptStatus | null => (
  value === 'pending' || value === 'passed' || value === 'failed'
    ? value
    : null
);

const readAttempt = (value: unknown): RemedialAttemptView | null => {
  if (!isRecordValue(value)) return null;
  const attemptNumber = readAttemptNumber(value.attemptNumber ?? value.attempt_number);
  if (!attemptNumber) return null;

  const rawDate = value.scheduledDate ?? value.scheduled_date;
  const percentage = typeof value.percentage === 'number' && Number.isFinite(value.percentage)
    ? value.percentage
    : null;
  return {
    attemptNumber,
    scheduledDate: typeof rawDate === 'string' && rawDate.trim().length > 0 ? rawDate : null,
    percentage,
    status: readAttemptStatus(value.outcome ?? value.status),
    notes: typeof value.notes === 'string' && value.notes.trim().length > 0 ? value.notes : null,
    updatedAt: typeof value.updatedAt === 'string' && value.updatedAt.length > 0 ? value.updatedAt : null,
  };
};

const readRemedialProgression = (record: FacultyRetentionRecord): RemedialProgressionView => {
  const source = record as unknown as { remedialProgression?: unknown; remedial?: unknown };
  const rawProgression = source.remedialProgression
    ?? (isRecordValue(source.remedial) && 'stage' in source.remedial ? source.remedial : null);

  if (isRecordValue(rawProgression)) {
    const declaredStage = readRemedialStage(rawProgression.stage);
    const rawLegacyUnclassified = rawProgression.legacyUnclassified === true
      || rawProgression.legacy_unclassified === true;
    const stage = rawLegacyUnclassified ? 'legacy_unclassified' : (declaredStage ?? 'legacy_unclassified');
    const attempts = Array.isArray(rawProgression.attempts)
      ? rawProgression.attempts.map(readAttempt).filter((attempt): attempt is RemedialAttemptView => attempt !== null)
      : [];
    const passedAttempt = readAttemptNumber(rawProgression.passedAttempt ?? rawProgression.passed_attempt);
    const legacyUnclassified = rawLegacyUnclassified || stage === 'legacy_unclassified';
    const rawCost = rawProgression.costRecovery;
    const costRecoveryGrade = isRecordValue(rawCost) && typeof rawCost.finalGrade === 'number' ? rawCost.finalGrade : null;
    const clearedAt = stage === 'cost_recovery_passed' && isRecordValue(rawCost) && typeof rawCost.recordedAt === 'string'
      ? rawCost.recordedAt
      : stage === 'passed' ? (attempts.find(attempt => attempt.attemptNumber === passedAttempt)?.updatedAt ?? null) : null;
    return { stage, attempts, passedAttempt, legacyUnclassified, costRecoveryGrade, clearedAt };
  }

  // A legacy current-state JSON blob is deliberately not interpreted as an attempt.
  // The server must classify it before Faculty can write a new progression.
  if (hasRemedialShape(source.remedial) && Object.keys(source.remedial).length > 0) {
    return { stage: 'legacy_unclassified', attempts: [], passedAttempt: null, legacyUnclassified: true };
  }
  return { stage: 'none', attempts: [], passedAttempt: null, legacyUnclassified: false };
};

const allowedAttemptNumbers = (progression: RemedialProgressionView): AllowedAttempt[] => {
  if (progression.stage === 'none') return [1];
  if (progression.stage === 'attempt_2_available') return [2];
  return [];
};

const pendingAttemptNumber = (progression: RemedialProgressionView): AllowedAttempt | null => {
  if (progression.stage === 'attempt_1_pending') return 1;
  if (progression.stage === 'attempt_2_pending') return 2;
  return null;
};

// Remedial exams are scheduled for today or later (Asia/Manila); the server re-checks.
const manilaToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

const canScheduleRecord = (record: FacultyRetentionRecord): boolean => (
  hasPersistedIdentifiers(record)
  && record.state !== 'archived'
  // Older servers omit the flag; only an explicit false hides the student.
  && record.remedialEligible !== false
  && isPersistedText(record.subjectCode)
  && allowedAttemptNumbers(readRemedialProgression(record)).length > 0
);

const stageLabel = (stage: RemedialStage): string => {
  switch (stage) {
    case 'none': return 'No remedial attempt assigned';
    case 'attempt_1_pending': return 'Attempt 1 pending';
    case 'attempt_2_available': return 'Attempt 2 available';
    case 'attempt_2_pending': return 'Attempt 2 pending';
    case 'passed': return 'Cleared (passed remedial)';
    case 'cost_recovery_required': return 'Cost recovery required';
    case 'cost_recovery_passed': return 'Cleared (passed cost recovery)';
    case 'cost_recovery_failed': return 'Failed (did not pass cost recovery)';
    case 'legacy_unclassified': return 'Legacy / unclassified';
    default: return 'Progression unavailable';
  }
};

const attemptStatus = (
  progression: RemedialProgressionView,
  attemptNumber: AllowedAttempt,
): RemedialDisplayStatus => {
  const attempt = progression.attempts.find(item => item.attemptNumber === attemptNumber);
  if (attempt?.status) return attempt.status;
  if (progression.stage === 'attempt_1_pending' && attemptNumber === 1) return 'pending';
  if (progression.stage === 'attempt_2_available' && attemptNumber === 1) return 'failed';
  if (progression.stage === 'attempt_2_pending') return attemptNumber === 1 ? 'failed' : 'pending';
  if (progression.stage === 'passed') return progression.passedAttempt === attemptNumber ? 'passed' : attemptNumber < (progression.passedAttempt ?? 2) ? 'failed' : 'not_started';
  if (progression.stage === 'cost_recovery_required' || progression.stage === 'cost_recovery_passed' || progression.stage === 'cost_recovery_failed') return 'failed';
  if (progression.stage === 'attempt_2_available' && attemptNumber === 2) return 'available';
  return 'not_started';
};

const attemptStatusLabel = (status: RemedialDisplayStatus): string => {
  switch (status) {
    case 'pending': return 'Pending';
    case 'passed': return 'Passed';
    case 'failed': return 'Failed';
    case 'available': return 'Available';
    case 'not_started': return 'Not started';
    default: return 'Unavailable';
  }
};

const retentionStateLabel = (state: FacultyRetentionState): string => {
  switch (state) {
    case 'active': return 'Active';
    case 'warning': return 'Warning';
    case 'critical': return 'Critical';
    case 'remedial': return 'Remedial';
    case 'cleared': return 'Cleared';
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
    case 'cleared': return 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200/60';
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
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('all');
  const [currentSchoolYear, setCurrentSchoolYear] = useState('');
  const syInitializedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'midterm' | 'remedials'>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAtRiskOnly, setShowAtRiskOnly] = useState(true);

  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedScheduleEnrollmentId, setSelectedScheduleEnrollmentId] = useState('');
  const [scheduleAttempt, setScheduleAttempt] = useState<AllowedAttempt>(1);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');

  const [selectedResolveEnrollmentId, setSelectedResolveEnrollmentId] = useState<string | null>(null);
  const [resolveAttemptNumber, setResolveAttemptNumber] = useState<AllowedAttempt | null>(null);
  const [remedialScore, setRemedialScore] = useState('');
  const [resolveOutcome, setResolveOutcome] = useState<'pass' | 'fail'>('pass');
  const [reattemptDate, setReattemptDate] = useState('');

  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [selectedOverrideEnrollmentId, setSelectedOverrideEnrollmentId] = useState<string | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<'active' | 'warning' | 'critical' | 'remedial'>('warning');
  const [overrideRemarks, setOverrideRemarks] = useState('');

  const [selectedPolicyRecord, setSelectedPolicyRecord] = useState<FacultyRetentionRecord | null>(null);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

  const refreshRetention = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await getFacultyRetentionApi();
      const records = Array.isArray(response.retention) ? response.retention : [];
      setRetentionRecords(records);
      const curSy = response.currentSchoolYear || '';
      setCurrentSchoolYear(curSy);
      if (!syInitializedRef.current) {
        if (curSy) {
          setSelectedSchoolYear(curSy);
        } else if (records.length > 0) {
          const syOptions = Array.from(new Set(records.map(r => r.schoolYear).filter(Boolean))).sort().reverse();
          if (syOptions.length > 0) {
            setSelectedSchoolYear(syOptions[0] as string);
          }
        }
        syInitializedRef.current = true;
      }
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

  const availableSchoolYears = useMemo(() => {
    const years = new Set<string>();
    if (currentSchoolYear) years.add(currentSchoolYear);
    usableRecords.forEach(record => {
      if (record.schoolYear) years.add(record.schoolYear);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [usableRecords, currentSchoolYear]);

  const recordsForSchoolYear = useMemo(() => {
    if (selectedSchoolYear === 'all') return usableRecords;
    return usableRecords.filter(record => record.schoolYear === selectedSchoolYear);
  }, [usableRecords, selectedSchoolYear]);

  const subjectOptions = useMemo(() => (
    Array.from(new Set(
      recordsForSchoolYear
        .map(record => record.subjectCode)
        .filter(isPersistedText),
    )).sort((left, right) => left.localeCompare(right))
  ), [recordsForSchoolYear]);

  const classOptions = useMemo(() => {
    const labels = new Map<string, string>();
    recordsForSchoolYear.forEach(record => {
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
  }, [recordsForSchoolYear]);

  const selectedClassName = useMemo(() => {
    if (selectedClassId === 'all') return '';
    return classOptions.find(([id]) => id === selectedClassId)?.[1] || '';
  }, [selectedClassId, classOptions]);

  useEffect(() => {
    if (selectedClassId !== 'all') {
      const exists = classOptions.some(([cid]) => cid === selectedClassId);
      if (!exists) setSelectedClassId('all');
    }
  }, [classOptions, selectedClassId]);

  useEffect(() => {
    if (selectedSubjectCode !== 'all') {
      const exists = subjectOptions.includes(selectedSubjectCode);
      if (!exists) setSelectedSubjectCode('all');
    }
  }, [subjectOptions, selectedSubjectCode]);

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return usableRecords.filter(record => {
      if (selectedSchoolYear !== 'all' && record.schoolYear !== selectedSchoolYear) return false;
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
  }, [searchQuery, selectedSchoolYear, selectedClassId, selectedSubjectCode, usableRecords]);

  const watchlistRecords = useMemo(
    () => filteredRecords.filter(record => record.state !== 'active' && record.state !== 'cleared'),
    [filteredRecords],
  );

  const eligibleMidtermRecords = useMemo(() => filteredRecords.filter(record =>
    !isFiniteNumber(record.gwa)), [filteredRecords]);

  const atRiskMidtermCount = useMemo(() => eligibleMidtermRecords.filter(hasVisibleMidtermRisk).length,
  [eligibleMidtermRecords]);

  const midtermDisplayRecords = useMemo(() => {
    if (!showAtRiskOnly) return eligibleMidtermRecords;
    return eligibleMidtermRecords.filter(hasVisibleMidtermRisk);
  }, [eligibleMidtermRecords, showAtRiskOnly]);

  const currentAttentionStudents = useMemo(() => new Set(usableRecords.filter(record => record.schoolYear === currentSchoolYear
    && ['warning', 'critical', 'remedial'].includes(record.state)).map(record => record.studentId)).size, [usableRecords, currentSchoolYear]);
  const visibleRecords = activeTab === 'midterm' ? midtermDisplayRecords : filteredRecords;
  const visibleStudentCount = new Set(visibleRecords.map(record => record.studentId)).size;

  const remedialRows = useMemo<RetentionRemedialRow[]>(() => {
    const rows: RetentionRemedialRow[] = [];
    filteredRecords.forEach(record => {
      const progression = readRemedialProgression(record);
      if (progression.stage !== 'none') rows.push({ record, progression });
    });
    return rows;
  }, [filteredRecords]);

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

  const selectedScheduleProgression = selectedScheduleRecord
    ? readRemedialProgression(selectedScheduleRecord)
    : null;

  const selectedResolveProgression = selectedResolveRecord
    ? readRemedialProgression(selectedResolveRecord)
    : null;

  const selectedPolicyProgression = selectedPolicyRecord
    ? readRemedialProgression(selectedPolicyRecord)
    : null;

  const pendingExams = remedialRows.filter(row => (
    row.progression.stage === 'attempt_1_pending' || row.progression.stage === 'attempt_2_pending'
  )).length;

  // Past school-year classes are view-only; the server rejects these writes too.
  const isPastYearRecord = (record: FacultyRetentionRecord): boolean => (
    currentSchoolYear !== '' && Boolean(record.schoolYear) && record.schoolYear !== currentSchoolYear
  );
  const selectedClassIsPastYear = selectedClassId !== 'all'
    && usableRecords.some(record => record.classId === selectedClassId && isPastYearRecord(record));

  const openSchedule = (record: FacultyRetentionRecord) => {
    if (isPastYearRecord(record)) {
      showFeedback('Past school-year classes are view-only.', 'info');
      return;
    }
    if (!canScheduleRecord(record)) {
      showFeedback('Scheduling is unavailable for this enrollment.', 'info');
      return;
    }
    const candidate = record;
    setSelectedScheduleEnrollmentId(candidate.enrollmentId);
    const allowedAttempts = allowedAttemptNumbers(readRemedialProgression(candidate));
    setScheduleAttempt(allowedAttempts[0] ?? 1);
    setScheduleDate('');
    setScheduleNotes('');
    setIsScheduleOpen(true);
  };

  const [costRecoveryRecord, setCostRecoveryRecord] = useState<FacultyRetentionRecord | null>(null);
  const [costRecoveryGrade, setCostRecoveryGrade] = useState('');
  const openCostRecovery = (row: RetentionRemedialRow) => {
    setCostRecoveryRecord(row.record);
    setCostRecoveryGrade('');
  };
  const handleCostRecoverySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!costRecoveryRecord) return;
    const grade = Number(costRecoveryGrade);
    if (!Number.isFinite(grade) || grade < 1 || grade > 5) {
      showFeedback('Enter the cost recovery final grade from 1.00 to 5.00.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await saveFacultyCostRecoveryApi({ enrollmentId: costRecoveryRecord.enrollmentId, finalGrade: grade });
      setCostRecoveryRecord(null);
      await refreshRetention();
      showFeedback(result.outcome === 'passed'
        ? 'Cost recovery passed: the student is now cleared for this course.'
        : 'Cost recovery recorded as not passed.', result.outcome === 'passed' ? 'success' : 'info');
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : 'Unable to record the cost recovery result.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openResolve = (row: RetentionRemedialRow) => {
    const attemptNumber = pendingAttemptNumber(row.progression);
    if (!attemptNumber) {
      showFeedback('Only a server-authorized pending attempt can be graded.', 'info');
      return;
    }
    setSelectedResolveEnrollmentId(row.record.enrollmentId);
    setResolveAttemptNumber(attemptNumber);
    setRemedialScore('');
    setResolveOutcome('pass');
    setReattemptDate('');
    setResolveNotes(row.progression.attempts.find(attempt => attempt.attemptNumber === attemptNumber)?.notes ?? '');
  };

  const openOverride = (record: FacultyRetentionRecord) => {
    if (isPastYearRecord(record)) {
      showFeedback('Past school-year classes are view-only.', 'info');
      return;
    }
    if (!canOverrideRecord(record)) {
      if (record.state === 'archived') {
        showFeedback('Status override is unavailable for archived enrollments.', 'info');
        return;
      }
      showFeedback('Status override is unavailable because persisted identifiers are missing.', 'info');
      return;
    }
    setSelectedOverrideEnrollmentId(record.enrollmentId);
    setOverrideStatus(record.state === 'archived' ? 'warning' : record.state === 'cleared' ? 'active' : record.state);
    setOverrideRemarks('');
    setIsOverrideOpen(true);
  };

  const resetScheduleForm = () => {
    setIsScheduleOpen(false);
    setSelectedScheduleEnrollmentId('');
    setScheduleAttempt(1);
    setScheduleDate('');
    setScheduleNotes('');
  };

  const resetResolveForm = () => {
    setSelectedResolveEnrollmentId(null);
    setResolveAttemptNumber(null);
    setRemedialScore('');
    setResolveOutcome('pass');
    setReattemptDate('');
    setResolveNotes('');
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
    const allowedAttempts = allowedAttemptNumbers(readRemedialProgression(selectedScheduleRecord));
    if (!allowedAttempts.includes(scheduleAttempt)) {
      showFeedback('This remedial attempt is no longer available. Refresh the authoritative records and try again.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveFacultyRemedialApi({
        enrollmentId: selectedScheduleRecord.enrollmentId,
        studentId: selectedScheduleRecord.studentId,
        classId: selectedScheduleRecord.classId,
        attemptNumber: scheduleAttempt,
        scheduledDate: scheduleDate.trim().length > 0 ? scheduleDate.trim() : null,
        notes: scheduleNotes.trim().length > 0 ? scheduleNotes.trim() : null,
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

  const handleSelectOutcome = (outcome: 'pass' | 'fail') => {
    setResolveOutcome(outcome);
  };

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRemedialScore(val);
    const num = Number(val);
    if (Number.isFinite(num) && val.trim() !== '') {
      if (num >= 50 && resolveOutcome !== 'pass') {
        setResolveOutcome('pass');
      } else if (num < 50 && resolveOutcome !== 'fail') {
        setResolveOutcome('fail');
      }
    }
  };

  const outcomeContradictsScore = remedialScore.trim() !== '' && Number.isFinite(Number(remedialScore))
    && (Number(remedialScore) >= 50) !== (resolveOutcome === 'pass');

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
    if (!selectedResolveProgression || !resolveAttemptNumber) {
      showFeedback('Only a server-authorized pending attempt can be graded.', 'info');
      return;
    }

    if (remedialScore.trim().length === 0) {
      showFeedback('Enter a percentage score from 0 to 100.', 'error');
      return;
    }

    const score = Number(remedialScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      showFeedback('Enter a valid percentage score from 0 to 100.', 'error');
      return;
    }

    if (outcomeContradictsScore) {
      showFeedback('The selected outcome contradicts the entered score. The pass mark is 50%.', 'error');
      return;
    }

    if (pendingAttemptNumber(selectedResolveProgression) !== resolveAttemptNumber) {
      showFeedback('This remedial attempt is no longer pending. Refresh the authoritative records and try again.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await saveFacultyRemedialApi({
        enrollmentId: selectedResolveRecord.enrollmentId,
        studentId: selectedResolveRecord.studentId,
        classId: selectedResolveRecord.classId,
        attemptNumber: resolveAttemptNumber,
        percentage: score,
        notes: resolveNotes.trim().length > 0 ? resolveNotes.trim() : null,
      });

      let scheduleError: string | null = null;
      let studentNotified = response.notification?.created === true;
      if (resolveAttemptNumber === 1 && score < 50 && reattemptDate.trim().length > 0) {
        try {
          const scheduleResponse = await saveFacultyRemedialApi({
            enrollmentId: selectedResolveRecord.enrollmentId,
            studentId: selectedResolveRecord.studentId,
            classId: selectedResolveRecord.classId,
            attemptNumber: 2,
            scheduledDate: reattemptDate.trim(),
            notes: 'Scheduled for Attempt 2 re-attempt',
          });
          studentNotified = studentNotified || scheduleResponse.notification?.created === true;
        } catch (error) {
          scheduleError = `Attempt 1 was saved but Attempt 2 could not be scheduled: ${error instanceof Error ? error.message : 'Unknown scheduling error.'}`;
        }
      }

      const refreshed = await refreshRetention();
      resetResolveForm();
      const outcomeMsg = score >= 50
        ? 'Remedial exam passed! Student cleared.'
        : resolveAttemptNumber === 1
          ? (reattemptDate.trim() && !scheduleError
              ? 'Attempt 1 marked for Re-attempt and Attempt 2 scheduled.'
              : 'Attempt 1 marked for Re-attempt.')
          : 'Attempt 2 recorded as not passed. Student moved to Cost Recovery.';

      if (scheduleError) showFeedback(scheduleError, 'error');
      const message = outcomeMsg + (studentNotified ? ' Student notified.' : '');
      setNotification({
        type: refreshed ? 'success' : 'info',
        message: refreshed
          ? message
          : `${message} (authoritative list could not be refreshed)`,
      });
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to persist the remedial result.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverrideSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedOverrideRecord && isPastYearRecord(selectedOverrideRecord)) {
      showFeedback('Past school-year classes are view-only.', 'info');
      return;
    }
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

  const openPolicyProgression = (record: FacultyRetentionRecord) => {
    setSelectedPolicyRecord(record);
    setIsPolicyOpen(true);
  };

  const handleComputeMidtermRisk = async () => {
    if (isSubmitting || selectedClassIsPastYear || selectedClassId === 'all') return;
    setIsSubmitting(true);
    try {
      await unlockFacultyWatchlistApi(selectedClassId);
      await refreshRetention();
      setNotification({
        type: 'success',
        message: 'Midterm watchlist unlocked for the selected class section.',
      });
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : 'Unable to unlock the midterm watchlist.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComputeClassRisk = async (classId: string) => {
    if (!classId || classId === 'all' || isSubmitting
      || usableRecords.some(record => record.classId === classId && isPastYearRecord(record))) return;
    setIsSubmitting(true);
    try {
      await unlockFacultyWatchlistApi(classId);
      await refreshRetention();
      setNotification({
        type: 'success',
        message: 'Midterm watchlist unlocked for the selected class section.',
      });
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : 'Unable to unlock the class midterm watchlist.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Retention & Remedial Monitoring</h1>
            {currentSchoolYear && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300">
                <CalendarDays className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                S.Y. {currentSchoolYear} (Current)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">Review standing and remedial progress for each student’s course enrollment.</p>
        </div>
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

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => { setActiveTab('watchlist'); setSearchQuery(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'watchlist'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>Watchlist</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'watchlist' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
              {watchlistRecords.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('remedials'); setSearchQuery(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'remedials'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>Remedials</span>
            {pendingExams > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'remedials' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              }`}>
                {pendingExams}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('midterm'); setSearchQuery(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'midterm'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>Midterm Risk</span>
            {(
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'midterm' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              }`}>
                {atRiskMidtermCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
          {/* School Year Selector Filter Pill (Defaults to Current School Year) */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors">
            <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <select
              value={selectedSchoolYear}
              onChange={(event) => setSelectedSchoolYear(event.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All School Years</option>
              {availableSchoolYears.map(sy => (
                <option key={sy} value={sy}>
                  S.Y. {sy}{sy === currentSchoolYear ? ' (Current)' : ''}
                </option>
              ))}
            </select>
          </div>

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

      {selectedSchoolYear !== currentSchoolYear && currentSchoolYear && selectedSchoolYear !== 'all' && (
        <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <CalendarDays className="w-4 h-4 text-amber-600 shrink-0" />
            <span>You are viewing archived records for <strong>S.Y. {selectedSchoolYear}</strong>. Historical classes are view-only.</span>
          </div>
          <button
            type="button"
            onClick={() => { setSelectedSchoolYear(currentSchoolYear); setSelectedClassId('all'); setSelectedSubjectCode('all'); setSearchQuery(''); }}
            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
          >
            Switch to Current S.Y. ({currentSchoolYear})
          </button>
        </div>
      )}

      {!isLoading && !loadError && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <p className="font-bold">Showing {visibleStudentCount} student{visibleStudentCount === 1 ? '' : 's'} across {visibleRecords.length} course enrollment{visibleRecords.length === 1 ? '' : 's'} · {selectedSchoolYear === 'all' ? 'All school years' : `S.Y. ${selectedSchoolYear}`}</p>
        <p className="mt-1">{currentAttentionStudents} student{currentAttentionStudents === 1 ? ' needs' : 's need'} attention in the current school year ({currentSchoolYear || 'unavailable'}). Course enrollments and pending exams are counted separately in the tabs.</p>
        {currentAttentionStudents > 0 && <button type="button" onClick={() => { setSelectedSchoolYear(currentSchoolYear); setSelectedClassId('all'); setSelectedSubjectCode('all'); setSearchQuery(''); setActiveTab('watchlist'); }} className="mt-2 font-bold text-emerald-700 dark:text-emerald-400">View current-year students needing attention</button>}
        {activeTab === 'midterm' && <p className="mt-1">Current retention alerts appear in Retention Watchlist. Midterm Watchlist shows grade completeness and informational risk separately.</p>}
        {(selectedClassId !== 'all' || selectedSubjectCode !== 'all' || searchQuery.trim() !== '') && <button type="button" onClick={() => { setSelectedClassId('all'); setSelectedSubjectCode('all'); setSearchQuery(''); }} className="mt-2 font-bold text-emerald-700 dark:text-emerald-400">Clear course, section and search filters</button>}
      </div>}

      {activeTab === 'midterm' && (
        <Card className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Midterm Standing & Risk Evaluation
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Review server-calculated risk. Unlocking the selected class changes watchlist visibility only; missing assessment data remains incomplete. Students with completed final course grades are handled in the remediation (Retention Watchlist) list.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAtRiskOnly(prev => !prev)}
                aria-pressed={showAtRiskOnly}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  showAtRiskOnly
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Show At-Risk Only</span>
                {(
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    showAtRiskOnly ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}>
                    {atRiskMidtermCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                disabled={isSubmitting || isLoading || selectedClassIsPastYear || selectedClassId === 'all'}
                title={selectedClassIsPastYear ? 'Past school-year classes are view-only.' : selectedClassId === 'all' ? 'Select one class section to unlock its watchlist.' : undefined}
                onClick={() => void handleComputeMidtermRisk()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-40 cursor-pointer"
              >
                <Calculator className="h-4 w-4" />
                <span>{isSubmitting ? 'Unlocking...' : 'Unlock Midterm Watchlist'}</span>
              </button>
            </div>
          </div>

          <div className="sm:overflow-x-auto">
            <table role="table" className={`${RETENTION_TABLE_LAYOUT} w-full text-left text-xs`}>
              <thead className="text-[10px] uppercase text-slate-400">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Class</th>
                  <th className="p-3">Midterm Grade</th>
                  <th className="p-3">Risk Standing</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {midtermDisplayRecords.map(record => {
                  return (
                    <tr role="row" key={record.enrollmentId} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td role="cell" className="p-3 font-bold">
                        {record.studentName}
                        <span className="block text-[10px] font-normal text-slate-400">{record.studentNumber}</span>
                      </td>
                      <td role="cell" className="p-3"><PhoneFieldLabel>Class</PhoneFieldLabel>{record.className}</td>
                      <td role="cell" className="p-3"><PhoneFieldLabel>Midterm Grade</PhoneFieldLabel>
                        {record.midtermComplete === true && isFiniteNumber(record.midtermPercentage) ? (
                          <div className="font-mono">
                            <span className="font-bold">{record.midtermPercentage.toFixed(2)}%</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5 font-normal">
                              (Midterm Grade: {percentageToGWA(record.midtermPercentage).toFixed(2)})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Incomplete assessments</span>
                        )}
                      </td>
                      <td role="cell" className="p-3"><PhoneFieldLabel>Risk Standing</PhoneFieldLabel>
                        {isMidtermRiskVisible(record) ? <RiskBadge risk={record.risk} /> : <span className="text-[10px] text-slate-400">Locked</span>}
                      </td>
                      <td role="cell" className="p-3"><PhoneFieldLabel>Status</PhoneFieldLabel>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60">
                          {record.midtermComplete === true ? 'Computed · Ready' : record.watchlistUnlocked === true ? 'Unlocked · Assessments incomplete' : 'Locked'}
                        </span>
                        {record.midtermComplete !== true && !record.watchlistUnlocked && !isPastYearRecord(record) && (
                          <button type="button" onClick={() => void handleComputeClassRisk(record.classId)} disabled={isSubmitting}
                            className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                            title="Unlock the midterm watchlist for this class"><Calculator className="w-3 h-3" />Unlock watchlist</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {midtermDisplayRecords.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400 space-y-1">
              {showAtRiskOnly ? (
                <>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">No visible students are currently flagged High or At Risk for midterm.</p>
                  <button
                    type="button"
                    onClick={() => setShowAtRiskOnly(false)}
                    className="text-emerald-600 hover:underline font-bold"
                  >
                    Show all eligible students
                  </button>
                </>
              ) : (
                <p>{isLoading ? 'Loading records...' : 'No students without final course grades match these filters.'}</p>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-500">Midterm scores provide an early review. Final retention decisions remain in Retention Watchlist.</p>
        </Card>
      )}

      {activeTab === 'watchlist' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div><h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">Retention Watchlist ({watchlistRecords.length})</h2><p className="text-xs text-slate-400">Final grades and saved retention decisions. Select a status to view policy progression.</p></div>
          </div>
          <div className="sm:overflow-x-auto">
            <table role="table" className={`${RETENTION_TABLE_LAYOUT} w-full text-left text-xs border-collapse`}>
              <thead><tr role="row" className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]"><th className="py-3 px-4">Student</th><th className="py-3 px-4">Student Number</th><th className="py-3 px-4">Subject</th><th className="py-3 px-4">Class</th><th className="py-3 px-4 text-center">Course Grade</th><th className="py-3 px-4">State</th><th className="py-3 px-4">Risk</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
              <tbody role="rowgroup" className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {watchlistRecords.length === 0 ? <tr><td role="cell" colSpan={8} className="py-10 text-center text-slate-400">{isLoading ? 'Loading authoritative retention records...' : 'No persisted retention records match the selected filters.'}</td></tr> : watchlistRecords.map(record => (
                  <tr role="row" key={record.enrollmentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td role="cell" className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">{textOrUnavailable(record.studentName, 'Student name unavailable')}</td>
                    <td role="cell" className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono"><PhoneFieldLabel>Student Number</PhoneFieldLabel>{textOrUnavailable(record.studentNumber, 'Student number unavailable')}</td>
                    <td role="cell" className="py-3.5 px-4 font-mono"><PhoneFieldLabel>Subject</PhoneFieldLabel>{textOrUnavailable(record.subjectCode, 'Subject code unavailable')}</td>
                    <td role="cell" className="py-3.5 px-4"><PhoneFieldLabel>Class</PhoneFieldLabel>{textOrUnavailable(record.className, `Class name unavailable (${record.classId})`)}</td>
                    <td role="cell" className="py-3.5 px-4 text-center font-mono"><PhoneFieldLabel>Course Grade</PhoneFieldLabel>{isFiniteNumber(record.gwa) ? record.gwa.toFixed(2) : 'Grade unavailable'}<span className="block text-[10px] text-slate-400">{isFiniteNumber(record.percentage) ? `${record.percentage.toFixed(2)}%` : 'Percentage unavailable'}</span></td>
                    <td role="cell" className="py-3.5 px-4"><PhoneFieldLabel>State</PhoneFieldLabel><button type="button" onClick={() => openPolicyProgression(record)} className="inline-flex items-center gap-1.5 rounded-full transition-colors hover:ring-2 hover:ring-emerald-300" title="View retention policy progression"><span>{renderStatusBadge(record.state)}</span><ChevronRight className="h-3 w-3 text-slate-400" /></button>{record.manualOverride && <span className="ml-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400" title="Set by Faculty. Kept until the student's course grade changes.">Manual</span>}</td>
                    <td role="cell" className="py-3.5 px-4"><PhoneFieldLabel>Risk</PhoneFieldLabel><RiskBadge risk={record.risk} /></td>
                    <td role="cell" className="py-3.5 px-4 text-right"><PhoneFieldLabel>Actions</PhoneFieldLabel><div className="flex items-center justify-end gap-1.5"><button type="button" onClick={() => openSchedule(record)} disabled={!canScheduleRecord(record)} title={!canScheduleRecord(record) ? (record.state === 'archived' ? 'Scheduling unavailable for archived enrollments.' : 'Scheduling unavailable: persisted subject data is missing.') : 'Schedule remedial exam'} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[11px] font-bold transition-all shadow-xs"><Plus className="w-3 h-3" /><span>Remedial</span></button><button type="button" onClick={() => openOverride(record)} disabled={!canOverrideRecord(record) || isPastYearRecord(record)} title={isPastYearRecord(record) ? 'Past school-year classes are view-only.' : !canOverrideRecord(record) ? (record.state === 'archived' ? 'Status override unavailable for archived enrollments.' : 'Status override unavailable: persisted identifiers are missing.') : 'Override retention status'} className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 text-[11px] font-bold"><Pencil className="w-3.5 h-3.5" /></button></div></td>
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
            <div><h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">Remedial Progression ({remedialRows.length})</h2><p className="text-xs text-slate-400">Attempt stages, scores and outcomes are read from the authoritative retention API. Removal is unavailable because no approved authoritative delete contract exists.</p></div>
          </div>
          <div className="sm:overflow-x-auto">
            <table role="table" className={`${RETENTION_TABLE_LAYOUT} w-full text-left text-xs border-collapse`}>
              <thead><tr role="row" className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]"><th className="py-3 px-4">Student</th><th className="py-3 px-4">Subject / Class</th><th className="py-3 px-4">Original grade</th><th className="py-3 px-4">Attempts</th><th className="py-3 px-4">Current stage</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
              <tbody role="rowgroup" className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {remedialRows.length === 0 ? <tr><td role="cell" colSpan={6} className="py-10 text-center text-slate-400">{isLoading ? 'Loading authoritative remedial records...' : 'No persisted remedial records match the selected filters.'}</td></tr> : remedialRows.map(row => (
                  <tr role="row" key={row.record.enrollmentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td role="cell" className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">{textOrUnavailable(row.record.studentName, 'Student name unavailable')}<span className="block text-[10px] text-slate-400 font-mono">{textOrUnavailable(row.record.studentNumber, 'Student number unavailable')}</span></td>
                    <td role="cell" className="py-3.5 px-4"><PhoneFieldLabel>Subject / Class</PhoneFieldLabel><span className="font-mono font-bold text-[10px]">{textOrUnavailable(row.record.subjectCode, 'Subject code unavailable')}</span><span className="block text-[10px] text-slate-400">{textOrUnavailable(row.record.className, `Class name unavailable (${row.record.classId})`)}</span></td>
                    <td role="cell" className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100"><PhoneFieldLabel>Original grade</PhoneFieldLabel>{isFiniteNumber(row.record.gwa) ? row.record.gwa.toFixed(2) : <span className="text-[10px] font-medium text-slate-400">Grade unavailable</span>}</td>
                    <td role="cell" className="py-3.5 px-4 whitespace-nowrap"><PhoneFieldLabel>Attempts</PhoneFieldLabel>
                      <div className="space-y-1.5">{([1, 2] as AllowedAttempt[]).map(activeAttemptNumber => {
                        const attempt = row.progression.attempts.find(item => item.attemptNumber === activeAttemptNumber);
                        const status = attemptStatus(row.progression, activeAttemptNumber);
                        const statusClass = status === 'passed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : status === 'failed'
                            ? 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300'
                            : status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300'
                              : status === 'available'
                                ? 'bg-sky-50 text-sky-700 border-sky-200/60 dark:bg-sky-950/40 dark:text-sky-300'
                                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300';

                        return (
                          <div key={activeAttemptNumber} className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              Attempt {activeAttemptNumber}
                            </span>
                            <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${statusClass}`}>
                              {attemptStatusLabel(status)}{isFiniteNumber(attempt?.percentage) ? ` · ${attempt.percentage.toFixed(2)}%` : ''}
                            </span>
                            {attempt?.scheduledDate && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {attempt.scheduledDate}
                              </span>
                            )}
                            {attempt?.notes && <span className="basis-full text-[10px] italic text-slate-500 dark:text-slate-400">{attempt.notes}</span>}
                          </div>
                        );
                      })}</div>
                    </td>
                    <td role="cell" className="py-3.5 px-4 whitespace-nowrap"><div className="sm:hidden mb-2"><PhoneFieldLabel>Risk</PhoneFieldLabel><RiskBadge risk={row.record.risk} /></div><PhoneFieldLabel>Current stage</PhoneFieldLabel>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                          row.progression.stage === 'passed' || row.progression.stage === 'cost_recovery_passed'
                            ? 'border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : row.progression.stage === 'cost_recovery_required' || row.progression.stage === 'cost_recovery_failed'
                              ? 'border-rose-200/60 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              : row.progression.stage === 'legacy_unclassified'
                                ? 'border-slate-200 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                : 'border-amber-200/60 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}>
                          {stageLabel(row.progression.stage)}
                        </span>
                        {row.progression.clearedAt && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                            Cleared {new Date(row.progression.clearedAt).toLocaleDateString()}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openPolicyProgression(row.record)}
                          className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                          title="View complete attempt history and progression details"
                        >
                          Details <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td role="cell" className="py-3.5 px-4 text-right whitespace-nowrap"><PhoneFieldLabel>Actions</PhoneFieldLabel>
                      <div className="flex items-center justify-end gap-2">
                        {canScheduleRecord(row.record) && !isPastYearRecord(row.record) && (
                          <button
                            type="button"
                            onClick={() => openSchedule(row.record)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                          >
                            Schedule Attempt {allowedAttemptNumbers(row.progression)[0]}
                          </button>
                        )}
                        {pendingAttemptNumber(row.progression) && row.record.state !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => openResolve(row)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                          >
                            Grade Attempt {pendingAttemptNumber(row.progression)}
                          </button>
                        )}
                        {row.progression.stage === 'cost_recovery_required' && row.record.state !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => openCostRecovery(row)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                          >
                            Record Cost Recovery
                          </button>
                        )}
                        {typeof row.progression.costRecoveryGrade === 'number' && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Cost recovery: {row.progression.costRecoveryGrade.toFixed(2)}
                          </span>
                        )}
                        {row.progression.legacyUnclassified && (
                          <span className="text-[10px] text-amber-600" title="Legacy remedial data must be classified by the server before another write">
                            Legacy / unclassified
                          </span>
                        )}
                        <span className="sr-only" title="No approved authoritative delete endpoint exists">Removal unavailable</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}


      {isScheduleOpen && (
        <Modal isOpen={isScheduleOpen} onClose={resetScheduleForm} title="Schedule Remedial Exam">
          <form onSubmit={handleScheduleSubmit} className="space-y-4 text-xs">
            {selectedScheduleRecord && (
              <dl className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900">
                <div><dt className="text-[10px] font-bold uppercase text-slate-400">Student</dt><dd className="font-bold text-slate-800 dark:text-slate-100">{textOrUnavailable(selectedScheduleRecord.studentName, 'Student name unavailable')}<span className="block font-mono text-[10px] font-normal text-slate-400">{textOrUnavailable(selectedScheduleRecord.studentNumber, 'Student number unavailable')}</span></dd></div>
                <div><dt className="text-[10px] font-bold uppercase text-slate-400">Course</dt><dd className="font-mono font-bold text-slate-800 dark:text-slate-100">{textOrUnavailable(selectedScheduleRecord.subjectCode, 'Subject code unavailable')}</dd></div>
                <div><dt className="text-[10px] font-bold uppercase text-slate-400">Section</dt><dd className="font-bold text-slate-800 dark:text-slate-100">{textOrUnavailable(selectedScheduleRecord.className, `Class name unavailable (${selectedScheduleRecord.classId})`)}</dd></div>
              </dl>
            )}
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Attempt</label><select required value={scheduleAttempt} onChange={(event) => setScheduleAttempt(Number(event.target.value) as AllowedAttempt)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer" disabled={!selectedScheduleProgression || allowedAttemptNumbers(selectedScheduleProgression).length <= 1}>{selectedScheduleProgression && allowedAttemptNumbers(selectedScheduleProgression).map(attemptNumber => <option key={attemptNumber} value={attemptNumber}>Attempt {attemptNumber}</option>)}</select><p className="mt-1 text-[11px] text-slate-400">The server-authorized stage determines whether Attempt 1 or Attempt 2 can be scheduled.</p></div>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Remedial Exam Date <span className="font-normal text-slate-400">(optional)</span></label><input type="date" min={manilaToday()} value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium" /><p className="mt-1 text-[11px] text-slate-400">Today or later.</p></div>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Notes <span className="font-normal text-slate-400">(optional)</span></label><textarea value={scheduleNotes} onChange={(event) => setScheduleNotes(event.target.value)} maxLength={500} rows={2} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100" /></div>
            <div className="pt-2 flex justify-end gap-2"><button type="button" onClick={resetScheduleForm} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">Cancel</button><button type="submit" disabled={isSubmitting || !selectedScheduleRecord || !canScheduleRecord(selectedScheduleRecord)} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold shadow-md shadow-emerald-600/20">{isSubmitting ? 'Saving...' : 'Confirm & Schedule Exam'}</button></div>
          </form>
        </Modal>
      )}

      {selectedResolveRecord && (
        <Modal isOpen={Boolean(selectedResolveRecord)} onClose={resetResolveForm} title="Grade Remedial Exam Result">
          <form onSubmit={handleResolveRemedial} className="space-y-4 text-xs">
            {outcomeContradictsScore && <p role="alert" className="text-rose-600 dark:text-rose-400">The selected outcome contradicts the entered score. The pass mark is 50%.</p>}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {textOrUnavailable(selectedResolveRecord.studentName, 'Student name unavailable')}
                </p>
                <p className="text-slate-400 text-[11px] font-mono">
                  {textOrUnavailable(selectedResolveRecord.studentNumber, 'No ID')} · {textOrUnavailable(selectedResolveRecord.subjectCode, 'Subject unavailable')}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Attempt {resolveAttemptNumber ?? 1}
              </span>
            </div>

            {/* Outcome Selection Buttons */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                Outcome Option
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectOutcome('pass')}
                  className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    resolveOutcome === 'pass'
                      ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-sm flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    Pass
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Score ≥ 50%. Remedial passed and student is cleared.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectOutcome('fail')}
                  className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    resolveOutcome === 'fail'
                      ? resolveAttemptNumber === 1
                        ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 shadow-sm'
                        : 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className={`font-bold text-sm flex items-center gap-1.5 ${
                    resolveAttemptNumber === 1 ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'
                  }`}>
                    <CalendarDays className="w-4 h-4" />
                    {resolveAttemptNumber === 1 ? 'Re-attempt' : 'Cost Recovery'}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {resolveAttemptNumber === 1
                      ? 'Score < 50%. Flagged for Attempt 2 re-attempt.'
                      : 'Score < 50%. Move to Cost Recovery program.'}
                  </p>
                </button>
              </div>
            </div>

            {/* Percentage Score Input */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Percentage Score (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                required
                value={remedialScore}
                onChange={handleScoreChange}
                placeholder="Enter score"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold text-sm"
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                The server determines Pass or Fail at 50% or higher. This form sends only the attempt number and percentage.
              </span>
            </div>

            {/* Optional Re-attempt schedule date for Attempt 1 */}
            {resolveOutcome === 'fail' && resolveAttemptNumber === 1 && (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-2">
                <label className="font-bold text-amber-900 dark:text-amber-200 block text-xs">
                  Schedule Re-attempt Date <span className="font-normal text-amber-700 dark:text-amber-400">(optional)</span>
                </label>
                <input
                  type="date"
                  min={manilaToday()}
                  value={reattemptDate}
                  onChange={(event) => setReattemptDate(event.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium text-xs"
                />
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Optionally schedule Attempt 2 now (today or later).
                </p>
              </div>
            )}

            {/* Cost recovery notification for Attempt 2 */}
            {resolveOutcome === 'fail' && resolveAttemptNumber === 2 && (
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20">
                <p className="font-bold text-rose-900 dark:text-rose-200 text-xs">
                  Cost Recovery Progression
                </p>
                <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                  Both remedial attempts will be failed. The student will be transferred to Cost Recovery.
                </p>
              </div>
            )}

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Notes <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                value={resolveNotes}
                onChange={(event) => setResolveNotes(event.target.value)}
                maxLength={500}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>

            <p className="text-[11px] text-slate-400 italic">
              The student will be automatically notified in their own account.
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetResolveForm}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-5 py-2 rounded-xl font-bold shadow-md transition-all text-white disabled:bg-slate-300 disabled:cursor-not-allowed ${
                  resolveOutcome === 'pass'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : resolveAttemptNumber === 1
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                }`}
              >
                {isSubmitting
                  ? 'Saving...'
                  : resolveOutcome === 'pass'
                    ? 'Save Exam Grade (Pass)'
                    : resolveAttemptNumber === 1
                      ? 'Record Re-attempt'
                      : 'Record Cost Recovery'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {costRecoveryRecord && (
        <Modal isOpen={Boolean(costRecoveryRecord)} onClose={() => setCostRecoveryRecord(null)} title="Record Cost Recovery Result">
          <form onSubmit={handleCostRecoverySubmit} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-300">{textOrUnavailable(costRecoveryRecord.studentName, 'Student name unavailable')} · {textOrUnavailable(costRecoveryRecord.subjectCode, 'Subject code unavailable')}</p>
            <p className="text-slate-500 dark:text-slate-400">Both remedial attempts were failed. Enter the final grade earned in the cost recovery program. A grade better than the retention trigger clears the student; otherwise the course is failed. The original course grade is not changed.</p>
            <label className="font-bold text-slate-700 dark:text-slate-300 block">
              Cost recovery final grade (1.00 – 5.00)
              <input type="number" min="1" max="5" step="0.01" required value={costRecoveryGrade} onChange={(event) => setCostRecoveryGrade(event.target.value)} placeholder="e.g. 2.25"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium" />
            </label>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setCostRecoveryRecord(null)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold">{isSubmitting ? 'Saving…' : 'Record Result'}</button>
            </div>
          </form>
        </Modal>
      )}

      {isOverrideOpen && selectedOverrideRecord && (
        <Modal isOpen={isOverrideOpen} onClose={resetOverrideForm} title="Override Retention Status">
          <form onSubmit={handleOverrideSubmit} className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-300">{textOrUnavailable(selectedOverrideRecord.studentName, 'Student name unavailable')} · {textOrUnavailable(selectedOverrideRecord.subjectCode, 'Subject code unavailable')}</p>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select New Status</label><select value={overrideStatus} onChange={(event) => setOverrideStatus(event.target.value as 'active' | 'warning' | 'critical' | 'remedial')} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"><option value="active">Active / Cleared</option><option value="warning">Retention Warning</option><option value="critical">Critical Watchlist</option><option value="remedial">Remedial Assigned</option></select><p className="mt-1 text-[11px] text-slate-400">The status you set is kept until the student's course grade changes; a changed grade recomputes it automatically.</p></div>
            <div><label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Reason for Override</label><textarea rows={3} required value={overrideRemarks} onChange={(event) => setOverrideRemarks(event.target.value)} placeholder="Enter at least eight characters..." className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium" /></div>
            <div className="pt-2 flex justify-end gap-2"><button type="button" onClick={resetOverrideForm} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">Cancel</button><button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold shadow-md shadow-emerald-600/20">{isSubmitting ? 'Saving...' : 'Save Override'}</button></div>
          </form>
        </Modal>
      )}

      {isPolicyOpen && selectedPolicyRecord && (
        <Modal
          isOpen={isPolicyOpen}
          onClose={() => {
            setIsPolicyOpen(false);
            setSelectedPolicyRecord(null);
          }}
          title="Retention Policy Progression"
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{textOrUnavailable(selectedPolicyRecord.studentName, 'Student name unavailable')}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{textOrUnavailable(selectedPolicyRecord.subjectCode, 'Subject code unavailable')} · {textOrUnavailable(selectedPolicyRecord.className, `Class name unavailable (${selectedPolicyRecord.classId})`)}</p>
                </div>
                {renderStatusBadge(selectedPolicyRecord.state)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl bg-white px-3 py-2 dark:bg-slate-950"><span className="block text-slate-400">Final Grade</span><span className="font-bold text-slate-800 dark:text-slate-100">{isFiniteNumber(selectedPolicyRecord.gwa) ? selectedPolicyRecord.gwa.toFixed(2) : 'Unavailable'}</span></div>
                <div className="rounded-xl bg-white px-3 py-2 dark:bg-slate-950"><span className="block text-slate-400">Recorded score</span><span className="font-bold text-slate-800 dark:text-slate-100">{isFiniteNumber(selectedPolicyRecord.percentage) ? `${selectedPolicyRecord.percentage.toFixed(2)}%` : 'Unavailable'}</span></div>
              </div>
            </div>
            {selectedPolicyProgression && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div><p className="font-bold text-emerald-800 dark:text-emerald-200">{stageLabel(selectedPolicyProgression.stage)}</p><p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80">Server-authoritative remedial stage</p></div>
                  {selectedPolicyProgression.stage === 'passed' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                </div>
                <div className="space-y-2">
                  {([1, 2] as AllowedAttempt[]).map(attemptNumber => {
                    const attempt = selectedPolicyProgression.attempts.find(item => item.attemptNumber === attemptNumber);
                    const status = attemptStatus(selectedPolicyProgression, attemptNumber);
                    return <div key={attemptNumber} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950"><div className="flex-1"><p className="font-bold text-slate-800 dark:text-slate-100">Attempt {attemptNumber}</p><p className="text-[10px] text-slate-400">{attempt?.scheduledDate ? `Scheduled ${attempt.scheduledDate} · ` : ''}{isFiniteNumber(attempt?.percentage) ? `${attempt.percentage.toFixed(2)}% · ` : ''}{attemptStatusLabel(status)}</p></div><span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : status === 'pending' ? 'Pending' : status === 'available' ? 'Available' : 'Not started'}</span></div>;
                  })}
                </div>
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">Original final grade remains unchanged. A remedial pass changes progression readiness only. Legacy records are not interpreted as a new attempt.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
