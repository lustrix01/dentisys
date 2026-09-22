import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  BookOpen,
  Ban,
  Clock,
  MapPin,
} from 'lucide-react';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import {
  getFacultyClassesApi,
  getFacultyAttendanceWorksheetApi,
  recordFacultyInitialAttendanceApi,
  correctFacultyAttendanceApi,
  revokeFacultyAttendanceSessionApi,
  FacultyClassItem,
  FacultyAttendanceWorksheet,
  FacultyAttendanceWorksheetRosterItem,
} from '../../services/apiClient';

type SupportedStatus = 'present' | 'absent' | 'late' | 'excused';

export const AttendanceMonitoring: React.FC = () => {
  // Assigned classes from API
  const [classes, setClasses] = useState<FacultyClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [classesError, setClassesError] = useState<string | null>(null);

  // Hierarchy Selection States
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedCsId, setSelectedCsId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toLocaleDateString('en-CA');
  });

  // Maximum date constraint (UX guidance; backend remains authoritative)
  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  // Worksheet State
  const [worksheet, setWorksheet] = useState<FacultyAttendanceWorksheet | null>(null);
  const [loadingWorksheet, setLoadingWorksheet] = useState<boolean>(false);
  const [worksheetError, setWorksheetError] = useState<string | null>(null);

  // Row mutation states
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Roster Filter / Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Correction Modal State
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<FacultyAttendanceWorksheetRosterItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<SupportedStatus>('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Session Revocation Modal State
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [submittingRevocation, setSubmittingRevocation] = useState(false);

  // Load Faculty-owned classes on mount
  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setClassesError(null);
    try {
      const res = await getFacultyClassesApi();
      setClasses(res.classes || []);
    } catch (err) {
      setClasses([]);
      setClassesError(err instanceof Error ? err.message : 'Failed to load assigned classes.');
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Derive unique courses represented by Faculty-owned classes
  const assignedCourses = useMemo(() => {
    const map = new Map<number, { id: number; code: string; name: string }>();
    classes.forEach(c => {
      if (!map.has(c.courseId)) {
        map.set(c.courseId, { id: c.courseId, code: c.courseCode, name: c.courseName });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [classes]);

  // Filter sections belonging strictly to the selected course
  const availableSections = useMemo(() => {
    if (selectedCourseId === null) return [];
    return classes.filter(c => c.courseId === selectedCourseId);
  }, [classes, selectedCourseId]);

  // Handle Assigned Course Change (Rule 3: clear section and worksheet; do NOT auto-select first section)
  const handleCourseChange = (courseIdVal: string) => {
    if (!courseIdVal) {
      setSelectedCourseId(null);
    } else {
      setSelectedCourseId(Number(courseIdVal));
    }
    setSelectedCsId('');
    setWorksheet(null);
    setWorksheetError(null);
  };

  // Load Worksheet from authoritative backend
  const loadWorksheet = useCallback(async (csIdNum: number, dateStr: string) => {
    if (!csIdNum || !dateStr) return;
    setLoadingWorksheet(true);
    setWorksheetError(null);
    try {
      const res = await getFacultyAttendanceWorksheetApi({ csId: csIdNum, date: dateStr });
      setWorksheet(res.worksheet);
    } catch (err) {
      setWorksheet(null);
      setWorksheetError(err instanceof Error ? err.message : 'Unable to load attendance worksheet.');
    } finally {
      setLoadingWorksheet(false);
    }
  }, []);

  useEffect(() => {
    const csIdNum = parseInt(selectedCsId, 10);
    if (csIdNum > 0 && selectedDate) {
      loadWorksheet(csIdNum, selectedDate);
    } else {
      setWorksheet(null);
      setWorksheetError(null);
    }
  }, [selectedCsId, selectedDate, loadWorksheet]);

  // Handle Status Button Click
  const handleStatusClick = async (
    item: FacultyAttendanceWorksheetRosterItem,
    newStatus: SupportedStatus
  ) => {
    // Rule 1 / Rule 4: No-op if selecting the identical persisted status
    if (item.status === newStatus) {
      return;
    }

    const csIdNum = parseInt(selectedCsId, 10);
    const enrollmentIdNum = parseInt(item.enrollmentId, 10);

    // Initial entry (status: null / Not recorded): no reason required
    if (item.status === null) {
      setSavingStudentId(item.enrollmentId);
      try {
        const res = await recordFacultyInitialAttendanceApi({
          csId: csIdNum,
          enrollmentId: enrollmentIdNum,
          sessionDate: selectedDate,
          status: newStatus,
        });

        // Update local worksheet state
        setWorksheet(prev => {
          if (!prev) return null;
          return {
            ...prev,
            roster: prev.roster.map(r =>
              r.enrollmentId === item.enrollmentId
                ? {
                    ...r,
                    id: res.recordId || r.id,
                    status: newStatus,
                    date: selectedDate,
                  }
                : r
            ),
          };
        });

        setNotification({
          type: 'success',
          message: `Recorded ${item.studentName} as ${newStatus}.`,
        });
      } catch (err) {
        setNotification({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to record attendance.',
        });
      } finally {
        setSavingStudentId(null);
      }
      return;
    }

    // Existing record: status change requires non-empty reason via modal
    setCorrectionTarget(item);
    setTargetStatus(newStatus);
    setCorrectionReason('');
    setCorrectionError(null);
    setIsCorrectionModalOpen(true);
  };

  // Submit Correction (Rule 1 & Rule 6: sends minimal payload { recordId, status, reason })
  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget || !correctionTarget.id) return;

    // Rule 2: trimmed non-empty reason only
    const trimmedReason = correctionReason.trim();
    if (!trimmedReason) {
      setCorrectionError('A justification reason is required when correcting existing attendance.');
      return;
    }

    setSubmittingCorrection(true);
    setCorrectionError(null);
    try {
      const res = await correctFacultyAttendanceApi({
        recordId: correctionTarget.id,
        status: targetStatus,
        reason: trimmedReason,
      });

      // Update local worksheet row
      setWorksheet(prev => {
        if (!prev) return null;
        return {
          ...prev,
          roster: prev.roster.map(r =>
            r.enrollmentId === correctionTarget.enrollmentId
              ? {
                  ...r,
                  id: res.recordId || r.id,
                  status: targetStatus,
                  overrideReason: trimmedReason,
                }
              : r
          ),
        };
      });

      setIsCorrectionModalOpen(false);
      setCorrectionTarget(null);
      setCorrectionReason('');
      setNotification({
        type: 'success',
        message: `Attendance corrected for ${correctionTarget.studentName} (${targetStatus}).`,
      });
    } catch (err) {
      setCorrectionError(err instanceof Error ? err.message : 'Failed to save attendance correction.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Submit Session Revocation (Revokes active session, preserves recorded attendance, blocks further submissions)
  const handleRevokeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worksheet?.attendanceSession?.sessionId) return;

    setSubmittingRevocation(true);
    setRevokeError(null);
    try {
      await revokeFacultyAttendanceSessionApi({
        sessionId: worksheet.attendanceSession.sessionId,
        reason: revokeReason.trim() || null,
      });

      setIsRevokeModalOpen(false);
      setRevokeReason('');
      setNotification({
        type: 'success',
        message: 'Attendance session revoked. Already-recorded attendance was preserved; further submissions are blocked.',
      });

      const csIdNum = parseInt(selectedCsId, 10);
      if (csIdNum > 0) {
        await loadWorksheet(csIdNum, selectedDate);
      }
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Failed to revoke attendance session.');
    } finally {
      setSubmittingRevocation(false);
    }
  };

  // Rule 4: Straightforward counts, no invented presence rate formula
  const stats = useMemo(() => {
    const roster = worksheet?.roster || [];
    const total = roster.length;
    let recorded = 0;
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;

    roster.forEach(r => {
      if (r.status !== null) {
        recorded++;
        if (r.status === 'present') present++;
        else if (r.status === 'late') late++;
        else if (r.status === 'absent') absent++;
        else if (r.status === 'excused') excused++;
      }
    });

    return { total, recorded, present, late, absent, excused };
  }, [worksheet]);

  // Filtered Roster for large classes
  const filteredRoster = useMemo(() => {
    if (!worksheet) return [];
    return worksheet.roster.filter(item => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.studentNumber.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'unrecorded' && item.status === null) ||
        item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [worksheet, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Attendance Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Authoritative course, section, and date attendance register backed by PostgreSQL.
          </p>
        </div>

        {selectedCsId && (
          <button
            onClick={() => {
              const csIdNum = parseInt(selectedCsId, 10);
              if (csIdNum > 0) loadWorksheet(csIdNum, selectedDate);
            }}
            disabled={loadingWorksheet}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingWorksheet ? 'animate-spin' : ''}`} />
            <span>Refresh Worksheet</span>
          </button>
        )}
      </div>

      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Hierarchy Selectors: Assigned Course -> Class Section -> Worksheet Date */}
      <Card className="p-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Step 1: Assigned Course */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
              <span>Assigned Course</span>
            </label>
            <select
              value={selectedCourseId !== null ? String(selectedCourseId) : ''}
              onChange={(e) => handleCourseChange(e.target.value)}
              disabled={loadingClasses || assignedCourses.length === 0}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
            >
              <option value="">-- Select Assigned Course --</option>
              {assignedCourses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Class Section */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              <span>Class Section</span>
            </label>
            <select
              value={selectedCsId}
              onChange={(e) => setSelectedCsId(e.target.value)}
              disabled={selectedCourseId === null || availableSections.length === 0}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
            >
              <option value="">
                {selectedCourseId === null
                  ? 'Select course first'
                  : availableSections.length === 0
                  ? 'No sections available'
                  : '-- Select Class Section --'}
              </option>
              {availableSections.map(s => (
                <option key={s.csId} value={s.csId}>
                  {s.csName} (Block {s.block}) — {s.enrolledCount} enrolled
                </option>
              ))}
            </select>
          </div>

          {/* Step 3: Worksheet Date */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Worksheet Date</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
            />
          </div>
        </div>

        {classesError && (
          <div className="mt-3 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{classesError}</span>
          </div>
        )}
      </Card>

      {/* 3. Summary Count Cards (Rule 4: straightforward counts) */}
      {worksheet && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Enrolled</span>
            <span className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">{stats.total}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Recorded</span>
            <span className="text-xl font-extrabold font-heading text-slate-700 dark:text-slate-300">{stats.recorded}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">Present</span>
            <span className="text-xl font-extrabold font-heading text-emerald-600 dark:text-emerald-300">{stats.present}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">Late</span>
            <span className="text-xl font-extrabold font-heading text-amber-600 dark:text-amber-300">{stats.late}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">Absent</span>
            <span className="text-xl font-extrabold font-heading text-rose-600 dark:text-rose-300">{stats.absent}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400 block">Excused</span>
            <span className="text-xl font-extrabold font-heading text-sky-600 dark:text-sky-300">{stats.excused}</span>
          </div>
        </div>
      )}

      {/* 4. Main Worksheet Register */}
      {!selectedCsId ? (
        <Card className="p-12 text-center text-slate-400">
          <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Please select an Assigned Course and Class Section to view the attendance worksheet.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Attendance records are loaded directly from the authoritative database.
          </p>
        </Card>
      ) : loadingWorksheet ? (
        <Card className="p-12 text-center text-slate-400">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 text-emerald-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Loading authoritative attendance worksheet...
          </p>
        </Card>
      ) : worksheetError ? (
        <Card className="p-8 text-center space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{worksheetError}</p>
          <button
            onClick={() => {
              const csIdNum = parseInt(selectedCsId, 10);
              if (csIdNum > 0) loadWorksheet(csIdNum, selectedDate);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer"
          >
            Retry
          </button>
        </Card>
      ) : worksheet ? (
        <Card className="p-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          {/* Attendance Session Information / Revocation Control */}
          {worksheet.attendanceSession && (
            worksheet.attendanceSession.status === 'revoked' ? (
              <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fade-in">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 font-extrabold text-[10px] uppercase tracking-wider">
                      <Ban className="w-3 h-3 text-rose-600" />
                      Session Revoked
                    </span>
                    <span className="font-mono text-slate-500 font-bold">
                      Code: {worksheet.attendanceSession.sessionCode}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    Biometric capture is closed; further student submissions are blocked. All recorded attendance is preserved.
                  </p>
                  {worksheet.attendanceSession.revocationReason && (
                    <p className="text-slate-500 dark:text-slate-400 italic">
                      Reason: {worksheet.attendanceSession.revocationReason}
                    </p>
                  )}
                </div>
              </div>
            ) : worksheet.attendanceSession.status === 'active' ? (
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fade-in">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10px] uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      Live Attendance Session Active
                    </span>
                    <span className="font-mono text-slate-500 font-bold">
                      Code: {worksheet.attendanceSession.sessionCode}
                    </span>
                    {worksheet.attendanceSession.room && (
                      <span className="text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {worksheet.attendanceSession.room}
                      </span>
                    )}
                  </div>
                  {worksheet.attendanceSession.openingTime && worksheet.attendanceSession.presentCutoff && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>
                        Timing (Asia/Manila): Open {worksheet.attendanceSession.openingTime} → Present Cutoff {worksheet.attendanceSession.presentCutoff} → Late Cutoff {worksheet.attendanceSession.lateCutoff || 'Late'}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setRevokeError(null);
                    setRevokeReason('');
                    setIsRevokeModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm shadow-rose-600/20 cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Revoke Session</span>
                </button>
              </div>
            ) : null
          )}

          {/* Controls Bar: Search & Status Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by student name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Filter Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">All ({worksheet.roster.length})</option>
                <option value="unrecorded">Not recorded ({worksheet.roster.filter(r => r.status === null).length})</option>
                <option value="present">Present ({stats.present})</option>
                <option value="late">Late ({stats.late})</option>
                <option value="absent">Absent ({stats.absent})</option>
                <option value="excused">Excused ({stats.excused})</option>
              </select>
            </div>
          </div>

          {/* Roster Table: Bounded Scroll Container with Sticky Header */}
          <div className="max-h-[560px] overflow-y-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/95 backdrop-blur-xs z-10">
                <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Current Status</th>
                  <th className="py-3 px-4 text-center">Record / Correct Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredRoster.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-slate-400">
                      {worksheet.roster.length === 0
                        ? 'No enrolled students found in this class section.'
                        : 'No students match the current filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredRoster.map(item => {
                    const isSaving = savingStudentId === item.enrollmentId;
                    return (
                      <tr
                        key={item.enrollmentId}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Student Details */}
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-800 dark:text-slate-100 block">
                            {item.studentName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.studentNumber}
                          </span>
                        </td>

                        {/* Current Status */}
                        <td className="py-3 px-4">
                          {item.status === null ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              Not recorded
                            </span>
                          ) : item.status === 'present' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                              Present
                            </span>
                          ) : item.status === 'late' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                              Late
                            </span>
                          ) : item.status === 'absent' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50">
                              Absent
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50">
                              Excused
                            </span>
                          )}

                          {item.overrideReason && (
                            <span className="block text-[10px] text-slate-400 italic mt-0.5 truncate max-w-xs" title={item.overrideReason}>
                              Reason: {item.overrideReason}
                            </span>
                          )}
                        </td>

                        {/* Status Action Buttons */}
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStatusClick(item, 'present')}
                              disabled={isSaving}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer disabled:opacity-50 ${
                                item.status === 'present'
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-slate-700'
                              }`}
                            >
                              Present
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusClick(item, 'late')}
                              disabled={isSaving}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer disabled:opacity-50 ${
                                item.status === 'late'
                                  ? 'bg-amber-500 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-slate-700'
                              }`}
                            >
                              Late
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusClick(item, 'absent')}
                              disabled={isSaving}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer disabled:opacity-50 ${
                                item.status === 'absent'
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-slate-700'
                              }`}
                            >
                              Absent
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusClick(item, 'excused')}
                              disabled={isSaving}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer disabled:opacity-50 ${
                                item.status === 'excused'
                                  ? 'bg-sky-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-slate-700'
                              }`}
                            >
                              Excused
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* 5. Attendance Correction Modal */}
      {isCorrectionModalOpen && correctionTarget && (
        <Modal
          isOpen={isCorrectionModalOpen}
          onClose={() => {
            setIsCorrectionModalOpen(false);
            setCorrectionTarget(null);
            setCorrectionReason('');
            setCorrectionError(null);
          }}
          title="Attendance Correction"
        >
          <form onSubmit={handleCorrectionSubmit} className="space-y-4 text-xs">
            {correctionError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium">
                {correctionError}
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700 dark:text-slate-300">Student:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{correctionTarget.studentName}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Student ID:</span>
                <span className="font-mono">{correctionTarget.studentNumber}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-800">
                <span>Status Change:</span>
                <span className="font-bold">
                  <span className="uppercase text-slate-500">{correctionTarget.status}</span>
                  {' → '}
                  <span className="uppercase text-emerald-600 dark:text-emerald-400">{targetStatus}</span>
                </span>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Correction Justification Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Enter justification for manual attendance correction..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Reason is audited and recorded with your Faculty credentials.
              </span>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCorrectionModalOpen(false);
                  setCorrectionTarget(null);
                  setCorrectionReason('');
                  setCorrectionError(null);
                }}
                disabled={submittingCorrection}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingCorrection}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingCorrection && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Correction</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 6. Session Revocation Modal */}
      {isRevokeModalOpen && worksheet?.attendanceSession && (
        <Modal
          isOpen={isRevokeModalOpen}
          onClose={() => {
            setIsRevokeModalOpen(false);
            setRevokeReason('');
            setRevokeError(null);
          }}
          title="Revoke Attendance Session"
        >
          <form onSubmit={handleRevokeSession} className="space-y-4 text-xs">
            {revokeError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium">
                {revokeError}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-1.5 text-rose-800 dark:text-rose-300">
              <p className="font-bold">Important Session Revocation Rules:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>Revoking immediately closes biometric capture and blocks further student submissions.</li>
                <li><strong>All attendance already recorded is strictly preserved.</strong></li>
                <li>Unresolved students remain subject to normal final attendance resolution (not automatically marked Absent).</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="font-semibold">Session Code:</span>
                <span className="font-mono font-bold">{worksheet.attendanceSession.sessionCode}</span>
              </div>
              {worksheet.attendanceSession.room && (
                <div className="flex justify-between">
                  <span className="font-semibold">Room:</span>
                  <span>{worksheet.attendanceSession.room}</span>
                </div>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Revocation Reason (Optional, max 500 characters)
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g. Schedule adjustment, instructor requested cancellation, or incorrect session parameters..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-rose-500"
              />
              <span className="text-[10px] text-slate-400 block mt-1 text-right">
                {revokeReason.length}/500
              </span>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsRevokeModalOpen(false);
                  setRevokeReason('');
                  setRevokeError(null);
                }}
                disabled={submittingRevocation}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingRevocation}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingRevocation && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <Ban className="w-3.5 h-3.5" />
                <span>Confirm Revoke Session</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
