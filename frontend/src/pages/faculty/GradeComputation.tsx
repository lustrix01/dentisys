import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  X,
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
import { GradebookMatrix } from '../../components/GradebookMatrix';
import { Modal } from '../../components/Modal';
import { requestConfirmation, showFeedback } from '../../components/FeedbackCenter';
import { percentageToGWAExact } from '../../utils/gradeHelper';
import { recordAudit } from '../../services/auditService';

import {
  computeFacultyGradesApi,
  deleteFacultyAssessmentApi,
  getFacultyClassesApi,
  getFacultySettingsApi,
  saveFacultyAssessmentScoresApi,
  saveFacultyScoreBatchesApi,
  type FacultyScoreEntry,
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
  GradingSourceKindEnum,
  GradingComponentEnum,
  FacultyGradingComponentMappingRequiredItem
} from '../../services/apiClient';
import {
  buildDefaultPeriodDraft,
  buildDefaultLectureLaboratoryCategories,
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
  PeriodCategoryDraftRow,
  PeriodComponentEvaluation
} from '../../utils/periodGradingHelper';

export interface EditorCategoryRow {
  tempId: string;
  id?: number;
  name: string;
  weight: string;
  sortOrder: number;
  inUse: boolean;
}

interface CategoryWeightSummary {
  sumUnits: number;
  allValid: boolean;
  isExact100: boolean;
  displayPercent: string;
}

const categoryOptionKey = (category: {
  id?: number | string | null;
  name: string;
  gradingPeriod?: 'Midterm' | 'Final' | null;
  component?: GradingComponentEnum | null;
}, fallbackPeriod: 'Midterm' | 'Final') => category.id
    ? String(category.id)
    : `${category.gradingPeriod ?? fallbackPeriod}:${category.component ?? 'unassigned'}:${category.name}`;

const calculateCategoryWeightSummary = (rows: PeriodCategoryDraftRow[]): CategoryWeightSummary => {
  let sumUnits = 0;
  let allValid = true;
  for (const row of rows) {
    const units = parseWeightUnits(row.weight.trim());
    if (units === null) {
      allValid = false;
    } else {
      sumUnits += units;
    }
  }
  return {
    sumUnits,
    allValid,
    isExact100: allValid && sumUnits === TOTAL_WEIGHT_UNITS,
    displayPercent: formatWeightUnitsToPercent(sumUnits),
  };
};

const formatComponentResultCell = (
  component: PeriodComponentEvaluation | undefined,
  periodStatus: 'computed' | 'incomplete' | 'unconfigured' | 'pending'
) => {
  if (component?.percentage !== null && component?.percentage !== undefined) return `${component.percentage.toFixed(2)}%`;
  if (component?.status === 'pending' || periodStatus === 'pending') return 'Pending';
  if (component?.reasons.length) return `Incomplete (${component.reasons[0]})`;
  if (periodStatus === 'computed') return 'Unavailable (recompute required)';
  return periodStatus === 'incomplete' ? 'Incomplete' : '—';
};

export const GradeComputation: React.FC = () => {
  const { user } = useAuth();
  const {
    students,
    attendanceRecords,
    settings,
    assessments,
    assessmentScores,
    refreshAssessments,
    saveAssessmentScores,
  } = useApp();

  const location = useLocation();

  const [currentSchoolYear, setCurrentSchoolYear] = useState<string>('');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('');
  const [facultyClasses, setFacultyClasses] = useState<FacultyClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  const [loading, setLoading] = useState(true);
  const [transmutationDefaults, setTransmutationDefaults] = useState({ minimumPercentage: 50, maximumPercentage: 100 });

  const isClassCurrentSchoolYear = useCallback((c: FacultyClassItem) => {
    if (c.isCurrentSchoolYear === true) return true;
    if (c.isHistorical === true) return false;
    if (currentSchoolYear && c.schoolYear) {
      return c.schoolYear.trim().toLowerCase() === currentSchoolYear.trim().toLowerCase();
    }
    return !c.isHistorical;
  }, [currentSchoolYear]);

  const currentYearActiveClasses = useMemo(() => {
    return facultyClasses.filter(c => {
      const isActive = (c.status || '').trim().toLowerCase() === 'active';
      return isActive && isClassCurrentSchoolYear(c);
    });
  }, [facultyClasses, isClassCurrentSchoolYear]);

  const activeCourses = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const c of currentYearActiveClasses) {
      if (c.courseCode && !map.has(c.courseCode)) {
        map.set(c.courseCode, {
          code: c.courseCode,
          name: c.courseName || c.courseCode || 'Course',
        });
      }
    }
    return Array.from(map.values());
  }, [currentYearActiveClasses]);

  const availableClasses = useMemo(
    () => currentYearActiveClasses.filter(classItem =>
      classItem.courseCode === selectedSubjectCode
    ),
    [currentYearActiveClasses, selectedSubjectCode],
  );

  useEffect(() => {
    // Settings only provide transmutation defaults; a settings failure must not hide the classes.
    Promise.allSettled([getFacultyClassesApi(), getFacultySettingsApi()])
      .then(([classesResult, settingsResult]) => {
        if (classesResult.status === 'fulfilled') {
          const classesResponse = classesResult.value;
          const loadedClasses = Array.isArray(classesResponse.classes) ? classesResponse.classes : [];
          setCurrentSchoolYear(classesResponse.currentSchoolYear || '');
          setFacultyClasses(loadedClasses);
        }
        if (settingsResult.status === 'fulfilled' && settingsResult.value.settings?.transmutationDefaults) {
          setTransmutationDefaults(settingsResult.value.settings.transmutationDefaults);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (activeCourses.length > 0 && !activeCourses.some(c => c.code === selectedSubjectCode)) {
      setSelectedSubjectCode(activeCourses[0].code);
    }
  }, [activeCourses, selectedSubjectCode]);

  useEffect(() => {
    if (availableClasses.length > 0 && !availableClasses.some(c => c.id === selectedClassId)) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses, selectedClassId]);

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
    for (const c of currentYearActiveClasses) {
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
  }, [currentYearActiveClasses]);

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

  const getStudentLastName = (s: { lastName?: string; name: string }): string => {
    if (s.lastName && s.lastName.trim()) return s.lastName.trim();
    const parts = s.name.trim().split(/\s+/);
    return parts.length > 0 ? parts[parts.length - 1] : s.name;
  };

  const sortStudentsByLastName = <T extends { lastName?: string; name: string }>(list: T[]): T[] => {
    return [...list].sort((a, b) => {
      const lastA = getStudentLastName(a).toLowerCase();
      const lastB = getStudentLastName(b).toLowerCase();
      const cmp = lastA.localeCompare(lastB);
      if (cmp !== 0) return cmp;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  };

  // Filter students under active subject/class scope (default sorted alphabetically by last name)
  const activeStudents = useMemo(() => {
    const list = students.filter(s =>
      s.enrolledSubjects.some(sub => sub.classId === selectedClassId && sub.code === selectedSubjectCode)
    );
    return sortStudentsByLastName(list);
  }, [students, selectedSubjectCode, selectedClassId]);

  // Find active subject details
  const activeSubjectName = useMemo(() => {
    const fromActiveCourse = activeCourses.find(c => c.code === selectedSubjectCode);
    if (fromActiveCourse) return fromActiveCourse.name;
    const rawStud = students.find(s => s.enrolledSubjects.some(sub => sub.code === selectedSubjectCode));
    const sub = rawStud?.enrolledSubjects.find(x => x.code === selectedSubjectCode);
    return sub ? sub.name : 'Dental Course';
  }, [activeCourses, selectedSubjectCode, students]);

  // ----------------------------------------------------
  // GRADE WEIGHTS EDITOR STATE (AUTHORITATIVE BACKEND)
  // ----------------------------------------------------
  const [selectedOfferingKey, setSelectedOfferingKey] = useState<string>('');
  const [loadedConfig, setLoadedConfig] = useState<FacultyGradingConfiguration | null>(null);
  const [schemaMode, setSchemaMode] = useState<'overall' | 'periods'>('periods');
  const [componentMode, setComponentMode] = useState<'combined' | 'lecture_laboratory'>('lecture_laboratory');
  const [savedComponentMode, setSavedComponentMode] = useState<'combined' | 'lecture_laboratory'>('lecture_laboratory');
  const [componentWeights, setComponentWeights] = useState<{ lecture: string; laboratory: string }>({ lecture: '60', laboratory: '40' });
  const [savedComponentWeights, setSavedComponentWeights] = useState<{ lecture: string; laboratory: string }>({ lecture: '60', laboratory: '40' });
  const [activeComponentEditorTab, setActiveComponentEditorTab] = useState<GradingComponentEnum>('Lecture');
  const [isPresetDraft, setIsPresetDraft] = useState<boolean>(false);
  const [activePeriodEditorTab, setActivePeriodEditorTab] = useState<'Midterm' | 'Final'>('Midterm');

  // Overall Mode State (Preserved Legacy Single-List)
  const [categoryRows, setCategoryRows] = useState<EditorCategoryRow[]>([]);
  const [savedCategoryRows, setSavedCategoryRows] = useState<EditorCategoryRow[]>([]);

  // Period Mode State (Midterm & Finals)
  const [termRatio, setTermRatio] = useState<{ midterm: string; final: string }>({ midterm: '30', final: '70' });
  const [savedTermRatio, setSavedTermRatio] = useState<{ midterm: string; final: string }>({ midterm: '30', final: '70' });

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
  // Set when Faculty try to add an assessment to a course that has no saved grade weights yet.
  const [weightsRequiredOffering, setWeightsRequiredOffering] = useState<{ key: string; courseCode: string; courseName: string } | null>(null);

  // Assessment Form State
  const [assTitle, setAssTitle] = useState('');
  const [assClassId, setAssClassId] = useState('CLINIC-A');
  const [assType, setAssType] = useState<string>('Quiz');
  const [assPeriod, setAssPeriod] = useState<'Midterm' | 'Final'>('Midterm');
  const [assMaxScore, setAssMaxScore] = useState<number | ''>(50);
  const [assDueDate, setAssDueDate] = useState('');
  const [assInstructions, setAssInstructions] = useState('');
  const [assRemarks, setAssRemarks] = useState('');
  const [assStatus, setAssStatus] = useState<'Active' | 'Closed'>('Active');
  const [assTransmutationEnabled, setAssTransmutationEnabled] = useState(false);
  const [assTransmutationMinimum, setAssTransmutationMinimum] = useState(50);
  const [assTransmutationMaximum, setAssTransmutationMaximum] = useState(100);
  const [assAttendanceDate, setAssAttendanceDate] = useState('');
  const [assAttendanceCode, setAssAttendanceCode] = useState('');
  const [isTransmutationSectionOpen, setIsTransmutationSectionOpen] = useState(false);

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
      } else {
        // Keep an unconfigured offering unconfigured. Defaults are draft choices only;
        // the assessment save guard requires an actual server configuration.
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

  const modalEligibleCategories = useMemo<Array<{
    id?: number | null;
    name: string;
    weight: string;
    gradingPeriod?: 'Midterm' | 'Final' | null;
    sourceKind?: GradingSourceKindEnum | null;
    component?: GradingComponentEnum | null;
  }>>(() => {
    const targetClass = facultyClasses.find(c => c.id === assClassId);
    const targetOffering = targetClass ? getOfferingForClass(targetClass) : currentAssessmentOffering;

    // 0. A saved configuration is authoritative: only its (saved, stable-ID) categories can be chosen.
    if (modalConfigStatus === 'configured' && modalConfig && Array.isArray(modalConfig.categories)) {
      return modalConfig.categories
        .filter(c => (c.gradingPeriod === assPeriod || !c.gradingPeriod) && c.sourceKind !== 'attendance')
        .map(c => ({
          id: c.id,
          name: c.name,
          weight: String(c.weight),
          gradingPeriod: c.gradingPeriod,
          sourceKind: c.sourceKind,
          component: c.component,
        }));
    }

    // 1. If currently editing this offering in the Grade Weights Editor, use active in-memory categories
    if (targetOffering && selectedOfferingKey === targetOffering.key) {
      if (schemaMode === 'periods') {
        const rows = assPeriod === 'Final' ? finalCategories : midtermCategories;
        const validRows = rows.filter(c => c.sourceKind !== 'attendance' && c.name.trim() !== '');
        if (validRows.length > 0) {
          return validRows.map((r) => ({
            id: r.id ?? undefined,
            name: r.name,
            weight: String(r.weight),
            gradingPeriod: assPeriod,
            sourceKind: r.sourceKind,
            component: r.component,
          }));
        }
      } else {
        const validRows = categoryRows.filter(c => c.name.toLowerCase() !== 'attendance' && c.name.trim() !== '');
        if (validRows.length > 0) {
          return validRows.map((r) => ({
            id: r.id ?? undefined,
            name: r.name,
            weight: String(r.weight),
            gradingPeriod: undefined,
            sourceKind: 'assessment' as const,
          }));
        }
      }
    }

    // 2. If modalConfig is configured, use its categories
    if (modalConfig && Array.isArray(modalConfig.categories) && modalConfig.categories.length > 0) {
      const filtered = modalConfig.categories.filter(c =>
        (c.gradingPeriod === assPeriod || !c.gradingPeriod) &&
        c.sourceKind !== 'attendance'
      );
      if (filtered.length > 0) {
        return filtered.map(c => ({
          id: c.id,
          name: c.name,
          weight: String(c.weight),
          gradingPeriod: c.gradingPeriod,
          sourceKind: c.sourceKind,
          component: c.component,
        }));
      }
    }

    // 3. If assessmentConfig is loaded, use its categories
    if (assessmentConfig && Array.isArray(assessmentConfig.categories) && assessmentConfig.categories.length > 0) {
      const filtered = assessmentConfig.categories.filter(c =>
        (c.gradingPeriod === assPeriod || !c.gradingPeriod) &&
        c.sourceKind !== 'attendance'
      );
      if (filtered.length > 0) {
        return filtered.map(c => ({
          id: c.id,
          name: c.name,
          weight: String(c.weight),
          gradingPeriod: c.gradingPeriod,
          sourceKind: c.sourceKind,
          component: c.component,
        }));
      }
    }

    // 4. In-memory categories from active Grade Weight Editor
    if (schemaMode === 'periods') {
      const rows = assPeriod === 'Final' ? finalCategories : midtermCategories;
      const validRows = rows.filter(c => c.sourceKind !== 'attendance' && c.name.trim() !== '');
      if (validRows.length > 0) {
        return validRows.map((r) => ({
          id: r.id ?? undefined,
          name: r.name,
          weight: String(r.weight),
          gradingPeriod: assPeriod,
          sourceKind: r.sourceKind,
          component: r.component,
        }));
      }
    } else if (categoryRows.length > 0) {
      const validRows = categoryRows.filter(c => c.name.toLowerCase() !== 'attendance' && c.name.trim() !== '');
      if (validRows.length > 0) {
        return validRows.map((r) => ({
          id: r.id ?? undefined,
          name: r.name,
          weight: String(r.weight),
          gradingPeriod: undefined,
          sourceKind: 'assessment' as const,
        }));
      }
    }

    // 5. Fallback to default period draft
    const fallback = buildDefaultPeriodDraft();
    const rows = assPeriod === 'Final' ? fallback.finalCategories : fallback.midtermCategories;
    return rows.filter(c => c.sourceKind !== 'attendance').map((r) => ({
      id: undefined,
      name: r.name,
      weight: String(r.weight),
      gradingPeriod: assPeriod,
      sourceKind: r.sourceKind,
      component: r.component,
    }));
  }, [
    modalConfig,
    modalConfigStatus,
    assessmentConfig,
    assPeriod,
    assClassId,
    facultyClasses,
    currentAssessmentOffering,
    selectedOfferingKey,
    schemaMode,
    midtermCategories,
    finalCategories,
    categoryRows,
  ]);

  const handlePeriodChange = (newPeriod: 'Midterm' | 'Final') => {
    setAssPeriod(newPeriod);
    const targetClass = facultyClasses.find(c => c.id === assClassId);
    const targetOffering = targetClass ? getOfferingForClass(targetClass) : currentAssessmentOffering;

    let nextEligible: Array<{ id?: number | string | null; name: string; weight: string | number; component?: GradingComponentEnum | null }> = [];
    if (modalConfigStatus === 'configured' && modalConfig?.schemaMode === 'periods' && Array.isArray(modalConfig.categories)) {
      // Period changes in this modal must use the same saved categories shown by its picker.
      // The editor may contain unsaved component reassignment drafts for this offering.
      nextEligible = modalConfig.categories.filter(
        c => (c.gradingPeriod === newPeriod || !c.gradingPeriod) && c.sourceKind !== 'attendance'
      );
    } else if (targetOffering && selectedOfferingKey === targetOffering.key && schemaMode === 'periods') {
      const rows = newPeriod === 'Final' ? finalCategories : midtermCategories;
      nextEligible = rows.filter(c => c.sourceKind !== 'attendance' && c.name.trim() !== '');
    } else if (modalConfig && modalConfig.schemaMode === 'periods') {
      nextEligible = modalConfig.categories.filter(
        c => (c.gradingPeriod === newPeriod || !c.gradingPeriod) && c.sourceKind !== 'attendance'
      );
    } else {
      const fallback = buildDefaultPeriodDraft();
      const rows = newPeriod === 'Final' ? fallback.finalCategories : fallback.midtermCategories;
      nextEligible = rows.filter(c => c.sourceKind !== 'attendance');
    }

    const selectedCurrentCategory = modalEligibleCategories.find(c =>
      assGradingCategoryId && (String(c.id) === assGradingCategoryId || categoryOptionKey(c, assPeriod) === assGradingCategoryId)
    );
    const usesGroupedCategories = modalConfigStatus === 'configured' && modalConfig
      ? modalConfig.componentMode === 'lecture_laboratory'
      : Boolean(targetOffering && selectedOfferingKey === targetOffering.key && schemaMode === 'periods' && componentMode === 'lecture_laboratory');
    const preferredComponent = usesGroupedCategories ? selectedCurrentCategory?.component : undefined;
    const currentMatches = preferredComponent
      ? nextEligible.find(c => c.name === assType && c.component === preferredComponent)
      ?? nextEligible.find(c => assGradingCategoryId && (String(c.id) === assGradingCategoryId || categoryOptionKey(c, newPeriod) === assGradingCategoryId) && c.component === preferredComponent)
      : nextEligible.find(
        c => (assGradingCategoryId && String(c.id) === String(assGradingCategoryId)) || c.name === assType
      );
    if (currentMatches) {
      setAssGradingCategoryId(currentMatches.id ? String(currentMatches.id) : '');
      setAssType(currentMatches.name);
      setModalCategoryWarning(false);
    } else if (nextEligible.length > 0) {
      const fallbackCategory = preferredComponent
        ? nextEligible.find(c => c.component === preferredComponent)
        : nextEligible[0];
      if (fallbackCategory) {
        setAssGradingCategoryId(fallbackCategory.id ? String(fallbackCategory.id) : '');
        setAssType(fallbackCategory.name);
        setModalCategoryWarning(false);
      } else {
        setAssGradingCategoryId('');
        setAssType('');
        setModalCategoryWarning(true);
      }
    } else {
      setAssGradingCategoryId('');
      setAssType('');
      setModalCategoryWarning(true);
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

  // Assessments Manager Filters State
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [assessmentPeriodFilter, setAssessmentPeriodFilter] = useState<'all' | 'Midterm' | 'Final'>('all');
  const [assessmentCategoryFilter, setAssessmentCategoryFilter] = useState<string>('all');
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState<string>('all');

  const filteredAssessments = useMemo(() => {
    return activeAssessments.filter(ass => {
      // 1. Search query filter
      if (assessmentSearch.trim()) {
        const query = assessmentSearch.toLowerCase().trim();
        const matchesTitle = ass.title.toLowerCase().includes(query);
        const matchesInstructions = (ass.instructions || '').toLowerCase().includes(query);
        const matchedCat = assessmentConfig?.categories.find(c => String(c.id) === String(ass.gradingCategoryId));
        const matchesCategory = matchedCat?.name.toLowerCase().includes(query) || false;
        if (!matchesTitle && !matchesInstructions && !matchesCategory) return false;
      }

      // 2. Grading Period filter
      if (assessmentPeriodFilter !== 'all') {
        if (ass.gradingPeriod !== assessmentPeriodFilter) return false;
      }

      // 3. Status filter
      if (assessmentStatusFilter !== 'all') {
        if (ass.status !== assessmentStatusFilter) return false;
      }

      // 4. Category filter
      if (assessmentCategoryFilter !== 'all') {
        if (String(ass.gradingCategoryId ?? '') !== String(assessmentCategoryFilter)) return false;
      }

      return true;
    });
  }, [
    activeAssessments,
    assessmentSearch,
    assessmentPeriodFilter,
    assessmentStatusFilter,
    assessmentCategoryFilter,
    assessmentConfig,
  ]);

  const openNewAssessmentModal = async () => {
    const modalAvailableSections = availableClasses.length > 0
      ? availableClasses
      : (currentAssessmentOffering?.sections ?? []);
    const initialClassId = modalAvailableSections.some(classItem => classItem.id === selectedClassId)
      ? selectedClassId
      : (modalAvailableSections[0]?.id ?? '');

    // New assessments must link to a saved grading category, so the course needs saved weights first.
    const precheckClass = facultyClasses.find(c => c.id === initialClassId);
    const precheckOffering = precheckClass ? getOfferingForClass(precheckClass) : currentAssessmentOffering;
    if (precheckOffering) {
      let hasSavedWeights = false;
      let lookupFailed = false;
      try {
        const res = await getFacultyGradingConfigApi({
          courseId: precheckOffering.courseId,
          semester: precheckOffering.canonicalSemester,
          schoolYear: precheckOffering.canonicalSchoolYear,
        });
        hasSavedWeights = Boolean(res.configuration && Array.isArray(res.configuration.categories) && res.configuration.categories.length > 0);
      } catch {
        lookupFailed = true; // the form shows its own retry state below
      }
      if (!hasSavedWeights && !lookupFailed) {
        setWeightsRequiredOffering(precheckOffering);
        return;
      }
    }

    setEditingAssessment(null);
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
    setIsTransmutationSectionOpen(false);
    setIsAssessmentModalOpen(true);

    const initialClass = facultyClasses.find(c => c.id === initialClassId);
    const offering = initialClass ? getOfferingForClass(initialClass) : currentAssessmentOffering;

    // Faculty must pick the grading category explicitly; nothing is preselected.
    if (offering) {
      await loadModalConfigForOffering(offering);
    } else {
      setModalConfigStatus('configured');
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
    setIsTransmutationSectionOpen(Boolean(ass.transmutationEnabled));
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
    if (!assGradingCategoryId && !assType) {
      showFeedback('Please select a valid grading category from the active configuration.', 'error');
      return;
    }
    if (!editingAssessment && modalConfigStatus === 'unconfigured') {
      showFeedback('Set up and save grade weights for this course before adding assessments.', 'error');
      return;
    }

    if (assTransmutationEnabled && ((assAttendanceDate && !assAttendanceCode) || (!assAttendanceDate && assAttendanceCode))) {
      showFeedback('Please select both session date and session code, or leave both blank for no attendance link.', 'error');
      return;
    }
    if (assTransmutationMinimum < 0 || assTransmutationMaximum > 100 || assTransmutationMinimum > assTransmutationMaximum) {
      showFeedback('Transmutation bounds must be between 0% and 100%, with minimum not exceeding maximum.', 'error');
      return;
    }

    const targetClass = facultyClasses.find(c => c.id === assClassId);
    const targetSubjectCode = targetClass?.courseCode || selectedSubjectCode;

    const numericCategoryId = modalConfigStatus === 'configured' && assGradingCategoryId && !isNaN(Number(assGradingCategoryId)) && Number(assGradingCategoryId) > 0
      ? Number(assGradingCategoryId)
      : null;

    const parsedMaxScore = typeof assMaxScore === 'number' ? assMaxScore : parseInt(String(assMaxScore), 10);
    if (isNaN(parsedMaxScore) || parsedMaxScore <= 0) {
      showFeedback('Please enter a valid maximum score greater than 0.', 'error');
      return;
    }

    const candidate: any = editingAssessment
      ? {
        ...editingAssessment,
        title: assTitle.trim(),
        type: assType,
        classId: assClassId,
        gradingPeriod: assPeriod,
        maxScore: parsedMaxScore,
        dueDate: assDueDate || null,
        instructions: assInstructions,
        remarks: assRemarks,
        status: assStatus as 'Active' | 'Closed' | 'Archived',
        transmutationEnabled: assTransmutationEnabled,
        transmutationMinimumPercentage: assTransmutationMinimum,
        transmutationMaximumPercentage: assTransmutationMaximum,
        attendanceSessionDate: assAttendanceDate || null,
        attendanceSessionCode: assAttendanceCode || null,
        ...(numericCategoryId ? { gradingCategoryId: numericCategoryId } : {}),
      }
      : {
        title: assTitle.trim(),
        type: assType,
        subjectCode: targetSubjectCode,
        classId: assClassId,
        gradingPeriod: assPeriod,
        maxScore: parsedMaxScore,
        dueDate: assDueDate || null,
        instructions: assInstructions,
        remarks: assRemarks,
        status: assStatus as 'Active' | 'Closed' | 'Archived',
        transmutationEnabled: assTransmutationEnabled,
        transmutationMinimumPercentage: assTransmutationMinimum,
        transmutationMaximumPercentage: assTransmutationMaximum,
        attendanceSessionDate: assAttendanceDate || null,
        attendanceSessionCode: assAttendanceCode || null,
        ...(numericCategoryId ? { gradingCategoryId: numericCategoryId } : {}),
      };

    if (!numericCategoryId) {
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
  const [activityFilterPeriod, setActivityFilterPeriod] = useState<'all' | 'Midterm' | 'Final'>('all');
  const [activityFilterType, setActivityFilterType] = useState<string>('all');
  const [activityFilterSearch, setActivityFilterSearch] = useState<string>('');
  const [scoreSearch, setScoreSearch] = useState('');
  const [scoresInputState, setScoresInputState] = useState<Record<string, { score: string; remarks: string }>>({});
  const [isScoresSavedAlert, setIsScoresSavedAlert] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  // Auto-save status states
  const [singleSaveStatus, setSingleSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('saved');
  const singleDirtyRef = useRef(false);
  const singleSavingRef = useRef(false);
  const singleQueuedRef = useRef(false);
  const singleSavedRef = useRef<Record<string, { score: string; remarks: string }>>({});
  const singleSaveRef = useRef<(manual?: boolean) => Promise<void>>(async () => {});
  const singleScoresRef = useRef<Record<string, { score: string; remarks: string }>>({});

  const [matrixSaveStatus, setMatrixSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('saved');
  const matrixDirtyRef = useRef(false);
  const matrixSavingRef = useRef(false);
  const matrixQueuedRef = useRef(false);
  const matrixSavedRef = useRef<Record<string, Record<string, string>>>({});
  const matrixSaveRef = useRef<(manual?: boolean) => Promise<void>>(async () => {});
  const autoSaveRef = useRef(autoSaveEnabled);
  autoSaveRef.current = autoSaveEnabled;

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (!singleDirtyRef.current && !matrixDirtyRef.current && !singleSavingRef.current && !matrixSavingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, []);
  const matrixScoresRef = useRef<Record<string, Record<string, string>>>({});

  const availableActivityTypes = useMemo(() => {
    const types = new Set<string>();
    activeAssessments.forEach(a => {
      if (a.type && a.type.trim()) {
        types.add(a.type.trim());
      }
    });
    return Array.from(types).sort();
  }, [activeAssessments]);

  const activityMidtermCount = useMemo(() => {
    return activeAssessments.filter(a => (a.gradingPeriod ?? 'Midterm') === 'Midterm').length;
  }, [activeAssessments]);

  const activityFinalCount = useMemo(() => {
    return activeAssessments.filter(a => a.gradingPeriod === 'Final').length;
  }, [activeAssessments]);

  const singleActivityFilteredAssessments = useMemo(() => {
    return activeAssessments.filter(a => {
      if (activityFilterPeriod !== 'all') {
        const period = a.gradingPeriod ?? 'Midterm';
        if (period !== activityFilterPeriod) return false;
      }
      if (activityFilterType !== 'all') {
        if ((a.type || '').trim() !== activityFilterType) return false;
      }
      if (activityFilterSearch.trim()) {
        const q = activityFilterSearch.toLowerCase().trim();
        const matchTitle = (a.title || '').toLowerCase().includes(q);
        const matchType = (a.type || '').toLowerCase().includes(q);
        if (!matchTitle && !matchType) return false;
      }
      return true;
    });
  }, [activeAssessments, activityFilterPeriod, activityFilterType, activityFilterSearch]);

  // Set default assessment when subject/class or filter changes
  useEffect(() => {
    if (singleDirtyRef.current || singleSavingRef.current) return;
    if (singleActivityFilteredAssessments.length > 0) {
      if (!singleActivityFilteredAssessments.some(a => a.id === selectedAssessmentId)) {
        setSelectedAssessmentId(singleActivityFilteredAssessments[0].id);
      }
    }
  }, [singleActivityFilteredAssessments, selectedAssessmentId]);

  const activeAssessment = useMemo(() => {
    return assessments.find(a => a.id === selectedAssessmentId);
  }, [assessments, selectedAssessmentId]);

  // Load existing student scores
  useEffect(() => {
    if (!selectedAssessmentId || singleDirtyRef.current || singleSavingRef.current) return;
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
    singleScoresRef.current = initialInputs;
    singleSavedRef.current = initialInputs;
    singleDirtyRef.current = false;
    setSingleSaveStatus('saved');
    setIsScoresSavedAlert(false);
  }, [selectedAssessmentId, activeStudents, assessmentScores]);

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

  const hasStoredScore = (assessmentId: string, studentId: string): boolean =>
    assessmentScores.some(score => score.assessmentId === assessmentId && score.studentId === studentId);

  // Save on leaving a cell. Refs preserve edits made while a request is in flight.
  const performSaveSingleScores = async (isManual = false) => {
    if (!selectedAssessmentId || !activeAssessment || (!isManual && !autoSaveRef.current)) return;
    if (singleSavingRef.current) {
      singleQueuedRef.current = true;
      return;
    }
    singleSavingRef.current = true;
    setSingleSaveStatus('saving');
    try {
      const currentScores = singleScoresRef.current;
      const saveList: FacultyScoreEntry[] = [];
      for (const [studentId, val] of Object.entries(currentScores)) {
        if (!validateSingleScore(val.score, activeAssessment.maxScore)) {
          throw new Error('Some scores are invalid. Scores cannot exceed the assessment maximum.');
        }
        if (val.score !== '' || hasStoredScore(selectedAssessmentId, studentId)) {
          saveList.push({ studentId, score: val.score === '' ? null : Number(val.score), remarks: val.remarks });
        }
      }
      const cleared = saveList.filter(entry => entry.score === null);
      if (isManual || cleared.length > 0) {
        const confirmed = await requestConfirmation(
          `Save ${saveList.length - cleared.length} score(s)${cleared.length > 0 ? ` and clear ${cleared.length}` : ''} for ${activeAssessment.title}?`,
          'Save scores'
        );
        if (!confirmed) {
          const restored = { ...singleScoresRef.current };
          cleared.forEach(entry => {
            const stored = assessmentScores.find(score => score.assessmentId === selectedAssessmentId && score.studentId === entry.studentId);
            if (stored && restored[entry.studentId]?.score === '') {
              restored[entry.studentId] = { ...restored[entry.studentId], score: String(stored.score) };
            }
          });
          singleScoresRef.current = restored;
          setScoresInputState(restored);
          singleDirtyRef.current = JSON.stringify(restored) !== JSON.stringify(singleSavedRef.current);
          setSingleSaveStatus(singleDirtyRef.current ? 'idle' : 'saved');
          return;
        }
      }
      if (saveList.length > 0) {
        await saveFacultyAssessmentScoresApi(selectedAssessmentId, saveList);
        saveAssessmentScores(selectedAssessmentId, saveList);
        await refreshPersistedGrades(activeAssessment.classId);
      }
      singleSavedRef.current = currentScores;
      singleDirtyRef.current = JSON.stringify(singleScoresRef.current) !== JSON.stringify(currentScores);
      setSingleSaveStatus(singleDirtyRef.current ? 'idle' : 'saved');
      setIsScoresSavedAlert(!singleDirtyRef.current);
      if (isManual) showFeedback(`Saved ${saveList.filter(entry => entry.score !== null).length} scores successfully!`, 'success');
    } catch (requestError) {
      setSingleSaveStatus('error');
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to save assessment scores.', 'error');
    } finally {
      singleSavingRef.current = false;
      if (singleQueuedRef.current) {
        singleQueuedRef.current = false;
        if (singleDirtyRef.current && autoSaveRef.current) void singleSaveRef.current();
      }
    }
  };
  singleSaveRef.current = performSaveSingleScores;

  const handleScoreChange = (studentId: string, val: string, field: 'score' | 'remarks') => {
    const next = {
      ...singleScoresRef.current,
      [studentId]: { ...singleScoresRef.current[studentId], [field]: val },
    };
    singleScoresRef.current = next;
    singleDirtyRef.current = JSON.stringify(next) !== JSON.stringify(singleSavedRef.current);
    setScoresInputState(next);
    if (!singleSavingRef.current) setSingleSaveStatus(singleDirtyRef.current ? 'idle' : 'saved');
    setIsScoresSavedAlert(false);
  };

  const handleScoreBlur = async (_studentId: string) => {
    if (autoSaveRef.current && (singleDirtyRef.current || singleSavingRef.current)) await singleSaveRef.current();
  };

  const handleManualSaveScores = async () => {
    await singleSaveRef.current(true);
  };

  // View Mode: 'single' (Activity view) vs 'matrix' (Full gradebook grid view)
  const [scoreEntryMode, setScoreEntryMode] = useState<'single' | 'matrix'>('single');
  const [matrixScoresState, setMatrixScoresState] = useState<Record<string, Record<string, string>>>({});
  const [isMatrixSavedAlert, setIsMatrixSavedAlert] = useState(false);
  const [matrixRefreshKey, setMatrixRefreshKey] = useState(0);

  // Initialize Matrix Scores State whenever activeAssessments, activeStudents, or assessmentScores change
  useEffect(() => {
    if (matrixDirtyRef.current || matrixSavingRef.current) return;
    const matrix: Record<string, Record<string, string>> = {};
    activeStudents.forEach(student => {
      matrix[student.id] = {};
      activeAssessments.forEach(ass => {
        const match = assessmentScores.find(s => s.assessmentId === ass.id && s.studentId === student.id);
        matrix[student.id][ass.id] = match ? match.score.toString() : '';
      });
    });
    setMatrixScoresState(matrix);
    matrixScoresRef.current = matrix;
    matrixSavedRef.current = matrix;
    matrixDirtyRef.current = false;
    setMatrixSaveStatus('saved');
  }, [activeStudents, activeAssessments, assessmentScores]);

  const performSaveMatrixScores = async (isManual = false) => {
    if (!isManual && !autoSaveRef.current) return;
    if (matrixSavingRef.current) {
      matrixQueuedRef.current = true;
      return;
    }
    matrixSavingRef.current = true;
    setMatrixSaveStatus('saving');
    try {
      const currentScores = matrixScoresRef.current;
      let saveCount = 0;
      const cleared: Array<{ studentId: string; assessmentId: string; score: string }> = [];
      const batches: Array<{ assessmentId: string; scores: FacultyScoreEntry[] }> = [];
      for (const ass of activeAssessments) {
        const scores: FacultyScoreEntry[] = [];
        for (const student of activeStudents) {
          const value = currentScores[student.id]?.[ass.id] ?? '';
          const stored = assessmentScores.find(score => score.assessmentId === ass.id && score.studentId === student.id);
          if (!validateSingleScore(value, ass.maxScore)) throw new Error('Some scores in the matrix are invalid (exceed max score or negative).');
          if (value === '' && stored) {
            scores.push({ studentId: student.id, score: null, remarks: stored.remarks || '' });
            cleared.push({ studentId: student.id, assessmentId: ass.id, score: String(stored.score) });
          } else if (value !== '') {
            scores.push({ studentId: student.id, score: Number(value), remarks: stored?.remarks || '' });
            saveCount++;
          }
        }
        if (scores.length > 0) batches.push({ assessmentId: ass.id, scores });
      }
      if (isManual || cleared.length > 0) {
        const confirmed = await requestConfirmation(
          `Save ${saveCount} score(s)${cleared.length > 0 ? ` and clear ${cleared.length}` : ''} across ${batches.length} assessment(s)? All changes are saved together or not at all.`,
          'Save scores'
        );
        if (!confirmed) {
          const restored = { ...matrixScoresRef.current };
          cleared.forEach(cell => {
            if (restored[cell.studentId]?.[cell.assessmentId] === '') {
              restored[cell.studentId] = { ...restored[cell.studentId], [cell.assessmentId]: cell.score };
            }
          });
          matrixScoresRef.current = restored;
          setMatrixScoresState(restored);
          matrixDirtyRef.current = JSON.stringify(restored) !== JSON.stringify(matrixSavedRef.current);
          setMatrixSaveStatus(matrixDirtyRef.current ? 'idle' : 'saved');
          return;
        }
      }
      if (batches.length > 0) {
        await saveFacultyScoreBatchesApi(batches);
        batches.forEach(batch => saveAssessmentScores(batch.assessmentId, batch.scores));
        const targetClassId = selectedClassId || availableClasses[0]?.id;
        if (targetClassId) await refreshPersistedGrades(targetClassId);
        setMatrixRefreshKey(key => key + 1);
      }
      matrixSavedRef.current = currentScores;
      matrixDirtyRef.current = JSON.stringify(matrixScoresRef.current) !== JSON.stringify(currentScores);
      setMatrixSaveStatus(matrixDirtyRef.current ? 'idle' : 'saved');
      setIsMatrixSavedAlert(!matrixDirtyRef.current);
      if (isManual) showFeedback(`Saved ${saveCount} grades across matrix successfully!`, 'success');
    } catch (requestError) {
      setMatrixSaveStatus('error');
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to save the score matrix. Nothing was saved.', 'error');
    } finally {
      matrixSavingRef.current = false;
      if (matrixQueuedRef.current) {
        matrixQueuedRef.current = false;
        if (matrixDirtyRef.current && autoSaveRef.current) void matrixSaveRef.current();
      }
    }
  };
  matrixSaveRef.current = performSaveMatrixScores;

  const handleMatrixScoreChange = (studentId: string, assessmentId: string, value: string) => {
    const next = {
      ...matrixScoresRef.current,
      [studentId]: { ...(matrixScoresRef.current[studentId] || {}), [assessmentId]: value },
    };
    matrixScoresRef.current = next;
    matrixDirtyRef.current = JSON.stringify(next) !== JSON.stringify(matrixSavedRef.current);
    setMatrixScoresState(next);
    if (!matrixSavingRef.current) setMatrixSaveStatus(matrixDirtyRef.current ? 'idle' : 'saved');
    setIsMatrixSavedAlert(false);
  };

  const handleMatrixScoreBlur = async () => {
    if (autoSaveRef.current && (matrixDirtyRef.current || matrixSavingRef.current)) await matrixSaveRef.current();
  };

  const handleSaveMatrixScores = async () => {
    await matrixSaveRef.current(true);
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

  const handleResetScoresInput = () => {
    if (!selectedAssessmentId || singleSavingRef.current) return;
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
    singleScoresRef.current = initialInputs;
    singleSavedRef.current = initialInputs;
    singleDirtyRef.current = false;
    setSingleSaveStatus('saved');
    setScoresInputState(initialInputs);
    setIsScoresSavedAlert(false);
  };

  // Filter roster for scores entry (default sorted alphabetically by last name)
  const filteredScoreStudents = useMemo(() => {
    const list = activeStudents.filter(s =>
      s.name.toLowerCase().includes(scoreSearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(scoreSearch.toLowerCase())
    );
    return sortStudentsByLastName(list);
  }, [activeStudents, scoreSearch]);

  // ----------------------------------------------------
  // 3. GRADE WEIGHTS EDITOR STATE (AUTHORITATIVE BACKEND)
  // ----------------------------------------------------
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);
  const [firstSaveAssignmentError, setFirstSaveAssignmentError] = useState<FacultyGradingCategoryAssignmentRequiredItem[] | null>(null);
  // Categories Faculty pick by hand for existing assessments that could not be linked by name.
  const [assessmentAssignments, setAssessmentAssignments] = useState<Record<number, string>>({});
  const [conversionMappingError, setConversionMappingError] = useState<FacultyGradingCategoryPeriodMappingRequiredItem[] | null>(null);
  const [componentMappingError, setComponentMappingError] = useState<FacultyGradingComponentMappingRequiredItem[] | null>(null);
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

  const handlePrepareOverallPeriodConversion = () => {
    setSchemaMode('periods');
    setComponentMode('lecture_laboratory');
    setSavedComponentMode('lecture_laboratory');
    setComponentWeights({ lecture: '60', laboratory: '40' });
    setSavedComponentWeights({ lecture: '60', laboratory: '40' });
    setActiveComponentEditorTab('Lecture');
    setActivePeriodEditorTab('Midterm');
    setIsPresetDraft(false);
    setIsConversionModalOpen(false);
  };

  // Keep selected offering key synchronized with the active course filter
  useEffect(() => {
    if (facultyOfferings.length === 0) return;
    const match = facultyOfferings.find(o => o.courseCode === selectedSubjectCode);
    if (match) {
      if (selectedOfferingKey !== match.key) {
        setSelectedOfferingKey(match.key);
      }
    } else if (!selectedOfferingKey || !facultyOfferings.some(o => o.key === selectedOfferingKey)) {
      setSelectedOfferingKey(facultyOfferings[0].key);
    }
  }, [facultyOfferings, selectedSubjectCode, selectedOfferingKey]);

  const currentOffering = useMemo(() => {
    return facultyOfferings.find(o => o.key === selectedOfferingKey) || null;
  }, [facultyOfferings, selectedOfferingKey]);

  const loadGradingConfig = async (offering: FacultyOffering) => {
    setConfigLoading(true);
    setConfigError(null);
    setConflictError(false);
    setFirstSaveAssignmentError(null);
    setConversionMappingError(null);
    setComponentMappingError(null);
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
        const defaults = res.defaults;
        const fallback = buildDefaultPeriodDraft();
        setComponentMode(defaults?.componentMode ?? 'lecture_laboratory');
        setSavedComponentMode(defaults?.componentMode ?? 'lecture_laboratory');
        const initialComponentWeights = defaults?.componentWeights
          ? { lecture: String(defaults.componentWeights.lecture), laboratory: String(defaults.componentWeights.laboratory) }
          : fallback.componentWeights;
        setComponentWeights(initialComponentWeights);
        setSavedComponentWeights(initialComponentWeights);
        setActiveComponentEditorTab('Lecture');
        setIsPresetDraft(true);

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
            sourceKind: c.sourceKind ?? 'assessment',
            component: c.component,
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
            sourceKind: c.sourceKind ?? 'assessment',
            component: c.component,
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
        const loadedComponentMode = res.configuration.componentMode ?? 'combined';
        setComponentMode(loadedComponentMode);
        setSavedComponentMode(loadedComponentMode);
        const loadedComponentWeights = {
          lecture: String(res.configuration.componentWeights?.lecture ?? 60),
          laboratory: String(res.configuration.componentWeights?.laboratory ?? 40),
        };
        setComponentWeights(loadedComponentWeights);
        setSavedComponentWeights(loadedComponentWeights);
        setActiveComponentEditorTab('Lecture');

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
            midterm: String(res.configuration.termRatio?.midterm ?? 30),
            final: String(res.configuration.termRatio?.final ?? 70),
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
            defaultMax: (c.name.toLowerCase().includes('exam') || c.name.toLowerCase().includes('attendance') || c.name.toLowerCase().includes('lab')) ? '100' : '50',
            sortOrder: c.sortOrder ?? (idx + 1),
            gradingPeriod: 'Midterm' as const,
            sourceKind: c.sourceKind ?? (c.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment'),
            component: c.component ?? undefined,
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
            defaultMax: (c.name.toLowerCase().includes('exam') || c.name.toLowerCase().includes('attendance') || c.name.toLowerCase().includes('lab')) ? '100' : '50',
            sortOrder: c.sortOrder ?? (idx + 1),
            gradingPeriod: 'Final' as const,
            sourceKind: c.sourceKind ?? (c.name.toLowerCase() === 'attendance' ? 'attendance' : 'assessment'),
            component: c.component ?? undefined,
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
    if (componentMode !== savedComponentMode) return true;
    if (componentMode === 'lecture_laboratory' && (componentWeights.lecture !== savedComponentWeights.lecture || componentWeights.laboratory !== savedComponentWeights.laboratory)) return true;
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
      if (c.name !== s.name || c.weight !== s.weight || c.sortOrder !== s.sortOrder || c.id !== s.id || c.sourceKind !== s.sourceKind || (componentMode === 'lecture_laboratory' && c.component !== s.component)) {
        return true;
      }
    }
    if (finalCategories.length !== savedFinalCategories.length) return true;
    for (let i = 0; i < finalCategories.length; i++) {
      const c = finalCategories[i];
      const s = savedFinalCategories[i];
      if (c.name !== s.name || c.weight !== s.weight || c.sortOrder !== s.sortOrder || c.id !== s.id || c.sourceKind !== s.sourceKind || (componentMode === 'lecture_laboratory' && c.component !== s.component)) {
        return true;
      }
    }
    return false;
  }, [componentMode, savedComponentMode, componentWeights, savedComponentWeights, termRatio, savedTermRatio, attendanceDateRanges, savedAttendanceDateRanges, midtermCategories, savedMidtermCategories, finalCategories, savedFinalCategories]);

  const isDirty = schemaMode === 'overall' ? isOverallDirty : isPeriodDirty;
  const isLegacyCombinedPeriodConfig = loadedConfig?.schemaMode === 'periods'
    && loadedConfig.componentMode !== 'lecture_laboratory'
    && componentMode === 'combined';
  const isOverallPeriodConversionDraft = loadedConfig?.schemaMode === 'overall' && schemaMode === 'periods';

  const handleSelectOffering = async (newKey: string): Promise<boolean> => {
    if (newKey === selectedOfferingKey) return true;
    if (isDirty) {
      const confirmed = await requestConfirmation(
        'You have unsaved changes to grade weights. Switching courses will discard them. Continue?',
        'Discard unsaved changes?'
      );
      if (!confirmed) return false;
    }
    // Clear all period state before loading new offering so one offering's preset cannot leak into another
    setLoadedConfig(null);
    setCategoryRows([]);
    setSavedCategoryRows([]);
    setMidtermCategories([]);
    setSavedMidtermCategories([]);
    setFinalCategories([]);
    setSavedFinalCategories([]);
    setComponentMode('lecture_laboratory');
    setSavedComponentMode('lecture_laboratory');
    setComponentWeights({ lecture: '60', laboratory: '40' });
    setSavedComponentWeights({ lecture: '60', laboratory: '40' });
    setActiveComponentEditorTab('Lecture');
    setAttendanceDateRanges({ midterm: { startDate: '', endDate: '' }, final: { startDate: '', endDate: '' } });
    setSavedAttendanceDateRanges({ midterm: { startDate: '', endDate: '' }, final: { startDate: '', endDate: '' } });
    setFirstSaveAssignmentError(null);
    setConversionMappingError(null);
    setComponentMappingError(null);
    setConflictError(false);
    setSelectedOfferingKey(newKey);
    return true;
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

  const handleRemoveCategory = async (tempId: string) => {
    const target = categoryRows.find(r => r.tempId === tempId);
    if (!target) return;
    if (target.inUse) {
      showFeedback('Cannot remove category that has associated assessments.', 'error');
      return;
    }
    if (!await requestConfirmation(`Remove the "${target.name || 'unnamed'}" category? It is removed when you save the grade weights.`, 'Remove category')) return;
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
      return `Total weights must equal exactly 100%. Current total: ${weightCalculation.displayPercent}.`;
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

  const handleUpdateComponentWeight = (field: 'lecture' | 'laboratory', val: string) => {
    const num = Number(val);
    if (val.trim() !== '' && Number.isFinite(num) && num >= 0 && num <= 100) {
      const other = Math.round((100 - num) * 10000) / 10000;
      setComponentWeights(field === 'lecture'
        ? { lecture: val, laboratory: String(other) }
        : { lecture: String(other), laboratory: val });
    } else {
      setComponentWeights(prev => ({ ...prev, [field]: val }));
    }
  };

  const handleStartLectureLaboratoryConversion = () => {
    if (!isLegacyCombinedPeriodConfig) return;
    setComponentMode('lecture_laboratory');
    setActiveComponentEditorTab('Lecture');
    // Existing category records keep their names, IDs, and weights; component mapping is explicit.
    setMidtermCategories(rows => rows.map(row => ({ ...row, component: undefined })));
    setFinalCategories(rows => rows.map(row => ({ ...row, component: undefined })));
    setComponentMappingError(null);
    setAssessmentAssignments({});
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
    const periodRows = period === 'Midterm' ? midtermCategories : finalCategories;
    const sameComponentRows = componentMode === 'lecture_laboratory'
      ? periodRows.filter(row => row.component === activeComponentEditorTab)
      : periodRows;
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newRow: PeriodCategoryDraftRow = {
      compositeKey: buildRowCompositeKey(period, null, tempId),
      tempId,
      name: '',
      weight: '',
      defaultMax: '50',
      sortOrder: sameComponentRows.length + 1,
      gradingPeriod: period,
      sourceKind: 'assessment',
      ...(componentMode === 'lecture_laboratory' ? { component: activeComponentEditorTab } : {}),
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
    field: 'name' | 'weight' | 'defaultMax',
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

  const handleUpdatePeriodCategoryComponent = (period: 'Midterm' | 'Final', compositeKey: string, component: GradingComponentEnum | '') => {
    const updateList = (list: PeriodCategoryDraftRow[]) => list.map(row => {
      if (row.compositeKey !== compositeKey) return row;
      return { ...row, component: component || undefined };
    });
    if (period === 'Midterm') setMidtermCategories(updateList);
    else setFinalCategories(updateList);
  };

  const handleUpdatePeriodCategorySourceKind = (period: 'Midterm' | 'Final', compositeKey: string, sourceKind: GradingSourceKindEnum) => {
    const updateList = (list: PeriodCategoryDraftRow[]) => list.map(row => {
      if (row.compositeKey !== compositeKey) return row;
      return { ...row, sourceKind };
    });
    if (period === 'Midterm') setMidtermCategories(updateList);
    else setFinalCategories(updateList);
  };

  const handleMovePeriodCategory = (period: 'Midterm' | 'Final', index: number, direction: 'up' | 'down') => {
    const list = period === 'Midterm' ? midtermCategories : finalCategories;
    const reorderable = componentMode === 'lecture_laboratory'
      ? list.filter(row => row.component === activeComponentEditorTab)
      : list;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= reorderable.length) return;
    const firstKey = reorderable[index].compositeKey;
    const secondKey = reorderable[targetIndex].compositeKey;
    const next = [...reorderable];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    const newSortOrder = new Map(next.map((row, idx) => [row.compositeKey, idx + 1]));
    let reordered: PeriodCategoryDraftRow[];
    if (componentMode === 'lecture_laboratory') {
      let componentIndex = 0;
      reordered = list.map(row => {
        if (row.component !== activeComponentEditorTab) return row;
        const reorderedRow = next[componentIndex++];
        return { ...reorderedRow, sortOrder: newSortOrder.get(reorderedRow.compositeKey)! };
      });
    } else {
      reordered = next.map((row, idx) => ({ ...row, sortOrder: idx + 1 }));
    }
    // Keep unassigned rows and the other component's ordering unchanged.
    if (firstKey === secondKey) return;
    if (period === 'Midterm') {
      setMidtermCategories(reordered);
    } else {
      setFinalCategories(reordered);
    }
  };

  const handleRemovePeriodCategory = async (period: 'Midterm' | 'Final', compositeKey: string) => {
    const list = period === 'Midterm' ? midtermCategories : finalCategories;
    const target = list.find(r => r.compositeKey === compositeKey);
    if (!target) return;
    if (target.inUse) {
      showFeedback('Cannot remove category that has associated assessments.', 'error');
      return;
    }
    if (!await requestConfirmation(`Remove the "${target.name || 'unnamed'}" ${period} category? It is removed when you save the grade weights.`, 'Remove category')) return;
    const filtered = list.filter(r => r.compositeKey !== compositeKey);
    if (period === 'Midterm') {
      setMidtermCategories(filtered);
    } else {
      setFinalCategories(filtered);
    }
  };

  const midtermCalc = useMemo(() => {
    if (componentMode === 'combined') return calculateCategoryWeightSummary(midtermCategories);
    const lecture = calculateCategoryWeightSummary(midtermCategories.filter(row => row.component === 'Lecture'));
    const laboratory = calculateCategoryWeightSummary(midtermCategories.filter(row => row.component === 'Laboratory'));
    const hasUnassigned = midtermCategories.some(row => !row.component);
    return {
      sumUnits: lecture.sumUnits + laboratory.sumUnits,
      allValid: lecture.allValid && laboratory.allValid && !hasUnassigned,
      isExact100: lecture.isExact100 && laboratory.isExact100 && !hasUnassigned,
      displayPercent: `Lecture ${lecture.displayPercent} / Laboratory ${laboratory.displayPercent}`,
    };
  }, [componentMode, midtermCategories]);

  const finalCalc = useMemo(() => {
    if (componentMode === 'combined') return calculateCategoryWeightSummary(finalCategories);
    const lecture = calculateCategoryWeightSummary(finalCategories.filter(row => row.component === 'Lecture'));
    const laboratory = calculateCategoryWeightSummary(finalCategories.filter(row => row.component === 'Laboratory'));
    const hasUnassigned = finalCategories.some(row => !row.component);
    return {
      sumUnits: lecture.sumUnits + laboratory.sumUnits,
      allValid: lecture.allValid && laboratory.allValid && !hasUnassigned,
      isExact100: lecture.isExact100 && laboratory.isExact100 && !hasUnassigned,
      displayPercent: `Lecture ${lecture.displayPercent} / Laboratory ${laboratory.displayPercent}`,
    };
  }, [componentMode, finalCategories]);

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
      return `Term ratio weights must equal 100% (Current: ${termRatioCalc.displayPercent}).`;
    }

    if (componentMode === 'lecture_laboratory') {
      const lectureUnits = parseWeightUnits(componentWeights.lecture.trim());
      const laboratoryUnits = parseWeightUnits(componentWeights.laboratory.trim());
      if (lectureUnits === null || laboratoryUnits === null || lectureUnits + laboratoryUnits !== TOTAL_WEIGHT_UNITS) {
        return 'Lecture and Laboratory contribution weights must be positive and total exactly 100%.';
      }
    }

    const validateCategories = (
      label: 'Midterm' | 'Finals',
      rows: PeriodCategoryDraftRow[],
      calculation: CategoryWeightSummary
    ): string | null => {
      if (rows.length === 0) return `At least one ${label} category is required.`;
      if (rows.some(row => !row.name.trim())) return `All ${label} category names must be filled out.`;
      if (rows.filter(row => row.sourceKind === 'attendance').length > 1) {
        return 'Each period may contain only one authoritative Attendance category.';
      }

      const groups: Array<{ label: string; rows: PeriodCategoryDraftRow[]; calculation: CategoryWeightSummary }> = componentMode === 'lecture_laboratory'
        ? (['Lecture', 'Laboratory'] as const).map(component => {
          const componentRows = rows.filter(row => row.component === component);
          return {
            label: `${label} ${component}`,
            rows: componentRows,
            calculation: calculateCategoryWeightSummary(componentRows),
          };
        })
        : [{ label, rows, calculation }];

      if (componentMode === 'lecture_laboratory' && rows.some(row => !row.component)) {
        return `Assign every existing ${label} category to Lecture or Laboratory before saving.`;
      }

      for (const group of groups) {
        if (group.rows.length === 0) return `At least one ${group.label} category is required.`;
        const names = group.rows.map(row => row.name.trim().toLowerCase());
        if (new Set(names).size !== names.length) {
          return `${group.label} category names must be unique within this component and period.`;
        }
        for (const row of group.rows) {
          if (parseWeightUnits(row.weight.trim()) === null) {
            return `Invalid ${group.label} weight "${row.weight}". Enter a positive number between 0 and 100 with up to 4 decimal places.`;
          }
        }
        if (!group.calculation.isExact100) {
          return `${group.label} category weights must equal 100% (Current: ${group.calculation.displayPercent}).`;
        }
      }
      return null;
    };

    const midtermError = validateCategories('Midterm', midtermCategories, midtermCalc);
    if (midtermError) return midtermError;
    const finalError = validateCategories('Finals', finalCategories, finalCalc);
    if (finalError) return finalError;

    const dateVal = validateDateRanges(attendanceDateRanges);
    if (!dateVal.valid) {
      return dateVal.error || 'Attendance date ranges are invalid.';
    }

    return null;
  }, [termRatioCalc, componentMode, componentWeights, midtermCategories, finalCategories, midtermCalc, finalCalc, attendanceDateRanges]);

  const categoriesForPeriod = (period: 'Midterm' | 'Final') => period === 'Midterm' ? midtermCategories : finalCategories;

  const assignmentSelectionForItem = (item: { assessmentId: number; gradingPeriod?: 'Midterm' | 'Final' | null; categoryId?: number | null; component?: GradingComponentEnum | null }) => {
    const chosen = assessmentAssignments[item.assessmentId];
    if (chosen) return chosen;
    if (!item.gradingPeriod) return '';
    if (componentMode === 'lecture_laboratory' && item.categoryId && item.component) {
      return categoriesForPeriod(item.gradingPeriod === 'Final' ? 'Final' : 'Midterm')
        .find(row => row.id === item.categoryId && row.component === item.component)?.compositeKey ?? '';
    }
    return '';
  };

  const assignmentOptionsForItem = (item: { gradingPeriod?: 'Midterm' | 'Final' | null }) => {
    if (schemaMode === 'overall') {
      return categoryRows.filter(row => row.name.trim()).map(row => ({ value: row.name.trim(), label: row.name.trim() }));
    }
    const periods: Array<'Midterm' | 'Final'> = item.gradingPeriod
      ? [item.gradingPeriod]
      : ['Midterm', 'Final'];
    const categories = periods.flatMap(period => categoriesForPeriod(period)
      .filter(row => row.name.trim() && row.sourceKind !== 'attendance')
      .map(row => ({ row, period })));
    if (componentMode === 'lecture_laboratory') {
      return categories.filter(({ row }) => row.component).map(({ row, period }) => ({
        value: item.gradingPeriod ? row.compositeKey : `period:${period}:${row.compositeKey}`,
        label: `${item.gradingPeriod ? '' : `${period} · `}${row.component} · ${row.name.trim()}`,
      }));
    }
    return categories.map(({ row, period }) => ({
      value: item.gradingPeriod ? row.name.trim() : `period:${period}:${row.compositeKey}`,
      label: item.gradingPeriod ? row.name.trim() : `${period} · ${row.name.trim()}`,
    }));
  };

  const getPendingAssessmentAssignments = (): NonNullable<FacultyGradingConfigSavePayload['assessmentAssignments']> => {
    const itemsById = new Map<number, FacultyGradingCategoryAssignmentRequiredItem | FacultyGradingComponentMappingRequiredItem>();
    for (const item of [...(firstSaveAssignmentError ?? []), ...(componentMappingError ?? [])]) itemsById.set(item.assessmentId, item);
    const assignments: NonNullable<FacultyGradingConfigSavePayload['assessmentAssignments']> = [];
    for (const item of itemsById.values()) {
      const selection = assignmentSelectionForItem(item);
      if (!selection) continue;
      if (componentMode !== 'lecture_laboratory') {
        if (!item.gradingPeriod) {
          const parsed = selection.match(/^period:(Midterm|Final):(.*)$/);
          if (!parsed) continue;
          const period = parsed[1] as 'Midterm' | 'Final';
          const target = categoriesForPeriod(period).find(row => row.compositeKey === parsed[2]);
          if (!target) continue;
          assignments.push({ assessmentId: item.assessmentId, categoryName: target.name.trim(), gradingPeriod: period });
        } else {
          assignments.push({ assessmentId: item.assessmentId, categoryName: selection });
        }
        continue;
      }
      let period: 'Midterm' | 'Final' = item.gradingPeriod === 'Final' ? 'Final' : 'Midterm';
      let targetSelection = selection;
      if (!item.gradingPeriod) {
        const parsed = selection.match(/^period:(Midterm|Final):(.*)$/);
        if (!parsed) continue;
        period = parsed[1] as 'Midterm' | 'Final';
        targetSelection = parsed[2];
      }
      const target = categoriesForPeriod(period).find(row => row.compositeKey === targetSelection);
      if (!target?.component) continue;
      assignments.push({
        assessmentId: item.assessmentId,
        ...(target.id ? { categoryId: target.id } : { categoryName: target.name.trim() }),
        gradingPeriod: period,
        component: target.component,
      });
    }
    return assignments;
  };

  const assessmentMappingItems = [
    ...(firstSaveAssignmentError ?? []),
    ...(componentMappingError ?? []),
  ];

  const handleSaveGradingConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentOffering) return;
    if (configSaving) return;
    if (isLegacyCombinedPeriodConfig) {
      showFeedback('Choose Convert to Lecture/Laboratory before changing this saved period configuration.', 'error');
      return;
    }

    if (schemaMode === 'overall') {
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

    const isForwardGroupedConversion = loadedConfig?.schemaMode === 'periods'
      && loadedConfig.componentMode !== 'lecture_laboratory'
      && componentMode === 'lecture_laboratory';
    const isOverallConversion = isOverallPeriodConversionDraft;
    const confirmed = await requestConfirmation(
      isForwardGroupedConversion
        ? 'Convert this saved combined period configuration to Lecture/Laboratory grading? Existing category IDs, assessment links, scores, history, and saved grades will be preserved. Assign every category to a component, set both component lists to 100%, and resolve any assessment mappings. This conversion cannot be reversed.'
        : isOverallConversion
          ? 'Convert this saved overall configuration to Lecture/Laboratory period grading? Existing category IDs, scores, history, and saved grades will be preserved. Assign every category to a component and set both component lists to 100% before saving.'
          : 'Save these grade weights? Grades for this course are computed with the saved weights.',
      isForwardGroupedConversion || isOverallConversion ? 'Confirm forward grading conversion' : 'Save grade weights'
    );
    if (!confirmed) return;

    setConfigSaving(true);
    setConfigError(null);
    setConflictError(false);
    const pendingAssignments = getPendingAssessmentAssignments();
    setFirstSaveAssignmentError(null);
    setConversionMappingError(null);
    setComponentMappingError(null);

    let payload: FacultyGradingConfigSavePayload;

    if (schemaMode === 'overall') {
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
          sortOrder: componentMode === 'lecture_laboratory'
            ? midtermCategories.filter(row => row.component === c.component).findIndex(row => row.compositeKey === c.compositeKey) + 1
            : idx + 1,
          gradingPeriod: 'Midterm',
          sourceKind: c.sourceKind,
          ...(componentMode === 'lecture_laboratory' && c.component ? { component: c.component } : {}),
        })),
        finalCategories: finalCategories.map((c, idx) => ({
          ...(c.id ? { id: c.id } : {}),
          name: c.name.trim(),
          weight: c.weight.trim(),
          sortOrder: componentMode === 'lecture_laboratory'
            ? finalCategories.filter(row => row.component === c.component).findIndex(row => row.compositeKey === c.compositeKey) + 1
            : idx + 1,
          gradingPeriod: 'Final',
          sourceKind: c.sourceKind,
          ...(componentMode === 'lecture_laboratory' && c.component ? { component: c.component } : {}),
        })),
        attendanceDateRanges: normalizeDateRangesForPayload(attendanceDateRanges),
        ...(componentMode === 'lecture_laboratory' ? {
          componentMode,
          componentWeights: {
            lecture: Number(componentWeights.lecture),
            laboratory: Number(componentWeights.laboratory),
          },
        } : {}),
      };
      if (loadedConfig?.version !== undefined && loadedConfig.version !== null) {
        payload.version = loadedConfig.version;
      }
      if (isOverallConversion) {
        payload.convertFromOverall = true;
      }
      if (componentMode === 'lecture_laboratory' && (
        loadedConfig?.schemaMode === 'overall'
        || (loadedConfig?.schemaMode === 'periods' && loadedConfig.componentMode !== 'lecture_laboratory')
      )) {
        payload.convertToLectureLaboratory = true;
      }
    }
    if (pendingAssignments.length > 0) {
      payload.assessmentAssignments = pendingAssignments;
    }

    try {
      const res = await saveFacultyGradingConfigApi(payload);
      setLoadedConfig(res.configuration);
      setIsPresetDraft(false);
      setSchemaMode(res.configuration.schemaMode ?? 'periods');
      const persistedComponentMode = res.configuration.schemaMode === 'periods' ? 'lecture_laboratory' : 'combined';
      setComponentMode(persistedComponentMode);
      setSavedComponentMode(persistedComponentMode);
      const persistedComponentWeights = {
        lecture: String(res.configuration.componentWeights?.lecture ?? 60),
        laboratory: String(res.configuration.componentWeights?.laboratory ?? 40),
      };
      setComponentWeights(persistedComponentWeights);
      setSavedComponentWeights(persistedComponentWeights);

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
          component: c.component ?? undefined,
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
          component: c.component ?? undefined,
          inUse: Boolean(c.inUse),
        }));
        setFinalCategories(fRows);
        setSavedFinalCategories(fRows);

        if (isOverallConversion) {
          setIsConversionModalOpen(false);
        }
      }
      setAssessmentAssignments({});
      setComponentMappingError(null);
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
        } else if (err.status === 422 && err.code === 'GRADING_COMPONENT_MAPPING_REQUIRED') {
          const assessments = (Array.isArray(err.details?.assessments) ? err.details.assessments : []) as FacultyGradingComponentMappingRequiredItem[];
          setComponentMappingError(assessments);
          showFeedback(err.message || 'Existing assessments require Lecture/Laboratory category mappings.', 'error');
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

  const isLectureLaboratoryMode = useMemo(() => {
    if (loadedConfig?.componentMode === 'lecture_laboratory' || assessmentConfig?.componentMode === 'lecture_laboratory') return true;
    for (const result of computeResultsByEnrollment.values()) {
      if (isPeriodComputeResult(result) && (result.periods.midterm.components || result.periods.final.components)) return true;
    }
    return activeStudents.some(student => {
      const subject = student.enrolledSubjects.find(item => item.code === selectedSubjectCode);
      const periods = (subject?.components as Record<string, unknown> | undefined)?.periods as Record<string, unknown> | undefined;
      const midterm = periods?.midterm as Record<string, unknown> | undefined;
      const final = periods?.final as Record<string, unknown> | undefined;
      return Boolean(midterm?.components || final?.components);
    });
  }, [loadedConfig, assessmentConfig, computeResultsByEnrollment, activeStudents, selectedSubjectCode]);

  const sortedSummaryStudents = useMemo(() => {
    const filtered = activeStudents.filter(s =>
      s.name.toLowerCase().includes(summarySearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(summarySearch.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (sortField === 'name') {
        const lastA = getStudentLastName(a).toLowerCase();
        const lastB = getStudentLastName(b).toLowerCase();
        const cmp = lastA.localeCompare(lastB);
        if (cmp !== 0) return sortAsc ? cmp : -cmp;
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
          } else if (res.status === 'weights_required') {
            incompleteReasons.add('Grade weights have not been set up for this course — set them up in the Grade Weights Editor, then recompute');
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
      computeResultsByEnrollment,
      isLectureLaboratoryMode ? 'lecture_laboratory' : 'combined'
    );

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedSubjectCode}_Grade_Summary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    recordAudit({
      action: 'Exported grade PDF',
      module: 'Grade Computation',
      description: `Exported printable PDF grade ledger for ${selectedSubjectCode}.`,
      status: 'Success',
    });
    window.print();
  };

  // ----------------------------------------------------
  // 5. IMPORT GRADE SHEETS TAB STATE
  // ----------------------------------------------------
  const [importPeriod, setImportPeriod] = useState<'Midterm' | 'Final' | 'Overall'>('Midterm');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<{ id: string; name: string; score: number; valid: boolean; error?: string }[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const handleClearCsv = () => {
    setCsvFile(null);
    setCsvPreviewData([]);
    setCsvErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadCsvTemplate = () => {
    const headers = 'Student ID,Score\n';
    const sampleRows = activeStudents.length > 0
      ? activeStudents.map(s => `${s.studentId},`).join('\n')
      : '2024-0001,85\n2024-0002,90\n';
    const blob = new Blob([headers + sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedSubjectCode || 'Course'}_${importPeriod}_Score_Template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showFeedback('Sample CSV score template downloaded.', 'success');
  };

  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

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

  // Helper styles
  const getBadgeColor = (status: string) => {
    if (status === 'critical') return 'bg-rose-50 text-rose-600 dark:bg-rose-950/20';
    if (status === 'warning') return 'bg-amber-50 text-amber-600 dark:bg-amber-950/20';
    if (status === 'remedial') return 'bg-accent-50 text-accent-600 dark:bg-accent-950/20';
    return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20';
  };

  const activePeriodCategories = activePeriodEditorTab === 'Midterm' ? midtermCategories : finalCategories;
  const activePeriodVisibleCategories = componentMode === 'lecture_laboratory'
    ? activePeriodCategories.filter(row => row.component === activeComponentEditorTab)
    : activePeriodCategories;
  const activePeriodUnassignedCategories = componentMode === 'lecture_laboratory'
    ? activePeriodCategories.filter(row => !row.component)
    : [];
  const activeComponentCategoryCalc = calculateCategoryWeightSummary(activePeriodVisibleCategories);

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

      {/* Unified Class and Course Selector Bar for All Tabs */}
      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="w-full md:flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Active Course</label>
          <select
            value={selectedSubjectCode}
            disabled={singleSaveStatus !== 'saved' || matrixSaveStatus !== 'saved'}
            title="Save or reset unsaved scores before changing the score context."
            onChange={async (e) => {
              const newCode = e.target.value;
              const matchOffering = facultyOfferings.find(o => o.courseCode === newCode);
              if (matchOffering && matchOffering.key !== selectedOfferingKey) {
                // Asks before discarding unsaved grade weights and clears the previous course's draft.
                const switched = await handleSelectOffering(matchOffering.key);
                if (!switched) return;
              }
              setSelectedSubjectCode(newCode);
              if (matchOffering) {
                setSelectedOfferingKey(matchOffering.key);
                setSelectedAssessmentOfferingKey(matchOffering.key);
              }
              const matchingClasses = currentYearActiveClasses.filter(c => c.courseCode === newCode);
              if (matchingClasses.length > 0) {
                setSelectedClassId(matchingClasses[0].id);
              } else {
                setSelectedClassId('');
              }
            }}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
          >
            {activeCourses.length === 0 ? (
              <option value="">No active courses for current school year</option>
            ) : (
              activeCourses.map(course => (
                <option key={course.code} value={course.code}>
                  {course.code} - {course.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="w-full md:w-56">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Active Section / Class</label>
          <select
            value={selectedClassId}
            disabled={singleSaveStatus !== 'saved' || matrixSaveStatus !== 'saved'}
            title="Save or reset unsaved scores before changing the score context."
            onChange={(e) => {
              const newClassId = e.target.value;
              setSelectedClassId(newClassId);
              const classItem = currentYearActiveClasses.find(c => c.id === newClassId);
              if (classItem && classItem.courseCode && classItem.courseCode !== selectedSubjectCode) {
                setSelectedSubjectCode(classItem.courseCode);
                const matchOffering = facultyOfferings.find(o => o.courseCode === classItem.courseCode);
                if (matchOffering) {
                  setSelectedOfferingKey(matchOffering.key);
                  setSelectedAssessmentOfferingKey(matchOffering.key);
                }
              }
            }}
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

      {/* Navigation Sub-Tabs */}
      <div className="grid grid-cols-2 gap-1 sm:flex sm:gap-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm">
        <button
          onClick={() => setActiveSubTab('scores')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeSubTab === 'scores' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Student Scores Entry
        </button>
        <button
          onClick={() => setActiveSubTab('assessments')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeSubTab === 'assessments' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
        >
          <FileText className="w-4 h-4" />
          Assessments Manager
        </button>
        <button
          onClick={() => setActiveSubTab('components')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeSubTab === 'components' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
        >
          <Settings className="w-4 h-4" />
          Grade Weights Editor
        </button>
        <button
          onClick={() => setActiveSubTab('summaries')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeSubTab === 'summaries' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
        >
          <Printer className="w-4 h-4" />
          Summaries & Export
        </button>
        <button
          onClick={() => setActiveSubTab('import')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeSubTab === 'import' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
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
                disabled={singleSaveStatus !== 'saved' || matrixSaveStatus !== 'saved'}
                onClick={() => setScoreEntryMode('single')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${scoreEntryMode === 'single'
                  ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
              >
                <List className="w-3.5 h-3.5" />
                Single Activity View
              </button>
              <button
                disabled={singleSaveStatus !== 'saved' || matrixSaveStatus !== 'saved'}
                onClick={() => setScoreEntryMode('matrix')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${scoreEntryMode === 'matrix'
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
            <Card className="p-0">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Grid className="w-4 h-4 text-clinical-550" />
                    Full Gradebook Matrix View
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Edit all course assessments side-by-side in a spreadsheet grid.</p>
                </div>

                <div className="flex items-center gap-2.5">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={autoSaveEnabled} onChange={event => setAutoSaveEnabled(event.target.checked)} />
                    Auto-save
                  </label>
                </div>
              </div>

              {(() => {
                const matrixClass = facultyClasses.find(c => c.id === selectedClassId);
                const matrixOffering = matrixClass && matrixClass.courseId !== undefined && matrixClass.courseId !== null
                  ? { courseId: Number(matrixClass.courseId), semester: matrixClass.semester || '', schoolYear: matrixClass.schoolYear || '' }
                  : null;
                return (
                  <GradebookMatrix
                    classId={selectedClassId}
                    offering={matrixOffering}
                    students={filteredScoreStudents.map(student => ({ id: student.id, studentId: String(student.studentId ?? ''), name: student.name, lastName: student.lastName }))}
                    assessments={activeAssessments}
                    scores={matrixScoresState}
                    onScoreChange={handleMatrixScoreChange}
                    onScoreBlur={handleMatrixScoreBlur}
                    onSingleActivityView={() => setScoreEntryMode('single')}
                    canSwitchView={singleSaveStatus === 'saved' && matrixSaveStatus === 'saved'}
                    isValidScore={validateSingleScore}
                    refreshKey={matrixRefreshKey}
                  />
                );
              })()}
              <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800">
                  <span role="status" aria-live="polite">{matrixSaveStatus === 'saving' ? 'Saving…' : matrixSaveStatus === 'saved' ? 'Saved' : matrixSaveStatus === 'error' ? 'Failed – Retry' : 'Unsaved changes'}</span>
                  {matrixSaveStatus === 'error' && <button type="button" onClick={() => void matrixSaveRef.current(true)} className="text-rose-600 underline">Retry</button>}
                </div>
                <button
                  data-manual-score-save
                  onClick={handleSaveMatrixScores}
                  disabled={matrixSaveStatus === 'saving'}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-bold text-xs shadow-md transition-all active:scale-97 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isMatrixSavedAlert ? 'Saved!' : 'Save All Matrix Scores'}</span>
                </button>
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
                    <div className="space-y-3">
                      {/* Filter Controls Bar */}
                      <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-150 dark:border-slate-800 space-y-2">
                        {/* Period Segmented Pills */}
                        <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setActivityFilterPeriod('all')}
                            className={`flex-1 py-1 text-center rounded-md text-[11px] font-bold transition-all ${
                              activityFilterPeriod === 'all'
                                ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                          >
                            All ({activeAssessments.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setActivityFilterPeriod('Midterm')}
                            className={`flex-1 py-1 text-center rounded-md text-[11px] font-bold transition-all ${
                              activityFilterPeriod === 'Midterm'
                                ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                          >
                            Midterm ({activityMidtermCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setActivityFilterPeriod('Final')}
                            className={`flex-1 py-1 text-center rounded-md text-[11px] font-bold transition-all ${
                              activityFilterPeriod === 'Final'
                                ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                          >
                            Final ({activityFinalCount})
                          </button>
                        </div>

                        {/* Search & Category Row */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search..."
                              value={activityFilterSearch}
                              onChange={(e) => setActivityFilterSearch(e.target.value)}
                              className="w-full pl-8 pr-6 py-1.5 rounded-lg border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
                            />
                            {activityFilterSearch && (
                              <button
                                type="button"
                                onClick={() => setActivityFilterSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <select
                            value={activityFilterType}
                            onChange={(e) => setActivityFilterType(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-clinical-500"
                          >
                            <option value="all">All Categories</option>
                            {availableActivityTypes.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Choose Assessment */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Choose Assessment</label>
                          <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold">
                            {singleActivityFilteredAssessments.length === activeAssessments.length
                              ? `${activeAssessments.length} total`
                              : `${singleActivityFilteredAssessments.length} of ${activeAssessments.length}`}
                          </span>
                        </div>

                        {activeAssessments.length === 0 ? (
                          <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-150 rounded-xl text-xs text-slate-450 text-center">
                            No active assessments. Please create one under "Assessments Manager" first.
                          </div>
                        ) : singleActivityFilteredAssessments.length === 0 ? (
                          <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl text-center space-y-1">
                            <p className="text-xs text-slate-500">No assessments match the active filters.</p>
                            <button
                              type="button"
                              onClick={() => {
                                setActivityFilterPeriod('all');
                                setActivityFilterType('all');
                                setActivityFilterSearch('');
                              }}
                              className="text-[11px] font-bold text-clinical-600 hover:underline"
                            >
                              Reset filters
                            </button>
                          </div>
                        ) : (
                          <select
                            value={selectedAssessmentId}
                            disabled={singleSaveStatus !== 'saved' || matrixSaveStatus !== 'saved'}
                            title="Save or reset unsaved scores before changing the score context."
                            onChange={(e) => setSelectedAssessmentId(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
                          >
                            {singleActivityFilteredAssessments.map((ass) => (
                              <option key={ass.id} value={ass.id}>
                                {activityFilterPeriod === 'all' && ass.gradingPeriod ? `[${ass.gradingPeriod}] ` : ''}
                                {ass.title} ({ass.type || 'Assessment'} • Max: {ass.maxScore})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
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
                <Card className="p-0">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Roster Score Entries</h3>
                      <p className="hidden sm:block text-[10px] text-slate-400 mt-0.5">Use Enter / Down / Up arrow keys to quickly navigate between student score boxes.</p>
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
                                  inputMode="decimal"
                                  min="0"
                                  max={activeAssessment?.maxScore || 100}
                                  placeholder={`0 - ${activeAssessment?.maxScore || 100}`}
                                  value={row.score}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      const next = document.getElementById(`score-input-${idx + 1}`) as HTMLInputElement | null;
                                      if (!next) void handleScoreBlur(student.id);
                                      if (next) {
                                        next.focus();
                                        next.select();
                                      }
                                    } else if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      const prev = document.getElementById(`score-input-${idx - 1}`) as HTMLInputElement | null;
                                      if (!prev) void handleScoreBlur(student.id);
                                      if (prev) {
                                        prev.focus();
                                        prev.select();
                                      }
                                    }
                                  }}
                                  onChange={(e) => handleScoreChange(student.id, e.target.value, 'score')}
                                  onBlur={event => { if (!(event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('[data-manual-score-save]'))) void handleScoreBlur(student.id); }}
                                  className={`w-28 px-3 py-1.5 rounded-xl border text-xs text-center font-bold focus:outline-none ${!isValid
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
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {selectedAssessmentId && filteredScoreStudents.length > 0 && (
                    <div className="sticky bottom-0 z-20 px-3 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex flex-wrap justify-end items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <span role="status" aria-live="polite">{singleSaveStatus === 'saving' ? 'Saving…' : singleSaveStatus === 'saved' ? 'Saved' : singleSaveStatus === 'error' ? 'Failed – Retry' : 'Unsaved changes'}</span>
                        {singleSaveStatus === 'error' && <button type="button" onClick={() => void singleSaveRef.current(true)} className="text-rose-600 underline">Retry</button>}
                      </div>
                      <button
                        data-manual-score-save
                        onClick={handleManualSaveScores}
                        disabled={singleSaveStatus === 'saving'}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-xs shadow-md transition-all active:scale-97 disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
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

          {/* ASSESSMENTS FILTERS TOOLBAR (SINGLE ROW) */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-2.5 flex-nowrap shrink-0">
              {/* Search Box */}
              <div className="relative w-48 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assessment..."
                  value={assessmentSearch}
                  onChange={(e) => setAssessmentSearch(e.target.value)}
                  className="w-full pl-9 pr-7 py-1.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
                />
                {assessmentSearch && (
                  <button
                    onClick={() => setAssessmentSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Grading Period Dropdown */}
              <select
                value={assessmentPeriodFilter}
                onChange={(e) => {
                  const newPeriod = e.target.value as 'all' | 'Midterm' | 'Final';
                  setAssessmentPeriodFilter(newPeriod);
                  if (assessmentCategoryFilter !== 'all' && assessmentConfig?.categories) {
                    const match = assessmentConfig.categories.find(c => String(c.id) === String(assessmentCategoryFilter));
                    if (match && newPeriod !== 'all' && match.gradingPeriod && match.gradingPeriod !== newPeriod) {
                      setAssessmentCategoryFilter('all');
                    }
                  }
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-clinical-500"
              >
                <option value="all">All Periods</option>
                <option value="Midterm">Midterm</option>
                <option value="Final">Final</option>
              </select>

              {/* Category Dropdown (dynamically filtered by selected period) */}
              {assessmentConfig?.categories && assessmentConfig.categories.length > 0 && (
                <select
                  value={assessmentCategoryFilter}
                  onChange={(e) => setAssessmentCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-clinical-500 max-w-[200px] truncate"
                >
                  <option value="all">All Categories</option>
                  {assessmentConfig.categories
                    .filter(c => {
                      if (c.sourceKind === 'attendance') return false;
                      if (assessmentPeriodFilter !== 'all' && c.gradingPeriod && c.gradingPeriod !== assessmentPeriodFilter) {
                        return false;
                      }
                      return true;
                    })
                    .map(cat => (
                      <option key={cat.id} value={String(cat.id)}>
                        {assessmentPeriodFilter === 'all' && cat.gradingPeriod ? `${cat.gradingPeriod}: ` : ''}
                        {cat.component ? `${cat.component} · ` : ''}{cat.name}
                      </option>
                    ))}
                </select>
              )}

              {/* Status Dropdown */}
              <select
                value={assessmentStatusFilter}
                onChange={(e) => setAssessmentStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-clinical-500"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Closed">Closed</option>
              </select>

              {/* Clear Filters Button */}
              {(assessmentSearch || assessmentPeriodFilter !== 'all' || assessmentCategoryFilter !== 'all' || assessmentStatusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setAssessmentSearch('');
                    setAssessmentPeriodFilter('all');
                    setAssessmentCategoryFilter('all');
                    setAssessmentStatusFilter('all');
                  }}
                  className="text-[11px] font-bold text-clinical-600 dark:text-clinical-400 hover:underline px-1.5 py-1 whitespace-nowrap"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0">
              Showing <span className="font-bold text-slate-700 dark:text-slate-200">{filteredAssessments.length}</span> of {activeAssessments.length}
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
                ) : filteredAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-slate-400 font-semibold">
                      No assessments match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredAssessments.map(ass => (
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
                        {ass.transmutationEnabled && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold bg-clinical-50 text-clinical-650 dark:bg-clinical-950/40 dark:text-clinical-400 border border-clinical-200 dark:border-clinical-800">
                              Transmuted ({ass.transmutationMinimumPercentage ?? 50}%–{ass.transmutationMaximumPercentage ?? 100}%)
                            </span>
                            {ass.attendanceSessionDate ? (
                              <span className="text-[9px] text-slate-400 font-mono">
                                Linked: {ass.attendanceSessionDate}
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400">
                                (No attendance link)
                              </span>
                            )}
                          </div>
                        )}
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
                                  {matchedCategory.component ? `${matchedCategory.component} · ${matchedCategory.name}` : matchedCategory.name}
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
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${ass.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-650'
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
        <Card className="p-0 sm:p-6 max-w-4xl mx-auto shadow-sm border border-slate-200/90 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
          <CardHeader className="relative border-b border-slate-100 dark:border-slate-800/80 p-3 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1 sm:pr-24">
                <CardTitle className="text-lg sm:text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
                  <Settings className="w-5 h-5 text-clinical-600 dark:text-clinical-400" />
                  <span>Configure Grading Weights & Schema</span>
                </CardTitle>
                {currentOffering && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    Editing schema for: <span className="font-bold text-clinical-600 dark:text-clinical-400">{currentOffering.courseCode} — {currentOffering.courseName}</span>
                  </p>
                )}
                {currentOffering && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500" data-testid="weights-sections-note">
                    These weights apply to all {currentOffering.sections.length === 1 ? 'sections' : `${currentOffering.sections.length} sections`} of this course ({currentOffering.sectionNames.join(', ')}). The section selector above does not change them.
                  </p>
                )}
                {currentOffering && !configLoading && (
                  <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {schemaMode === 'overall' ? 'Overall Grading (legacy)' : 'Period Grading'}
                    </span>
                    {loadedConfig ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                        Version {loadedConfig.version}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                        Suggested starting preset — unsaved
                      </span>
                    )}
                    {isDirty && loadedConfig && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                        Unsaved Changes
                      </span>
                    )}
                  </div>
                )}
              </div>

              {currentOffering && (
                <div className="self-start sm:absolute sm:top-7 sm:right-7 z-10">
                  <button
                    type="button"
                    onClick={handleReload}
                    disabled={configLoading || configSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 shadow-2xs disabled:opacity-50 cursor-pointer transition-colors"
                    title="Reload latest configuration from server"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${configLoading ? 'animate-spin' : ''}`} />
                    <span>Reload</span>
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-7 space-y-6">

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
            {assessmentMappingItems.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="font-bold">Existing Assessments Require Category Mappings</div>
                    <div className="text-[11px] mt-0.5">
                      {componentMode === 'lecture_laboratory'
                        ? 'Choose the exact Lecture or Laboratory category for each assessment. Existing category IDs and scores remain attached to their current records.'
                        : 'Existing assessments were linked to your new categories by name where possible. Choose a category for each unmatched assessment, then save again.'}
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
                        {componentMode === 'lecture_laboratory' && <th className="px-3 py-2">Period</th>}
                        <th className="px-3 py-2">Assign To Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-500/20">
                      {assessmentMappingItems.map(item => (
                        <tr key={item.assessmentId}>
                          <td className="px-3 py-1.5 font-mono text-[11px]">{item.assessmentId}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-100">{item.title}</td>
                          <td className="px-3 py-1.5">
                            <span className="px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold text-[10px]">
                              {item.legacyType}
                            </span>
                          </td>
                          {componentMode === 'lecture_laboratory' && (
                            <td className="px-3 py-1.5 font-semibold text-slate-800 dark:text-slate-100">{item.gradingPeriod ?? 'Choose period'}</td>
                          )}
                          <td className="px-3 py-1.5">
                            <select
                              aria-label={`Category for ${item.title}`}
                              value={assignmentSelectionForItem(item)}
                              onChange={(e) => setAssessmentAssignments(prev => ({ ...prev, [item.assessmentId]: e.target.value }))}
                              className="px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-xs font-semibold"
                            >
                              <option value="">Choose category…</option>
                              {assignmentOptionsForItem(item).map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
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
              <div className="space-y-6">
                <form onSubmit={handleSaveGradingConfig} className="space-y-6">
                  {/* STATUS / UNSAVED BANNER */}
                  {isDirty ? (
                    <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold">
                        <Edit className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>You have unsaved changes. Adjust weights or categories directly below, then click Save Grade Weights.</span>
                      </div>
                      {loadedConfig && (
                        <button
                          type="button"
                          onClick={handleReload}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-200 font-bold text-xs hover:bg-amber-100/50 transition-colors cursor-pointer shrink-0"
                        >
                          <span>Reset Changes</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 sm:p-3.5 rounded-2xl bg-clinical-50/70 dark:bg-clinical-950/30 border border-clinical-200/80 dark:border-clinical-800/50 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-clinical-800 dark:text-clinical-200 font-semibold">
                        <CheckCircle className="w-4 h-4 text-clinical-600 dark:text-clinical-400 shrink-0" />
                        <span>{loadedConfig ? 'Saved grading' : 'BU syllabus default (unsaved)'}: Midterm {termRatio.midterm}% / Finals {termRatio.final}%{componentMode === 'lecture_laboratory' && <> · Lecture {componentWeights.lecture}% / Laboratory {componentWeights.laboratory}%</>}</span>
                      </div>
                      <span className="text-[11px] font-bold text-clinical-600 dark:text-clinical-400 shrink-0">
                        Directly editable
                      </span>
                    </div>
                  )}

                  {/* LEGACY COMBINED NOTIFICATION (IF APPLICABLE) */}
                  {isLegacyCombinedPeriodConfig && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-300/70 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-xs">
                      <div className="space-y-0.5">
                        <h3 className="font-bold text-amber-900 dark:text-amber-200">Saved combined period grading</h3>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                          This setup remains active until converted. Assign categories to Lecture or Laboratory to apply standard split.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleStartLectureLaboratoryConversion}
                        disabled={configSaving}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-bold text-xs cursor-pointer shadow-xs"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Convert to Lecture/Laboratory</span>
                      </button>
                    </div>
                  )}

                  {/* LEVEL 1: TOPMOST PERIOD TABS (MIDTERM & FINAL WITH INLINE RATIO EDITING) */}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        1. Select Period & Term Split
                      </span>
                      <span className={`text-[11px] font-bold ${termRatioCalc.isExact100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                        Term Split Total: {termRatioCalc.displayPercent}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Midterm Tab */}
                      <div
                        role="button"
                        aria-label="Midterm Categories"
                        tabIndex={0}
                        onClick={() => setActivePeriodEditorTab('Midterm')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActivePeriodEditorTab('Midterm'); }}
                        className={`p-2.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 ${
                          activePeriodEditorTab === 'Midterm'
                            ? 'border-clinical-600 bg-clinical-50/60 dark:bg-clinical-950/40 shadow-sm ring-2 ring-clinical-500/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full shrink-0 ${activePeriodEditorTab === 'Midterm' ? 'bg-clinical-600 ring-4 ring-clinical-200 dark:ring-clinical-900' : 'bg-slate-300 dark:bg-slate-700'}`} />
                          <div>
                            <div className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                              <span>Midterm</span>
                              <span className="text-[11px] font-bold text-slate-400">Categories</span>
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              Midterm Period Weight
                            </p>
                          </div>
                        </div>

                        {/* Inline editable percentage */}
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <div className="relative">
                            <input
                              id="midterm-ratio-input"
                              type="number"
                              min="0"
                              max="100"
                              value={termRatio.midterm}
                              disabled={isLegacyCombinedPeriodConfig}
                              onChange={(e) => {
                                handleUpdateTermRatio('midterm', e.target.value);
                              }}
                              className="w-16 sm:w-20 pl-2.5 pr-6 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-extrabold text-xs sm:text-sm text-right focus:outline-none focus:ring-2 focus:ring-clinical-500 shadow-2xs"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                          </div>
                        </div>
                      </div>

                      {/* Finals Tab */}
                      <div
                        role="button"
                        aria-label="Finals Categories"
                        tabIndex={0}
                        onClick={() => setActivePeriodEditorTab('Final')}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActivePeriodEditorTab('Final'); }}
                        className={`p-2.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 ${
                          activePeriodEditorTab === 'Final'
                            ? 'border-clinical-600 bg-clinical-50/60 dark:bg-clinical-950/40 shadow-sm ring-2 ring-clinical-500/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full shrink-0 ${activePeriodEditorTab === 'Final' ? 'bg-clinical-600 ring-4 ring-clinical-200 dark:ring-clinical-900' : 'bg-slate-300 dark:bg-slate-700'}`} />
                          <div>
                            <div className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                              <span>Finals</span>
                              <span className="text-[11px] font-bold text-slate-400">Categories</span>
                            </div>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              Finals Period Weight
                            </p>
                          </div>
                        </div>

                        {/* Inline editable percentage */}
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <div className="relative">
                            <input
                              id="final-ratio-input"
                              type="number"
                              min="0"
                              max="100"
                              value={termRatio.final}
                              disabled={isLegacyCombinedPeriodConfig}
                              onChange={(e) => {
                                handleUpdateTermRatio('final', e.target.value);
                              }}
                              className="w-16 sm:w-20 pl-2.5 pr-6 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-extrabold text-xs sm:text-sm text-right focus:outline-none focus:ring-2 focus:ring-clinical-500 shadow-2xs"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* LEVEL 2: COMPONENT SUB-TABS (LECTURE & LABORATORY WITH INLINE CONTRIBUTION EDITING) */}
                  {componentMode === 'lecture_laboratory' && (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          2. {activePeriodEditorTab === 'Midterm' ? 'Midterm' : 'Finals'} Component Contribution
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          Lecture {componentWeights.lecture}% + Lab {componentWeights.laboratory}% = 100%
                        </span>
                      </div>

                      <div
                        role="tablist"
                        aria-label="Grading component categories"
                        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                      >
                        {/* Lecture Sub-Tab */}
                        <div
                          role="tab"
                          aria-label="Lecture Categories"
                          aria-selected={activeComponentEditorTab === 'Lecture'}
                          tabIndex={0}
                          onClick={() => setActiveComponentEditorTab('Lecture')}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveComponentEditorTab('Lecture'); }}
                          className={`p-2.5 sm:p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 ${
                            activeComponentEditorTab === 'Lecture'
                              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20 shadow-xs'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeComponentEditorTab === 'Lecture' ? 'bg-emerald-500 ring-3 ring-emerald-200 dark:ring-emerald-900' : 'bg-slate-300 dark:bg-slate-700'}`} />
                            <div>
                              <div className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1">
                                <span>Lecture</span>
                                <span className="text-[10px] font-semibold text-slate-400">Categories</span>
                              </div>
                              <label htmlFor="lecture-component-weight" className="text-[10px] text-slate-400 dark:text-slate-500">Lecture contribution (%)</label>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="relative">
                              <input
                                id="lecture-component-weight"
                                type="text"
                                value={componentWeights.lecture}
                                onChange={(e) => {
                                  handleUpdateComponentWeight('lecture', e.target.value);
                                }}
                                className="w-14 sm:w-16 pl-2 pr-5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-extrabold text-xs text-right focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">%</span>
                            </div>
                          </div>
                        </div>

                        {/* Laboratory Sub-Tab */}
                        <div
                          role="tab"
                          aria-label="Laboratory Categories"
                          aria-selected={activeComponentEditorTab === 'Laboratory'}
                          tabIndex={0}
                          onClick={() => setActiveComponentEditorTab('Laboratory')}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveComponentEditorTab('Laboratory'); }}
                          className={`p-2.5 sm:p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 ${
                            activeComponentEditorTab === 'Laboratory'
                              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20 shadow-xs'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeComponentEditorTab === 'Laboratory' ? 'bg-emerald-500 ring-3 ring-emerald-200 dark:ring-emerald-900' : 'bg-slate-300 dark:bg-slate-700'}`} />
                            <div>
                              <div className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1">
                                <span>Laboratory</span>
                                <span className="text-[10px] font-semibold text-slate-400">Categories</span>
                              </div>
                              <label htmlFor="laboratory-component-weight" className="text-[10px] text-slate-400 dark:text-slate-500">Laboratory contribution (%)</label>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="relative">
                              <input
                                id="laboratory-component-weight"
                                type="text"
                                value={componentWeights.laboratory}
                                onChange={(e) => {
                                  handleUpdateComponentWeight('laboratory', e.target.value);
                                }}
                                className="w-14 sm:w-16 pl-2 pr-5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-extrabold text-xs text-right focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Period Validation Error */}
                  {periodValidationError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span>{periodValidationError}</span>
                    </div>
                  )}

                  {/* UNASSIGNED CATEGORIES NOTICE (FOR CONVERSION SCENARIOS) */}
                  {componentMode === 'lecture_laboratory' && activePeriodUnassignedCategories.length > 0 && (
                    <div className="p-4 rounded-2xl border border-amber-300/70 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/20 space-y-3" data-testid="unassigned-component-categories">
                      <div>
                        <h4 className="text-xs font-extrabold text-amber-900 dark:text-amber-200">Assign existing categories to a component</h4>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">Category IDs and linked assessment history are retained when you choose Lecture or Laboratory.</p>
                      </div>
                      {activePeriodUnassignedCategories.map(row => (
                        <div key={row.compositeKey} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-amber-300/50 dark:border-amber-900/50 bg-white/70 dark:bg-slate-900/60 p-2.5">
                          <span className="flex-1 text-xs font-bold text-slate-800 dark:text-slate-100">{row.name || 'Unnamed category'}{row.id ? ` (#${row.id})` : ''}</span>
                          <select
                            aria-label={`Component for ${row.name || 'unnamed category'}`}
                            value=""
                            onChange={event => handleUpdatePeriodCategoryComponent(activePeriodEditorTab, row.compositeKey, event.target.value as GradingComponentEnum | '')}
                            className="px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-xs font-semibold"
                          >
                            <option value="">Choose component…</option>
                            <option value="Lecture">Lecture</option>
                            <option value="Laboratory">Laboratory</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* LEVEL 3: CATEGORIES LIST FOR ACTIVE PERIOD & COMPONENT */}
                  <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
                    {/* Header Toolbar */}
                    <div className="p-2.5 sm:p-4 bg-slate-50/70 dark:bg-slate-850/60 border-b border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                          {componentMode === 'lecture_laboratory' ? '3.' : '2.'} {activePeriodEditorTab === 'Midterm' ? 'Midterm' : 'Finals'}{componentMode === 'lecture_laboratory' && ` • ${activeComponentEditorTab}`} Categories ({activePeriodVisibleCategories.length})
                        </span>
                        <span className="text-[11px] text-slate-400">• Must total 100%</span>
                      </div>

                      <div className="flex flex-col items-start sm:flex-row sm:items-center gap-2.5">
                        {/* Status badge */}
                        <span className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                          activeComponentCategoryCalc.isExact100
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        }`}>
                          {activeComponentCategoryCalc.displayPercent}<span className="hidden sm:inline"> / 100%</span>
                          <span className="ml-1">{activeComponentCategoryCalc.isExact100 ? 'Valid 100%' : 'Must equal 100%'}</span>
                        </span>

                        {/* Simple "+ Add Category" button */}
                        <button
                          type="button"
                          aria-label={activePeriodEditorTab === 'Midterm' ? 'Add Midterm Category' : 'Add Finals Category'}
                          onClick={() => handleAddPeriodCategory(activePeriodEditorTab)}
                          disabled={isLegacyCombinedPeriodConfig}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Category</span>
                        </button>
                      </div>
                    </div>

                    {/* Categories rows list */}
                    {activePeriodVisibleCategories.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 space-y-2">
                        <p className="text-xs">No {activeComponentEditorTab} categories defined for {activePeriodEditorTab}.</p>
                        <button
                          type="button"
                          onClick={() => handleAddPeriodCategory(activePeriodEditorTab)}
                          disabled={isLegacyCombinedPeriodConfig}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-clinical-600 hover:text-clinical-700 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add first category</span>
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {activePeriodVisibleCategories.map((row, index, list) => (
                          <div
                            key={row.compositeKey}
                            className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                          >
                            {/* Reorder Buttons */}
                            <div className="flex sm:flex-col gap-0.5 shrink-0">
                              <button
                                type="button"
                                aria-label={`Move category ${row.name || 'unnamed'} up`}
                                onClick={() => handleMovePeriodCategory(activePeriodEditorTab, index, 'up')}
                                disabled={isLegacyCombinedPeriodConfig || index === 0}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Move category ${row.name || 'unnamed'} down`}
                                onClick={() => handleMovePeriodCategory(activePeriodEditorTab, index, 'down')}
                                disabled={isLegacyCombinedPeriodConfig || index === list.length - 1}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Category Name */}
                            <div className="flex-1 min-w-0">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                Category Name
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={row.name}
                                  placeholder="Category name (e.g. Quizzes, Practical Exam)"
                                  disabled={isLegacyCombinedPeriodConfig}
                                  onChange={(e) => handleUpdatePeriodCategoryField(activePeriodEditorTab, row.compositeKey, 'name', e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-100 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-clinical-500 shadow-2xs"
                                />
                                {row.sourceKind === 'attendance' && (
                                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800" title="Authoritative attendance data from recorded sessions">
                                    Attendance
                                  </span>
                                )}
                              </div>
                            </div>


                            {componentMode === 'lecture_laboratory' && (
                              <>
                                <div className="w-full sm:w-32 shrink-0">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Component</label>
                                  <select
                                    aria-label={`Component for ${row.name || 'unnamed category'}`}
                                    value={row.component ?? ''}
                                    onChange={event => handleUpdatePeriodCategoryComponent(activePeriodEditorTab, row.compositeKey, event.target.value as GradingComponentEnum | '')}
                                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-100 text-xs font-semibold"
                                  >
                                    <option value="">Unassigned</option>
                                    <option value="Lecture">Lecture</option>
                                    <option value="Laboratory">Laboratory</option>
                                  </select>
                                </div>
                                <div className="w-full sm:w-32 shrink-0">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Source</label>
                                  <select
                                    aria-label={`Source for ${row.name || 'unnamed category'}`}
                                    value={row.sourceKind}
                                    disabled={row.inUse}
                                    onChange={event => handleUpdatePeriodCategorySourceKind(activePeriodEditorTab, row.compositeKey, event.target.value as GradingSourceKindEnum)}
                                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-100 text-xs font-semibold disabled:opacity-50"
                                  >
                                    <option value="assessment">Assessment</option>
                                    <option value="attendance">Attendance</option>
                                  </select>
                                  {row.inUse && <p className="mt-1 text-[9px] leading-tight text-slate-400">In-use category source is fixed to protect linked records.</p>}
                                </div>
                              </>
                            )}

                            {/* Weight (%) */}
                            <div className="w-full sm:w-28 shrink-0">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                Weight (%)
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.weight}
                                  placeholder="0"
                                  disabled={isLegacyCombinedPeriodConfig}
                                  onChange={(e) => handleUpdatePeriodCategoryField(activePeriodEditorTab, row.compositeKey, 'weight', e.target.value)}
                                  className="w-full pl-2 pr-6 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-100 text-xs font-bold text-right focus:outline-none focus:ring-2 focus:ring-clinical-500 shadow-2xs"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                              </div>
                            </div>

                            <div className="w-full sm:w-24 shrink-0">
                              <label htmlFor={`default-max-${row.compositeKey}`} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Default Max</label>
                              <input
                                id={`default-max-${row.compositeKey}`}
                                type="text"
                                value={row.defaultMax ?? ''}
                                placeholder="50"
                                disabled={isLegacyCombinedPeriodConfig}
                                onChange={(e) => handleUpdatePeriodCategoryField(activePeriodEditorTab, row.compositeKey, 'defaultMax', e.target.value)}
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-100 text-xs font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            {/* Delete Action */}
                            <div className="sm:pt-5 shrink-0 flex justify-end">
                              <button
                                type="button"
                                aria-label={`Delete category ${row.name || 'unnamed'}`}
                                onClick={() => handleRemovePeriodCategory(activePeriodEditorTab, row.compositeKey)}
                                disabled={isLegacyCombinedPeriodConfig || row.inUse}
                                title={row.inUse ? 'Cannot delete category with associated assessments' : 'Delete category'}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Attendance Calendar Date Ranges (Collapsible) */}
                  <details open className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 overflow-hidden group">
                    <summary className="p-3.5 sm:p-4 cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5 text-slate-400" />
                        <span>Faculty-Defined Attendance Date Ranges (Optional Calendar Settings)</span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="p-4 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 space-y-3">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Inclusive calendar dates for each period's attendance. Midterm attendance must end before Finals attendance starts.
                      </p>

                      {!validateDateRanges(attendanceDateRanges).valid && periodValidationError !== validateDateRanges(attendanceDateRanges).error && (
                        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{validateDateRanges(attendanceDateRanges).error}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Midterm Attendance Range</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label htmlFor="midterm-start-date" className="text-[10px] text-slate-400 block font-semibold mb-0.5">Start Date</label>
                              <input
                                id="midterm-start-date"
                                type="date"
                                value={attendanceDateRanges.midterm.startDate}
                                disabled={isLegacyCombinedPeriodConfig}
                                onChange={(e) => handleUpdateDateRange('midterm', 'startDate', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label htmlFor="midterm-end-date" className="text-[10px] text-slate-400 block font-semibold mb-0.5">End Date</label>
                              <input
                                id="midterm-end-date"
                                type="date"
                                value={attendanceDateRanges.midterm.endDate}
                                disabled={isLegacyCombinedPeriodConfig}
                                onChange={(e) => handleUpdateDateRange('midterm', 'endDate', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Finals Attendance Range</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label htmlFor="final-start-date" className="text-[10px] text-slate-400 block font-semibold mb-0.5">Start Date</label>
                              <input
                                id="final-start-date"
                                type="date"
                                value={attendanceDateRanges.final.startDate}
                                disabled={isLegacyCombinedPeriodConfig}
                                onChange={(e) => handleUpdateDateRange('final', 'startDate', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label htmlFor="final-end-date" className="text-[10px] text-slate-400 block font-semibold mb-0.5">End Date</label>
                              <input
                                id="final-end-date"
                                type="date"
                                value={attendanceDateRanges.final.endDate}
                                disabled={isLegacyCombinedPeriodConfig}
                                onChange={(e) => handleUpdateDateRange('final', 'endDate', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Bottom Summary & Save Bar */}
                  <div className="pt-5 border-t border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                        Term Split: <strong className={termRatioCalc.isExact100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>{termRatio.midterm}% / {termRatio.final}%</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                        Components: <strong className="text-slate-700 dark:text-slate-300">{componentWeights.lecture}% / {componentWeights.laboratory}%</strong>
                      </span>
                      <span className={`px-2.5 py-1 rounded-xl ${activeComponentCategoryCalc.isExact100 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'}`}>
                        {activeComponentEditorTab} Total: <strong>{activeComponentCategoryCalc.displayPercent}</strong>
                      </span>
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={configSaving || periodValidationError !== null || isLegacyCombinedPeriodConfig}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>{configSaving ? 'Saving...' : loadedConfig ? 'Save Grade Weights' : 'Save Initial Schema'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grade weights must be saved before assessments can be added */}
      {weightsRequiredOffering && (
        <Modal
          isOpen={Boolean(weightsRequiredOffering)}
          onClose={() => setWeightsRequiredOffering(null)}
          title="Set up grade weights first"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>{weightsRequiredOffering.courseCode} — {weightsRequiredOffering.courseName}</strong> has no saved grade weights yet.
              Every assessment must belong to one of the course's grading categories, so set up and save the grade weights for this course before adding assessments.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWeightsRequiredOffering(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = weightsRequiredOffering;
                  setWeightsRequiredOffering(null);
                  const switched = await handleSelectOffering(target.key);
                  if (!switched) return;
                  setSelectedSubjectCode(target.courseCode);
                  setActiveSubTab('components');
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
              >
                Go to Grade Weights
              </button>
            </div>
          </div>
        </Modal>
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
                This starts a draft for mandatory <strong>Lecture</strong> and <strong>Laboratory</strong> grading. Existing categories retain their IDs and weights; assign each category to a component and rebalance both component lists before saving. Existing scores and saved grades remain as recorded until an authorized recomputation.
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
                onClick={handlePrepareOverallPeriodConversion}
                className="px-5 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 disabled:opacity-50 text-white font-bold text-xs shadow-md"
              >
                Continue to Lecture/Laboratory Mapping
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
          <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-200">Academic Grade Summaries</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-clinical-50 text-clinical-700 dark:bg-clinical-950/60 dark:text-clinical-400 border border-clinical-200/50">
                  {selectedSubjectCode || 'Course'} · {selectedClassId || 'Section'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">General Weighted Averages (GWA) and periodic evaluations based on current component scores</p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsRecomputeConfirmOpen(true)}
                disabled={isRecomputing || !selectedClassId}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                <Zap className={`w-3.5 h-3.5 ${isRecomputing ? 'animate-spin' : 'text-amber-400'}`} />
                <span>{isRecomputing ? 'Recomputing...' : 'Recompute Grades'}</span>
              </button>

              {/* Clean Export Group (CSV & PDF) */}
              <div className="flex items-center bg-white dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  aria-label="Export CSV Ledger"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                  title="Export grade ledger as CSV spreadsheet"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Export CSV</span>
                </button>
                <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer"
                  title="Export or print grade ledger as PDF document"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Export PDF</span>
                </button>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-slate-150 dark:border-slate-800/80 bg-slate-50/10 dark:bg-slate-900/10 flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search student by name or ID..."
                value={summarySearch}
                onChange={(e) => setSummarySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-205 dark:border-slate-850 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-clinical-500"
              />
            </div>
            <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">
              Showing {sortedSummaryStudents.length} {sortedSummaryStudents.length === 1 ? 'student' : 'students'}
            </span>
          </div>

          {/* Recompute Alert */}
          {recomputeAlert && (
            <div className={`mx-5 my-3 p-4 rounded-2xl border text-xs flex flex-col gap-1.5 ${recomputeAlert.status === 'success'
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

          {isPeriodMode && isLectureLaboratoryMode && (
            <p role="note" className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              Lecture and Laboratory results are available after recomputation with the saved component setup. Older combined period results remain historical; unavailable component values are not derived from the new weights.
            </p>
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
                      {isLectureLaboratoryMode ? (
                        <>
                          <th className="px-5 py-3 text-center">Midterm Lecture %</th>
                          <th className="px-5 py-3 text-center">Midterm Laboratory %</th>
                          <th className="px-5 py-3 text-center">Midterm %</th>
                          <th className="px-5 py-3 text-center">Finals Lecture %</th>
                          <th className="px-5 py-3 text-center">Finals Laboratory %</th>
                          <th className="px-5 py-3 text-center">Finals %</th>
                        </>
                      ) : (
                        <>
                          <th className="px-5 py-3 text-center">Midterm %</th>
                          <th className="px-5 py-3 text-center">Final %</th>
                        </>
                      )}
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
                      Final Grade
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-5 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs">
                {sortedSummaryStudents.length === 0 ? (
                  <tr>
                    <td colSpan={isPeriodMode ? (isLectureLaboratoryMode ? 9 : 5) : 7} className="px-5 py-8 text-center text-slate-400">
                      No matching student grade summaries found.
                    </td>
                  </tr>
                ) : (
                  sortedSummaryStudents.map(student => {
                    const subj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
                    const computeRes = subj?.enrollmentId ? computeResultsByEnrollment.get(String(subj.enrollmentId)) : null;

                    if (isPeriodMode) {
                      const evalResult = extractPeriodEvaluation(subj, computeRes, isPeriodMode);
                      const isFailsRetention = subj && subj.isClinical && evalResult.overallGwa !== null && (evalResult.retentionState != null
                        ? evalResult.retentionState === 'remedial'
                        : evalResult.overallPercentage !== null && Number.isFinite(evalResult.overallPercentage)
                          && percentageToGWAExact(evalResult.overallPercentage) >= settings.retentionThreshold);
                      const isFailed = evalResult.overallGwa === 5.0;
                      const isPending = evalResult.statusText === 'PENDING';
                      const isIncomplete = evalResult.overallGwa === null;

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                          <td className="px-5 py-3">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{student.name}</div>
                            <span className="text-[10px] text-slate-400">{student.studentId}</span>
                          </td>
                          {isLectureLaboratoryMode && (
                            <>
                              <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{formatComponentResultCell(evalResult.midtermComponents?.lecture, evalResult.midtermStatus)}</td>
                              <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{formatComponentResultCell(evalResult.midtermComponents?.laboratory, evalResult.midtermStatus)}</td>
                            </>
                          )}
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
                          {isLectureLaboratoryMode && (
                            <>
                              <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{formatComponentResultCell(evalResult.finalComponents?.lecture, evalResult.finalStatus)}</td>
                              <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{formatComponentResultCell(evalResult.finalComponents?.laboratory, evalResult.finalStatus)}</td>
                            </>
                          )}
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
                            <span className={`px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${isFailed
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
                    const evalResult = extractPeriodEvaluation(subj, computeRes, isPeriodMode);
                    const isFailsRetention = subj && subj.isClinical && evalResult.overallGwa !== null && (evalResult.retentionState != null
                        ? evalResult.retentionState === 'remedial'
                        : evalResult.overallPercentage !== null && Number.isFinite(evalResult.overallPercentage)
                          && percentageToGWAExact(evalResult.overallPercentage) >= settings.retentionThreshold);
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
                          <span className={`px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${!hasGrade
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
        <Card className="max-w-4xl mx-auto shadow-sm border border-slate-200/90 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
                  <Upload className="w-5 h-5 text-clinical-600 dark:text-clinical-400" />
                  <span>Import Grade Sheets from CSV</span>
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Upload CSV score records to validate and preview assessment marks for enrolled students
                </p>
              </div>
              <div className="shrink-0">
                <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {selectedSubjectCode || 'Course'} · {selectedClassId || 'Section'}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 sm:p-7 space-y-6">
            {/* Top Grid: Destination & Upload Dropzone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
              {/* Left Column: Component Destination & Template Guide */}
              <div className="space-y-4 flex flex-col justify-between p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-850/50 border border-slate-150 dark:border-slate-800">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      1. Grading Component Destination
                    </label>
                    <select
                      value={importPeriod}
                      onChange={(e) => setImportPeriod(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-205 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500 shadow-2xs"
                    >
                      <option value="Midterm">Midterm Examination Score</option>
                      <option value="Final">Final Examination / Quizzes</option>
                      <option value="Overall">Clinical Practicums / Laboratories</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Required Columns
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
                        Student ID
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
                        Score (0–100)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-clinical-400 dark:hover:border-clinical-500 text-clinical-600 dark:text-clinical-400 hover:text-clinical-700 font-bold text-xs transition-colors shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV Template with Roster</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Interactive Dropzone */}
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  2. Select CSV Score Sheet
                </label>
                <div
                  className={`flex-1 flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed transition-all text-center ${
                    csvFile
                      ? 'border-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-clinical-500 dark:hover:border-clinical-400 bg-slate-50/40 dark:bg-slate-850/30'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvSelect}
                    className="hidden"
                    id="csv-file-upload"
                  />

                  {csvFile ? (
                    <div className="space-y-2">
                      <div className="w-10 h-10 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <Check className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-xs">
                          {csvFile.name}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {(csvFile.size / 1024).toFixed(1)} KB • CSV Spreadsheet
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-1">
                        <label
                          htmlFor="csv-file-upload"
                          className="px-3 py-1 rounded-lg text-xs font-bold text-clinical-600 dark:text-clinical-400 hover:bg-clinical-50 dark:hover:bg-clinical-950/50 cursor-pointer transition-colors"
                        >
                          Change File
                        </label>
                        <button
                          type="button"
                          onClick={handleClearCsv}
                          className="px-3 py-1 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="csv-file-upload" className="cursor-pointer space-y-2">
                      <div className="w-10 h-10 mx-auto rounded-full bg-clinical-50 dark:bg-clinical-950/60 text-clinical-600 dark:text-clinical-400 flex items-center justify-center">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-clinical-600 dark:text-clinical-400 hover:underline">
                          Browse CSV file
                        </span>
                        <span className="text-xs text-slate-400"> or drag and drop</span>
                      </div>
                      <p className="text-[10px] text-slate-400">Standard Comma-Separated Values (.csv)</p>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Parsing Errors Notification */}
            {csvErrors.length > 0 && (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 space-y-1.5 text-xs">
                <h4 className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Validation Issues ({csvErrors.length})</span>
                </h4>
                <div className="max-h-28 overflow-y-auto text-[11px] text-rose-600 dark:text-rose-400 space-y-0.5 pl-5">
                  {csvErrors.map((err, idx) => (
                    <div key={idx}>• {err}</div>
                  ))}
                </div>
              </div>
            )}

            {/* CSV Data Preview */}
            {csvPreviewData.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Data Verification Preview
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Inspected {csvPreviewData.length} records against current roster
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {csvPreviewData.filter(r => r.valid).length} Valid
                    </span>
                    {csvPreviewData.filter(r => !r.valid).length > 0 && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        {csvPreviewData.filter(r => !r.valid).length} Invalid
                      </span>
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800 text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-850 sticky top-0 z-10">
                      <tr className="text-left font-bold text-[10px] uppercase text-slate-400 tracking-wider">
                        <th className="px-4 py-2.5">Student ID</th>
                        <th className="px-4 py-2.5">Student Name</th>
                        <th className="px-4 py-2.5">Imported Score</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                      {csvPreviewData.map((row, idx) => (
                        <tr
                          key={idx}
                          className={row.valid ? 'hover:bg-slate-50 dark:hover:bg-slate-800/30' : 'bg-rose-50/30 dark:bg-rose-950/10'}
                        >
                          <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400 font-semibold">{row.id}</td>
                          <td className="px-4 py-2 font-bold text-slate-800 dark:text-slate-100">{row.name}</td>
                          <td className="px-4 py-2 font-mono font-bold text-clinical-600 dark:text-clinical-400">{row.score}%</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                row.valid
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              }`}
                            >
                              {row.valid ? 'Ready' : 'Error'}
                            </span>
                            {row.error && (
                              <span className="block text-[10px] text-rose-500 mt-0.5">{row.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-150 dark:border-slate-800">
              <button
                type="button"
                onClick={handleClearCsv}
                disabled={!csvFile && csvPreviewData.length === 0}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
              >
                Reset
              </button>

              <button
                type="button"
                disabled
                title="Importing grade sheets is a preview capability. Apply individual scores in the Student Scores Entry tab."
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 font-bold text-xs cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Import Preview Verified</span>
              </button>
            </div>
          </CardContent>
        </Card>
      )}




      {/* ----------------------------------------------------
          PRINT LAYOUT SCREEN (HIDDEN NORMALLY)
      ---------------------------------------------------- */}
      <div className="print-only hidden p-8 bg-white text-slate-900 space-y-6 font-sans">
        <div className="text-center space-y-1.5 border-b-2 border-slate-800 pb-5 mb-6">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Bicol University · College of Dental Medicine</p>
          <h2 className="font-heading font-black text-2xl tracking-tight uppercase text-slate-900 mt-1">Class Grade Ledger Report</h2>
          <div className="flex flex-wrap justify-center items-center gap-3 text-xs text-slate-600 mt-2 font-medium"><span><strong className="text-slate-800">Course:</strong> {selectedSubjectCode} {activeSubjectName ? `(${activeSubjectName})` : ''}</span><span>•</span><span><strong className="text-slate-800">Section:</strong> {selectedClassId || '—'}</span><span>•</span><span><strong className="text-slate-800">Term:</strong> {currentSchoolYear ? `S.Y. ${currentSchoolYear}` : 'Current Academic Year'}</span><span>•</span><span><strong className="text-slate-800">Date:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span></div>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-xs">
          <thead>
            {isPeriodMode ? (
              <tr className="bg-slate-100 text-left font-bold uppercase">
                <th className="border border-slate-300 px-4 py-2">Student ID</th>
                <th className="border border-slate-300 px-4 py-2">Student Name</th>
                {isLectureLaboratoryMode ? (
                  <>
                    <th className="border border-slate-300 px-4 py-2 text-center">Midterm Lecture %</th>
                    <th className="border border-slate-300 px-4 py-2 text-center">Midterm Laboratory %</th>
                    <th className="border border-slate-300 px-4 py-2 text-center">Midterm %</th>
                    <th className="border border-slate-300 px-4 py-2 text-center">Finals Lecture %</th>
                    <th className="border border-slate-300 px-4 py-2 text-center">Finals Laboratory %</th>
                    <th className="border border-slate-300 px-4 py-2 text-center">Finals %</th>
                  </>
                ) : (
                  <>
                    <th className="border border-slate-300 px-4 py-2 text-center">Midterm %</th>
                    <th className="border border-slate-300 px-4 py-2 text-center">Final %</th>
                  </>
                )}
                <th className="border border-slate-300 px-4 py-2 text-center">Final Grade (Overall GWA)</th>
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
                <th className="border border-slate-300 px-4 py-2 text-center">Final Grade (Overall GWA)</th>
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
                const isFailsRetention = subj && subj.isClinical && evalResult.overallGwa !== null && (evalResult.retentionState != null
                  ? evalResult.retentionState === 'remedial'
                  : evalResult.overallPercentage !== null && Number.isFinite(evalResult.overallPercentage)
                    && percentageToGWAExact(evalResult.overallPercentage) >= settings.retentionThreshold);
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
                    {isLectureLaboratoryMode && (
                      <>
                        <td className="border border-slate-300 px-4 py-2 text-center font-mono">{formatComponentResultCell(evalResult.midtermComponents?.lecture, evalResult.midtermStatus)}</td>
                        <td className="border border-slate-300 px-4 py-2 text-center font-mono">{formatComponentResultCell(evalResult.midtermComponents?.laboratory, evalResult.midtermStatus)}</td>
                      </>
                    )}
                    <td className="border border-slate-300 px-4 py-2 text-center font-mono">{midtermStr}</td>
                    {isLectureLaboratoryMode && (
                      <>
                        <td className="border border-slate-300 px-4 py-2 text-center font-mono">{formatComponentResultCell(evalResult.finalComponents?.lecture, evalResult.finalStatus)}</td>
                        <td className="border border-slate-300 px-4 py-2 text-center font-mono">{formatComponentResultCell(evalResult.finalComponents?.laboratory, evalResult.finalStatus)}</td>
                      </>
                    )}
                    <td className="border border-slate-300 px-4 py-2 text-center font-mono">{finalStr}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-extrabold">{gwaStr}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-bold text-[10px]">{remarksStr}</td>
                  </tr>
                );
              }

              // Legacy print row
              const evalResult = extractPeriodEvaluation(subj, computeRes, isPeriodMode);
              const isFailsRetention = subj && subj.isClinical && evalResult.overallGwa !== null && (evalResult.retentionState != null
                  ? evalResult.retentionState === 'remedial'
                  : evalResult.overallPercentage !== null && Number.isFinite(evalResult.overallPercentage)
                    && percentageToGWAExact(evalResult.overallPercentage) >= settings.retentionThreshold);
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

        <div className="break-inside-avoid flex justify-between items-end mt-12 pt-8 border-t border-dashed border-slate-300 text-xs">
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
            {/* The class comes from the Active Section selector at the top of
                the page, so the page has a single place to choose a class. */}
            <div
              data-testid="assessment-target-class"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 text-xs font-semibold"
            >
              {[...availableClasses, ...(currentAssessmentOffering?.sections ?? [])].find(classItem => classItem.id === assClassId)?.csName
                || 'Choose a class with the Active Section selector at the top of the page.'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Grading Period
              </label>
              <select
                aria-label="Grading Period"
                value={assPeriod}
                onChange={(e) => handlePeriodChange(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
              >
                <option value="Midterm">Midterm Period</option>
                <option value="Final">Final Period</option>
              </select>
            </div>

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
              {modalConfigStatus !== 'loading' && modalConfigStatus !== 'error' && (
                <div className="space-y-2">
                  {modalCategoryWarning && (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>This assessment requires a valid grading category assignment configured in Grade Weights.</div>
                    </div>
                  )}
                  <select
                    aria-label="Category Type"
                    value={assGradingCategoryId || assType}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      const found = modalEligibleCategories.find(c =>
                        String(c.id) === selectedVal || categoryOptionKey(c, assPeriod) === selectedVal
                      );
                      if (found) {
                        setAssGradingCategoryId(categoryOptionKey(found, assPeriod));
                        setAssType(found.name);
                      } else {
                        setAssGradingCategoryId('');
                        setAssType(selectedVal);
                      }
                      setModalCategoryWarning(false);
                    }}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  >
                    <option value="">Select grading category</option>
                    {(() => {
                      const lectureCategories = modalEligibleCategories.filter(
                        c => (c.component ?? 'Lecture').toLowerCase() === 'lecture'
                      );
                      const labCategories = modalEligibleCategories.filter(
                        c => (c.component ?? '').toLowerCase() === 'laboratory' || (c.component ?? '').toLowerCase() === 'lab'
                      );
                      const otherCategories = modalEligibleCategories.filter(c => {
                        const comp = (c.component ?? '').toLowerCase();
                        return comp !== 'lecture' && comp !== 'laboratory' && comp !== 'lab' && comp !== '';
                      });

                      if (lectureCategories.length === 0 && labCategories.length === 0 && otherCategories.length === 0) {
                        return modalEligibleCategories.map(cat => (
                          <option key={categoryOptionKey(cat, assPeriod)} value={categoryOptionKey(cat, assPeriod)}>
                            {cat.component ? `${cat.component} · ` : ''}{cat.name} ({cat.weight}%)
                          </option>
                        ));
                      }

                      return (
                        <>
                          {lectureCategories.length > 0 && (
                            <optgroup label="Lecture Categories">
                              {lectureCategories.map(cat => (
                                <option key={categoryOptionKey(cat, assPeriod)} value={categoryOptionKey(cat, assPeriod)}>
                                  {cat.component ? `${cat.component} · ` : ''}{cat.name} ({cat.weight}%)
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {labCategories.length > 0 && (
                            <optgroup label="Laboratory Categories">
                              {labCategories.map(cat => (
                                <option key={categoryOptionKey(cat, assPeriod)} value={categoryOptionKey(cat, assPeriod)}>
                                  {cat.component ? `${cat.component} · ` : ''}{cat.name} ({cat.weight}%)
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {otherCategories.length > 0 && (
                            <optgroup label="Other Categories">
                              {otherCategories.map(cat => (
                                <option key={categoryOptionKey(cat, assPeriod)} value={categoryOptionKey(cat, assPeriod)}>
                                  {cat.component ? `${cat.component} · ` : ''}{cat.name} ({cat.weight}%)
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                </div>
              )}
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
                placeholder="e.g. 50"
                value={assMaxScore}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setAssMaxScore('');
                  } else {
                    const num = parseInt(val, 10);
                    setAssMaxScore(isNaN(num) ? '' : num);
                  }
                }}
                onBlur={() => {
                  if (assMaxScore === '' || Number(assMaxScore) <= 0) {
                    setAssMaxScore(50);
                  }
                }}
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

          {/* COLLAPSIBLE ATTENDANCE & TRANSMUTATION ACCORDION */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setIsTransmutationSectionOpen(prev => !prev)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-100/50 dark:hover:bg-slate-850/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${assTransmutationEnabled ? 'bg-clinical-500 ring-2 ring-clinical-500/20' : 'bg-slate-300 dark:bg-slate-700'}`} />
                <div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <span>Attendance Linking & Transmutation</span>
                    <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
                    {assTransmutationEnabled ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-clinical-50 text-clinical-650 dark:bg-clinical-950/40 dark:text-clinical-400 border border-clinical-200 dark:border-clinical-800">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                        Off
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Scale raw percentages or link to a biometric attendance session</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                {isTransmutationSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {isTransmutationSectionOpen && (
              <div className="p-4 pt-1 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <label className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700 dark:text-slate-200 pt-2 cursor-pointer">
                  <span>Enable attendance-linked transmutation</span>
                  <input
                    type="checkbox"
                    checked={assTransmutationEnabled}
                    onChange={(event) => setAssTransmutationEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-clinical-600 focus:ring-clinical-500 cursor-pointer"
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
                        Attendance session date (Optional)
                        <select
                          value={assAttendanceDate}
                          onChange={(event) => {
                            const date = event.target.value;
                            const codes = attendanceSessionOptions.find(option => option.date === date)?.codes ?? [];
                            setAssAttendanceDate(date);
                            setAssAttendanceCode(codes.length === 1 ? codes[0] : '');
                          }}
                          className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                        >
                          <option value="">No link (attendance not considered)</option>
                          {attendanceSessionOptions.map(option => (
                            <option key={option.date} value={option.date}>{option.date}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Attendance session code (Optional)
                        <select
                          value={assAttendanceCode}
                          onChange={(event) => setAssAttendanceCode(event.target.value)}
                          className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                        >
                          <option value="">No link (attendance not considered)</option>
                          {attendanceCodesForDate.map(code => <option key={code} value={code}>{code}</option>)}
                        </select>
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      💡 Without a linked session, the raw score is transmuted and attendance is not considered. With a linked session, a student is incomplete until the session ends; a student with no attendance record then counts as Absent (0%). You can link a session anytime later.
                    </p>
                  </>
                )}
              </div>
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
