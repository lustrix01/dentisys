import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
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
  Grid,
  List,
  Zap,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, EnrolledSubject, GradeComponents, Assessment, AssessmentScore, GradingComponentConfig } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { requestConfirmation, showFeedback } from '../../components/FeedbackCenter';
import { percentageToGWA, gwaToDescription, computeSubjectGrade } from '../../utils/gradeHelper';
import { recordAudit } from '../../services/auditService';

import { computeFacultyGradesApi, deleteFacultyAssessmentApi, getFacultyClassesApi, getFacultySettingsApi, saveFacultyAssessmentScoresApi, saveFacultyAssessmentsApi, getFacultyGradingConfigApi, saveFacultyGradingConfigApi } from '../../services/apiClient';
import type { FacultyClassItem } from '../../services/apiClient';

export const GradeComputation: React.FC = () => {
  const { user } = useAuth();
  const { 
    students, 
    attendanceRecords,
    settings, 
    assessments, 
    assessmentScores, 
    gradingComponents,
    addAssessment,
    updateAssessment,
    deleteAssessment,
    archiveAssessment,
    saveAssessmentScores,
    updateSubjectGradingComponents,
    updateStudentGrade
  } = useApp();

  const location = useLocation();

  const [facultyClasses, setFacultyClasses] = useState<FacultyClassItem[]>([]);

  const assignedSubjects = useMemo(() => {
    const codes = new Set<string>();
    facultyClasses.forEach(c => {
      if (c.courseCode) codes.add(c.courseCode);
    });
    students.forEach(s => {
      s.enrolledSubjects?.forEach(sub => {
        if (sub.code) codes.add(sub.code);
      });
    });
    if (codes.size === 0) {
      ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'].forEach(c => codes.add(c));
    }
    return Array.from(codes);
  }, [facultyClasses, students]);

  const [selectedSubjectCode, setSelectedSubjectCode] = useState('CLIN401');

  const availableClasses = useMemo(
    () => facultyClasses.filter(classItem =>
      classItem.courseCode === selectedSubjectCode
      && classItem.status.trim().toLowerCase() === 'active'
    ),
    [facultyClasses, selectedSubjectCode],
  );
  const [selectedClassId, setSelectedClassId] = useState('');

  // Auto switch subject if currently selected subject has no active sections but other subjects do
  useEffect(() => {
    if (availableClasses.length === 0 && facultyClasses.length > 0) {
      const activeClass = facultyClasses.find(c => c.status.trim().toLowerCase() === 'active');
      if (activeClass && activeClass.courseCode && activeClass.courseCode !== selectedSubjectCode) {
        setSelectedSubjectCode(activeClass.courseCode);
      }
    }
  }, [availableClasses.length, facultyClasses, selectedSubjectCode]);

  useEffect(() => {
    if (assignedSubjects.length > 0 && !assignedSubjects.includes(selectedSubjectCode)) {
      setSelectedSubjectCode(assignedSubjects[0]);
    }
  }, [assignedSubjects, selectedSubjectCode]);

  const [loading, setLoading] = useState(true);
  const [transmutationDefaults, setTransmutationDefaults] = useState({ minimumPercentage: 50, maximumPercentage: 100 });

  useEffect(() => {
    Promise.all([getFacultyClassesApi(), getFacultySettingsApi()])
      .then(([classesResponse, settingsResponse]) => {
        setFacultyClasses(Array.isArray(classesResponse.classes) ? classesResponse.classes : []);
        if (settingsResponse.settings?.transmutationDefaults) {
          setTransmutationDefaults(settingsResponse.settings.transmutationDefaults);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  
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
    return assessments.filter(a =>
      a.subjectCode === selectedSubjectCode &&
      a.classId === selectedClassId &&
      a.status !== 'Archived'
    );
  }, [assessments, selectedSubjectCode, selectedClassId]);

  const openNewAssessmentModal = () => {
    if (availableClasses.length === 0) {
      showFeedback('No active class section is assigned to you for this course. Please select another course or create/activate a section in "My Classes & Rosters" first.', 'error');
      return;
    }
    setEditingAssessment(null);
    setAssTitle('');
    setAssClassId(availableClasses.some(classItem => classItem.id === selectedClassId)
      ? selectedClassId
      : (availableClasses[0]?.id ?? ''));
    setAssType(midtermCategoryOptions[0] || 'Quiz');
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
  };

  const openEditAssessmentModal = (ass: Assessment) => {
    setEditingAssessment(ass);
    setAssTitle(ass.title);
    setAssClassId(availableClasses.some(classItem => classItem.id === ass.classId)
      ? ass.classId
      : selectedClassId);
    setAssType(ass.type);
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
    setIsAssessmentModalOpen(true);
  };

  const handleAssessmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assTitle) return;
    const targetClass = availableClasses.find(classItem => classItem.id === assClassId)
      || facultyClasses.find(c => c.id === assClassId);
    if (!targetClass) {
      showFeedback('Select an active class or section for the selected course.', 'error');
      return;
    }
    if (assTransmutationEnabled && (!assAttendanceDate || !assAttendanceCode)) {
      showFeedback('Select a deterministic attendance date and session code before enabling transmutation.', 'error');
      return;
    }
    if (assTransmutationMinimum < 0 || assTransmutationMaximum > 100 || assTransmutationMinimum > assTransmutationMaximum) {
      showFeedback('Transmutation bounds must be between 0% and 100%, with minimum not exceeding maximum.', 'error');
      return;
    }

    const candidate = editingAssessment
      ? {
        ...editingAssessment,
        title: assTitle,
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
      }
      : {
        title: assTitle,
        type: assType,
        subjectCode: selectedSubjectCode,
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
      };
    try {
      const response = await saveFacultyAssessmentsApi([candidate]);
      const persistedAssessment = response.assessments?.[0];
      if (response.assessments?.length !== 1
        || !persistedAssessment?.id
        || (String(persistedAssessment.classId) !== String(assClassId)
            && String(persistedAssessment.classId) !== String(targetClass.csId))
        || persistedAssessment.title !== assTitle) {
        throw new Error('The server did not confirm this assessment for the selected class. Please try again.');
      }
      if (editingAssessment) {
        updateAssessment(candidate as Assessment);
      } else {
        addAssessment({
          ...candidate,
          id: persistedAssessment.id,
        });
      }
      setSelectedClassId(assClassId);
      showFeedback(response.message, 'success');
      setIsAssessmentModalOpen(false);
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to save assessment.', 'error');
    }
  };

  // ----------------------------------------------------
  // 2. STUDENT SCORES TAB STATE & MATRIX MODE
  // ----------------------------------------------------
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [scoreSearch, setScoreSearch] = useState('');
  const [scoresInputState, setScoresInputState] = useState<Record<string, { score: string; remarks: string }>>({});
  const [isScoresSavedAlert, setIsScoresSavedAlert] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

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

    if (availableClasses[0]?.id) {
      await refreshPersistedGrades(availableClasses[0].id);
    }
    setIsMatrixSavedAlert(true);
    showFeedback(`Saved ${saveCount} grades across matrix successfully!`, 'success');
    setTimeout(() => setIsMatrixSavedAlert(false), 3000);
  };

  const activeAssessment = useMemo(() => {
    return assessments.find(a => a.id === selectedAssessmentId);
  }, [assessments, selectedAssessmentId]);

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

  // Set default assessment when subject/class changes
  useEffect(() => {
    if (activeAssessments.length > 0) {
      setSelectedAssessmentId(activeAssessments[0].id);
    } else {
      setSelectedAssessmentId('');
    }
  }, [selectedSubjectCode, selectedClassId, assessments]);

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
  // 3. GRADE COMPONENTS TAB STATE (FULL CUSTOMIZATION)
  // ----------------------------------------------------
  const [termRatio, setTermRatio] = useState<{ midterm: number; final: number }>(() => {
    const local = localStorage.getItem(`dentisys_term_ratio_${selectedSubjectCode}`);
    if (local) {
      try { return JSON.parse(local); } catch {}
    }
    return { midterm: 40, final: 60 };
  });

  const [schemaPeriodTab, setSchemaPeriodTab] = useState<'Midterm' | 'Final'>('Midterm');

  interface CustomCategoryRow {
    id: string;
    name: string;
    weight: string;
    maxScore: string;
  }

  const [midtermCategories, setMidtermCategories] = useState<CustomCategoryRow[]>(() => {
    const local = localStorage.getItem(`dentisys_midterm_cats_${selectedSubjectCode}`);
    if (local) {
      try { return JSON.parse(local); } catch {}
    }
    return [
      { id: 'm-cat-1', name: 'Quiz', weight: '25', maxScore: '50' },
      { id: 'm-cat-2', name: 'Activity', weight: '25', maxScore: '50' },
      { id: 'm-cat-3', name: 'Midterm Exam', weight: '40', maxScore: '100' },
      { id: 'm-cat-4', name: 'Attendance', weight: '10', maxScore: '100' },
    ];
  });

  const [finalCategories, setFinalCategories] = useState<CustomCategoryRow[]>(() => {
    const local = localStorage.getItem(`dentisys_final_cats_${selectedSubjectCode}`);
    if (local) {
      try { return JSON.parse(local); } catch {}
    }
    return [
      { id: 'f-cat-1', name: 'Quiz', weight: '20', maxScore: '50' },
      { id: 'f-cat-2', name: 'Activity', weight: '20', maxScore: '50' },
      { id: 'f-cat-3', name: 'Laboratory', weight: '20', maxScore: '100' },
      { id: 'f-cat-4', name: 'Final Exam', weight: '30', maxScore: '100' },
      { id: 'f-cat-5', name: 'Attendance', weight: '10', maxScore: '100' },
    ];
  });

  const [isComponentsSaved, setIsComponentsSaved] = useState(false);

  // Sync loaded components from database / API whenever selectedSubjectCode changes
  useEffect(() => {
    let active = true;
    getFacultyGradingConfigApi(selectedSubjectCode)
      .then(res => {
        if (!active) return;
        if (res.config) {
          if (res.config.termRatio) {
            setTermRatio(res.config.termRatio);
          }
          if (Array.isArray(res.config.midtermCategories) && res.config.midtermCategories.length > 0) {
            setMidtermCategories(res.config.midtermCategories);
          }
          if (Array.isArray(res.config.finalCategories) && res.config.finalCategories.length > 0) {
            setFinalCategories(res.config.finalCategories);
          }
        } else {
          // Fallback to localStorage if no DB entry exists yet
          const localRatio = localStorage.getItem(`dentisys_term_ratio_${selectedSubjectCode}`);
          if (localRatio) {
            try { setTermRatio(JSON.parse(localRatio)); } catch {}
          }
          const localMid = localStorage.getItem(`dentisys_midterm_cats_${selectedSubjectCode}`);
          if (localMid) {
            try { setMidtermCategories(JSON.parse(localMid)); } catch {}
          }
          const localFin = localStorage.getItem(`dentisys_final_cats_${selectedSubjectCode}`);
          if (localFin) {
            try { setFinalCategories(JSON.parse(localFin)); } catch {}
          }
        }
      })
      .catch(() => {
        if (!active) return;
        const localRatio = localStorage.getItem(`dentisys_term_ratio_${selectedSubjectCode}`);
        if (localRatio) {
          try { setTermRatio(JSON.parse(localRatio)); } catch {}
        }
        const localMid = localStorage.getItem(`dentisys_midterm_cats_${selectedSubjectCode}`);
        if (localMid) {
          try { setMidtermCategories(JSON.parse(localMid)); } catch {}
        }
        const localFin = localStorage.getItem(`dentisys_final_cats_${selectedSubjectCode}`);
        if (localFin) {
          try { setFinalCategories(JSON.parse(localFin)); } catch {}
        }
      });
    return () => { active = false; };
  }, [selectedSubjectCode]);

  // Sync loaded components if present in context
  useEffect(() => {
    if (gradingComponents && gradingComponents.length > 0) {
      const mConfigs = gradingComponents.filter(c => c.subjectCode === selectedSubjectCode && c.period === 'Midterm');
      const fConfigs = gradingComponents.filter(c => c.subjectCode === selectedSubjectCode && c.period === 'Final');

      if (mConfigs.length > 0) {
        setMidtermCategories(mConfigs.map((c, idx) => ({
          id: `m-cat-${idx}`,
          name: c.category,
          weight: c.weight.toString(),
          maxScore: c.maxScore.toString(),
        })));
      }
      if (fConfigs.length > 0) {
        setFinalCategories(fConfigs.map((c, idx) => ({
          id: `f-cat-${idx}`,
          name: c.category,
          weight: c.weight.toString(),
          maxScore: c.maxScore.toString(),
        })));
      }
    }
  }, [selectedSubjectCode, gradingComponents]);

  // Calculate live sums
  const midtermWeightsSum = useMemo(() => {
    return midtermCategories.reduce((sum, row) => sum + (parseInt(row.weight) || 0), 0);
  }, [midtermCategories]);

  const finalWeightsSum = useMemo(() => {
    return finalCategories.reduce((sum, row) => sum + (parseInt(row.weight) || 0), 0);
  }, [finalCategories]);

  const termRatioSum = useMemo(() => {
    return (termRatio.midterm || 0) + (termRatio.final || 0);
  }, [termRatio]);

  // Period-specific Category lists for Assessment Creation Modal
  const midtermCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    midtermCategories.forEach(c => { if (c.name.trim()) set.add(c.name.trim()); });
    if (set.size === 0) {
      ['Quiz', 'Activity', 'Midterm Exam', 'Attendance', 'Others'].forEach(cat => set.add(cat));
    }
    return Array.from(set);
  }, [midtermCategories]);

  const finalCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    finalCategories.forEach(c => { if (c.name.trim()) set.add(c.name.trim()); });
    if (set.size === 0) {
      ['Quiz', 'Activity', 'Laboratory', 'Final Exam', 'Attendance', 'Others'].forEach(cat => set.add(cat));
    }
    return Array.from(set);
  }, [finalCategories]);

  const activePeriodCategoryOptions = useMemo(() => {
    const baseList = assPeriod === 'Midterm' ? midtermCategoryOptions : finalCategoryOptions;
    if (assType && !baseList.includes(assType)) {
      return [...baseList, assType];
    }
    return baseList;
  }, [assPeriod, midtermCategoryOptions, finalCategoryOptions, assType]);

  // Handlers for Categories
  const handleAddCategoryRow = (period: 'Midterm' | 'Final') => {
    const newRow: CustomCategoryRow = {
      id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: 'New Category',
      weight: '0',
      maxScore: '50',
    };
    if (period === 'Midterm') {
      setMidtermCategories(prev => [...prev, newRow]);
    } else {
      setFinalCategories(prev => [...prev, newRow]);
    }
    setIsComponentsSaved(false);
  };

  const handleDeleteCategoryRow = (period: 'Midterm' | 'Final', id: string) => {
    if (period === 'Midterm') {
      if (midtermCategories.length <= 1) {
        showFeedback('You must have at least one category for Midterm.', 'error');
        return;
      }
      setMidtermCategories(prev => prev.filter(c => c.id !== id));
    } else {
      if (finalCategories.length <= 1) {
        showFeedback('You must have at least one category for Final.', 'error');
        return;
      }
      setFinalCategories(prev => prev.filter(c => c.id !== id));
    }
    setIsComponentsSaved(false);
  };

  const handleCategoryRowChange = (
    period: 'Midterm' | 'Final',
    id: string,
    field: 'name' | 'weight' | 'maxScore',
    val: string
  ) => {
    const updateList = (list: CustomCategoryRow[]) =>
      list.map(row => (row.id === id ? { ...row, [field]: val } : row));

    if (period === 'Midterm') {
      setMidtermCategories(updateList);
    } else {
      setFinalCategories(updateList);
    }
    setIsComponentsSaved(false);
  };

  const handleSaveFullComponentsSchema = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validate Term Split Ratio = 100%
    if (termRatioSum !== 100) {
      showFeedback(`Overall Term Ratio must equal 100% (Midterm % + Final % = 100%). Currently: ${termRatioSum}%.`, 'error');
      return;
    }

    // 2. Validate Midterm Categories sum = 100%
    if (midtermWeightsSum !== 100) {
      showFeedback(`Sum of Midterm category weights must equal exactly 100%. Currently: ${midtermWeightsSum}%.`, 'error');
      return;
    }

    // 3. Validate Final Categories sum = 100%
    if (finalWeightsSum !== 100) {
      showFeedback(`Sum of Final category weights must equal exactly 100%. Currently: ${finalWeightsSum}%.`, 'error');
      return;
    }

    // 4. Validate blank category names
    const hasBlankMidterm = midtermCategories.some(c => !c.name.trim());
    const hasBlankFinal = finalCategories.some(c => !c.name.trim());
    if (hasBlankMidterm || hasBlankFinal) {
      showFeedback('Category names cannot be blank.', 'error');
      return;
    }

    try {
      // Save directly into backend PostgreSQL database
      await saveFacultyGradingConfigApi({
        subjectCode: selectedSubjectCode,
        termRatio,
        midtermCategories,
        finalCategories,
      });

      // Also save to localStorage as cache fallback
      localStorage.setItem(`dentisys_term_ratio_${selectedSubjectCode}`, JSON.stringify(termRatio));
      localStorage.setItem(`dentisys_midterm_cats_${selectedSubjectCode}`, JSON.stringify(midtermCategories));
      localStorage.setItem(`dentisys_final_cats_${selectedSubjectCode}`, JSON.stringify(finalCategories));

      // Convert to GradingComponentConfig[] for AppContext compatibility
      const mConfigs: GradingComponentConfig[] = midtermCategories.map(c => ({
        subjectCode: selectedSubjectCode,
        category: c.name.trim(),
        weight: parseInt(c.weight) || 0,
        maxScore: parseInt(c.maxScore) || 50,
        period: 'Midterm',
      }));

      const fConfigs: GradingComponentConfig[] = finalCategories.map(c => ({
        subjectCode: selectedSubjectCode,
        category: c.name.trim(),
        weight: parseInt(c.weight) || 0,
        maxScore: parseInt(c.maxScore) || 50,
        period: 'Final',
      }));

      updateSubjectGradingComponents(selectedSubjectCode, [...mConfigs, ...fConfigs]);
      setIsComponentsSaved(true);
      showFeedback('Grading weights & period schema saved to database successfully!', 'success');
      setTimeout(() => setIsComponentsSaved(false), 3000);
    } catch (requestErr) {
      showFeedback(requestErr instanceof Error ? requestErr.message : 'Unable to save grading schema to database.', 'error');
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
      const gradeVal = subj ? subj.grade.toFixed(2) : '5.00';
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

      {/* Class and Subject Selector Bar */}
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
                        <div><span className="text-slate-400 font-semibold">Due Date:</span> {activeAssessment.dueDate}</div>
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
              <p className="text-[10px] text-slate-400 mt-0.5">Manage assignments, quizzes, laboratories, and exams</p>
            </div>

            <button
              onClick={openNewAssessmentModal}
              disabled={availableClasses.length === 0}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-white font-bold text-xs transition-colors shadow-sm ${
                availableClasses.length === 0
                  ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-60'
                  : 'bg-clinical-600 hover:bg-clinical-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Assessment
            </button>
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
                {availableClasses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                      <div className="max-w-md mx-auto space-y-2">
                        <p className="font-semibold text-slate-600 dark:text-slate-300">No active class section is assigned to you for course {selectedSubjectCode}.</p>
                        <p className="text-[11px] text-slate-400">
                          Assessment tracking requires an active class section. Select a course with active sections above, or create one in{' '}
                          <Link to="/faculty/classes" className="text-clinical-600 dark:text-clinical-400 underline font-semibold">
                            My Classes & Rosters
                          </Link>.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : activeAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                      No active assessments created for this course. Click "Add Assessment" to create one.
                    </td>
                  </tr>
                ) : (
                  activeAssessments.map(ass => (
                    <tr key={ass.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{ass.title}</div>
                        {ass.instructions && <span className="text-[10px] text-slate-400 line-clamp-1">{ass.instructions}</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded-md font-semibold bg-clinical-50 text-clinical-600 dark:bg-clinical-950/40 dark:text-clinical-450 uppercase text-[9px] tracking-wide">
                          {ass.type}
                        </span>
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
                                  archiveAssessment(ass.id);
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
                                  deleteAssessment(ass.id);
                                  showFeedback(response.message, 'success');
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="w-5 h-5 text-clinical-550" />
              Configure Grading Weights & Schema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveFullComponentsSchema} className="space-y-6">
              {/* SECTION 0: TARGET COURSE / SUBJECT SELECTION */}
              <div className="p-4 rounded-2xl bg-clinical-50/70 dark:bg-slate-900 border border-clinical-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider block">
                    Target Course / Subject
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Select the specific course to configure grading weights and schema for:
                  </p>
                </div>
                <select
                  value={selectedSubjectCode}
                  onChange={(e) => setSelectedSubjectCode(e.target.value)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold text-xs text-clinical-700 dark:text-clinical-400 focus:outline-none focus:ring-2 focus:ring-clinical-500 min-w-[200px]"
                >
                  {assignedSubjects.map(code => (
                    <option key={code} value={code}>
                      {code} - {code === 'CLIN401' ? 'Clinical Dentistry I' : code === 'CLIN402' ? 'Clinical Dentistry II' : code === 'CLIN301' ? 'Dental Prosthodontics I' : code === 'CLIN302' ? 'Dental Prosthodontics II' : 'Dental Subject'}
                    </option>
                  ))}
                </select>
              </div>

              {/* SECTION 1: OVERALL TERM WEIGHTING SPLIT */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Overall Term Ratio (Midterm vs Final)
                    </h4>
                    <p className="text-[10px] text-slate-400">Configure how Midterm grade and Final grade combine into Overall GWA.</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${termRatioSum === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    Sum: {termRatioSum}%
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Midterm Term Weight (%):</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={termRatio.midterm}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setTermRatio(prev => ({ midterm: val, final: 100 - val }));
                        setIsComponentsSaved(false);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Final Term Weight (%):</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={termRatio.final}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setTermRatio(prev => ({ final: val, midterm: 100 - val }));
                        setIsComponentsSaved(false);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: PERIOD SCHEMA TAB SWITCHER */}
              <div className="space-y-4">
                <div className="flex border-b border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSchemaPeriodTab('Midterm')}
                    className={`pb-2 px-4 text-xs font-bold transition-all border-b-2 ${
                      schemaPeriodTab === 'Midterm'
                        ? 'border-clinical-600 text-clinical-600 dark:text-clinical-400'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Midterm Period Schema ({midtermWeightsSum}%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchemaPeriodTab('Final')}
                    className={`pb-2 px-4 text-xs font-bold transition-all border-b-2 ${
                      schemaPeriodTab === 'Final'
                        ? 'border-clinical-600 text-clinical-600 dark:text-clinical-400'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Final Period Schema ({finalWeightsSum}%)
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
                  <span>Category weights for <strong>{schemaPeriodTab} Period</strong> must sum to exactly <strong>100%</strong>.</span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                    (schemaPeriodTab === 'Midterm' ? midtermWeightsSum : finalWeightsSum) === 100
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                  }`}>
                    {schemaPeriodTab === 'Midterm' ? midtermWeightsSum : finalWeightsSum}% / 100%
                  </span>
                </div>

                {/* CATEGORIES TABLE */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-150 dark:divide-slate-800">
                  {(schemaPeriodTab === 'Midterm' ? midtermCategories : finalCategories).map(cat => (
                    <div key={cat.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900">
                      <div className="flex-1 min-w-0">
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Category Name</label>
                        <input
                          type="text"
                          required
                          value={cat.name}
                          onChange={(e) => handleCategoryRowChange(schemaPeriodTab, cat.id, 'name', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-clinical-500"
                          placeholder="Category title..."
                        />
                      </div>

                      <div className="flex items-center gap-3 self-start sm:self-auto">
                        <div className="w-24">
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Weight (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            required
                            value={cat.weight}
                            onChange={(e) => handleCategoryRowChange(schemaPeriodTab, cat.id, 'weight', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs font-extrabold text-center text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        </div>

                        <div className="w-24">
                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Default Max</label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={cat.maxScore}
                            onChange={(e) => handleCategoryRowChange(schemaPeriodTab, cat.id, 'maxScore', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs font-extrabold text-center text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteCategoryRow(schemaPeriodTab, cat.id)}
                          className="mt-4 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-colors"
                          title="Delete category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => handleAddCategoryRow(schemaPeriodTab)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Category to {schemaPeriodTab}
                  </button>
                </div>
              </div>

              {/* SAVE BUTTON & VALIDATION SUMMARY */}
              <div className="pt-4 border-t border-slate-150 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs space-x-3 text-slate-400">
                  <span>Term Split: <strong className={termRatioSum === 100 ? 'text-emerald-500' : 'text-rose-500'}>{termRatioSum}%</strong></span>
                  <span>•</span>
                  <span>Midterm: <strong className={midtermWeightsSum === 100 ? 'text-emerald-500' : 'text-rose-500'}>{midtermWeightsSum}%</strong></span>
                  <span>•</span>
                  <span>Final: <strong className={finalWeightsSum === 100 ? 'text-emerald-500' : 'text-rose-500'}>{finalWeightsSum}%</strong></span>
                </div>

                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-6 py-3 rounded-2xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-md transition-all active:scale-97"
                >
                  <Save className="w-4 h-4" />
                  <span>{isComponentsSaved ? 'Grading Schema Saved!' : 'Save Components Schema'}</span>
                </button>
              </div>
            </form>
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
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj ? subj.components.quizzes.toFixed(1) : '80.0'}%</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj ? subj.components.practicum.toFixed(1) : '80.0'}%</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj ? subj.components.exams.toFixed(1) : '80.0'}%</td>
                        <td className="px-5 py-3 text-center font-mono text-slate-700 dark:text-slate-350">{subj ? subj.components.attendance.toFixed(1) : '90.0'}%</td>
                        <td className="px-5 py-3 text-center font-extrabold text-sm text-slate-850 dark:text-slate-100">
                          {subj ? subj.grade.toFixed(2) : '2.50'}
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
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj ? subj.components.quizzes.toFixed(1) : '80.0'}%</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj ? subj.components.practicum.toFixed(1) : '80.0'}%</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj ? subj.components.exams.toFixed(1) : '80.0'}%</td>
                  <td className="border border-slate-300 px-4 py-2 text-center">{subj ? subj.components.attendance.toFixed(1) : '90.0'}%</td>
                  <td className="border border-slate-300 px-4 py-2 text-center font-extrabold">{subj ? subj.grade.toFixed(2) : '2.50'}</td>
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
              onChange={(e) => setAssClassId(e.target.value)}
              required
              disabled={availableClasses.length === 0}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
            >
              {availableClasses.map(classItem => (
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
              <select
                value={assType}
                onChange={(e) => setAssType(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none"
              >
                {activePeriodCategoryOptions.map(catName => (
                  <option key={catName} value={catName}>{catName}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Grading Period
              </label>
              <select
                value={assPeriod}
                onChange={(e) => {
                  const newPeriod = e.target.value as 'Midterm' | 'Final';
                  setAssPeriod(newPeriod);
                  const validCats = newPeriod === 'Midterm' ? midtermCategoryOptions : finalCategoryOptions;
                  if (validCats.length > 0 && !validCats.includes(assType)) {
                    setAssType(validCats[0]);
                  }
                }}
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
              className="px-4 py-2.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-md"
            >
              Confirm Assessment
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
