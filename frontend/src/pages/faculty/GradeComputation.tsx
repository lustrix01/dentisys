import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Calculator,
  User,
  BookOpen,
  Settings,
  Save,
  AlertTriangle,
  CheckCircle,
  Plus,
  Search,
  Edit,
  Trash2,
  Archive,
  Download,
  Upload,
  Printer,
  ArrowUpDown,
  Check,
  FileText,
  FileSpreadsheet,
  ClipboardCheck,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, EnrolledSubject, GradeComponents, Assessment, AssessmentScore } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { requestConfirmation, showFeedback } from '../../components/FeedbackCenter';
import { percentageToGWA, gwaToDescription, computeSubjectGrade } from '../../utils/gradeHelper';
import { recordAudit } from '../../services/auditService';

import {
  computeFacultyGradesApi,
  deleteFacultyAssessmentApi,
  getFacultyClassesApi,
  getFacultySettingsApi,
  saveFacultyAssessmentScoresApi,
  saveFacultyAssessmentsApi,
  getFacultyGradingConfigApi,
  saveFacultyGradingConfigApi,
  parseWeightUnits,
  formatWeightUnitsToPercent,
  TOTAL_WEIGHT_UNITS,
  ApiError
} from '../../services/apiClient';
import type {
  FacultyClassItem,
  FacultyGradingConfiguration,
  FacultyGradingCategoryAssignmentRequiredItem,
  FacultyGradingConfigSavePayload
} from '../../services/apiClient';

export const GradeComputation: React.FC = () => {
  const { user } = useAuth();
  const {
    students,
    attendanceRecords,
    settings,
    assessments,
    assessmentScores,
    addAssessment,
    updateAssessment,
    deleteAssessment,
    archiveAssessment,
    refreshAssessments,
    saveAssessmentScores,
    updateStudentGrade
  } = useApp();

  const location = useLocation();

  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];
  const [selectedSubjectCode, setSelectedSubjectCode] = useState(assignedSubjects[0] || 'CLIN401');
  const [facultyClasses, setFacultyClasses] = useState<FacultyClassItem[]>([]);
  const availableClasses = useMemo(
    () => facultyClasses.filter(classItem =>
      classItem.courseCode === selectedSubjectCode
      && classItem.status.trim().toLowerCase() === 'active'
    ),
    [facultyClasses, selectedSubjectCode],
  );
  const [selectedClassId, setSelectedClassId] = useState('');

  const [loading, setLoading] = useState(true);
  const [transmutationDefaults, setTransmutationDefaults] = useState({ minimumPercentage: 50, maximumPercentage: 100 });

  useEffect(() => {
    Promise.all([getFacultyClassesApi(), getFacultySettingsApi()])
      .then(([classesResponse, settingsResponse]) => {
        const loadedClasses = Array.isArray(classesResponse.classes) ? classesResponse.classes : [];
        setFacultyClasses(loadedClasses);
        if (loadedClasses.length > 0 && !loadedClasses.some(c => c.courseCode === selectedSubjectCode)) {
          setSelectedSubjectCode(loadedClasses[0].courseCode);
        }
        if (settingsResponse.settings?.transmutationDefaults) {
          setTransmutationDefaults(settingsResponse.settings.transmutationDefaults);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedSubjectCode]);

  // ----------------------------------------------------
  // SHARED OFFERINGS DERIVATION (courseId + semester + schoolYear)
  // ----------------------------------------------------
  interface FacultyOffering {
    key: string;
    courseId: number;
    courseCode: string;
    courseName: string;
    canonicalSemester: string;
    canonicalSchoolYear: string;
    sectionNames: string[];
    sections: FacultyClassItem[];
  }

  const facultyOfferings = useMemo<FacultyOffering[]>(() => {
    const map = new Map<string, FacultyOffering>();
    for (const c of facultyClasses) {
      if (!c || (c.status || '').trim().toLowerCase() !== 'active') continue;
      const normSem = (c.semester || '').trim().toUpperCase();
      const normSY = (c.schoolYear || '').trim().toUpperCase();
      const courseIdKey = c.courseId !== undefined && c.courseId !== null ? String(c.courseId) : (c.courseCode || String(c.id || ''));
      const key = `${courseIdKey}:${normSem}:${normSY}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          courseId: c.courseId !== undefined && c.courseId !== null ? Number(c.courseId) : (Number(c.id) || 0),
          courseCode: c.courseCode || 'Course',
          courseName: c.courseName || c.courseCode || 'Course',
          canonicalSemester: c.semester || '',
          canonicalSchoolYear: c.schoolYear || '',
          sectionNames: [c.csName || String(c.csId || c.id || '')],
          sections: [c],
        });
      } else {
        const existing = map.get(key)!;
        const secName = c.csName || String(c.csId || c.id || '');
        if (secName && !existing.sectionNames.includes(secName)) {
          existing.sectionNames.push(secName);
        }
        if (!existing.sections.some(s => s.id === c.id)) {
          existing.sections.push(c);
        }
      }
    }
    return Array.from(map.values());
  }, [facultyClasses]);

  const getOfferingForClass = (classItem: FacultyClassItem): FacultyOffering | undefined => {
    return facultyOfferings.find(o => o.sections.some(s => s.id === classItem.id));
  };

  // Parse active tab from URL query params
  const getInitialTab = () => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'assessments' || tab === 'scores' || tab === 'components' || tab === 'summaries' || tab === 'import') {
      return tab;
    }
    return 'scores';
  };

  const [activeSubTab, setActiveSubTab] = useState(getInitialTab());

  useEffect(() => {
    setActiveSubTab(getInitialTab());
  }, [location]);

  // General Filter Selectors
  useEffect(() => {
    if (!availableClasses.some(classItem => classItem.id === selectedClassId)) {
      setSelectedClassId(availableClasses[0]?.id ?? '');
    }
  }, [availableClasses, selectedClassId]);

  // Filter students under active subject/class scope
  const activeStudents = useMemo(() => {
    return students.filter(s =>
      s.enrolledSubjects.some(sub => sub.classId === selectedClassId && sub.code === selectedSubjectCode)
    );
  }, [students, selectedSubjectCode, selectedClassId]);

  // Find active subject details
  const activeSubjectName = useMemo(() => {
    const rawStud = students.find(s => s.enrolledSubjects.some(sub => sub.code === selectedSubjectCode));
    const sub = rawStud?.enrolledSubjects.find(x => x.code === selectedSubjectCode);
    return sub ? sub.name : 'Dental Course';
  }, [students, selectedSubjectCode]);

  // ----------------------------------------------------
  // 1. ASSESSMENT MANAGER TAB STATE
  // ----------------------------------------------------
  type OfferingConfigStatus = 'loading' | 'configured' | 'unconfigured' | 'error';

  const [selectedAssessmentOfferingKey, setSelectedAssessmentOfferingKey] = useState<string>('');
  const currentAssessmentOffering = useMemo(() => {
    return facultyOfferings.find(o => o.key === selectedAssessmentOfferingKey) || null;
  }, [facultyOfferings, selectedAssessmentOfferingKey]);

  // Sync selectedAssessmentOfferingKey with selectedClassId / facultyOfferings
  useEffect(() => {
    if (facultyOfferings.length === 0) return;
    if (!selectedAssessmentOfferingKey || !facultyOfferings.some(o => o.key === selectedAssessmentOfferingKey)) {
      const matchByClass = facultyOfferings.find(o => o.sections.some(s => s.id === selectedClassId));
      const matchBySubject = facultyOfferings.find(o => o.courseCode === selectedSubjectCode);
      const initial = matchByClass || matchBySubject || facultyOfferings[0];
      setSelectedAssessmentOfferingKey(initial.key);
      if (initial.courseCode !== selectedSubjectCode) {
        setSelectedSubjectCode(initial.courseCode);
      }
      if (initial.sections.length > 0 && !initial.sections.some(s => s.id === selectedClassId)) {
        setSelectedClassId(initial.sections[0].id);
      }
    }
  }, [facultyOfferings, selectedClassId, selectedSubjectCode, selectedAssessmentOfferingKey]);

  // When switching to assessments tab, sync offering with selectedClassId if valid
  useEffect(() => {
    if (activeSubTab === 'assessments' && facultyOfferings.length > 0) {
      const matchByClass = facultyOfferings.find(o => o.sections.some(s => s.id === selectedClassId));
      if (matchByClass && matchByClass.key !== selectedAssessmentOfferingKey) {
        setSelectedAssessmentOfferingKey(matchByClass.key);
      }
    }
  }, [activeSubTab, selectedClassId, facultyOfferings, selectedAssessmentOfferingKey]);

  const handleAssessmentOfferingChange = (key: string) => {
    setSelectedAssessmentOfferingKey(key);
    const offering = facultyOfferings.find(o => o.key === key);
    if (offering) {
      setSelectedSubjectCode(offering.courseCode);
      if (offering.sections.length > 0) {
        const currentStillValid = offering.sections.some(s => s.id === selectedClassId);
        if (!currentStillValid) {
          setSelectedClassId(offering.sections[0].id);
        }
      } else {
        setSelectedClassId('');
      }
    }
  };

  // Assessment Manager Table Grading Config State
  const [assessmentConfigStatus, setAssessmentConfigStatus] = useState<OfferingConfigStatus>('loading');
  const [assessmentConfig, setAssessmentConfig] = useState<FacultyGradingConfiguration | null>(null);
  const [assessmentConfigError, setAssessmentConfigError] = useState<string | null>(null);

  const loadAssessmentOfferingConfig = async (offering: FacultyOffering) => {
    setAssessmentConfigStatus('loading');
    setAssessmentConfigError(null);
    try {
      const res = await getFacultyGradingConfigApi({
        courseId: offering.courseId,
        semester: offering.canonicalSemester,
        schoolYear: offering.canonicalSchoolYear,
      });
      if (res.configuration && Array.isArray(res.configuration.categories) && res.configuration.categories.length > 0) {
        setAssessmentConfig(res.configuration);
        setAssessmentConfigStatus('configured');
      } else if (res.configuration === null) {
        setAssessmentConfig(null);
        setAssessmentConfigStatus('unconfigured');
      } else {
        setAssessmentConfig(null);
        setAssessmentConfigStatus('unconfigured');
      }
    } catch (err) {
      setAssessmentConfig(null);
      setAssessmentConfigStatus('error');
      setAssessmentConfigError(err instanceof Error ? err.message : 'Failed to load grading configuration.');
    }
  };

  // Re-fetch config when assessment tab is active or selected offering changes
  useEffect(() => {
    if (activeSubTab === 'assessments' && currentAssessmentOffering) {
      loadAssessmentOfferingConfig(currentAssessmentOffering);
    }
  }, [activeSubTab, currentAssessmentOffering?.key]);

  // Modal Grading Config State
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [modalConfigStatus, setModalConfigStatus] = useState<OfferingConfigStatus>('loading');
  const [modalConfig, setModalConfig] = useState<FacultyGradingConfiguration | null>(null);
  const [modalConfigError, setModalConfigError] = useState<string | null>(null);
  const [assGradingCategoryId, setAssGradingCategoryId] = useState<string>('');
  const [modalCategoryWarning, setModalCategoryWarning] = useState<boolean>(false);

  // Assessment Form State
  const [assTitle, setAssTitle] = useState('');
  const [assClassId, setAssClassId] = useState('CLINIC-A');
  const [assType, setAssType] = useState<string>('Quiz');
  const [assPeriod, setAssPeriod] = useState<'Midterm' | 'Final'>('Midterm');
  const [assMaxScore, setAssMaxScore] = useState(50);
  const [assDueDate, setAssDueDate] = useState('');
  const [assInstructions, setAssInstructions] = useState('');
  const [assRemarks, setAssRemarks] = useState('');
  const [assStatus, setAssStatus] = useState<'Active' | 'Closed'>('Active');
  const [assTransmutationEnabled, setAssTransmutationEnabled] = useState(false);
  const [assTransmutationMinimum, setAssTransmutationMinimum] = useState(50);
  const [assTransmutationMaximum, setAssTransmutationMaximum] = useState(100);
  const [assAttendanceDate, setAssAttendanceDate] = useState('');
  const [assAttendanceCode, setAssAttendanceCode] = useState('');

  const loadModalConfigForOffering = async (offering: FacultyOffering): Promise<FacultyGradingConfiguration | null> => {
    setModalConfigStatus('loading');
    setModalConfigError(null);
    try {
      const res = await getFacultyGradingConfigApi({
        courseId: offering.courseId,
        semester: offering.canonicalSemester,
        schoolYear: offering.canonicalSchoolYear,
      });
      if (res.configuration && Array.isArray(res.configuration.categories) && res.configuration.categories.length > 0) {
        setModalConfig(res.configuration);
        setModalConfigStatus('configured');
        return res.configuration;
      } else if (res.configuration === null) {
        setModalConfig(null);
        setModalConfigStatus('unconfigured');
        return null;
      } else {
        setModalConfig(null);
        setModalConfigStatus('unconfigured');
        return null;
      }
    } catch (err) {
      setModalConfig(null);
      setModalConfigStatus('error');
      setModalConfigError(err instanceof Error ? err.message : 'Failed to load grading configuration.');
      return null;
    }
  };

  const attendanceSessionOptions = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    attendanceRecords
      .filter(record => record.classId === assClassId && !!record.sessionCode)
      .forEach(record => {
        const codes = grouped.get(record.date) ?? new Set<string>();
        codes.add(record.sessionCode as string);
        grouped.set(record.date, codes);
      });
    return Array.from(grouped.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([date, codes]) => ({ date, codes: Array.from(codes).sort() }));
  }, [attendanceRecords, assClassId]);

  const attendanceCodesForDate = useMemo(
    () => attendanceSessionOptions.find(option => option.date === assAttendanceDate)?.codes ?? [],
    [attendanceSessionOptions, assAttendanceDate],
  );

  const activeAssessments = useMemo(() => {
    if (activeSubTab === 'assessments') {
      const offeringSectionIds = currentAssessmentOffering?.sections.map(s => String(s.id)) ?? [];
      return assessments.filter(a =>
        offeringSectionIds.includes(String(a.classId)) &&
        a.status !== 'Archived'
      );
    }
    return assessments.filter(a =>
      a.subjectCode === selectedSubjectCode &&
      a.classId === selectedClassId &&
      a.status !== 'Archived'
    );
  }, [assessments, activeSubTab, currentAssessmentOffering, selectedSubjectCode, selectedClassId]);

  const openNewAssessmentModal = async () => {
    setEditingAssessment(null);
    const modalAvailableSections = availableClasses.length > 0
      ? availableClasses
      : (currentAssessmentOffering?.sections ?? []);
    const initialClassId = modalAvailableSections.some(classItem => classItem.id === selectedClassId)
      ? selectedClassId
      : (modalAvailableSections[0]?.id ?? '');
    setAssClassId(initialClassId);
    setAssGradingCategoryId('');
    setAssType('');
    setModalCategoryWarning(false);
    setAssPeriod('Midterm');
    setAssMaxScore(50);
    setAssDueDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setAssInstructions('');
    setAssRemarks('');
    setAssStatus('Active');
    setAssTransmutationEnabled(false);
    setAssTransmutationMinimum(transmutationDefaults.minimumPercentage);
    setAssTransmutationMaximum(transmutationDefaults.maximumPercentage);
    setAssAttendanceDate('');
    setAssAttendanceCode('');
    setIsAssessmentModalOpen(true);

    const initialClass = facultyClasses.find(c => c.id === initialClassId);
    const offering = initialClass ? getOfferingForClass(initialClass) : currentAssessmentOffering;
    if (offering) {
      const cfg = await loadModalConfigForOffering(offering);
      if (cfg && Array.isArray(cfg.categories) && cfg.categories.length > 0) {
        setAssGradingCategoryId('');
        setAssType('');
      } else {
        setAssType('Quiz');
      }
    } else {
      setModalConfigStatus('unconfigured');
      setAssType('Quiz');
    }
  };

  const openEditAssessmentModal = async (ass: Assessment) => {
    setEditingAssessment(ass);
    setAssTitle(ass.title);
    const targetClassId = availableClasses.some(classItem => classItem.id === ass.classId)
      ? ass.classId
      : selectedClassId;
    setAssClassId(targetClassId);
    setAssPeriod(ass.gradingPeriod);
    setAssMaxScore(ass.maxScore);
    setAssDueDate(ass.dueDate);
    setAssInstructions(ass.instructions || '');
    setAssRemarks(ass.remarks || '');
    setAssStatus(ass.status === 'Archived' ? 'Active' : ass.status);
    setAssTransmutationEnabled(ass.transmutationEnabled ?? false);
    setAssTransmutationMinimum(ass.transmutationMinimumPercentage ?? transmutationDefaults.minimumPercentage);
    setAssTransmutationMaximum(ass.transmutationMaximumPercentage ?? transmutationDefaults.maximumPercentage);
    setAssAttendanceDate(ass.attendanceSessionDate || '');
    setAssAttendanceCode(ass.attendanceSessionCode || '');
    setAssGradingCategoryId(ass.gradingCategoryId ? String(ass.gradingCategoryId) : '');
    setAssType(ass.type || '');
    setModalCategoryWarning(false);
    setIsAssessmentModalOpen(true);

    const assClass = facultyClasses.find(c => c.id === ass.classId);
    const offering = assClass ? getOfferingForClass(assClass) : currentAssessmentOffering;
    if (offering) {
      const cfg = await loadModalConfigForOffering(offering);
      if (cfg && Array.isArray(cfg.categories) && cfg.categories.length > 0) {
        const matchedCat = cfg.categories.find(c => String(c.id) === String(ass.gradingCategoryId));
        if (matchedCat) {
          setAssGradingCategoryId(String(matchedCat.id));
          setAssType(matchedCat.name);
          setModalCategoryWarning(false);
        } else {
          setAssGradingCategoryId('');
          setAssType('');
          setModalCategoryWarning(true);
        }
      } else {
        setAssGradingCategoryId('');
        setAssType(ass.type || 'Quiz');
        setModalCategoryWarning(false);
      }
    } else {
      setModalConfigStatus('unconfigured');
      setAssGradingCategoryId('');
      setAssType(ass.type || 'Quiz');
      setModalCategoryWarning(false);
    }
  };

  const handleModalClassChange = async (newClassId: string) => {
    const prevClass = facultyClasses.find(c => c.id === assClassId);
    const newClass = facultyClasses.find(c => c.id === newClassId);
    setAssClassId(newClassId);

    const prevOfferingKey = prevClass ? (getOfferingForClass(prevClass)?.key ?? '') : '';
    const newOffering = newClass ? getOfferingForClass(newClass) : null;
    const newOfferingKey = newOffering?.key ?? '';

    if (prevOfferingKey && newOfferingKey && prevOfferingKey === newOfferingKey) {
      // Same offering: preserve category selection
      return;
    }

    // Different offering: clear category selection and load new offering's config
    setAssGradingCategoryId('');
    setAssType('');
    setModalCategoryWarning(false);
    if (newOffering) {
      const cfg = await loadModalConfigForOffering(newOffering);
      if (!cfg || !cfg.categories || cfg.categories.length === 0) {
        setAssType('Quiz');
      }
    } else {
      setModalConfigStatus('unconfigured');
      setAssType('Quiz');
    }
  };

  const handleAssessmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assTitle.trim()) return;
    if (!availableClasses.some(classItem => classItem.id === assClassId)) {
      showFeedback('Select an active class or section for the selected course.', 'error');
      return;
    }
    if (modalConfigStatus === 'loading') {
      showFeedback('Please wait for grading configuration to load.', 'error');
      return;
    }
    if (modalConfigStatus === 'error') {
      showFeedback('Cannot save assessment while grading configuration is in an error state. Please retry loading configuration.', 'error');
      return;
    }
    if (modalConfigStatus === 'configured') {
      if (!assGradingCategoryId) {
        showFeedback('Please select a valid grading category from the active configuration.', 'error');
        return;
      }
    } else if (modalConfigStatus === 'unconfigured') {
      if (!assType) {
        showFeedback('Please select a valid category type.', 'error');
        return;
      }
    }

    if (assTransmutationEnabled && (!assAttendanceDate || !assAttendanceCode)) {
      showFeedback('Select a deterministic attendance date and session code before enabling transmutation.', 'error');
      return;
    }
    if (assTransmutationMinimum < 0 || assTransmutationMaximum > 100 || assTransmutationMinimum > assTransmutationMaximum) {
      showFeedback('Transmutation bounds must be between 0% and 100%, with minimum not exceeding maximum.', 'error');
      return;
    }

    const targetClass = facultyClasses.find(c => c.id === assClassId);
    const targetSubjectCode = targetClass?.courseCode || selectedSubjectCode;

    const candidate: any = editingAssessment
      ? {
        ...editingAssessment,
        title: assTitle.trim(),
        type: assType,
        classId: assClassId,
        gradingPeriod: assPeriod,
        maxScore: assMaxScore,
        dueDate: assDueDate,
        instructions: assInstructions,
        remarks: assRemarks,
        status: assStatus as 'Active' | 'Closed' | 'Archived',
        transmutationEnabled: assTransmutationEnabled,
        transmutationMinimumPercentage: assTransmutationMinimum,
        transmutationMaximumPercentage: assTransmutationMaximum,
        attendanceSessionDate: assAttendanceDate || null,
        attendanceSessionCode: assAttendanceCode || null,
        ...(modalConfigStatus === 'configured' && assGradingCategoryId
          ? { gradingCategoryId: Number(assGradingCategoryId) }
          : {}),
      }
      : {
        title: assTitle.trim(),
        type: assType,
        subjectCode: targetSubjectCode,
        classId: assClassId,
        gradingPeriod: assPeriod,
        maxScore: assMaxScore,
        dueDate: assDueDate,
        instructions: assInstructions,
        remarks: assRemarks,
        status: assStatus as 'Active' | 'Closed' | 'Archived',
        transmutationEnabled: assTransmutationEnabled,
        transmutationMinimumPercentage: assTransmutationMinimum,
        transmutationMaximumPercentage: assTransmutationMaximum,
        attendanceSessionDate: assAttendanceDate || null,
        attendanceSessionCode: assAttendanceCode || null,
        ...(modalConfigStatus === 'configured' && assGradingCategoryId
          ? { gradingCategoryId: Number(assGradingCategoryId) }
          : {}),
      };

    if (modalConfigStatus !== 'configured' || !assGradingCategoryId) {
      delete candidate.gradingCategoryId;
    }

    try {
      const response = await saveFacultyAssessmentsApi([candidate]);
      const persistedAssessment = response.assessments?.[0];
      if (response.assessments?.length !== 1
        || !persistedAssessment?.id
        || persistedAssessment.classId !== assClassId
        || persistedAssessment.title !== assTitle.trim()) {
        throw new Error('The server did not confirm this assessment for the selected class. Please try again.');
      }
      await refreshAssessments();
      setSelectedClassId(assClassId);
      showFeedback(response.message || 'Assessment saved successfully.', 'success');
      setIsAssessmentModalOpen(false);
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to save assessment.', 'error');
    }
  };

  // ----------------------------------------------------
  // 2. STUDENT SCORES TAB STATE
  // ----------------------------------------------------
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [scoreSearch, setScoreSearch] = useState('');
  const [scoresInputState, setScoresInputState] = useState<Record<string, { score: string; remarks: string }>>({});
  const [isScoresSavedAlert, setIsScoresSavedAlert] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  // Set default assessment when subject/class changes
  useEffect(() => {
    if (activeAssessments.length > 0) {
      setSelectedAssessmentId(activeAssessments[0].id);
    } else {
      setSelectedAssessmentId('');
    }
  }, [selectedSubjectCode, selectedClassId, assessments]);

  const activeAssessment = useMemo(() => {
    return assessments.find(a => a.id === selectedAssessmentId);
  }, [assessments, selectedAssessmentId]);

  // Load existing student scores
  useEffect(() => {
    if (!selectedAssessmentId) return;
    const initialInputs: Record<string, { score: string; remarks: string }> = {};
    activeStudents.forEach(student => {
      const match = assessmentScores.find(
        s => s.assessmentId === selectedAssessmentId && s.studentId === student.id
      );
      initialInputs[student.id] = {
        score: match ? match.score.toString() : '',
        remarks: match?.remarks || ''
      };
    });
    setScoresInputState(initialInputs);
    setIsScoresSavedAlert(false);
  }, [selectedAssessmentId, activeStudents, assessmentScores]);

  const handleScoreChange = (studentId: string, val: string, field: 'score' | 'remarks') => {
    setScoresInputState(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: val
      }
    }));
    setIsScoresSavedAlert(false);
  };

  // Validates a single score input
  const validateSingleScore = (scoreStr: string, maxScore: number): boolean => {
    if (!scoreStr) return true; // empty is allowed, means ungraded
    const num = parseFloat(scoreStr);
    return !isNaN(num) && num >= 0 && num <= maxScore;
  };

  const refreshPersistedGrades = async (classId: string): Promise<void> => {
    try {
      const response = await computeFacultyGradesApi(classId);
      if (response.results.some(result => result.status === 'incomplete_attendance')) {
        showFeedback('Scores saved. Some grades remain incomplete until linked attendance is available.', 'info');
      }
    } catch {
      showFeedback('Scores saved, but persisted grade recomputation could not complete.', 'info');
    }
  };

  // Auto-save on input blur
  const handleScoreBlur = async (studentId: string) => {
    if (!autoSaveEnabled || !selectedAssessmentId || !activeAssessment) return;
    const item = scoresInputState[studentId];
    if (!item) return;

    if (!validateSingleScore(item.score, activeAssessment.maxScore)) return;

    const saveList = Object.entries(scoresInputState)
      .filter(([id, val]) => val.score !== '')
      .map(([id, val]) => ({
        studentId: id,
        score: parseFloat(val.score),
        remarks: val.remarks
      }));
    try {
      await saveFacultyAssessmentScoresApi(selectedAssessmentId, saveList);
      saveAssessmentScores(selectedAssessmentId, saveList);
      await refreshPersistedGrades(activeAssessment.classId);
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Auto-save failed.', 'error');
    }
  };

  const handleManualSaveScores = async () => {
    if (!selectedAssessmentId || !activeAssessment) return;

    let hasErrors = false;
    const saveList: { studentId: string; score: number; remarks?: string }[] = [];

    Object.entries(scoresInputState).forEach(([studentId, val]) => {
      if (val.score === '') return;

      const num = parseFloat(val.score);
      if (isNaN(num) || num < 0 || num > activeAssessment.maxScore) {
        hasErrors = true;
      } else {
        saveList.push({
          studentId,
          score: num,
          remarks: val.remarks
        });
      }
    });

    if (hasErrors) {
      showFeedback('Some scores are invalid. Scores cannot exceed the assessment maximum.', 'error');
      return;
    }

    try {
      await saveFacultyAssessmentScoresApi(selectedAssessmentId, saveList);
      saveAssessmentScores(selectedAssessmentId, saveList);
      await refreshPersistedGrades(activeAssessment.classId);
      setIsScoresSavedAlert(true);
      setTimeout(() => setIsScoresSavedAlert(false), 3000);
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to save assessment scores.', 'error');
    }
  };

  // Filter roster for scores entry
  const filteredScoreStudents = useMemo(() => {
    return activeStudents.filter(s =>
      s.name.toLowerCase().includes(scoreSearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(scoreSearch.toLowerCase())
    );
  }, [activeStudents, scoreSearch]);

  // ----------------------------------------------------
  // 3. GRADE WEIGHTS EDITOR STATE (AUTHORITATIVE BACKEND)
  // ----------------------------------------------------
  interface EditorCategoryRow {
    tempId: string;
    id?: number;
    name: string;
    weight: string;
    sortOrder: number;
    inUse: boolean;
  }

  const [selectedOfferingKey, setSelectedOfferingKey] = useState<string>('');
  const [loadedConfig, setLoadedConfig] = useState<FacultyGradingConfiguration | null>(null);
  const [categoryRows, setCategoryRows] = useState<EditorCategoryRow[]>([]);
  const [savedCategoryRows, setSavedCategoryRows] = useState<EditorCategoryRow[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [mappingError, setMappingError] = useState<FacultyGradingCategoryAssignmentRequiredItem[] | null>(null);

  // Initialize selected offering key
  useEffect(() => {
    if (facultyOfferings.length === 0) return;
    if (!selectedOfferingKey || !facultyOfferings.some(o => o.key === selectedOfferingKey)) {
      const match = facultyOfferings.find(o => o.courseCode === selectedSubjectCode);
      setSelectedOfferingKey(match ? match.key : facultyOfferings[0].key);
    }
  }, [facultyOfferings, selectedSubjectCode, selectedOfferingKey]);

  const currentOffering = useMemo(() => {
    return facultyOfferings.find(o => o.key === selectedOfferingKey) || null;
  }, [facultyOfferings, selectedOfferingKey]);

  useEffect(() => {
    if (activeSubTab === 'components' && currentOffering && currentOffering.courseCode && currentOffering.courseCode !== selectedSubjectCode) {
      setSelectedSubjectCode(currentOffering.courseCode);
    }
  }, [activeSubTab, currentOffering, selectedSubjectCode]);

  const loadGradingConfig = async (offering: FacultyOffering) => {
    setConfigLoading(true);
    setConfigError(null);
    setConflictError(false);
    setMappingError(null);
    try {
      const res = await getFacultyGradingConfigApi({
        courseId: offering.courseId,
        semester: offering.canonicalSemester,
        schoolYear: offering.canonicalSchoolYear,
      });
      setLoadedConfig(res.configuration);
      if (res.configuration && Array.isArray(res.configuration.categories) && res.configuration.categories.length > 0) {
        const rows: EditorCategoryRow[] = res.configuration.categories.map((cat, idx) => ({
          tempId: String(cat.id ?? `cat-${idx}`),
          id: cat.id ?? undefined,
          name: cat.name,
          weight: String(cat.weight),
          sortOrder: cat.sortOrder ?? (idx + 1),
          inUse: Boolean(cat.inUse),
        }));
        setCategoryRows(rows);
        setSavedCategoryRows(rows);
      } else {
        setCategoryRows([]);
        setSavedCategoryRows([]);
      }
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to load grade configuration.');
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab !== 'components') return;
    if (!currentOffering) return;
    loadGradingConfig(currentOffering);
  }, [activeSubTab, currentOffering?.key]);

  const isDirty = useMemo(() => {
    if (categoryRows.length !== savedCategoryRows.length) return true;
    for (let i = 0; i < categoryRows.length; i++) {
      const curr = categoryRows[i];
      const saved = savedCategoryRows[i];
      if (
        curr.id !== saved.id ||
        curr.name !== saved.name ||
        curr.weight !== saved.weight ||
        curr.sortOrder !== saved.sortOrder
      ) {
        return true;
      }
    }
    return false;
  }, [categoryRows, savedCategoryRows]);

  const handleSelectOffering = async (newKey: string) => {
    if (newKey === selectedOfferingKey) return;
    if (isDirty) {
      const confirmed = await requestConfirmation(
        'You have unsaved changes to grade weights. Switching courses will discard them. Continue?',
        'Discard unsaved changes?'
      );
      if (!confirmed) return;
    }
    setSelectedOfferingKey(newKey);
  };

  const handleReload = async () => {
    if (isDirty) {
      const confirmed = await requestConfirmation(
        'You have unsaved changes. Reloading will discard them and fetch the latest saved configuration from the server. Continue?',
        'Discard unsaved changes?'
      );
      if (!confirmed) return;
    }
    if (currentOffering) {
      await loadGradingConfig(currentOffering);
    }
  };

  const handleAddCategory = () => {
    const newRow: EditorCategoryRow = {
      tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: '',
      weight: '',
      sortOrder: categoryRows.length + 1,
      inUse: false,
    };
    setCategoryRows(prev => [...prev, newRow]);
  };

  const handleUpdateCategory = (tempId: string, field: 'name' | 'weight', val: string) => {
    setCategoryRows(prev =>
      prev.map(r => (r.tempId === tempId ? { ...r, [field]: val } : r))
    );
  };

  const handleMoveCategory = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categoryRows.length) return;
    setCategoryRows(prev => {
      const next = [...prev];
      const item = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = item;
      return next.map((row, idx) => ({ ...row, sortOrder: idx + 1 }));
    });
  };

  const handleRemoveCategory = (tempId: string) => {
    const target = categoryRows.find(r => r.tempId === tempId);
    if (!target) return;
    if (target.inUse) {
      showFeedback('Cannot remove category that has associated assessments.', 'error');
      return;
    }
    setCategoryRows(prev => {
      const filtered = prev.filter(r => r.tempId !== tempId);
      return filtered.map((row, idx) => ({ ...row, sortOrder: idx + 1 }));
    });
  };

  const weightCalculation = useMemo(() => {
    let sumUnits = 0;
    let allValid = true;
    for (const row of categoryRows) {
      const trimmed = row.weight.trim();
      if (trimmed === '') {
        allValid = false;
        continue;
      }
      const units = parseWeightUnits(trimmed);
      if (units === null) {
        allValid = false;
      } else {
        sumUnits += units;
      }
    }
    const isExact100 = allValid && sumUnits === TOTAL_WEIGHT_UNITS;
    const displayPercent = formatWeightUnitsToPercent(sumUnits);
    return {
      sumUnits,
      allValid,
      isExact100,
      displayPercent,
    };
  }, [categoryRows]);

  const validationError = useMemo(() => {
    if (categoryRows.length === 0) {
      return 'At least one grading category is required.';
    }
    const trimmedNames = categoryRows.map(r => r.name.trim());
    if (trimmedNames.some(n => !n)) {
      return 'All category names must be filled out.';
    }
    const lowerNames = trimmedNames.map(n => n.toLowerCase());
    if (new Set(lowerNames).size !== lowerNames.length) {
      return 'Category names must be unique.';
    }
    for (const row of categoryRows) {
      const trimmed = row.weight.trim();
      if (!trimmed) {
        return 'All category weights must be filled out.';
      }
      const units = parseWeightUnits(trimmed);
      if (units === null) {
        return `Invalid weight "${row.weight}". Enter a number between 0 and 100 with up to 4 decimal places.`;
      }
    }
    if (!weightCalculation.isExact100) {
      return `Total weights must equal exactly 100%. Current total: ${weightCalculation.displayPercent}%.`;
    }
    return null;
  }, [categoryRows, weightCalculation]);

  const handleSaveGradingConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentOffering) return;
    if (configSaving) return;

    if (validationError) {
      showFeedback(validationError, 'error');
      return;
    }

    setConfigSaving(true);
    setConfigError(null);
    setConflictError(false);
    setMappingError(null);

    const payload: FacultyGradingConfigSavePayload = {
      courseId: currentOffering.courseId,
      semester: currentOffering.canonicalSemester,
      schoolYear: currentOffering.canonicalSchoolYear,
      categories: categoryRows.map((row, idx) => ({
        ...(row.id ? { id: row.id } : {}),
        name: row.name.trim(),
        weight: row.weight.trim(),
        sortOrder: idx + 1,
      })),
    };

    if (loadedConfig?.version !== undefined && loadedConfig.version !== null) {
      payload.version = loadedConfig.version;
    }

    try {
      const res = await saveFacultyGradingConfigApi(payload);
      setLoadedConfig(res.configuration);
      const updatedRows: EditorCategoryRow[] = res.configuration.categories.map((cat, idx) => ({
        tempId: String(cat.id ?? `cat-${idx}`),
        id: cat.id ?? undefined,
        name: cat.name,
        weight: String(cat.weight),
        sortOrder: cat.sortOrder ?? (idx + 1),
        inUse: Boolean(cat.inUse),
      }));
      setCategoryRows(updatedRows);
      setSavedCategoryRows(updatedRows);
      showFeedback('Grade weights saved successfully.', 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setConflictError(true);
          showFeedback('Version conflict: another session updated these grade weights. Please reload the latest configuration.', 'error');
        } else if (err.status === 422 && (err.code === 'GRADING_CATEGORY_ASSIGNMENT_REQUIRED' || Array.isArray(err.details?.assessments))) {
          const assessments = (Array.isArray(err.details?.assessments) ? err.details.assessments : []) as FacultyGradingCategoryAssignmentRequiredItem[];
          setMappingError(assessments);
          showFeedback(err.message || 'Existing assessments require matching category assignments.', 'error');
        } else {
          setConfigError(err.message);
          showFeedback(err.message, 'error');
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to save grade configuration.';
        setConfigError(msg);
        showFeedback(msg, 'error');
      }
    } finally {
      setConfigSaving(false);
    }
  };

  // ----------------------------------------------------
  // 4. GRADE SUMMARIES TAB STATE
  // ----------------------------------------------------
  const [summarySearch, setSummarySearch] = useState('');
  const [sortField, setSortField] = useState<'name' | 'overall'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const toggleSort = (field: 'name' | 'overall') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedSummaryStudents = useMemo(() => {
    const filtered = activeStudents.filter(s =>
      s.name.toLowerCase().includes(summarySearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(summarySearch.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (sortField === 'name') {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else {
        const gradeA = a.enrolledSubjects.find(sub => sub.code === selectedSubjectCode)?.grade ?? 5.0;
        const gradeB = b.enrolledSubjects.find(sub => sub.code === selectedSubjectCode)?.grade ?? 5.0;
        // In GWA, smaller values are better (e.g. 1.0 is better than 5.0)
        return sortAsc ? gradeA - gradeB : gradeB - gradeA;
      }
    });
  }, [activeStudents, summarySearch, sortField, sortAsc, selectedSubjectCode]);

  const handleExportCSV = () => {
    recordAudit({ action: 'Exported grade CSV', module: 'Grade Computation', description: `Exported grade ledger for ${selectedSubjectCode}.`, status: 'Success' });
    let headers = 'Student ID,Name,Midterm Grade,Final Grade,Overall GWA,Status\n';
    let rows = sortedSummaryStudents.map(student => {
      const subj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
      const gradeVal = subj && typeof subj.grade === 'number' ? subj.grade.toFixed(2) : '5.00';
      const statusText = student.status.toUpperCase();
      return `${student.studentId},"${student.name}",${gradeVal},${gradeVal},${gradeVal},${statusText}`;
    }).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedSubjectCode}_Grade_Summary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ----------------------------------------------------
  // 5. IMPORT GRADE SHEETS TAB STATE
  // ----------------------------------------------------
  const [importPeriod, setImportPeriod] = useState<'Midterm' | 'Final' | 'Overall'>('Midterm');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<{ id: string; name: string; score: number; valid: boolean; error?: string }[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState(false);

  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setImportSuccess(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) {
        setCsvErrors(['CSV must contain a header row and at least one student record.']);
        setCsvPreviewData([]);
        return;
      }

      // Check header format: Student ID, Score (e.g. DENT-2022-0051, 85)
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      if (!headers.includes('student id') || !headers.includes('score')) {
        setCsvErrors(['Invalid CSV headers! The file must include "Student ID" and "Score" columns.']);
        setCsvPreviewData([]);
        return;
      }

      const idIdx = headers.indexOf('student id');
      const scoreIdx = headers.indexOf('score');

      const parsed: typeof csvPreviewData = [];
      const errorsList: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        const studId = cols[idIdx];
        const scoreStr = cols[scoreIdx];

        if (!studId) continue;

        const matchedStudent = students.find(s => s.studentId === studId);
        const scoreNum = parseFloat(scoreStr);
        let valid = true;
        let rowErr = '';

        if (!matchedStudent) {
          valid = false;
          rowErr = `Line ${i + 1}: Student ID "${studId}" is not registered in the system.`;
          errorsList.push(rowErr);
        } else if (!matchedStudent.classSections?.some(section => section.classId === selectedClassId)) {
          valid = false;
          rowErr = `Line ${i + 1}: Student "${matchedStudent.name}" is not enrolled in Class "${selectedClassId}".`;
          errorsList.push(rowErr);
        } else if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
          valid = false;
          rowErr = `Line ${i + 1}: Score "${scoreStr}" must be a number between 0 and 100.`;
          errorsList.push(rowErr);
        }

        parsed.push({
          id: studId,
          name: matchedStudent ? matchedStudent.name : 'Unknown Student',
          score: isNaN(scoreNum) ? 0 : scoreNum,
          valid,
          error: rowErr || undefined
        });
      }

      setCsvPreviewData(parsed);
      setCsvErrors(errorsList);
    };

    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (csvErrors.length > 0) {
      showFeedback('Please fix the CSV errors listed below before importing.', 'error');
      return;
    }

    if (csvPreviewData.length === 0) return;

    const confirmed = await requestConfirmation(
      `Import grades for ${csvPreviewData.length} students?\nThis will automatically recalculate student scores.`
    );
    if (!confirmed) return;

    // Recalculate components based on score import
    csvPreviewData.forEach(row => {
      const student = students.find(s => s.studentId === row.id);
      if (!student) return;

      const currentSubj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
      if (!currentSubj) return;

      // Update base components quizzes / exams / practicum relative to imported score
      const updatedComponents: GradeComponents = { ...currentSubj.components };

      if (importPeriod === 'Midterm') {
        updatedComponents.exams = row.score; // Map to exams components
      } else if (importPeriod === 'Final') {
        updatedComponents.quizzes = row.score;
      } else {
        updatedComponents.practicum = row.score;
      }

      updateStudentGrade(student.id, selectedSubjectCode, updatedComponents);
    });

    setImportSuccess(true);
    setCsvFile(null);
    setCsvPreviewData([]);
    showFeedback('CSV grades imported and student grades recalculated.', 'success');
  };

  // Helper styles
  const getBadgeColor = (status: string) => {
    if (status === 'critical') return 'bg-rose-50 text-rose-600 dark:bg-rose-950/20';
    if (status === 'warning') return 'bg-amber-50 text-amber-600 dark:bg-amber-950/20';
    if (status === 'remedial') return 'bg-accent-50 text-accent-600 dark:bg-accent-950/20';
    return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20';
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-205 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-clinical-550" />
            Grade Management Portal
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Perform assessment tracking, grading components editing, GWA calculations, and CSV score sheet imports
          </p>
        </div>
      </div>

      {/* Assessments Manager Course Offering and Section Selector Bar */}
      {activeSubTab === 'assessments' && (
        <Card className="p-4 flex flex-col md:flex-row gap-4 items-center">
          <div className="w-full md:flex-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Active Course Offering</label>
            <select
              value={selectedAssessmentOfferingKey}
              onChange={(e) => handleAssessmentOfferingChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
            >
              {facultyOfferings.length === 0 ? (
                <option value="">No active course offerings</option>
              ) : (
                facultyOfferings.map(offering => (
                  <option key={offering.key} value={offering.key}>
                    {offering.courseCode} - {offering.courseName}
                    {offering.canonicalSemester ? ` (${offering.canonicalSemester}, ${offering.canonicalSchoolYear})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="w-full md:w-56">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Active Section / Class</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
            >
              {(!currentAssessmentOffering || currentAssessmentOffering.sections.length === 0)
                ? <option value="">No active sections assigned</option>
                : currentAssessmentOffering.sections.map(classItem => (
                  <option key={classItem.id} value={classItem.id}>{classItem.csName}</option>
                ))}
            </select>
          </div>
        </Card>
      )}

      {/* Legacy Class and Subject Selector Bar for other untouched tabs */}
      {activeSubTab !== 'components' && activeSubTab !== 'assessments' && (
        <Card className="p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="w-full md:flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Active Course</label>
          <select
            value={selectedSubjectCode}
            onChange={(e) => setSelectedSubjectCode(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
          >
            {assignedSubjects.map((subCode: string) => (
              <option key={subCode} value={subCode}>{subCode} - {students.find(s=>s.enrolledSubjects.some(x=>x.code===subCode))?.enrolledSubjects.find(x=>x.code===subCode)?.name || 'Course'}</option>
            ))}
          </select>
        </div>

        <div className="w-full md:w-56">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Active Section / Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
          >
            {availableClasses.length === 0
              ? <option value="">No active sections assigned</option>
              : availableClasses.map(classItem => (
                <option key={classItem.id} value={classItem.id}>{classItem.csName}</option>
              ))}
          </select>
        </div>
      </Card>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm">
        <button
          onClick={() => setActiveSubTab('scores')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'scores' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Student Scores Entry
        </button>
        <button
          onClick={() => setActiveSubTab('assessments')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'assessments' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <FileText className="w-4 h-4" />
          Assessments Manager
        </button>
        <button
          onClick={() => setActiveSubTab('components')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'components' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <Settings className="w-4 h-4" />
          Grade Weights Editor
        </button>
        <button
          onClick={() => setActiveSubTab('summaries')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'summaries' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <Printer className="w-4 h-4" />
          Summaries & Export
        </button>
        <button
          onClick={() => setActiveSubTab('import')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'import' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <Upload className="w-4 h-4" />
          Import Grade Sheets
        </button>
      </div>

      {/* ----------------------------------------------------
          TAB 1: STUDENT SCORES ENTRY
      ---------------------------------------------------- */}
      {activeSubTab === 'scores' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-4">
            <Card className="h-full flex flex-col justify-between">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Calculator className="w-4.5 h-4.5 text-clinical-550" />
                  Select Assessment Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Choose Assessment</label>
                  {activeAssessments.length === 0 ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-150 rounded-xl text-xs text-slate-450 text-center">
                      No active assessments. Please create one under "Assessments Manager" first.
                    </div>
                  ) : (
                    <select
                      value={selectedAssessmentId}
                      onChange={(e) => setSelectedAssessmentId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 text-xs focus:outline-none"
                    >
                      {activeAssessments.map(ass => (
                        <option key={ass.id} value={ass.id}>
                          {ass.title} ({ass.type} • Max: {ass.maxScore})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {activeAssessment && (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-150 dark:border-slate-800 text-xs space-y-2">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Assessment Spec:</h4>
                    <div><span className="text-slate-400 font-semibold">Type:</span> {activeAssessment.type}</div>
                    <div><span className="text-slate-400 font-semibold">Grading Period:</span> {activeAssessment.gradingPeriod}</div>
                    <div><span className="text-slate-400 font-semibold">Max Score:</span> {activeAssessment.maxScore} points</div>
                    <div><span className="text-slate-400 font-semibold">Due Date:</span> {activeAssessment.dueDate}</div>
                    {activeAssessment.instructions && (
                      <div>
                        <span className="text-slate-400 font-semibold">Instructions:</span>
                        <p className="text-slate-550 dark:text-slate-400 italic mt-0.5">{activeAssessment.instructions}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center space-x-2 pt-2 border-t border-slate-150 dark:border-slate-850">
                  <input
                    type="checkbox"
                    id="autosave"
                    checked={autoSaveEnabled}
                    onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-clinical-600 focus:ring-clinical-500"
                  />
                  <label htmlFor="autosave" className="text-xs text-slate-555 font-semibold">
                    Enable Auto-Save on score input blur
                  </label>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Roster Score Entries</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Record student scores below. Unsaved scores are bordered in orange.</p>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student..."
                    value={scoreSearch}
                    onChange={(e) => setScoreSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {!selectedAssessmentId ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                    Please select or create an assessment activity on the left pane.
                  </div>
                ) : filteredScoreStudents.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                    No matching student records found.
                  </div>
                ) : (
                  filteredScoreStudents.map(student => {
                    const row = scoresInputState[student.id] || { score: '', remarks: '' };
                    const isValid = validateSingleScore(row.score, activeAssessment?.maxScore || 100);

                    return (
                      <div key={student.id} className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/30 dark:hover:bg-slate-900/10">
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">{student.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">{student.studentId}</span>
                        </div>

                        <div className="flex items-center space-x-2 self-start md:self-auto">
                          {/* Score Input */}
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max={activeAssessment?.maxScore || 100}
                              placeholder={`0 - ${activeAssessment?.maxScore || 100}`}
                              value={row.score}
                              onChange={(e) => handleScoreChange(student.id, e.target.value, 'score')}
                              onBlur={() => handleScoreBlur(student.id)}
                              className={`w-24 px-3 py-1.5 rounded-xl border text-xs text-center font-bold focus:outline-none ${
                                !isValid
                                  ? 'border-rose-500 focus:ring-rose-500 bg-rose-50/50'
                                  : row.score === ''
                                  ? 'border-slate-200 dark:border-slate-800 dark:bg-slate-950'
                                  : 'border-clinical-550/30 bg-clinical-50/20 text-clinical-650'
                              }`}
                            />
                            {!isValid && (
                              <span className="absolute bottom-[-14px] left-0 text-[8px] font-bold text-rose-500">Exceeds max</span>
                            )}
                          </div>

                          {/* Remarks */}
                          <input
                            type="text"
                            placeholder="Remarks..."
                            value={row.remarks}
                            onChange={(e) => handleScoreChange(student.id, e.target.value, 'remarks')}
                            onBlur={() => handleScoreBlur(student.id)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-950 text-xs w-36 focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {selectedAssessmentId && filteredScoreStudents.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800/80 flex justify-end items-center gap-3">
                  <button
                    onClick={handleManualSaveScores}
                    className="flex items-center gap-1.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-xs shadow-md transition-all active:scale-97"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isScoresSavedAlert ? 'Scores Saved Successfully!' : 'Save Scores Sheet'}</span>
                  </button>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          TAB 2: ASSESSMENTS MANAGER
      ---------------------------------------------------- */}
      {activeSubTab === 'assessments' && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Active Course Assessments</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {currentAssessmentOffering
                  ? `${currentAssessmentOffering.courseCode} · ${currentAssessmentOffering.courseName}`
                  : 'Manage assignments, quizzes, laboratories, and exams'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {assessmentConfigStatus === 'error' && (
                <button
                  type="button"
                  onClick={() => currentAssessmentOffering && loadAssessmentOfferingConfig(currentAssessmentOffering)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  title="Retry loading configuration"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Config
                </button>
              )}
              <button
                onClick={openNewAssessmentModal}
                disabled={availableClasses.length === 0 && (!currentAssessmentOffering || currentAssessmentOffering.sections.length === 0)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Assessment
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
                  <th className="px-5 py-3">Assessment Title</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Grading Period</th>
                  <th className="px-5 py-3 text-center">Max Score</th>
                  <th className="px-5 py-3">Due Date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs">
                {activeAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                      No active assessments created for this course. Click "Add Assessment" to create one.
                    </td>
                  </tr>
                ) : (
                  activeAssessments.map(ass => (
                    <tr key={ass.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{ass.title}</span>
                          {currentAssessmentOffering && currentAssessmentOffering.sections.length > 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-mono">
                              {facultyClasses.find(c => c.id === ass.classId)?.csName || ass.classId}
                            </span>
                          )}
                        </div>
                        {ass.instructions && <span className="text-[10px] text-slate-400 line-clamp-1">{ass.instructions}</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {(() => {
                          if (assessmentConfigStatus === 'loading') {
                            return (
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase text-[9px] tracking-wide animate-pulse">
                                Loading...
                              </span>
                            );
                          }
                          if (assessmentConfigStatus === 'configured' && assessmentConfig) {
                            const matchedCategory = assessmentConfig.categories.find(
                              c => String(c.id) === String(ass.gradingCategoryId)
                            );
                            if (matchedCategory) {
                              return (
                                <span className="px-2 py-0.5 rounded-md font-semibold bg-clinical-50 text-clinical-600 dark:bg-clinical-950/40 dark:text-clinical-450 uppercase text-[9px] tracking-wide">
                                  {matchedCategory.name}
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 uppercase text-[9px] tracking-wide">
                                <AlertTriangle className="w-3 h-3" />
                                Unassigned Category
                              </span>
                            );
                          }
                          return (
                            <span className="px-2 py-0.5 rounded-md font-semibold bg-clinical-50 text-clinical-600 dark:bg-clinical-950/40 dark:text-clinical-450 uppercase text-[9px] tracking-wide">
                              {ass.type}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-700 dark:text-slate-350">{ass.gradingPeriod}</td>
                      <td className="px-5 py-3.5 text-center font-extrabold text-slate-800 dark:text-slate-100">{ass.maxScore} pts</td>
                      <td className="px-5 py-3.5 font-mono text-slate-450 dark:text-slate-500">{ass.dueDate}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${
                          ass.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-650'
                        }`}>
                          {ass.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => openEditAssessmentModal(ass)}
                            className="p-1 text-slate-455 hover:text-clinical-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
                            title="Edit"
                          >
                            <Edit className="w-3.8 h-3.8" />
                          </button>
                          <button
                            onClick={async () => {
                              if (await requestConfirmation(`Archive ${ass.title}?`, 'Archive assessment')) {
                                try {
                                  await saveFacultyAssessmentsApi([{ ...ass, status: 'Archived' }]);
                                  await refreshAssessments();
                                  showFeedback('Assessment archived.', 'success');
                                } catch (requestError) {
                                  showFeedback(requestError instanceof Error ? requestError.message : 'Unable to archive assessment.', 'error');
                                }
                              }
                            }}
                            className="p-1 text-slate-455 hover:text-amber-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
                            title="Archive"
                          >
                            <Archive className="w-3.8 h-3.8" />
                          </button>
                          <button
                            onClick={async () => {
                              if (await requestConfirmation(`Permanently delete ${ass.title}? This will delete all student scores for this assessment.`, 'Delete assessment')) {
                                try {
                                  const response = await deleteFacultyAssessmentApi(ass.id);
                                  await refreshAssessments();
                                  showFeedback(response.message || 'Assessment deleted.', 'success');
                                } catch (requestError) {
                                  showFeedback(requestError instanceof Error ? requestError.message : 'Unable to delete assessment.', 'error');
                                }
                              }
                            }}
                            className="p-1 text-slate-455 hover:text-rose-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
                            title="Delete"
                          >
                            <Trash2 className="w-3.8 h-3.8" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ----------------------------------------------------
          TAB 3: GRADE WEIGHTS EDITOR
      ---------------------------------------------------- */}
      {activeSubTab === 'components' && (
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-clinical-550" />
                  Grade Weights & Schema Editor
                </CardTitle>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Configure dynamic grading categories and percentage weights for your course offering.
                </p>
              </div>

              {currentOffering && (
                <button
                  type="button"
                  onClick={handleReload}
                  disabled={configLoading || configSaving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-205 dark:border-slate-800 text-xs font-semibold text-slate-650 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-900 bg-white dark:bg-slate-950 shadow-sm disabled:opacity-50"
                  title="Reload latest configuration from server"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${configLoading ? 'animate-spin' : ''}`} />
                  Reload Latest
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Course Offering Selector */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <label htmlFor="course-offering-select" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Course Offering (Faculty Assignment)
              </label>

              {loading ? (
                <div className="text-xs text-slate-400 animate-pulse">Loading teaching assignments...</div>
              ) : facultyOfferings.length === 0 ? (
                <div className="text-xs text-slate-500">No active teaching assignments found. You can only edit grade weights for courses you currently teach.</div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <select
                    id="course-offering-select"
                    value={selectedOfferingKey}
                    onChange={(e) => handleSelectOffering(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  >
                    {facultyOfferings.map(offering => (
                      <option key={offering.key} value={offering.key}>
                        {offering.courseCode} - {offering.courseName} ({offering.canonicalSemester}, {offering.canonicalSchoolYear}) · {offering.sectionNames.length} {offering.sectionNames.length === 1 ? 'Section' : 'Sections'}
                      </option>
                    ))}
                  </select>

                  {loadedConfig && (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-clinical-50 dark:bg-clinical-950/40 border border-clinical-200 dark:border-clinical-800 text-clinical-700 dark:text-clinical-300 text-[10px] font-bold">
                        Version {loadedConfig.version}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Conflict Alert (409) */}
            {conflictError && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <div>
                    <div className="font-bold">Version Conflict Detected</div>
                    <div className="text-[11px] mt-0.5">
                      Another session or user modified this grading configuration. Your local changes cannot overwrite the newer version.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReload}
                  className="shrink-0 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reload Latest
                </button>
              </div>
            )}

            {/* Mapping Error Alert (422) */}
            {mappingError && mappingError.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="font-bold">Existing Assessments Require Matching Categories</div>
                    <div className="text-[11px] mt-0.5">
                      This course offering contains active assessments that require matching category names before this configuration can be activated. Please create categories matching each legacy type below:
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-amber-500/20 bg-white/60 dark:bg-slate-900/60">
                  <table className="min-w-full divide-y divide-amber-500/20 text-xs">
                    <thead>
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                        <th className="px-3 py-2">Assessment ID</th>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Required Legacy Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-500/20">
                      {mappingError.map(item => (
                        <tr key={item.assessmentId}>
                          <td className="px-3 py-1.5 font-mono text-[11px]">{item.assessmentId}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-100">{item.title}</td>
                          <td className="px-3 py-1.5">
                            <span className="px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold text-[10px]">
                              {item.legacyType}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* General Error Alert */}
            {configError && !conflictError && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{configError}</span>
              </div>
            )}

            {/* Loading State */}
            {configLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-clinical-550" />
                <span className="text-xs">Loading course grade configuration...</span>
              </div>
            ) : (
              <form onSubmit={handleSaveGradingConfig} className="space-y-5">
                {/* Policy Banner / Empty State Banner */}
                {loadedConfig === null && categoryRows.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-clinical-500/10 border border-clinical-500/20 text-xs text-clinical-800 dark:text-clinical-300 space-y-2">
                    <div className="font-bold flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-clinical-600 dark:text-clinical-400" />
                      Unconfigured Course Offering
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-650 dark:text-slate-350">
                      No grade weights have been configured for this course offering yet. Add dynamic categories totaling exactly <strong>100%</strong> to establish the initial grading schema.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>
                      Grade weighting policy: Total weights across all categories must sum to exactly <strong>100%</strong>. Weights support decimal precision up to 4 places (e.g. 33.3333%).
                    </span>
                  </div>
                )}

                {/* Categories Table / Rows */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Grading Categories ({categoryRows.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-clinical-50 dark:bg-clinical-950/40 text-clinical-600 dark:text-clinical-400 hover:bg-clinical-100 font-bold text-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Category
                    </button>
                  </div>

                  {categoryRows.length === 0 ? (
                    <div className="py-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                      <p className="text-xs text-slate-400">No categories added yet.</p>
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="mt-2 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-clinical-600 text-white font-bold text-xs hover:bg-clinical-700"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add First Category
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-150 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950">
                      {categoryRows.map((row, index) => (
                        <div key={row.tempId} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                          {/* Reorder Buttons */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              aria-label="Move category up"
                              onClick={() => handleMoveCategory(index, 'up')}
                              disabled={index === 0}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Move category down"
                              onClick={() => handleMoveCategory(index, 'down')}
                              disabled={index === categoryRows.length - 1}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Category Name Input */}
                          <div className="flex-1">
                            <input
                              type="text"
                              value={row.name}
                              placeholder="Category name (e.g. Quizzes, Final Exam)"
                              onChange={(e) => handleUpdateCategory(row.tempId, 'name', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
                            />
                          </div>

                          {/* Category Weight Input */}
                          <div className="flex items-center gap-1.5 w-28">
                            <input
                              type="text"
                              value={row.weight}
                              placeholder="0"
                              onChange={(e) => handleUpdateCategory(row.tempId, 'weight', e.target.value)}
                              className="w-20 px-2.5 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-bold text-right focus:outline-none focus:ring-2 focus:ring-clinical-500"
                            />
                            <span className="text-xs font-bold text-slate-400">%</span>
                          </div>

                          {/* Remove Button */}
                          <div>
                            <button
                              type="button"
                              aria-label={`Delete category ${row.name || 'unnamed'}`}
                              onClick={() => handleRemoveCategory(row.tempId)}
                              disabled={row.inUse}
                              title={row.inUse ? 'Cannot delete category with associated assessments' : 'Delete category'}
                              className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Total Bar and Action Buttons */}
                <div className="pt-4 border-t border-slate-150 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="text-xs">
                      <span className="text-slate-400">Total Weight: </span>
                      <span
                        className={`font-extrabold text-sm ${
                          weightCalculation.isExact100 ? 'text-emerald-500' : 'text-rose-500'
                        }`}
                      >
                        {weightCalculation.displayPercent}
                      </span>
                      <span className="text-slate-400 text-xs"> / 100%</span>
                    </div>

                    {weightCalculation.isExact100 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                        <CheckCircle className="w-3 h-3" />
                        Valid 100%
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3" />
                        Must equal 100%
                      </span>
                    )}

                    {isDirty && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                        Unsaved Changes
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={configSaving || !weightCalculation.isExact100 || categoryRows.length === 0}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-clinical-500 hover:bg-clinical-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-md transition-all"
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {configSaving
                          ? 'Saving...'
                          : loadedConfig
                          ? 'Save Grade Weights'
                          : 'Save Initial Schema'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------
          TAB 4: GRADE SUMMARIES & EXPORT
      ---------------------------------------------------- */}
      {activeSubTab === 'summaries' && (
        <Card className="p-0 overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Academic Grade Summaries</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">General Weighted Averages (GWA) based on current evaluation scores</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 text-slate-650 hover:bg-slate-50 dark:text-slate-350 dark:hover:bg-slate-900 bg-white dark:bg-slate-950 font-bold text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Layout
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV Ledger
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-slate-150 dark:border-slate-800/80 flex items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search student..."
                value={summarySearch}
                onChange={(e) => setSummarySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-205 dark:border-slate-850 bg-white dark:bg-slate-900 text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
                  <th className="px-5 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => toggleSort('name')}>
                    <div className="flex items-center gap-1">
                      Student Details
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-5 py-3 text-center">Quizzes</th>
                  <th className="px-5 py-3 text-center">Practicum</th>
                  <th className="px-5 py-3 text-center">Exams</th>
                  <th className="px-5 py-3 text-center">Attendance</th>
                  <th className="px-5 py-3 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => toggleSort('overall')}>
                    <div className="flex items-center justify-center gap-1">
                      Overall GWA
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-5 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs">
                {sortedSummaryStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                      No matching student grade summaries found.
                    </td>
                  </tr>
                ) : (
                  sortedSummaryStudents.map(student => {
                    const subj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
                    const isFailsRetention = subj && subj.isClinical && subj.grade > settings.retentionThreshold;
                    const isFailed = subj && subj.grade === 5.0;

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{student.name}</div>
                          <span className="text-[10px] text-slate-400">{student.studentId}</span>
                        </td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj && typeof subj.components?.quizzes === 'number' ? subj.components.quizzes.toFixed(1) : '80.0'}%</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj && typeof subj.components?.practicum === 'number' ? subj.components.practicum.toFixed(1) : '80.0'}%</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj && typeof subj.components?.exams === 'number' ? subj.components.exams.toFixed(1) : '80.0'}%</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj && typeof subj.components?.attendance === 'number' ? subj.components.attendance.toFixed(1) : '90.0'}%</td>
                        <td className="px-5 py-3 text-center font-extrabold text-sm text-slate-850 dark:text-slate-100">
                          {subj && typeof subj.grade === 'number' ? subj.grade.toFixed(2) : '2.50'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            isFailed
                              ? 'bg-rose-100 text-rose-700'
                              : isFailsRetention
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {isFailed ? 'FAILED' : isFailsRetention ? 'FAILS RETENTION' : 'PASS'}
                          </span>
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
          TAB 5: IMPORT GRADE SHEETS
      ---------------------------------------------------- */}
      {activeSubTab === 'import' && (
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-clinical-550" />
              Import Grade Sheet from CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-550 dark:text-slate-400 space-y-1.5">
              <h4 className="font-bold text-slate-800 dark:text-slate-205">Import File Requirements:</h4>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>File must be in standard **CSV (Comma Separated Values)** format.</li>
                <li>Header row must contain **"Student ID"** and **"Score"** (GWA mapping percentage, 0-100).</li>
                <li>Values will be validated and mapped to the chosen Grading Period components.</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Grading Period / Component Destination</label>
                <select
                  value={importPeriod}
                  onChange={(e) => setImportPeriod(e.target.value as any)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
                >
                  <option value="Midterm">Midterm Exams Score</option>
                  <option value="Final">Final Quizzes / Class Activities</option>
                  <option value="Overall">Clinical Practicums / Laboratories</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Select CSV Sheet File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvSelect}
                  className="w-full text-xs text-slate-450 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-clinical-50 file:text-clinical-700 hover:file:bg-clinical-100 cursor-pointer border border-slate-205 dark:border-slate-800 p-1.5 rounded-xl"
                />
              </div>
            </div>

            {/* Error notifications */}
            {csvErrors.length > 0 && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 space-y-1.5">
                <h4 className="text-xs font-bold text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  CSV Parsing and Validation Errors ({csvErrors.length})
                </h4>
                <div className="max-h-28 overflow-y-auto text-[11px] text-rose-500 font-medium space-y-1">
                  {csvErrors.map((err, idx) => (
                    <div key={idx}>• {err}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Import Preview */}
            {csvPreviewData.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CSV Data Verification Preview</h4>
                <div className="border border-slate-150 dark:border-slate-800/80 rounded-xl max-h-56 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800 text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 sticky top-0">
                      <tr className="text-left font-bold text-[9px] uppercase text-slate-450 tracking-wider">
                        <th className="px-4 py-2">Student ID</th>
                        <th className="px-4 py-2">Student Name</th>
                        <th className="px-4 py-2">Imported Score</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-[11px]">
                      {csvPreviewData.map((row, idx) => (
                        <tr key={idx} className={row.valid ? 'hover:bg-slate-50' : 'bg-rose-50/20 text-rose-500'}>
                          <td className="px-4 py-2 font-semibold">{row.id}</td>
                          <td className="px-4 py-2">{row.name}</td>
                          <td className="px-4 py-2 font-bold">{row.score}%</td>
                          <td className="px-4 py-2">
                            <span className={`font-bold uppercase ${row.valid ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {row.valid ? 'OK' : 'Error'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Import Success */}
            {importSuccess && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />
                Grades imported and dynamic subject GWAs recalculated successfully!
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-150 dark:border-slate-800/80">
              <button
                onClick={handleConfirmImport}
                disabled={csvPreviewData.length === 0 || csvErrors.length > 0}
                className="flex items-center gap-1 px-5 py-3 rounded-2xl bg-clinical-600 hover:bg-clinical-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all"
              >
                <Save className="w-4 h-4" />
                <span>Save Grades Import</span>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------
          PRINT LAYOUT SCREEN (HIDDEN NORMALLY)
      ---------------------------------------------------- */}
      <div className="print-only hidden p-8 bg-white text-slate-900 space-y-6">
        <div className="text-center space-y-1.5 border-b-2 border-slate-800 pb-5 mb-6">
          <h2 className="font-heading font-extrabold text-2xl tracking-tight uppercase">DentiSys Academic Portal</h2>
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Class Grade Ledger Report</p>
          <p className="text-[10px] text-slate-400">Class: {selectedClassId} • Subject Code: {selectedSubjectCode} ({activeSubjectName})</p>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-xs">
          <thead>
            <tr className="bg-slate-100 text-left font-bold uppercase">
              <th className="border border-slate-300 px-4 py-2">Student ID</th>
              <th className="border border-slate-300 px-4 py-2">Student Name</th>
              <th className="border border-slate-300 px-4 py-2 text-center">Quizzes</th>
              <th className="border border-slate-300 px-4 py-2 text-center">Practicum</th>
              <th className="border border-slate-300 px-4 py-2 text-center">Exams</th>
              <th className="border border-slate-300 px-4 py-2 text-center">Attendance</th>
              <th className="border border-slate-300 px-4 py-2 text-center">Overall GWA</th>
            </tr>
          </thead>
          <tbody>
            {sortedSummaryStudents.map(student => {
              const subj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
              return (
                <tr key={student.id}>
                  <td className="border border-slate-300 px-4 py-2 font-mono">{student.studentId}</td>
                  <td className="border border-slate-300 px-4 py-2 font-bold">{student.name}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj && typeof subj.components?.quizzes === 'number' ? subj.components.quizzes.toFixed(1) : '80.0'}%</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj && typeof subj.components?.practicum === 'number' ? subj.components.practicum.toFixed(1) : '80.0'}%</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj && typeof subj.components?.exams === 'number' ? subj.components.exams.toFixed(1) : '80.0'}%</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj && typeof subj.components?.attendance === 'number' ? subj.components.attendance.toFixed(1) : '90.0'}%</td>
                  <td className="border border-slate-300 px-4 py-2 text-center font-extrabold">{subj && typeof subj.grade === 'number' ? subj.grade.toFixed(2) : '2.50'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-between items-end mt-12 pt-8 border-t border-dashed border-slate-300 text-xs">
          <div className="text-center w-40">
            <div className="h-0.5 w-full bg-slate-400 mb-1" />
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Dean of Dentistry Seal</p>
          </div>

          <div className="text-center w-48">
            <p className="font-bold">{user?.display_name}</p>
            <div className="h-0.5 w-full bg-slate-400 mt-1 mb-1" />
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Assigned Faculty Signature</p>
          </div>
        </div>
      </div>

      {/* ASSESSMENT ADD/EDIT MODAL */}
      <Modal
        isOpen={isAssessmentModalOpen}
        onClose={() => setIsAssessmentModalOpen(false)}
        title={editingAssessment ? 'Edit Assessment Spec' : 'Create New Assessment activity'}
      >
        <form onSubmit={handleAssessmentSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Assessment Title / Activity Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Molar Crown Prep quiz"
              value={assTitle}
              onChange={(e) => setAssTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Target Class / Section
            </label>
            <select
              value={assClassId}
              onChange={(e) => handleModalClassChange(e.target.value)}
              required
              disabled={availableClasses.length === 0 && (!currentAssessmentOffering || currentAssessmentOffering.sections.length === 0)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
            >
              {(availableClasses.length > 0 ? availableClasses : (currentAssessmentOffering?.sections ?? [])).map(classItem => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.csName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Category Type
              </label>
              {modalConfigStatus === 'loading' && (
                <div className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 text-xs flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-clinical-600" />
                  <span>Loading grading categories...</span>
                </div>
              )}
              {modalConfigStatus === 'error' && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-400 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                    <div className="flex-1 font-medium">{modalConfigError || 'Failed to resolve grading configuration.'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const c = facultyClasses.find(x => x.id === assClassId);
                      const off = c ? getOfferingForClass(c) : currentAssessmentOffering;
                      if (off) loadModalConfigForOffering(off);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry Loading Configuration
                  </button>
                </div>
              )}
              {modalConfigStatus === 'configured' && modalConfig && (
                <div className="space-y-2">
                  {modalCategoryWarning && (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>This assessment requires a valid grading category assignment under this configured offering. Please select one below.</div>
                    </div>
                  )}
                  <select
                    value={assGradingCategoryId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setAssGradingCategoryId(selectedId);
                      const found = modalConfig.categories.find(c => String(c.id) === String(selectedId));
                      setAssType(found ? found.name : '');
                    }}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  >
                    <option value="">Select grading category</option>
                    {modalConfig.categories.map(cat => (
                      <option key={cat.id} value={String(cat.id)}>
                        {cat.name} ({cat.weight}%)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {modalConfigStatus === 'unconfigured' && (
                <select
                  value={assType}
                  onChange={(e) => setAssType(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
                >
                  <option value="Quiz">Quiz</option>
                  <option value="Activity">Activity</option>
                  <option value="Assignment">Assignment</option>
                  <option value="Laboratory">Laboratory</option>
                  <option value="Midterm Exam">Midterm Exam</option>
                  <option value="Final Exam">Final Exam</option>
                  <option value="Others">Others</option>
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Grading Period
              </label>
              <select
                value={assPeriod}
                onChange={(e) => setAssPeriod(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
              >
                <option value="Midterm">Midterm Period</option>
                <option value="Final">Final Period</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Maximum Score (Points)
              </label>
              <input
                type="number"
                min="1"
                required
                value={assMaxScore}
                onChange={(e) => setAssMaxScore(parseInt(e.target.value) || 50)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Due Date
              </label>
              <input
                type="date"
                required
                value={assDueDate}
                onChange={(e) => setAssDueDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <label className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700 dark:text-slate-200">
              <span>Enable attendance-linked transmutation</span>
              <input
                type="checkbox"
                checked={assTransmutationEnabled}
                onChange={(event) => setAssTransmutationEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-clinical-600 focus:ring-clinical-500"
              />
            </label>
            {assTransmutationEnabled && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Minimum percentage
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={assTransmutationMinimum}
                      onChange={(event) => setAssTransmutationMinimum(Number(event.target.value) || 0)}
                      className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Maximum percentage
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={assTransmutationMaximum}
                      onChange={(event) => setAssTransmutationMaximum(Number(event.target.value) || 0)}
                      className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                    />
                  </label>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Preview: 0% raw -&gt; {assTransmutationMinimum.toFixed(2)}%, 50% raw -&gt; {(assTransmutationMinimum + (assTransmutationMaximum - assTransmutationMinimum) / 2).toFixed(2)}%, 100% raw -&gt; {assTransmutationMaximum.toFixed(2)}%. Absent -&gt; 0%.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Attendance session date
                    <select
                      required={assTransmutationEnabled}
                      value={assAttendanceDate}
                      onChange={(event) => {
                        const date = event.target.value;
                        const codes = attendanceSessionOptions.find(option => option.date === date)?.codes ?? [];
                        setAssAttendanceDate(date);
                        setAssAttendanceCode(codes.length === 1 ? codes[0] : '');
                      }}
                      className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                    >
                      <option value="">Select date</option>
                      {attendanceSessionOptions.map(option => (
                        <option key={option.date} value={option.date}>{option.date}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Attendance session code
                    <select
                      required={assTransmutationEnabled}
                      value={assAttendanceCode}
                      onChange={(event) => setAssAttendanceCode(event.target.value)}
                      className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                    >
                      <option value="">Select code</option>
                      {attendanceCodesForDate.map(code => <option key={code} value={code}>{code}</option>)}
                    </select>
                  </label>
                </div>
                {attendanceSessionOptions.length === 0 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">No coded attendance sessions are available for this class yet. Save the assessment disabled and link it later.</p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Instructions
            </label>
            <textarea
              rows={2}
              placeholder="Instructions details..."
              value={assInstructions}
              onChange={(e) => setAssInstructions(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Remarks / Metadata
              </label>
              <input
                type="text"
                placeholder="Remarks..."
                value={assRemarks}
                onChange={(e) => setAssRemarks(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Assessment Status
              </label>
              <select
                value={assStatus}
                onChange={(e) => setAssStatus(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
              >
                <option value="Active">Active / Open</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="flex space-x-3 pt-3 justify-end">
            <button
              type="button"
              onClick={() => setIsAssessmentModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                modalConfigStatus === 'loading' ||
                modalConfigStatus === 'error' ||
                (modalConfigStatus === 'configured' && !assGradingCategoryId)
              }
              className="px-4 py-2.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-md"
            >
              Confirm Assessment
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
