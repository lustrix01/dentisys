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
  AlertCircle,
  List,
  Grid,
  Zap,
  RotateCcw
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
  FacultyGradingCategoryPeriodMappingRequiredItem,
  FacultyGradingConfigSavePayload,
  FacultyGradeComputeResult,
  GradingSourceKindEnum
} from '../../services/apiClient';
import {
  buildDefaultPeriodDraft,
  buildRowCompositeKey,
  validateDateRanges,
  normalizeDateRangesForPayload,
  formatPeriodIncompleteReason,
  extractPeriodEvaluation,
  generateGradeSummaryCSV,
  isPeriodComputeResult
} from '../../utils/periodGradingHelper';
import type {
  PeriodDraftState,
  PeriodCategoryDraftRow
} from '../../utils/periodGradingHelper';

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
    if (tab === 'summary' || tab === 'summaries') {
      return 'summaries';
    }
    if (tab === 'assessments' || tab === 'scores' || tab === 'components' || tab === 'import') {
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

  const modalEligibleCategories = useMemo(() => {
    if (!modalConfig || !Array.isArray(modalConfig.categories)) return [];
    if (modalConfig.schemaMode === 'periods') {
      return modalConfig.categories.filter(c =>
        (c.gradingPeriod === assPeriod || !c.gradingPeriod) &&
        c.sourceKind !== 'attendance'
      );
    }
    return modalConfig.categories.filter(c => c.sourceKind !== 'attendance');
  }, [modalConfig, assPeriod]);

  const handlePeriodChange = (newPeriod: 'Midterm' | 'Final') => {
    setAssPeriod(newPeriod);
    if (modalConfig && modalConfig.schemaMode === 'periods') {
      const validForNewPeriod = modalConfig.categories.filter(
        c => (c.gradingPeriod === newPeriod || !c.gradingPeriod) && c.sourceKind !== 'attendance'
      );
      if (!validForNewPeriod.some(c => String(c.id) === String(assGradingCategoryId))) {
        setAssGradingCategoryId('');
        setAssType('');
        if (modalConfigStatus === 'configured') {
          setModalCategoryWarning(true);
        }
      } else {
        setModalCategoryWarning(false);
      }
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
        const matchedCat = cfg.categories.find(c =>
          String(c.id) === String(ass.gradingCategoryId) &&
          (cfg.schemaMode !== 'periods' || c.gradingPeriod === ass.gradingPeriod) &&
          c.sourceKind !== 'attendance'
        );
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
        dueDate: assDueDate || null,
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
        dueDate: assDueDate || null,
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

  // View Mode: 'single' (Activity view) vs 'matrix' (Full gradebook grid view)
  const [scoreEntryMode, setScoreEntryMode] = useState<'single' | 'matrix'>('single');
  const [matrixScoresState, setMatrixScoresState] = useState<Record<string, Record<string, string>>>({});
  const [isMatrixSavedAlert, setIsMatrixSavedAlert] = useState(false);

  // Initialize Matrix Scores State whenever activeAssessments, activeStudents, or assessmentScores change
  useEffect(() => {
    const matrix: Record<string, Record<string, string>> = {};
    activeStudents.forEach(student => {
      matrix[student.id] = {};
      activeAssessments.forEach(ass => {
        const match = assessmentScores.find(s => s.assessmentId === ass.id && s.studentId === student.id);
        matrix[student.id][ass.id] = match ? match.score.toString() : '';
      });
    });
    setMatrixScoresState(matrix);
  }, [activeStudents, activeAssessments, assessmentScores]);

  const handleMatrixScoreChange = (studentId: string, assessmentId: string, value: string) => {
    setMatrixScoresState(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [assessmentId]: value,
      }
    }));
    setIsMatrixSavedAlert(false);
  };

  const handleSaveMatrixScores = async () => {
    let hasErrors = false;
    let saveCount = 0;

    for (const ass of activeAssessments) {
      const saveList: { studentId: string; score: number; remarks?: string }[] = [];
      activeStudents.forEach(student => {
        const valStr = matrixScoresState[student.id]?.[ass.id] ?? '';
        if (valStr !== '') {
          const num = parseFloat(valStr);
          if (isNaN(num) || num < 0 || num > ass.maxScore) {
            hasErrors = true;
          } else {
            const existingMatch = assessmentScores.find(s => s.assessmentId === ass.id && s.studentId === student.id);
            saveList.push({
              studentId: student.id,
              score: num,
              remarks: existingMatch?.remarks || ''
            });
          }
        }
      });

      if (!hasErrors && saveList.length > 0) {
        try {
          await saveFacultyAssessmentScoresApi(ass.id, saveList);
          saveAssessmentScores(ass.id, saveList);
          saveCount += saveList.length;
        } catch {
          showFeedback(`Failed to save scores for ${ass.title}`, 'error');
          return;
        }
      }
    }

    if (hasErrors) {
      showFeedback('Some scores in the matrix are invalid (exceed max score or negative).', 'error');
      return;
    }

    const targetClassId = selectedClassId || availableClasses[0]?.id;
    if (targetClassId) {
      await refreshPersistedGrades(targetClassId);
    }
    setIsMatrixSavedAlert(true);
    showFeedback(`Saved ${saveCount} grades across matrix successfully!`, 'success');
    setTimeout(() => setIsMatrixSavedAlert(false), 3000);
  };

  // Helper stats for Single Assessment Mode
  const activeAssessmentStats = useMemo(() => {
    const defaultRes = { graded: 0, total: activeStudents.length, avg: 'N/A', max: 'N/A', min: 'N/A' };
    if (!activeAssessment) return defaultRes;
    const validScores: number[] = [];
    activeStudents.forEach(student => {
      const val = scoresInputState[student.id]?.score;
      if (val && val !== '') {
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 0 && num <= activeAssessment.maxScore) {
          validScores.push(num);
        }
      }
    });
    const total = activeStudents.length;
    const graded = validScores.length;
    const avg = graded > 0 ? (validScores.reduce((a, b) => a + b, 0) / graded).toFixed(1) : 'N/A';
    const max = graded > 0 ? Math.max(...validScores).toString() : 'N/A';
    const min = graded > 0 ? Math.min(...validScores).toString() : 'N/A';
    return { graded, total, avg, max, min };
  }, [activeAssessment, activeStudents, scoresInputState]);

  // Quick fill helper
  const handleQuickFillEmpty = (fillValue: number) => {
    if (!activeAssessment) return;
    setScoresInputState(prev => {
      const updated = { ...prev };
      activeStudents.forEach(student => {
        if (!updated[student.id]?.score || updated[student.id].score === '') {
          updated[student.id] = {
            ...updated[student.id],
            score: Math.min(fillValue, activeAssessment.maxScore).toString(),
          };
        }
      });
      return updated;
    });
    setIsScoresSavedAlert(false);
  };

  const handleResetScoresInput = () => {
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
  const [schemaMode, setSchemaMode] = useState<'overall' | 'periods'>('periods');
  const [isPresetDraft, setIsPresetDraft] = useState<boolean>(false);
  const [activePeriodEditorTab, setActivePeriodEditorTab] = useState<'Midterm' | 'Final'>('Midterm');

  // Overall Mode State (Preserved Legacy Single-List)
  const [categoryRows, setCategoryRows] = useState<EditorCategoryRow[]>([]);
  const [savedCategoryRows, setSavedCategoryRows] = useState<EditorCategoryRow[]>([]);

  // Period Mode State (Midterm & Finals)
  const [termRatio, setTermRatio] = useState<{ midterm: string; final: string }>({ midterm: '40', final: '60' });
  const [savedTermRatio, setSavedTermRatio] = useState<{ midterm: string; final: string }>({ midterm: '40', final: '60' });

  const [midtermCategories, setMidtermCategories] = useState<PeriodCategoryDraftRow[]>([]);
  const [savedMidtermCategories, setSavedMidtermCategories] = useState<PeriodCategoryDraftRow[]>([]);

  const [finalCategories, setFinalCategories] = useState<PeriodCategoryDraftRow[]>([]);
  const [savedFinalCategories, setSavedFinalCategories] = useState<PeriodCategoryDraftRow[]>([]);

  const [attendanceDateRanges, setAttendanceDateRanges] = useState<{
    midterm: { startDate: string; endDate: string };
    final: { startDate: string; endDate: string };
  }>({
    midterm: { startDate: '', endDate: '' },
    final: { startDate: '', endDate: '' },
  });
  const [savedAttendanceDateRanges, setSavedAttendanceDateRanges] = useState<{
    midterm: { startDate: string; endDate: string };
    final: { startDate: string; endDate: string };
  }>({
    midterm: { startDate: '', endDate: '' },
    final: { startDate: '', endDate: '' },
  });

  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [firstSaveAssignmentError, setFirstSaveAssignmentError] = useState<FacultyGradingCategoryAssignmentRequiredItem[] | null>(null);
  const [conversionMappingError, setConversionMappingError] = useState<FacultyGradingCategoryPeriodMappingRequiredItem[] | null>(null);
  const [isConversionModalOpen, setIsConversionModalOpen] = useState(false);
  const [isRecomputeConfirmOpen, setIsRecomputeConfirmOpen] = useState(false);

  const handleOpenConversionModal = () => {
    setConversionMappingError(null);
    if (categoryRows.length > 0) {
      const mRows: PeriodCategoryDraftRow[] = categoryRows.map((cat, idx) => ({
        compositeKey: buildRowCompositeKey('Midterm', cat.id, `m-${idx + 1}`),
        tempId: `m-${cat.id ?? idx + 1}`,
        id: cat.id ?? undefined,
        name: cat.name,
        weight: cat.weight,
        sortOrder: cat.sortOrder ?? (idx + 1),
        gradingPeriod: 'Midterm',
        sourceKind: (cat.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment') as GradingSourceKindEnum,
        inUse: Boolean(cat.inUse),
      }));
      const fRows: PeriodCategoryDraftRow[] = categoryRows.map((cat, idx) => ({
        compositeKey: buildRowCompositeKey('Final', cat.id, `f-${idx + 1}`),
        tempId: `f-${cat.id ?? idx + 1}`,
        id: cat.id ?? undefined,
        name: cat.name,
        weight: cat.weight,
        sortOrder: cat.sortOrder ?? (idx + 1),
        gradingPeriod: 'Final',
        sourceKind: (cat.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment') as GradingSourceKindEnum,
        inUse: Boolean(cat.inUse),
      }));
      setMidtermCategories(mRows);
      setFinalCategories(fRows);
    }
    setIsConversionModalOpen(true);
  };

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
    setFirstSaveAssignmentError(null);
    setConversionMappingError(null);
    try {
      const res = await getFacultyGradingConfigApi({
        courseId: offering.courseId,
        semester: offering.canonicalSemester,
        schoolYear: offering.canonicalSchoolYear,
      });
      setLoadedConfig(res.configuration);
      if (res.configuration === null) {
        // Unconfigured offering: populate editable unsaved starting preset
        setSchemaMode('periods');
        setIsPresetDraft(true);
        const defaults = res.defaults;
        const fallback = buildDefaultPeriodDraft();

        const initialRatio = defaults?.termRatio
          ? { midterm: String(defaults.termRatio.midterm), final: String(defaults.termRatio.final) }
          : fallback.termRatio;
        setTermRatio(initialRatio);
        setSavedTermRatio(initialRatio);

        const initialMidterm: PeriodCategoryDraftRow[] = defaults?.midtermCategories
          ? defaults.midtermCategories.map((c, idx) => ({
              compositeKey: buildRowCompositeKey('Midterm', undefined, `preset-m-${idx + 1}`),
              tempId: `preset-m-${idx + 1}`,
              id: undefined,
              name: c.name,
              weight: String(c.weight),
              sortOrder: c.sortOrder ?? (idx + 1),
              gradingPeriod: 'Midterm' as const,
              sourceKind: c.sourceKind ?? (c.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment'),
              inUse: false,
            }))
          : fallback.midtermCategories;
        setMidtermCategories(initialMidterm);
        setSavedMidtermCategories(initialMidterm);

        const initialFinal: PeriodCategoryDraftRow[] = defaults?.finalCategories
          ? defaults.finalCategories.map((c, idx) => ({
              compositeKey: buildRowCompositeKey('Final', undefined, `preset-f-${idx + 1}`),
              tempId: `preset-f-${idx + 1}`,
              id: undefined,
              name: c.name,
              weight: String(c.weight),
              sortOrder: c.sortOrder ?? (idx + 1),
              gradingPeriod: 'Final' as const,
              sourceKind: c.sourceKind ?? (c.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment'),
              inUse: false,
            }))
          : fallback.finalCategories;
        setFinalCategories(initialFinal);
        setSavedFinalCategories(initialFinal);

        setAttendanceDateRanges(fallback.attendanceDateRanges);
        setSavedAttendanceDateRanges(fallback.attendanceDateRanges);

        setCategoryRows([]);
        setSavedCategoryRows([]);
      } else {
        setIsPresetDraft(false);
        const mode = res.configuration.schemaMode ?? 'overall';
        setSchemaMode(mode);

        if (mode === 'overall') {
          if (Array.isArray(res.configuration.categories) && res.configuration.categories.length > 0) {
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
          // Populate period draft preserving existing categories in case user converts
          const existingCats = Array.isArray(res.configuration.categories) && res.configuration.categories.length > 0
            ? res.configuration.categories
            : [];
          if (existingCats.length > 0) {
            const mRows: PeriodCategoryDraftRow[] = existingCats.map((cat, idx) => ({
              compositeKey: buildRowCompositeKey('Midterm', cat.id, `m-${idx + 1}`),
              tempId: `m-${cat.id ?? idx + 1}`,
              id: cat.id ?? undefined,
              name: cat.name,
              weight: String(cat.weight),
              sortOrder: cat.sortOrder ?? (idx + 1),
              gradingPeriod: 'Midterm' as const,
              sourceKind: (cat.sourceKind ?? (cat.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment')) as GradingSourceKindEnum,
              inUse: Boolean(cat.inUse),
            }));
            const fRows: PeriodCategoryDraftRow[] = existingCats.map((cat, idx) => ({
              compositeKey: buildRowCompositeKey('Final', cat.id, `f-${idx + 1}`),
              tempId: `f-${cat.id ?? idx + 1}`,
              id: cat.id ?? undefined,
              name: cat.name,
              weight: String(cat.weight),
              sortOrder: cat.sortOrder ?? (idx + 1),
              gradingPeriod: 'Final' as const,
              sourceKind: (cat.sourceKind ?? (cat.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment')) as GradingSourceKindEnum,
              inUse: Boolean(cat.inUse),
            }));
            const defaultDraft = buildDefaultPeriodDraft();
            setTermRatio(defaultDraft.termRatio);
            setSavedTermRatio(defaultDraft.termRatio);
            setMidtermCategories(mRows);
            setSavedMidtermCategories(mRows);
            setFinalCategories(fRows);
            setSavedFinalCategories(fRows);
            setAttendanceDateRanges(defaultDraft.attendanceDateRanges);
            setSavedAttendanceDateRanges(defaultDraft.attendanceDateRanges);
          } else {
            const draft = buildDefaultPeriodDraft();
            setTermRatio(draft.termRatio);
            setSavedTermRatio(draft.termRatio);
            setMidtermCategories(draft.midtermCategories);
            setSavedMidtermCategories(draft.midtermCategories);
            setFinalCategories(draft.finalCategories);
            setSavedFinalCategories(draft.finalCategories);
            setAttendanceDateRanges(draft.attendanceDateRanges);
            setSavedAttendanceDateRanges(draft.attendanceDateRanges);
          }
        } else {
          // Period Mode
          const tr = {
            midterm: String(res.configuration.termRatio?.midterm ?? 40),
            final: String(res.configuration.termRatio?.final ?? 60),
          };
          setTermRatio(tr);
          setSavedTermRatio(tr);

          const dr = {
            midterm: {
              startDate: res.configuration.attendanceDateRanges?.midterm?.startDate ?? '',
              endDate: res.configuration.attendanceDateRanges?.midterm?.endDate ?? '',
            },
            final: {
              startDate: res.configuration.attendanceDateRanges?.final?.startDate ?? '',
              endDate: res.configuration.attendanceDateRanges?.final?.endDate ?? '',
            },
          };
          setAttendanceDateRanges(dr);
          setSavedAttendanceDateRanges(dr);

          const mSource = res.configuration.midtermCategories
            ?? res.configuration.categories?.filter(c => c.gradingPeriod === 'Midterm')
            ?? [];
          const mRows: PeriodCategoryDraftRow[] = mSource.map((c, idx) => ({
            compositeKey: buildRowCompositeKey('Midterm', c.id, `m-${idx + 1}`),
            tempId: `m-${c.id ?? idx + 1}`,
            id: c.id,
            name: c.name,
            weight: String(c.weight),
            sortOrder: c.sortOrder ?? (idx + 1),
            gradingPeriod: 'Midterm' as const,
            sourceKind: c.sourceKind ?? (c.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment'),
            inUse: Boolean(c.inUse),
          }));
          setMidtermCategories(mRows);
          setSavedMidtermCategories(mRows);

          const fSource = res.configuration.finalCategories
            ?? res.configuration.categories?.filter(c => c.gradingPeriod === 'Final')
            ?? [];
          const fRows: PeriodCategoryDraftRow[] = fSource.map((c, idx) => ({
            compositeKey: buildRowCompositeKey('Final', c.id, `f-${idx + 1}`),
            tempId: `f-${c.id ?? idx + 1}`,
            id: c.id,
            name: c.name,
            weight: String(c.weight),
            sortOrder: c.sortOrder ?? (idx + 1),
            gradingPeriod: 'Final' as const,
            sourceKind: c.sourceKind ?? (c.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment'),
            inUse: Boolean(c.inUse),
          }));
          setFinalCategories(fRows);
          setSavedFinalCategories(fRows);

          setCategoryRows([]);
          setSavedCategoryRows([]);
        }
      }
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to load grade configuration.');
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    if (!currentOffering) return;
    loadGradingConfig(currentOffering);
  }, [currentOffering?.key]);

  // Dirty state checking
  const isOverallDirty = useMemo(() => {
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

  const isPeriodDirty = useMemo(() => {
    if (termRatio.midterm !== savedTermRatio.midterm || termRatio.final !== savedTermRatio.final) return true;
    if (
      attendanceDateRanges.midterm.startDate !== savedAttendanceDateRanges.midterm.startDate ||
      attendanceDateRanges.midterm.endDate !== savedAttendanceDateRanges.midterm.endDate ||
      attendanceDateRanges.final.startDate !== savedAttendanceDateRanges.final.startDate ||
      attendanceDateRanges.final.endDate !== savedAttendanceDateRanges.final.endDate
    ) {
      return true;
    }
    if (midtermCategories.length !== savedMidtermCategories.length) return true;
    for (let i = 0; i < midtermCategories.length; i++) {
      const c = midtermCategories[i];
      const s = savedMidtermCategories[i];
      if (c.name !== s.name || c.weight !== s.weight || c.sortOrder !== s.sortOrder || c.id !== s.id || c.sourceKind !== s.sourceKind) {
        return true;
      }
    }
    if (finalCategories.length !== savedFinalCategories.length) return true;
    for (let i = 0; i < finalCategories.length; i++) {
      const c = finalCategories[i];
      const s = savedFinalCategories[i];
      if (c.name !== s.name || c.weight !== s.weight || c.sortOrder !== s.sortOrder || c.id !== s.id || c.sourceKind !== s.sourceKind) {
        return true;
      }
    }
    return false;
  }, [termRatio, savedTermRatio, attendanceDateRanges, savedAttendanceDateRanges, midtermCategories, savedMidtermCategories, finalCategories, savedFinalCategories]);

  const isDirty = schemaMode === 'overall' ? isOverallDirty : isPeriodDirty;

  const handleSelectOffering = async (newKey: string) => {
    if (newKey === selectedOfferingKey) return;
    if (isDirty) {
      const confirmed = await requestConfirmation(
        'You have unsaved changes to grade weights. Switching courses will discard them. Continue?',
        'Discard unsaved changes?'
      );
      if (!confirmed) return;
    }
    // Clear all period state before loading new offering so one offering's preset cannot leak into another
    setLoadedConfig(null);
    setCategoryRows([]);
    setSavedCategoryRows([]);
    setMidtermCategories([]);
    setSavedMidtermCategories([]);
    setFinalCategories([]);
    setSavedFinalCategories([]);
    setAttendanceDateRanges({ midterm: { startDate: '', endDate: '' }, final: { startDate: '', endDate: '' } });
    setSavedAttendanceDateRanges({ midterm: { startDate: '', endDate: '' }, final: { startDate: '', endDate: '' } });
    setFirstSaveAssignmentError(null);
    setConversionMappingError(null);
    setConflictError(false);
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

  // Legacy Overall Category Handlers
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

  // Period Mode Category & Ratio Handlers
  const handleUpdateTermRatio = (field: 'midterm' | 'final', val: string) => {
    if (field === 'midterm') {
      const num = parseFloat(val);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        const comp = Math.round((100 - num) * 10000) / 10000;
        setTermRatio({ midterm: val, final: String(comp) });
      } else {
        setTermRatio(prev => ({ ...prev, midterm: val }));
      }
    } else {
      const num = parseFloat(val);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        const comp = Math.round((100 - num) * 10000) / 10000;
        setTermRatio({ midterm: String(comp), final: val });
      } else {
        setTermRatio(prev => ({ ...prev, final: val }));
      }
    }
  };

  const handleUpdateDateRange = (period: 'midterm' | 'final', field: 'startDate' | 'endDate', val: string) => {
    setAttendanceDateRanges(prev => ({
      ...prev,
      [period]: {
        ...prev[period],
        [field]: val,
      },
    }));
  };

  const handleAddPeriodCategory = (period: 'Midterm' | 'Final') => {
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newRow: PeriodCategoryDraftRow = {
      compositeKey: buildRowCompositeKey(period, null, tempId),
      tempId,
      name: '',
      weight: '',
      sortOrder: (period === 'Midterm' ? midtermCategories.length : finalCategories.length) + 1,
      gradingPeriod: period,
      sourceKind: 'assessment',
      inUse: false,
    };
    if (period === 'Midterm') {
      setMidtermCategories(prev => [...prev, newRow]);
    } else {
      setFinalCategories(prev => [...prev, newRow]);
    }
  };

  const handleUpdatePeriodCategoryField = (
    period: 'Midterm' | 'Final',
    compositeKey: string,
    field: 'name' | 'weight',
    val: string
  ) => {
    const updateList = (list: PeriodCategoryDraftRow[]) =>
      list.map(r => {
        if (r.compositeKey !== compositeKey) return r;
        return { ...r, [field]: val };
      });

    if (period === 'Midterm') {
      setMidtermCategories(updateList);
    } else {
      setFinalCategories(updateList);
    }
  };

  const handleMovePeriodCategory = (period: 'Midterm' | 'Final', index: number, direction: 'up' | 'down') => {
    const list = period === 'Midterm' ? midtermCategories : finalCategories;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const next = [...list];
    const item = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = item;
    const reordered = next.map((row, idx) => ({ ...row, sortOrder: idx + 1 }));
    if (period === 'Midterm') {
      setMidtermCategories(reordered);
    } else {
      setFinalCategories(reordered);
    }
  };

  const handleRemovePeriodCategory = (period: 'Midterm' | 'Final', compositeKey: string) => {
    const list = period === 'Midterm' ? midtermCategories : finalCategories;
    const target = list.find(r => r.compositeKey === compositeKey);
    if (!target) return;
    if (target.inUse) {
      showFeedback('Cannot remove category that has associated assessments.', 'error');
      return;
    }
    const filtered = list.filter(r => r.compositeKey !== compositeKey).map((row, idx) => ({ ...row, sortOrder: idx + 1 }));
    if (period === 'Midterm') {
      setMidtermCategories(filtered);
    } else {
      setFinalCategories(filtered);
    }
  };

  const midtermCalc = useMemo(() => {
    let sumUnits = 0;
    let allValid = true;
    for (const row of midtermCategories) {
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
    return { sumUnits, allValid, isExact100, displayPercent };
  }, [midtermCategories]);

  const finalCalc = useMemo(() => {
    let sumUnits = 0;
    let allValid = true;
    for (const row of finalCategories) {
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
    return { sumUnits, allValid, isExact100, displayPercent };
  }, [finalCategories]);

  const termRatioCalc = useMemo(() => {
    const midUnits = parseWeightUnits(termRatio.midterm.trim());
    const finUnits = parseWeightUnits(termRatio.final.trim());
    const allValid = midUnits !== null && finUnits !== null;
    const sumUnits = (midUnits ?? 0) + (finUnits ?? 0);
    const isExact100 = allValid && sumUnits === TOTAL_WEIGHT_UNITS;
    const displayPercent = formatWeightUnitsToPercent(sumUnits);
    return { allValid, isExact100, displayPercent };
  }, [termRatio]);

  const periodValidationError = useMemo(() => {
    if (!termRatioCalc.isExact100) {
      return `Term ratio weights must equal 100% (Current: ${termRatioCalc.displayPercent}%).`;
    }

    if (midtermCategories.length === 0) {
      return 'At least one Midterm category is required.';
    }
    const mNames = midtermCategories.map(r => r.name.trim());
    if (mNames.some(n => !n)) {
      return 'All Midterm category names must be filled out.';
    }
    const mLower = mNames.map(n => n.toLowerCase());
    if (new Set(mLower).size !== mLower.length) {
      return 'Midterm category names must be unique.';
    }
    const mAttendanceCount = midtermCategories.filter(r => r.sourceKind === 'attendance').length;
    if (mAttendanceCount > 1) {
      return 'Each period may contain only one authoritative Attendance category.';
    }
    for (const row of midtermCategories) {
      const units = parseWeightUnits(row.weight.trim());
      if (units === null) {
        return `Invalid Midterm weight "${row.weight}". Enter a number between 0 and 100 with up to 4 decimal places.`;
      }
    }
    if (!midtermCalc.isExact100) {
      return `Midterm category weights must equal 100% (Current: ${midtermCalc.displayPercent}%).`;
    }

    if (finalCategories.length === 0) {
      return 'At least one Finals category is required.';
    }
    const fNames = finalCategories.map(r => r.name.trim());
    if (fNames.some(n => !n)) {
      return 'All Finals category names must be filled out.';
    }
    const fLower = fNames.map(n => n.toLowerCase());
    if (new Set(fLower).size !== fLower.length) {
      return 'Finals category names must be unique.';
    }
    const fAttendanceCount = finalCategories.filter(r => r.sourceKind === 'attendance').length;
    if (fAttendanceCount > 1) {
      return 'Each period may contain only one authoritative Attendance category.';
    }
    for (const row of finalCategories) {
      const units = parseWeightUnits(row.weight.trim());
      if (units === null) {
        return `Invalid Finals weight "${row.weight}". Enter a number between 0 and 100 with up to 4 decimal places.`;
      }
    }
    if (!finalCalc.isExact100) {
      return `Finals category weights must equal 100% (Current: ${finalCalc.displayPercent}%).`;
    }

    const dateVal = validateDateRanges(attendanceDateRanges);
    if (!dateVal.valid) {
      return dateVal.error || 'Attendance date ranges are invalid.';
    }

    return null;
  }, [termRatioCalc, midtermCategories, finalCategories, midtermCalc, finalCalc, attendanceDateRanges]);

  const handleSaveGradingConfig = async (e?: React.FormEvent, options?: { convertFromOverall?: boolean }) => {
    if (e) e.preventDefault();
    if (!currentOffering) return;
    if (configSaving) return;

    if (schemaMode === 'overall' && !options?.convertFromOverall) {
      if (validationError) {
        showFeedback(validationError, 'error');
        return;
      }
    } else {
      if (periodValidationError) {
        showFeedback(periodValidationError, 'error');
        return;
      }
    }

    setConfigSaving(true);
    setConfigError(null);
    setConflictError(false);
    setFirstSaveAssignmentError(null);
    setConversionMappingError(null);

    let payload: FacultyGradingConfigSavePayload;

    if (schemaMode === 'overall' && !options?.convertFromOverall) {
      payload = {
        courseId: currentOffering.courseId,
        semester: currentOffering.canonicalSemester,
        schoolYear: currentOffering.canonicalSchoolYear,
        schemaMode: 'overall',
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
    } else {
      payload = {
        courseId: currentOffering.courseId,
        semester: currentOffering.canonicalSemester,
        schoolYear: currentOffering.canonicalSchoolYear,
        schemaMode: 'periods',
        termRatio: {
          midterm: Number(termRatio.midterm),
          final: Number(termRatio.final),
        },
        midtermCategories: midtermCategories.map((c, idx) => ({
          ...(c.id ? { id: c.id } : {}),
          name: c.name.trim(),
          weight: c.weight.trim(),
          sortOrder: idx + 1,
          gradingPeriod: 'Midterm',
          sourceKind: c.sourceKind,
        })),
        finalCategories: finalCategories.map((c, idx) => ({
          ...(c.id ? { id: c.id } : {}),
          name: c.name.trim(),
          weight: c.weight.trim(),
          sortOrder: idx + 1,
          gradingPeriod: 'Final',
          sourceKind: c.sourceKind,
        })),
        attendanceDateRanges: normalizeDateRangesForPayload(attendanceDateRanges),
      };
      if (loadedConfig?.version !== undefined && loadedConfig.version !== null) {
        payload.version = loadedConfig.version;
      }
      if (options?.convertFromOverall) {
        payload.convertFromOverall = true;
      }
    }

    try {
      const res = await saveFacultyGradingConfigApi(payload);
      setLoadedConfig(res.configuration);
      setIsPresetDraft(false);
      setSchemaMode(res.configuration.schemaMode ?? 'periods');

      if (res.configuration.schemaMode === 'overall') {
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
      } else {
        const tr = {
          midterm: String(res.configuration.termRatio?.midterm ?? 40),
          final: String(res.configuration.termRatio?.final ?? 60),
        };
        setTermRatio(tr);
        setSavedTermRatio(tr);

        const dr = {
          midterm: {
            startDate: res.configuration.attendanceDateRanges?.midterm?.startDate ?? '',
            endDate: res.configuration.attendanceDateRanges?.midterm?.endDate ?? '',
          },
          final: {
            startDate: res.configuration.attendanceDateRanges?.final?.startDate ?? '',
            endDate: res.configuration.attendanceDateRanges?.final?.endDate ?? '',
          },
        };
        setAttendanceDateRanges(dr);
        setSavedAttendanceDateRanges(dr);

        const mSource = res.configuration.midtermCategories
          ?? res.configuration.categories?.filter(c => c.gradingPeriod === 'Midterm')
          ?? [];
        const mRows: PeriodCategoryDraftRow[] = mSource.map((c, idx) => ({
          compositeKey: buildRowCompositeKey('Midterm', c.id, `m-${idx + 1}`),
          tempId: `m-${c.id ?? idx + 1}`,
          id: c.id,
          name: c.name,
          weight: String(c.weight),
          sortOrder: c.sortOrder ?? (idx + 1),
          gradingPeriod: 'Midterm',
          sourceKind: c.sourceKind ?? (c.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment'),
          inUse: Boolean(c.inUse),
        }));
        setMidtermCategories(mRows);
        setSavedMidtermCategories(mRows);

        const fSource = res.configuration.finalCategories
          ?? res.configuration.categories?.filter(c => c.gradingPeriod === 'Final')
          ?? [];
        const fRows: PeriodCategoryDraftRow[] = fSource.map((c, idx) => ({
          compositeKey: buildRowCompositeKey('Final', c.id, `f-${idx + 1}`),
          tempId: `f-${c.id ?? idx + 1}`,
          id: c.id,
          name: c.name,
          weight: String(c.weight),
          sortOrder: c.sortOrder ?? (idx + 1),
          gradingPeriod: 'Final',
          sourceKind: c.sourceKind ?? (c.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment'),
          inUse: Boolean(c.inUse),
        }));
        setFinalCategories(fRows);
        setSavedFinalCategories(fRows);

        if (options?.convertFromOverall) {
          setIsConversionModalOpen(false);
        }
      }
      showFeedback('Grade weights saved successfully.', 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          if (err.code === 'GRADING_CONFIGURATION_VERSION_CONFLICT') {
            setConflictError(true);
            showFeedback('Version conflict: another session updated these grade weights. Please reload the latest configuration.', 'error');
          } else if (err.code === 'GRADING_PERIOD_CONVERSION_REQUIRED') {
            const msg = err.message || 'Converting from overall grading requires explicit confirmation.';
            setConfigError(msg);
            showFeedback(msg, 'error');
          } else if (err.code === 'GRADING_SCHEMA_MODE_CONFLICT') {
            const msg = err.message || 'An existing period configuration cannot be changed back to overall categories.';
            setConfigError(msg);
            showFeedback(msg, 'error');
          } else if (err.code === 'GRADING_CATEGORY_IN_USE') {
            const msg = err.message || 'A grading category referenced by an assessment cannot be deleted.';
            setConfigError(msg);
            showFeedback(msg, 'error');
          } else {
            setConfigError(err.message);
            showFeedback(err.message, 'error');
          }
        } else if (err.status === 422 && err.code === 'GRADING_CATEGORY_ASSIGNMENT_REQUIRED') {
          const assessments = (Array.isArray(err.details?.assessments) ? err.details.assessments : []) as FacultyGradingCategoryAssignmentRequiredItem[];
          setFirstSaveAssignmentError(assessments);
          showFeedback(err.message || 'Existing assessments require matching category assignments.', 'error');
        } else if (err.status === 422 && err.code === 'GRADING_CATEGORY_PERIOD_MAPPING_REQUIRED') {
          const refs = (Array.isArray(err.details?.assessmentReferences) ? err.details.assessmentReferences : []) as FacultyGradingCategoryPeriodMappingRequiredItem[];
          setConversionMappingError(refs);
          showFeedback(err.message || 'Existing assessments require matching period category assignments.', 'error');
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

  // Recomputation State
  const [computeResultsByEnrollment, setComputeResultsByEnrollment] = useState<Map<string, FacultyGradeComputeResult>>(new Map());
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [recomputeAlert, setRecomputeAlert] = useState<{
    status: 'success' | 'incomplete';
    message: string;
    details?: string[];
  } | null>(null);

  const toggleSort = (field: 'name' | 'overall') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const isPeriodMode = useMemo(() => {
    if (loadedConfig?.schemaMode === 'periods') return true;
    if (assessmentConfig?.schemaMode === 'periods') return true;
    const hasStudentPeriod = activeStudents.some(s => {
      const subj = s.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
      return subj?.components && typeof subj.components === 'object' && (subj.components as any).calculationMode === 'authoritative_periods';
    });
    if (hasStudentPeriod) return true;
    for (const res of computeResultsByEnrollment.values()) {
      if (isPeriodComputeResult(res)) return true;
    }
    return false;
  }, [loadedConfig, assessmentConfig, activeStudents, selectedSubjectCode, computeResultsByEnrollment]);

  const sortedSummaryStudents = useMemo(() => {
    const filtered = activeStudents.filter(s =>
      s.name.toLowerCase().includes(summarySearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(summarySearch.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (sortField === 'name') {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else {
        const subjA = a.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
        const subjB = b.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
        const resA = subjA?.enrollmentId ? computeResultsByEnrollment.get(String(subjA.enrollmentId)) : null;
        const resB = subjB?.enrollmentId ? computeResultsByEnrollment.get(String(subjB.enrollmentId)) : null;
        const evalA = extractPeriodEvaluation(subjA, resA, isPeriodMode);
        const evalB = extractPeriodEvaluation(subjB, resB, isPeriodMode);
        const gradeA = evalA.overallGwa ?? 5.0;
        const gradeB = evalB.overallGwa ?? 5.0;
        // In GWA, smaller values are better (e.g. 1.0 is better than 5.0)
        return sortAsc ? gradeA - gradeB : gradeB - gradeA;
      }
    });
  }, [activeStudents, summarySearch, sortField, sortAsc, selectedSubjectCode, computeResultsByEnrollment, isPeriodMode]);

  const handleRecomputeGrades = async () => {
    if (!selectedClassId) return;
    setIsRecomputing(true);
    setRecomputeAlert(null);
    try {
      const response = await computeFacultyGradesApi(selectedClassId);
      const newMap = new Map<string, FacultyGradeComputeResult>();
      let computedCount = 0;
      let incompleteCount = 0;
      const incompleteReasons = new Set<string>();

      (response.results || []).forEach(res => {
        if (res.enrollmentId) {
          newMap.set(String(res.enrollmentId), res);
        }
        if (res.status === 'computed') {
          computedCount++;
        } else {
          incompleteCount++;
          if (res.status === 'incomplete_period' && res.periods) {
            const m = res.periods.midterm;
            const f = res.periods.final;
            if (Array.isArray(m?.incomplete)) {
              m.incomplete.forEach(i => incompleteReasons.add(`Midterm: ${formatPeriodIncompleteReason(i.reason)}`));
            }
            if (Array.isArray(f?.incomplete)) {
              f.incomplete.forEach(i => incompleteReasons.add(`Finals: ${formatPeriodIncompleteReason(i.reason)}`));
            }
          } else if (res.status === 'incomplete_attendance') {
            incompleteReasons.add('Attendance data missing or unresolved');
          }
        }
      });

      setComputeResultsByEnrollment(newMap);

      if (incompleteCount > 0) {
        setRecomputeAlert({
          status: 'incomplete',
          message: `Recomputation complete: ${computedCount} computed, ${incompleteCount} incomplete. Prior recorded results were preserved.`,
          details: Array.from(incompleteReasons),
        });
        showFeedback(`Recomputation complete: ${incompleteCount} student(s) remain incomplete. Prior grades preserved.`, 'info');
      } else {
        setRecomputeAlert({
          status: 'success',
          message: `All ${computedCount} student grade(s) recomputed and persisted successfully.`,
        });
        showFeedback('Class grades recomputed successfully.', 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recomputation failed.';
      setRecomputeAlert({
        status: 'incomplete',
        message: `Grade recomputation failed: ${msg}. Prior persisted grades remain in place.`,
      });
      showFeedback(msg, 'error');
    } finally {
      setIsRecomputing(false);
    }
  };

  const handleExportCSV = () => {
    recordAudit({
      action: 'Exported grade CSV',
      module: 'Grade Computation',
      description: `Exported grade ledger for ${selectedSubjectCode}.`,
      status: 'Success',
    });
    const csvContent = generateGradeSummaryCSV(
      sortedSummaryStudents,
      selectedSubjectCode,
      isPeriodMode,
      computeResultsByEnrollment
    );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
        <div className="space-y-4">
          {/* View Mode Switcher Header */}
          <div className="flex justify-end items-center bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setScoreEntryMode('single')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  scoreEntryMode === 'single'
                    ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                Single Activity View
              </button>
              <button
                onClick={() => setScoreEntryMode('matrix')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  scoreEntryMode === 'matrix'
                    ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                Full Matrix View
              </button>
            </div>
          </div>

          {scoreEntryMode === 'matrix' ? (
            /* FULL GRADEBOOK MATRIX VIEW */
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Grid className="w-4 h-4 text-clinical-550" />
                    Full Gradebook Matrix View
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Edit all course assessments side-by-side in a spreadsheet grid.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveMatrixScores}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-bold text-xs shadow-md transition-all active:scale-97"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isMatrixSavedAlert ? 'All Matrix Scores Saved!' : 'Save All Matrix Scores'}</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800 border-collapse">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left divide-x divide-slate-200 dark:divide-slate-800">
                      <th className="px-4 py-3 min-w-[180px]">Student Details</th>
                      {activeAssessments.map(ass => (
                        <th key={ass.id} className="px-3 py-3 text-center min-w-[120px]">
                          <div className="font-bold text-slate-700 dark:text-slate-200">{ass.title}</div>
                          <div className="text-[9px] font-semibold text-clinical-600 dark:text-clinical-400 font-mono mt-0.5">
                            {ass.type} • Max {ass.maxScore}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs">
                    {filteredScoreStudents.length === 0 ? (
                      <tr>
                        <td colSpan={activeAssessments.length + 1} className="py-12 text-center text-slate-400 font-semibold">
                          No matching student records found.
                        </td>
                      </tr>
                    ) : (
                      filteredScoreStudents.map(student => (
                        <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/20 divide-x divide-slate-100 dark:divide-slate-800/40">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">{student.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{student.studentId}</div>
                          </td>
                          {activeAssessments.map(ass => {
                            const val = matrixScoresState[student.id]?.[ass.id] ?? '';
                            const isValid = validateSingleScore(val, ass.maxScore);
                            return (
                              <td key={ass.id} className="px-2 py-2.5 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={ass.maxScore}
                                  placeholder={`0-${ass.maxScore}`}
                                  value={val}
                                  onChange={(e) => handleMatrixScoreChange(student.id, ass.id, e.target.value)}
                                  className={`w-20 px-2 py-1 rounded-lg border text-xs text-center font-bold focus:outline-none ${
                                    !isValid
                                      ? 'border-rose-500 bg-rose-50/50 focus:ring-rose-500'
                                      : val === ''
                                      ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
                                      : 'border-clinical-500/30 bg-clinical-50/20 text-clinical-650 dark:text-clinical-400'
                                  }`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            /* ENHANCED SINGLE ACTIVITY VIEW */
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
                        <div><span className="text-slate-400 font-semibold">Due Date:</span> {activeAssessment.dueDate || 'No deadline'}</div>
                        {activeAssessment.instructions && (
                          <div>
                            <span className="text-slate-400 font-semibold">Instructions:</span>
                            <p className="text-slate-550 dark:text-slate-400 italic mt-0.5">{activeAssessment.instructions}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* LIVE CLASS STATS SUMMARY */}
                    {activeAssessment && (
                      <div className="p-3.5 rounded-2xl bg-clinical-50/40 dark:bg-clinical-950/20 border border-clinical-100 dark:border-clinical-900/30 text-xs space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-clinical-600 dark:text-clinical-400 block">Class Stats Summary</span>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-150 dark:border-slate-800">
                            <div className="text-[10px] text-slate-400 font-semibold">Graded</div>
                            <div className="font-extrabold text-slate-800 dark:text-slate-200 text-xs">
                              {activeAssessmentStats.graded} / {activeAssessmentStats.total}
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-150 dark:border-slate-800">
                            <div className="text-[10px] text-slate-400 font-semibold">Class Avg</div>
                            <div className="font-extrabold text-clinical-600 dark:text-clinical-400 text-xs">
                              {activeAssessmentStats.avg} pts
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-150 dark:border-slate-800">
                            <div className="text-[10px] text-slate-400 font-semibold">Highest Score</div>
                            <div className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                              {activeAssessmentStats.max}
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-150 dark:border-slate-800">
                            <div className="text-[10px] text-slate-400 font-semibold">Lowest Score</div>
                            <div className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                              {activeAssessmentStats.min}
                            </div>
                          </div>
                        </div>
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

              <div className="lg:col-span-8 space-y-3">
                {/* QUICK BATCH ACTIONS TOOLBAR */}
                {selectedAssessmentId && activeAssessment && (
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Quick Actions:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQuickFillEmpty(0)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-300 hover:bg-slate-100 font-semibold text-[11px]"
                      >
                        Fill Empty with 0
                      </button>
                      <button
                        onClick={() => handleQuickFillEmpty(activeAssessment.maxScore)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-300 hover:bg-slate-100 font-semibold text-[11px]"
                      >
                        Fill Empty with Max ({activeAssessment.maxScore})
                      </button>
                      <button
                        onClick={handleResetScoresInput}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-450 hover:text-slate-600 font-semibold text-[11px] flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                    </div>
                  </div>
                )}

                <Card className="p-0 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Roster Score Entries</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Use Enter / Down / Up arrow keys to quickly navigate between student score boxes.</p>
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
                      filteredScoreStudents.map((student, idx) => {
                        const row = scoresInputState[student.id] || { score: '', remarks: '' };
                        const isValid = validateSingleScore(row.score, activeAssessment?.maxScore || 100);

                        return (
                          <div key={student.id} className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/30 dark:hover:bg-slate-900/10">
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">{student.name}</h4>
                              <span className="text-[10px] text-slate-400 font-mono">{student.studentId}</span>
                            </div>

                            <div className="flex items-center space-x-2 self-start md:self-auto">
                              {/* Score Input with Arrow/Enter Keyboard Navigation */}
                              <div className="relative">
                                <input
                                  id={`score-input-${idx}`}
                                  type="number"
                                  min="0"
                                  max={activeAssessment?.maxScore || 100}
                                  placeholder={`0 - ${activeAssessment?.maxScore || 100}`}
                                  value={row.score}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      const next = document.getElementById(`score-input-${idx + 1}`);
                                      if (next) (next as HTMLInputElement).focus();
                                    } else if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      const prev = document.getElementById(`score-input-${idx - 1}`);
                                      if (prev) (prev as HTMLInputElement).focus();
                                    }
                                  }}
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
                              c => String(c.id) === String(ass.gradingCategoryId) &&
                                   (assessmentConfig.schemaMode !== 'periods' || !ass.gradingPeriod || !c.gradingPeriod || c.gradingPeriod === ass.gradingPeriod)
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
                      <td className="px-5 py-3.5 font-mono text-slate-450 dark:text-slate-500">{ass.dueDate || 'No deadline'}</td>
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
                  Configure the selected course offering in plain terms: the Midterm and Finals contributions must total 100%, and each period's categories must total 100%.
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

                  {isPresetDraft ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                        Suggested starting preset — unsaved
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 text-[10px] font-bold uppercase">
                        Period Grading
                      </span>
                    </div>
                  ) : loadedConfig ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-clinical-50 dark:bg-clinical-950/40 border border-clinical-200 dark:border-clinical-800 text-clinical-700 dark:text-clinical-300 text-[10px] font-bold">
                        Version {loadedConfig.version}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 text-[10px] font-bold uppercase">
                        {schemaMode === 'periods' ? 'Period Grading' : 'Legacy Overall'}
                      </span>
                    </div>
                  ) : null}
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

            {/* First-Save Unmapped Assessment Alert (422) */}
            {firstSaveAssignmentError && firstSaveAssignmentError.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="font-bold">Existing Assessments Require Matching Categories</div>
                    <div className="text-[11px] mt-0.5">
                      This unconfigured course offering contains active assessments that require matching category names before this configuration can be activated. Please create categories matching each legacy assessment below:
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
                      {firstSaveAssignmentError.map(item => (
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

            {/* Conversion Mapping Error Alert (422) */}
            {conversionMappingError && conversionMappingError.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="font-bold">Existing Assessments Require Period Category Mappings</div>
                    <div className="text-[11px] mt-0.5">
                      Every existing assessment must have a category mapping for its grading period during conversion. Please review the missing mappings below:
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-amber-500/20 bg-white/60 dark:bg-slate-900/60">
                  <table className="min-w-full divide-y divide-amber-500/20 text-xs">
                    <thead>
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                        <th className="px-3 py-2">Assessment ID</th>
                        <th className="px-3 py-2">Category ID</th>
                        <th className="px-3 py-2">Grading Period</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-500/20">
                      {conversionMappingError.map(item => (
                        <tr key={item.assessmentId}>
                          <td className="px-3 py-1.5 font-mono text-[11px]">{item.assessmentId}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px]">{item.categoryId ?? 'Unassigned'}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-100">{item.gradingPeriod}</td>
                          <td className="px-3 py-1.5">
                            <span className="px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold text-[10px]">
                              {item.status || 'Active'}
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
            ) : schemaMode === 'overall' ? (
              /* LEGACY OVERALL GRADING VIEW */
              <div className="space-y-5">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      Legacy Overall Grading Active
                    </div>
                    <p className="text-[11px] text-slate-650 dark:text-slate-350 mt-0.5">
                      This course offering uses single-list overall grading categories. You can continue editing or convert to period grading.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenConversionModal}
                    className="shrink-0 px-3.5 py-1.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Convert to Period Grading
                  </button>
                </div>

                <form onSubmit={handleSaveGradingConfig} className="space-y-5">
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
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-150 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950">
                        {categoryRows.map((row, index) => (
                          <div key={row.tempId} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
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

                            <div className="flex-1">
                              <input
                                type="text"
                                value={row.name}
                                placeholder="Category name (e.g. Quizzes, Final Exam)"
                                onChange={(e) => handleUpdateCategory(row.tempId, 'name', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
                              />
                            </div>

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

                  <div className="pt-4 border-t border-slate-150 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="text-xs">
                        <span className="text-slate-400">Total Weight: </span>
                        <span className={`font-extrabold text-sm ${weightCalculation.isExact100 ? 'text-emerald-500' : 'text-rose-500'}`}>
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

                    <button
                      type="submit"
                      disabled={configSaving || !weightCalculation.isExact100 || categoryRows.length === 0}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-clinical-500 hover:bg-clinical-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-md transition-all"
                    >
                      <Save className="w-4 h-4" />
                      <span>{configSaving ? 'Saving...' : 'Save Grade Weights'}</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* PERIOD GRADING VIEW (MIDTERM & FINALS) */
              <div className="space-y-5">
                {isPresetDraft ? (
                  <div className="p-4 rounded-2xl bg-clinical-500/10 border border-clinical-500/20 text-xs text-clinical-800 dark:text-clinical-300 space-y-2">
                    <div className="font-bold flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-clinical-600 dark:text-clinical-400" />
                      Suggested starting preset — unsaved
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-650 dark:text-slate-350">
                      No grade weights have been configured for this course offering yet. The standard dental curriculum starting preset (40% Midterm / 60% Finals) is loaded for you to customize and save.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-clinical-500" />
                    <span>
                      Period grading policy: Midterm and Finals categories independently total 100%. The term contribution ratio must also total 100%.
                    </span>
                  </div>
                )}

                <form onSubmit={handleSaveGradingConfig} className="space-y-5">
                  {/* Term Weight Contribution Ratio */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Term Weight Ratio
                      </span>
                      {termRatioCalc.isExact100 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          <CheckCircle className="w-3 h-3" />
                          Valid 100%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          Must equal 100% (Current: {termRatioCalc.displayPercent}%)
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="midterm-ratio-input" className="text-xs font-semibold text-slate-600 dark:text-slate-350 block mb-1">
                          Midterm Weight (%)
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            id="midterm-ratio-input"
                            type="text"
                            value={termRatio.midterm}
                            onChange={(e) => handleUpdateTermRatio('midterm', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-clinical-500"
                          />
                          <span className="text-xs font-bold text-slate-400">%</span>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="final-ratio-input" className="text-xs font-semibold text-slate-600 dark:text-slate-350 block mb-1">
                          Finals Weight (%)
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            id="final-ratio-input"
                            type="text"
                            value={termRatio.final}
                            onChange={(e) => handleUpdateTermRatio('final', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-clinical-500"
                          />
                          <span className="text-xs font-bold text-slate-400">%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Attendance Date Ranges */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Faculty-Defined Attendance Date Ranges (YYYY-MM-DD)
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Inclusive calendar dates for each period's attendance. Midterm attendance must end before Finals attendance starts; gaps are allowed. Attendance calculations are performed strictly server-side.
                      </p>
                    </div>

                    {!validateDateRanges(attendanceDateRanges).valid && (
                      <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{validateDateRanges(attendanceDateRanges).error}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Midterm Dates */}
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Midterm Attendance Range</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor="midterm-start-date" className="text-[10px] text-slate-400 block font-semibold mb-0.5">Start Date</label>
                            <input
                              id="midterm-start-date"
                              type="date"
                              value={attendanceDateRanges.midterm.startDate}
                              onChange={(e) => handleUpdateDateRange('midterm', 'startDate', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
                            />
                          </div>
                          <div>
                            <label htmlFor="midterm-end-date" className="text-[10px] text-slate-400 block font-semibold mb-0.5">End Date</label>
                            <input
                              id="midterm-end-date"
                              type="date"
                              value={attendanceDateRanges.midterm.endDate}
                              onChange={(e) => handleUpdateDateRange('midterm', 'endDate', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Finals Dates */}
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Finals Attendance Range</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor="final-start-date" className="text-[10px] text-slate-400 block font-semibold mb-0.5">Start Date</label>
                            <input
                              id="final-start-date"
                              type="date"
                              value={attendanceDateRanges.final.startDate}
                              onChange={(e) => handleUpdateDateRange('final', 'startDate', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
                            />
                          </div>
                          <div>
                            <label htmlFor="final-end-date" className="text-[10px] text-slate-400 block font-semibold mb-0.5">End Date</label>
                            <input
                              id="final-end-date"
                              type="date"
                              value={attendanceDateRanges.final.endDate}
                              onChange={(e) => handleUpdateDateRange('final', 'endDate', e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Period Category Tabs */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
                    <button
                      type="button"
                      onClick={() => setActivePeriodEditorTab('Midterm')}
                      className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
                        activePeriodEditorTab === 'Midterm'
                          ? 'border-clinical-600 text-clinical-600 dark:text-clinical-400'
                          : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <span>Midterm Categories ({midtermCategories.length})</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        midtermCalc.isExact100
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                      }`}>
                        {midtermCalc.displayPercent}%
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePeriodEditorTab('Final')}
                      className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
                        activePeriodEditorTab === 'Final'
                          ? 'border-clinical-600 text-clinical-600 dark:text-clinical-400'
                          : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <span>Finals Categories ({finalCategories.length})</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        finalCalc.isExact100
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                      }`}>
                        {finalCalc.displayPercent}%
                      </span>
                    </button>
                  </div>

                  {/* Active Period Category Table */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {activePeriodEditorTab === 'Midterm' ? 'Midterm' : 'Finals'} Grading Categories
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddPeriodCategory(activePeriodEditorTab)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-clinical-50 dark:bg-clinical-950/40 text-clinical-600 dark:text-clinical-400 hover:bg-clinical-100 font-bold text-xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add {activePeriodEditorTab === 'Midterm' ? 'Midterm' : 'Finals'} Category
                      </button>
                    </div>

                    {periodValidationError && (
                      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span>{periodValidationError}</span>
                      </div>
                    )}

                    <div className="divide-y divide-slate-150 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950">
                      {(activePeriodEditorTab === 'Midterm' ? midtermCategories : finalCategories).map((row, index, arr) => (
                        <div key={row.compositeKey} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                          {/* Reorder Buttons */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              aria-label={`Move category ${row.name || 'unnamed'} up`}
                              onClick={() => handleMovePeriodCategory(activePeriodEditorTab, index, 'up')}
                              disabled={index === 0}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move category ${row.name || 'unnamed'} down`}
                              onClick={() => handleMovePeriodCategory(activePeriodEditorTab, index, 'down')}
                              disabled={index === arr.length - 1}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Category Name & Source Kind Badge */}
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={row.name}
                              placeholder="Category name (e.g. Quiz, Exam)"
                              onChange={(e) => handleUpdatePeriodCategoryField(activePeriodEditorTab, row.compositeKey, 'name', e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
                            />
                            {row.sourceKind === 'attendance' && (
                              <span className="shrink-0 px-2 py-1 rounded-lg bg-clinical-50 dark:bg-clinical-950/40 text-clinical-700 dark:text-clinical-300 text-[10px] font-bold border border-clinical-200 dark:border-clinical-800" title="Authoritative attendance data from recorded sessions">
                                Authoritative Attendance
                              </span>
                            )}
                          </div>

                          {/* Category Weight Input */}
                          <div className="flex items-center gap-1.5 w-28">
                            <input
                              type="text"
                              value={row.weight}
                              placeholder="0"
                              onChange={(e) => handleUpdatePeriodCategoryField(activePeriodEditorTab, row.compositeKey, 'weight', e.target.value)}
                              className="w-20 px-2.5 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-bold text-right focus:outline-none focus:ring-2 focus:ring-clinical-500"
                            />
                            <span className="text-xs font-bold text-slate-400">%</span>
                          </div>

                          {/* Remove Button */}
                          <div>
                            <button
                              type="button"
                              aria-label={`Delete category ${row.name || 'unnamed'}`}
                              onClick={() => handleRemovePeriodCategory(activePeriodEditorTab, row.compositeKey)}
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
                  </div>

                  {/* Period Total Bar & Action Buttons */}
                  <div className="pt-4 border-t border-slate-150 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div>
                        <span className="text-slate-400">Ratio: </span>
                        <span className={`font-bold ${termRatioCalc.isExact100 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {termRatio.midterm}% / {termRatio.final}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Midterm: </span>
                        <span className={`font-bold ${midtermCalc.isExact100 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {midtermCalc.displayPercent}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Finals: </span>
                        <span className={`font-bold ${finalCalc.isExact100 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {finalCalc.displayPercent}%
                        </span>
                      </div>

                      {isDirty && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                          Unsaved Changes
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={configSaving || periodValidationError !== null}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-clinical-500 hover:bg-clinical-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-md transition-all"
                      >
                        <Save className="w-4 h-4" />
                        <span>
                          {configSaving
                            ? 'Saving...'
                            : isPresetDraft
                            ? 'Save Initial Schema'
                            : 'Save Grade Weights'}
                        </span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------
          CONVERSION REVIEW MODAL (LEGACY TO PERIOD GRADING)
      ---------------------------------------------------- */}
      {isConversionModalOpen && (
        <Modal
          isOpen={isConversionModalOpen}
          onClose={() => setIsConversionModalOpen(false)}
          title="Convert to Period Grading"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Convert Course Offering to Period Grading
              </div>
              <p className="text-[11px] leading-relaxed">
                Converting will switch this course offering from legacy single-list grading to separate <strong>Midterm</strong> and <strong>Finals</strong> grading periods.
                Once converted, existing assessments will be associated with their corresponding period categories.
                Conversion cannot be undone once saved.
              </p>
            </div>

            {conversionMappingError && conversionMappingError.length > 0 && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-400 space-y-2">
                <div className="font-bold">Missing Period Category Mappings</div>
                <p className="text-[11px]">The following assessments need valid period category assignments before conversion:</p>
                <div className="max-h-32 overflow-y-auto">
                  {conversionMappingError.map(item => (
                    <div key={item.assessmentId} className="text-[10px] font-mono">
                      Assessment #{item.assessmentId} (Period: {item.gradingPeriod})
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-800 dark:text-slate-200">Proposed Term Ratio:</h4>
              <div className="flex items-center gap-4 text-slate-650 dark:text-slate-350">
                <span>Midterm: <strong>{termRatio.midterm}%</strong></span>
                <span>Finals: <strong>{termRatio.final}%</strong></span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-slate-800 dark:text-slate-200">Proposed Period Category Mapping:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto">
                {/* Midterm Mapping */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                  <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] flex items-center justify-between">
                    <span>Midterm Categories</span>
                    <span className="font-mono text-[10px] text-clinical-600 font-bold">{midtermCategories.reduce((acc, c) => acc + (parseFloat(c.weight) || 0), 0)}%</span>
                  </div>
                  <div className="space-y-1">
                    {midtermCategories.map(c => (
                      <div key={c.compositeKey} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 dark:border-slate-800 last:border-none">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</span>
                          <span className="text-[9px] font-mono text-slate-400">
                            {c.id ? `(#${c.id})` : '(New)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                            {c.sourceKind}
                          </span>
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-350">{c.weight}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Finals Mapping */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                  <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] flex items-center justify-between">
                    <span>Finals Categories</span>
                    <span className="font-mono text-[10px] text-clinical-600 font-bold">{finalCategories.reduce((acc, c) => acc + (parseFloat(c.weight) || 0), 0)}%</span>
                  </div>
                  <div className="space-y-1">
                    {finalCategories.map(c => (
                      <div key={c.compositeKey} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 dark:border-slate-800 last:border-none">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{c.name}</span>
                          <span className="text-[9px] font-mono text-slate-400">
                            {c.id ? `(#${c.id})` : '(New)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                            {c.sourceKind}
                          </span>
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-350">{c.weight}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-150 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsConversionModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-205 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={configSaving}
                onClick={() => handleSaveGradingConfig(undefined, { convertFromOverall: true })}
                className="px-5 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 disabled:opacity-50 text-white font-bold text-xs shadow-md"
              >
                {configSaving ? 'Converting...' : 'Confirm Conversion'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ----------------------------------------------------
          RECOMPUTE CONFIRMATION MODAL
      ---------------------------------------------------- */}
      {isRecomputeConfirmOpen && (
        <Modal
          isOpen={isRecomputeConfirmOpen}
          onClose={() => setIsRecomputeConfirmOpen(false)}
          title="Recompute Class Grades"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Confirm Grade Recomputation
              </div>
              <p className="text-[11px] leading-relaxed">
                This will recalculate student period evaluations and General Weighted Averages (GWA) for all enrolled students in class <strong>{selectedClassId}</strong> using the authoritative grading configuration.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-150 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsRecomputeConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-205 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRecomputing}
                onClick={() => {
                  setIsRecomputeConfirmOpen(false);
                  handleRecomputeGrades();
                }}
                className="px-5 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 disabled:opacity-50 text-white font-bold text-xs shadow-md flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                Confirm Recomputation
              </button>
            </div>
          </div>
        </Modal>
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
                type="button"
                onClick={() => setIsRecomputeConfirmOpen(true)}
                disabled={isRecomputing || !selectedClassId}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-all"
              >
                <Zap className={`w-3.5 h-3.5 ${isRecomputing ? 'animate-spin' : 'text-amber-400'}`} />
                <span>{isRecomputing ? 'Recomputing...' : 'Recompute Grades'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 text-slate-650 hover:bg-slate-50 dark:text-slate-350 dark:hover:bg-slate-900 bg-white dark:bg-slate-950 font-bold text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Layout
              </button>
              <button
                type="button"
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

          {/* Recompute Alert */}
          {recomputeAlert && (
            <div className={`mx-5 my-3 p-4 rounded-2xl border text-xs flex flex-col gap-1.5 ${
              recomputeAlert.status === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            }`}>
              <div className="flex items-center gap-2 font-bold">
                {recomputeAlert.status === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <span>{recomputeAlert.message}</span>
              </div>
              {recomputeAlert.details && recomputeAlert.details.length > 0 && (
                <div className="mt-1 pl-6 space-y-0.5 text-[11px] opacity-90">
                  {recomputeAlert.details.map((detail, idx) => (
                    <div key={idx}>• {detail}</div>
                  ))}
                </div>
              )}
            </div>
          )}

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
                  {isPeriodMode ? (
                    <>
                      <th className="px-5 py-3 text-center">Midterm %</th>
                      <th className="px-5 py-3 text-center">Final %</th>
                    </>
                  ) : (
                    <>
                      <th className="px-5 py-3 text-center">Quizzes</th>
                      <th className="px-5 py-3 text-center">Practicum</th>
                      <th className="px-5 py-3 text-center">Exams</th>
                      <th className="px-5 py-3 text-center">Attendance</th>
                    </>
                  )}
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
                    <td colSpan={isPeriodMode ? 5 : 7} className="px-5 py-8 text-center text-slate-400">
                      No matching student grade summaries found.
                    </td>
                  </tr>
                ) : (
                  sortedSummaryStudents.map(student => {
                    const subj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
                    const computeRes = subj?.enrollmentId ? computeResultsByEnrollment.get(String(subj.enrollmentId)) : null;

                    if (isPeriodMode) {
                      const evalResult = extractPeriodEvaluation(subj, computeRes, isPeriodMode);
                      const isFailsRetention = subj && subj.isClinical && evalResult.overallGwa !== null && evalResult.overallGwa >= settings.retentionThreshold;
                      const isFailed = evalResult.overallGwa === 5.0;
                      const isPending = evalResult.statusText === 'PENDING';
                      const isIncomplete = evalResult.overallGwa === null;

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                          <td className="px-5 py-3">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{student.name}</div>
                            <span className="text-[10px] text-slate-400">{student.studentId}</span>
                          </td>
                          <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">
                            {evalResult.midtermPercentage !== null ? (
                              `${evalResult.midtermPercentage.toFixed(2)}%`
                            ) : evalResult.midtermStatus === 'pending' ? (
                              <span className="text-slate-400 font-sans">Pending</span>
                            ) : evalResult.midtermReasons.length > 0 ? (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold" title={evalResult.midtermReasons.join(', ')}>
                                Incomplete ({evalResult.midtermReasons[0]})
                              </span>
                            ) : (
                              <span className="text-slate-400 font-sans">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">
                            {evalResult.finalPercentage !== null ? (
                              `${evalResult.finalPercentage.toFixed(2)}%`
                            ) : evalResult.finalStatus === 'pending' ? (
                              <span className="text-slate-400 font-sans">Pending</span>
                            ) : evalResult.finalReasons.length > 0 ? (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold" title={evalResult.finalReasons.join(', ')}>
                                Incomplete ({evalResult.finalReasons[0]})
                              </span>
                            ) : (
                              <span className="text-slate-400 font-sans">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center font-extrabold text-sm text-slate-850 dark:text-slate-100">
                            {evalResult.overallGwa !== null ? (
                              evalResult.overallGwa.toFixed(2)
                            ) : evalResult.historicalGwa !== null ? (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium" title="Prior persisted grade; current recomputation is incomplete">
                                Prior: {evalResult.historicalGwa.toFixed(2)} (Historical)
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              isFailed
                                ? 'bg-rose-100 text-rose-700'
                                : isFailsRetention
                                ? 'bg-amber-100 text-amber-700'
                                : isPending
                                ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                                : isIncomplete
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {isFailed ? 'FAILED' : isFailsRetention ? 'FAILS RETENTION' : isPending ? 'PENDING' : isIncomplete ? 'INCOMPLETE' : 'PASS'}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    // Legacy overall view
                    const isFailsRetention = subj && subj.isClinical && typeof subj.grade === 'number' && subj.grade >= settings.retentionThreshold;
                    const isFailed = subj && typeof subj.grade === 'number' && subj.grade === 5.0;
                    const hasGrade = subj && typeof subj.grade === 'number' && subj.grade > 0;

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{student.name}</div>
                          <span className="text-[10px] text-slate-400">{student.studentId}</span>
                        </td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj && typeof subj.components?.quizzes === 'number' ? `${subj.components.quizzes.toFixed(1)}%` : '—'}</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj && typeof subj.components?.practicum === 'number' ? `${subj.components.practicum.toFixed(1)}%` : '—'}</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj && typeof subj.components?.exams === 'number' ? `${subj.components.exams.toFixed(1)}%` : '—'}</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj && typeof subj.components?.attendance === 'number' ? `${subj.components.attendance.toFixed(1)}%` : '—'}</td>
                        <td className="px-5 py-3 text-center font-extrabold text-sm text-slate-850 dark:text-slate-100">
                          {hasGrade ? subj.grade.toFixed(2) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            !hasGrade
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              : isFailed
                              ? 'bg-rose-100 text-rose-700'
                              : isFailsRetention
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {!hasGrade ? 'UNCOMPUTED' : isFailed ? 'FAILED' : isFailsRetention ? 'FAILS RETENTION' : 'PASS'}
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
            {isPeriodMode ? (
              <tr className="bg-slate-100 text-left font-bold uppercase">
                <th className="border border-slate-300 px-4 py-2">Student ID</th>
                <th className="border border-slate-300 px-4 py-2">Student Name</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Midterm %</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Final %</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Overall GWA</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Remarks</th>
              </tr>
            ) : (
              <tr className="bg-slate-100 text-left font-bold uppercase">
                <th className="border border-slate-300 px-4 py-2">Student ID</th>
                <th className="border border-slate-300 px-4 py-2">Student Name</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Quizzes</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Practicum</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Exams</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Attendance</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Overall GWA</th>
                <th className="border border-slate-300 px-4 py-2 text-center">Remarks</th>
              </tr>
            )}
          </thead>
          <tbody>
            {sortedSummaryStudents.map(student => {
              const subj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
              const computeRes = subj?.enrollmentId ? computeResultsByEnrollment.get(String(subj.enrollmentId)) : null;

              if (isPeriodMode) {
                const evalResult = extractPeriodEvaluation(subj, computeRes, isPeriodMode);
                const isFailsRetention = subj && subj.isClinical && evalResult.overallGwa !== null && evalResult.overallGwa >= settings.retentionThreshold;
                const isFailed = evalResult.overallGwa === 5.0;
                const isPending = evalResult.statusText === 'PENDING';
                const isIncomplete = evalResult.overallGwa === null;

                const midtermStr = evalResult.midtermPercentage !== null
                  ? `${evalResult.midtermPercentage.toFixed(2)}%`
                  : evalResult.midtermStatus === 'pending'
                  ? 'Pending'
                  : evalResult.midtermReasons.length > 0
                  ? `Incomplete (${evalResult.midtermReasons[0]})`
                  : '—';
                const finalStr = evalResult.finalPercentage !== null
                  ? `${evalResult.finalPercentage.toFixed(2)}%`
                  : evalResult.finalStatus === 'pending'
                  ? 'Pending'
                  : evalResult.finalReasons.length > 0
                  ? `Incomplete (${evalResult.finalReasons[0]})`
                  : '—';
                const gwaStr = evalResult.overallGwa !== null
                  ? evalResult.overallGwa.toFixed(2)
                  : evalResult.historicalGwa !== null
                  ? `Prior: ${evalResult.historicalGwa.toFixed(2)} (Historical)`
                  : '—';
                const remarksStr = isFailed
                  ? 'FAILED'
                  : isFailsRetention
                  ? 'FAILS RETENTION'
                  : isPending
                  ? 'PENDING'
                  : isIncomplete
                  ? 'INCOMPLETE'
                  : 'PASS';

                return (
                  <tr key={student.id}>
                    <td className="border border-slate-300 px-4 py-2 font-mono">{student.studentId}</td>
                    <td className="border border-slate-300 px-4 py-2 font-bold">{student.name}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-mono">{midtermStr}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-mono">{finalStr}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-extrabold">{gwaStr}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-bold text-[10px]">{remarksStr}</td>
                  </tr>
                );
              }

              // Legacy print row
              const isFailsRetention = subj && subj.isClinical && typeof subj.grade === 'number' && subj.grade >= settings.retentionThreshold;
              const isFailed = subj && typeof subj.grade === 'number' && subj.grade === 5.0;
              const hasGrade = subj && typeof subj.grade === 'number' && subj.grade > 0;
              const remarksStr = !hasGrade ? 'UNCOMPUTED' : isFailed ? 'FAILED' : isFailsRetention ? 'FAILS RETENTION' : 'PASS';

              return (
                <tr key={student.id}>
                  <td className="border border-slate-300 px-4 py-2 font-mono">{student.studentId}</td>
                  <td className="border border-slate-300 px-4 py-2 font-bold">{student.name}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj && typeof subj.components?.quizzes === 'number' ? `${subj.components.quizzes.toFixed(1)}%` : '—'}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj && typeof subj.components?.practicum === 'number' ? `${subj.components.practicum.toFixed(1)}%` : '—'}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj && typeof subj.components?.exams === 'number' ? `${subj.components.exams.toFixed(1)}%` : '—'}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj && typeof subj.components?.attendance === 'number' ? `${subj.components.attendance.toFixed(1)}%` : '—'}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center font-extrabold">{hasGrade ? subj.grade.toFixed(2) : '—'}</td>
                  <td className="border border-slate-300 px-4 py-2 text-center font-bold text-[10px]">{remarksStr}</td>
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
                      const found = modalEligibleCategories.find(c => String(c.id) === String(selectedId));
                      setAssType(found ? found.name : '');
                      setModalCategoryWarning(false);
                    }}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  >
                    <option value="">Select grading category</option>
                    {modalEligibleCategories.map(cat => (
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
                onChange={(e) => handlePeriodChange(e.target.value as any)}
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
                value={assDueDate}
                onChange={(e) => setAssDueDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
              />
              <p className="text-[10px] text-slate-400">Optional. Leave blank for activities without a specific deadline.</p>
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
