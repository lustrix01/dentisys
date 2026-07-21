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
  ClipboardCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, EnrolledSubject, GradeComponents, Assessment, AssessmentScore, GradingComponentConfig } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { percentageToGWA, gwaToDescription, computeSubjectGrade } from '../../utils/gradeHelper';
import { recordAudit } from '../../services/auditService';

import { getFacultyAssessmentsApi, saveFacultyAssessmentsApi } from '../../services/apiClient';

export const GradeComputation: React.FC = () => {
  const { user } = useAuth();
  const { 
    students, 
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

  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];
  const assignedClasses = ['CLINIC-A'];

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFacultyAssessmentsApi()
      .then(() => setLoading(false))
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
  const [selectedSubjectCode, setSelectedSubjectCode] = useState(assignedSubjects[0] || 'CLIN401');
  const [selectedClassId, setSelectedClassId] = useState(assignedClasses[0] || 'CLINIC-A');

  // Filter students under active subject/class scope
  const activeStudents = useMemo(() => {
    return students.filter(s =>
      s.classId === selectedClassId &&
      s.enrolledSubjects.some(sub => sub.code === selectedSubjectCode)
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
  const [assType, setAssType] = useState<'Quiz' | 'Activity' | 'Assignment' | 'Laboratory' | 'Midterm Exam' | 'Final Exam' | 'Others'>('Quiz');
  const [assPeriod, setAssPeriod] = useState<'Midterm' | 'Final'>('Midterm');
  const [assMaxScore, setAssMaxScore] = useState(50);
  const [assDueDate, setAssDueDate] = useState('');
  const [assInstructions, setAssInstructions] = useState('');
  const [assRemarks, setAssRemarks] = useState('');
  const [assStatus, setAssStatus] = useState<'Active' | 'Closed'>('Active');

  const activeAssessments = useMemo(() => {
    return assessments.filter(a =>
      a.subjectCode === selectedSubjectCode &&
      a.classId === selectedClassId &&
      a.status !== 'Archived'
    );
  }, [assessments, selectedSubjectCode, selectedClassId]);

  const openNewAssessmentModal = () => {
    setEditingAssessment(null);
    setAssTitle('');
    setAssType('Quiz');
    setAssPeriod('Midterm');
    setAssMaxScore(50);
    setAssDueDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setAssInstructions('');
    setAssRemarks('');
    setAssStatus('Active');
    setIsAssessmentModalOpen(true);
  };

  const openEditAssessmentModal = (ass: Assessment) => {
    setEditingAssessment(ass);
    setAssTitle(ass.title);
    setAssType(ass.type);
    setAssPeriod(ass.gradingPeriod);
    setAssMaxScore(ass.maxScore);
    setAssDueDate(ass.dueDate);
    setAssInstructions(ass.instructions || '');
    setAssRemarks(ass.remarks || '');
    setAssStatus(ass.status === 'Archived' ? 'Active' : ass.status);
    setIsAssessmentModalOpen(true);
  };

  const handleAssessmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assTitle) return;

    if (editingAssessment) {
      updateAssessment({
        ...editingAssessment,
        title: assTitle,
        type: assType,
        gradingPeriod: assPeriod,
        maxScore: assMaxScore,
        dueDate: assDueDate,
        instructions: assInstructions,
        remarks: assRemarks,
        status: assStatus as 'Active' | 'Closed' | 'Archived',
      });
      alert('Assessment updated successfully.');
    } else {
      addAssessment({
        title: assTitle,
        type: assType,
        subjectCode: selectedSubjectCode,
        classId: selectedClassId,
        gradingPeriod: assPeriod,
        maxScore: assMaxScore,
        dueDate: assDueDate,
        instructions: assInstructions,
        remarks: assRemarks,
        status: assStatus as 'Active' | 'Closed' | 'Archived',
      });
      alert('Assessment created successfully.');
    }
    setIsAssessmentModalOpen(false);
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

  // Auto-save on input blur
  const handleScoreBlur = (studentId: string) => {
    if (!autoSaveEnabled || !selectedAssessmentId || !activeAssessment) return;
    const item = scoresInputState[studentId];
    if (!item) return;

    if (!validateSingleScore(item.score, activeAssessment.maxScore)) return;

    const currentScoreValue = item.score ? parseFloat(item.score) : undefined;
    
    // Save to context
    const saveList = Object.entries(scoresInputState)
      .filter(([id, val]) => val.score !== '')
      .map(([id, val]) => ({
        studentId: id,
        score: parseFloat(val.score),
        remarks: val.remarks
      }));
    saveAssessmentScores(selectedAssessmentId, saveList);
  };

  const handleManualSaveScores = () => {
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
      alert('Some scores are invalid! Make sure scores do not exceed the maximum allowed for this assessment.');
      return;
    }

    saveAssessmentScores(selectedAssessmentId, saveList);
    setIsScoresSavedAlert(true);
    setTimeout(() => {
      setIsScoresSavedAlert(false);
    }, 3000);
  };

  // Filter roster for scores entry
  const filteredScoreStudents = useMemo(() => {
    return activeStudents.filter(s =>
      s.name.toLowerCase().includes(scoreSearch.toLowerCase()) ||
      s.studentId.toLowerCase().includes(scoreSearch.toLowerCase())
    );
  }, [activeStudents, scoreSearch]);

  // ----------------------------------------------------
  // 3. GRADE COMPONENTS TAB STATE
  // ----------------------------------------------------
  const [componentWeights, setComponentWeights] = useState<Record<string, { weight: string; maxScore: string }>>({});
  const [isComponentsSaved, setIsComponentsSaved] = useState(false);

  const categoriesList = ['Quiz', 'Activity', 'Assignment', 'Laboratory', 'Midterm Exam', 'Final Exam', 'Attendance'];

  useEffect(() => {
    const weights: Record<string, { weight: string; maxScore: string }> = {};
    categoriesList.forEach(cat => {
      const config = gradingComponents.find(c => c.subjectCode === selectedSubjectCode && c.category === cat);
      const defaults: Record<string, { weight: number; maxScore: number }> = {
        'Quiz': { weight: 15, maxScore: 50 },
        'Activity': { weight: 15, maxScore: 50 },
        'Assignment': { weight: 10, maxScore: 100 },
        'Laboratory': { weight: 30, maxScore: 100 },
        'Midterm Exam': { weight: 10, maxScore: 100 },
        'Final Exam': { weight: 10, maxScore: 100 },
        'Attendance': { weight: 10, maxScore: 100 }
      };
      weights[cat] = {
        weight: config ? config.weight.toString() : defaults[cat].weight.toString(),
        maxScore: config ? config.maxScore.toString() : defaults[cat].maxScore.toString()
      };
    });
    setComponentWeights(weights);
    setIsComponentsSaved(false);
  }, [selectedSubjectCode, gradingComponents]);

  const handleComponentChange = (cat: string, val: string, field: 'weight' | 'maxScore') => {
    setComponentWeights(prev => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [field]: val
      }
    }));
    setIsComponentsSaved(false);
  };

  const weightsSum = useMemo(() => {
    let sum = 0;
    Object.values(componentWeights).forEach(w => {
      const num = parseInt(w.weight);
      if (!isNaN(num)) sum += num;
    });
    return sum;
  }, [componentWeights]);

  const handleSaveComponents = (e: React.FormEvent) => {
    e.preventDefault();
    if (weightsSum !== 100) {
      alert(`The sum of weights must equal exactly 100%. Currently it is ${weightsSum}%.`);
      return;
    }

    const configs: GradingComponentConfig[] = Object.entries(componentWeights).map(([cat, val]) => ({
      subjectCode: selectedSubjectCode,
      category: cat as any,
      weight: parseInt(val.weight) || 0,
      maxScore: parseInt(val.maxScore) || 100
    }));

    updateSubjectGradingComponents(selectedSubjectCode, configs);
    setIsComponentsSaved(true);
    setTimeout(() => {
      setIsComponentsSaved(false);
    }, 3000);
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
        } else if (matchedStudent.classId !== selectedClassId) {
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

  const handleConfirmImport = () => {
    if (csvErrors.length > 0) {
      alert('Please fix the CSV errors listed below before importing.');
      return;
    }

    if (csvPreviewData.length === 0) return;

    const confirmed = window.confirm(
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
    alert('CSV Grades imported and overall student GWAs recalculated successfully.');
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
            {assignedClasses.map((clsId: string) => {
              const classStudent = students.find(s => s.classId === clsId);
              const label = classStudent?.className || clsId;
              return <option key={clsId} value={clsId}>{label}</option>;
            })}
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
              <p className="text-[10px] text-slate-400 mt-0.5">Manage assignments, quizzes, laboratories, and exams</p>
            </div>

            <button
              onClick={openNewAssessmentModal}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs transition-colors shadow-sm"
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
                            onClick={() => {
                              if (confirm(`Archive ${ass.title}?`)) {
                                archiveAssessment(ass.id);
                              }
                            }}
                            className="p-1 text-slate-455 hover:text-amber-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
                            title="Archive"
                          >
                            <Archive className="w-3.8 h-3.8" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Permanently delete ${ass.title}? This will delete all student scores for this assessment.`)) {
                                deleteAssessment(ass.id);
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
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-clinical-550" />
              Configure Grading Weights & Schema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveComponents} className="space-y-5">
              <div className="p-4 rounded-2xl bg-amber-550/10 border border-amber-550/20 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                ⚠️ **Grade Weighting Policy:** The sum of weights across all categories must equal exactly **100%**. These component percentages will overwrite GWA mappings for clinical evaluations.
              </div>

              <div className="divide-y divide-slate-150 dark:divide-slate-800">
                {categoriesList.map(cat => {
                  const entry = componentWeights[cat] || { weight: '0', maxScore: '100' };
                  return (
                    <div key={cat} className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">{cat}</h4>
                        <span className="text-[10px] text-slate-400">Class category weight scale</span>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-1.5">
                          <label className="text-[10px] text-slate-400 uppercase font-bold">Weight (%):</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={entry.weight}
                            onChange={(e) => handleComponentChange(cat, e.target.value, 'weight')}
                            className="w-16 px-2.5 py-1.5 rounded-lg border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-center"
                          />
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <label className="text-[10px] text-slate-400 uppercase font-bold">Default Max:</label>
                          <input
                            type="number"
                            min="1"
                            value={entry.maxScore}
                            onChange={(e) => handleComponentChange(cat, e.target.value, 'maxScore')}
                            className="w-16 px-2.5 py-1.5 rounded-lg border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-150 dark:border-slate-800/80 flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-slate-400">Sum of Weights: </span>
                  <span className={`font-extrabold text-sm ${weightsSum === 100 ? 'text-emerald-500' : 'text-rose-500 font-extrabold'}`}>
                    {weightsSum}%
                  </span>
                </div>

                <button
                  type="submit"
                  className="flex items-center gap-1 px-5 py-3 rounded-2xl bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-md"
                >
                  <Save className="w-4 h-4" />
                  <span>{isComponentsSaved ? 'Grading Weights Saved!' : 'Save Components Schema'}</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Category Type
              </label>
              <select
                value={assType}
                onChange={(e) => setAssType(e.target.value as any)}
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
