import React, { useEffect, useMemo, useState } from 'react';
import {
  FacultyGradeComputeResult,
  FacultyGradingCategoryItem,
  FacultyGradingConfiguration,
  FacultyPeriodBreakdown,
  getFacultyGradingConfigApi,
  previewFacultyGradesApi,
} from '../services/apiClient';
import { Search, X } from 'lucide-react';
import { percentageToGWA } from '../utils/gradeHelper';

interface MatrixStudent {
  id: string;
  studentId: string;
  name: string;
  lastName?: string;
}

interface MatrixAssessment {
  id: string;
  title: string;
  maxScore: number;
  gradingCategoryId?: string | number | null;
  gradingPeriod?: 'Midterm' | 'Final' | null;
  dueDate?: string | null;
}

interface GradebookMatrixProps {
  classId: string;
  offering: { courseId: number; semester: string; schoolYear: string } | null;
  students: MatrixStudent[];
  assessments: MatrixAssessment[];
  scores: Record<string, Record<string, string>>;
  onScoreChange: (studentId: string, assessmentId: string, value: string) => void;
  onScoreBlur?: (studentId: string, assessmentId: string) => void;
  onSingleActivityView: () => void;
  canSwitchView: boolean;
  isValidScore: (value: string, maxScore: number) => boolean;
  /** Changes after each save so the calculated columns are fetched again. */
  refreshKey: number;
}

type PeriodKey = 'midterm' | 'final';

interface CategoryGroup {
  category: FacultyGradingCategoryItem;
  assessments: MatrixAssessment[];
}

interface ComponentGroup {
  componentKey: 'lecture' | 'laboratory' | 'other' | 'all';
  label: string;
  weight?: number;
  categories: CategoryGroup[];
}

const PERIODS: Array<{ key: PeriodKey; label: string; totalLabel: string; name: 'Midterm' | 'Final' }> = [
  { key: 'midterm', label: 'Midterm', totalLabel: 'Total Midterm', name: 'Midterm' },
  { key: 'final', label: 'Tentative Final Grade', totalLabel: 'Tentative Final', name: 'Final' },
];

const format = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

const weightLabel = (weight: number | string) => `${Number(weight)}%`;

/**
 * Class-record grading matrix: Student info, then Midterm and Tentative Final
 * grouped by component (Lecture / Laboratory) and saved Grade Weights categories.
 * Every calculated column comes from the server's own computation (a preview
 * that saves nothing), so it reflects the saved scores.
 */
export const GradebookMatrix: React.FC<GradebookMatrixProps> = ({
  classId, offering, students, assessments, scores, onScoreChange, onScoreBlur, isValidScore, refreshKey, onSingleActivityView, canSwitchView,
}) => {
  const [config, setConfig] = useState<FacultyGradingConfiguration | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [results, setResults] = useState<Record<string, FacultyGradeComputeResult>>({});
  const [computeNotice, setComputeNotice] = useState<string | null>(null);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 639px)');
    const updateIsPhone = () => setIsPhone(media.matches);
    updateIsPhone();
    media.addEventListener('change', updateIsPhone);
    return () => media.removeEventListener('change', updateIsPhone);
  }, []);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'midterm' | 'final'>('all');
  const [componentFilter, setComponentFilter] = useState<'all' | 'lecture' | 'laboratory'>('all');

  const offeringKey = offering ? `${offering.courseId}|${offering.semester}|${offering.schoolYear}` : '';
  useEffect(() => {
    let active = true;
    if (!config) {
      setConfigLoaded(false);
    }
    if (!offering) {
      setConfig(null);
      setConfigLoaded(true);
      return () => { active = false; };
    }
    getFacultyGradingConfigApi({ courseId: offering.courseId, semester: offering.semester, schoolYear: offering.schoolYear })
      .then(response => { if (active) setConfig(response.configuration ?? null); })
      .catch(() => { if (active) setConfig(null); })
      .finally(() => { if (active) setConfigLoaded(true); });
    return () => { active = false; };
  }, [offeringKey]);

  useEffect(() => {
    let active = true;
    if (!classId) return () => { active = false; };
    setComputeNotice(null);
    previewFacultyGradesApi(classId)
      .then(response => {
        if (!active) return;
        const byStudent: Record<string, FacultyGradeComputeResult> = {};
        for (const result of response.results ?? []) byStudent[String(result.studentId)] = result;
        setResults(byStudent);
      })
      .catch(error => {
        if (!active) return;
        setResults({});
        setComputeNotice(error instanceof Error ? error.message : 'Calculated columns are unavailable.');
      });
    return () => { active = false; };
  }, [classId, refreshKey]);

  const periodMode = config?.schemaMode === 'periods'
    && (config.midtermCategories?.length ?? 0) + (config.finalCategories?.length ?? 0) > 0;

  const periodData = useMemo(() => {
    const byPeriod: Record<PeriodKey, ComponentGroup[]> = { midterm: [], final: [] };
    if (!periodMode || !config) return byPeriod;

    const lectureWeight = config.componentWeights?.lecture;
    const labWeight = config.componentWeights?.laboratory;

    for (const period of PERIODS) {
      const allCategories = [...(period.key === 'midterm' ? config.midtermCategories ?? [] : config.finalCategories ?? [])]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      const toGroup = (cat: FacultyGradingCategoryItem): CategoryGroup => ({
        category: cat,
        assessments: cat.sourceKind === 'attendance'
          ? []
          : assessments
            .filter(a => String(a.gradingCategoryId ?? '') === String(cat.id ?? '') && (a.gradingPeriod ?? 'Midterm') === period.name)
            .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.title.localeCompare(b.title)),
      });

      const lectureCats = allCategories.filter(c => (c.component ?? 'Lecture').toLowerCase() === 'lecture');
      const labCats = allCategories.filter(c => {
        const comp = (c.component ?? '').toLowerCase();
        return comp === 'laboratory' || comp === 'lab';
      });
      const otherCats = allCategories.filter(c => {
        const comp = (c.component ?? '').toLowerCase();
        return comp !== 'lecture' && comp !== 'laboratory' && comp !== 'lab' && comp !== '';
      });

      const comps: ComponentGroup[] = [];
      if (lectureCats.length > 0) {
        comps.push({
          componentKey: 'lecture',
          label: 'Lecture',
          weight: lectureWeight,
          categories: lectureCats.map(toGroup),
        });
      }
      if (labCats.length > 0) {
        comps.push({
          componentKey: 'laboratory',
          label: 'Laboratory',
          weight: labWeight,
          categories: labCats.map(toGroup),
        });
      }
      if (otherCats.length > 0) {
        comps.push({
          componentKey: 'other',
          label: 'Other',
          weight: undefined,
          categories: otherCats.map(toGroup),
        });
      }
      if (comps.length === 0 && allCategories.length > 0) {
        comps.push({
          componentKey: 'all',
          label: 'Assessments',
          weight: undefined,
          categories: allCategories.map(toGroup),
        });
      }

      byPeriod[period.key] = comps;
    }
    return byPeriod;
  }, [assessments, config, periodMode]);

  const groupedIds = useMemo(() => {
    return new Set(
      PERIODS.flatMap(p =>
        (periodData[p.key] ?? []).flatMap(comp =>
          comp.categories.flatMap(g => g.assessments.map(a => a.id))
        )
      )
    );
  }, [periodData]);

  const ungrouped = useMemo(() => {
    return assessments.filter(a => !groupedIds.has(a.id));
  }, [assessments, groupedIds]);

  const getStudentLastName = (student: MatrixStudent): string => {
    if (student.lastName && student.lastName.trim()) return student.lastName.trim();
    const parts = student.name.trim().split(/\s+/);
    return parts.length > 0 ? parts[parts.length - 1] : student.name;
  };

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = !q
      ? students
      : students.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.studentId.toLowerCase().includes(q)
        );
    return [...list].sort((a, b) => {
      const lastA = getStudentLastName(a).toLowerCase();
      const lastB = getStudentLastName(b).toLowerCase();
      const cmp = lastA.localeCompare(lastB);
      if (cmp !== 0) return cmp;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }, [students, searchTerm]);

  const componentColSpan = (comp: ComponentGroup) =>
    comp.categories.reduce((sum, g) => sum + g.assessments.length + 2, 0) + (comp.componentKey !== 'all' ? 1 : 0);

  const componentPercentage = (studentId: string, key: PeriodKey, comp: ComponentGroup): string => {
    const pb = periodBreakdown(studentId, key);
    if (!pb) return '—';

    const compKey = comp.componentKey as 'lecture' | 'laboratory';
    if (pb.components && pb.components[compKey]) {
      const compEval = pb.components[compKey];
      if (typeof compEval?.percentage === 'number') {
        return format(compEval.percentage, 2);
      }
    }

    return '—';
  };

  const getVisibleComponents = (periodKey: PeriodKey) => {
    const comps = periodData[periodKey] ?? [];
    if (componentFilter === 'all') return comps;
    return comps.filter(c => c.componentKey === componentFilter);
  };

  const periodColumnCount = (periodKey: PeriodKey) => {
    const comps = getVisibleComponents(periodKey);
    return comps.reduce((sum, c) => sum + componentColSpan(c), 0) + 2;
  };

  const periodEquivalentGrade = (percentage: number | null | undefined): string => {
    if (percentage === null || percentage === undefined || !Number.isFinite(percentage)) return '—';
    return format(percentageToGWA(percentage), 2);
  };

  const visiblePeriods = PERIODS.filter(p => periodFilter === 'all' || p.key === periodFilter);
  const showFinalGrade = periodMode && (periodFilter === 'all' || periodFilter === 'final');

  const periodBreakdown = (studentId: string, key: PeriodKey): FacultyPeriodBreakdown | null => {
    const result = results[studentId] as { periods?: Record<PeriodKey, FacultyPeriodBreakdown> } | undefined;
    return result?.periods?.[key] ?? null;
  };

  const categoryCells = (studentId: string, key: PeriodKey, categoryId: number | null | undefined) => {
    const detail = periodBreakdown(studentId, key)?.categories.find(c => c.categoryId === categoryId);
    return detail
      ? { total: format(detail.earnedPoints, 2), weighted: format(detail.contribution, 2), title: `${detail.earnedPoints} of ${detail.possiblePoints}` }
      : { total: '—', weighted: '—', title: 'Not complete yet' };
  };

  const scoreInput = (student: MatrixStudent, assessment: MatrixAssessment, studentIndex: number) => {
    const value = scores[student.id]?.[assessment.id] ?? '';
    const valid = isValidScore(value, assessment.maxScore);
    const inputId = `matrix-score-${studentIndex}-${assessment.id}`;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextInput = document.getElementById(`matrix-score-${studentIndex + 1}-${assessment.id}`) as HTMLInputElement | null;
        if (!nextInput) onScoreBlur?.(student.id, assessment.id);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevInput = document.getElementById(`matrix-score-${studentIndex - 1}-${assessment.id}`) as HTMLInputElement | null;
        if (!prevInput) onScoreBlur?.(student.id, assessment.id);
        if (prevInput) {
          prevInput.focus();
          prevInput.select();
        }
      }
    };

    return (
      <td key={assessment.id} className="px-1.5 py-2 text-center">
        <input
          id={inputId}
          inputMode="decimal"
          type="number"
          min="0"
          max={assessment.maxScore}
          placeholder={`0-${assessment.maxScore}`}
          aria-label={`${assessment.title} score for ${student.name}`}
          value={value}
          onChange={event => onScoreChange(student.id, assessment.id, event.target.value)}
          onBlur={event => { if (!(event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('[data-manual-score-save]'))) onScoreBlur?.(student.id, assessment.id); }}
          onKeyDown={handleKeyDown}
          className={`w-16 px-1.5 py-1 rounded-lg border text-xs text-center font-bold focus:outline-none ${!valid
            ? 'border-rose-500 bg-rose-50/50'
            : value === ''
              ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
              : 'border-clinical-500/30 bg-clinical-50/20'}`}
        />
      </td>
    );
  };

  const th = 'px-2 py-2 text-center border border-slate-200 dark:border-slate-800';
  const computedCell = 'px-2 py-2 text-center font-mono text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-900/40';
  const totalCell = 'px-2 py-2 text-center font-mono font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800/60';

  if (!configLoaded) {
    return <p className="p-6 text-xs text-slate-400">Loading the grading matrix…</p>;
  }

  return (
    <div className="space-y-3">
      {/* Interactive Filters Bar */}
      <div className="px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-150 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Student Search */}
          <div className="relative min-w-[210px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search student or ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-clinical-500/20 focus:border-clinical-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {periodMode && (
            <>
              {/* Period Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Period:</span>
                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-850 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-750">
                  <button
                    type="button"
                    onClick={() => setPeriodFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      periodFilter === 'all'
                        ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodFilter('midterm')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      periodFilter === 'midterm'
                        ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    Midterm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodFilter('final')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      periodFilter === 'final'
                        ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    Finals
                  </button>
                </div>
              </div>

              {/* Component Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Component:</span>
                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-850 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-755">
                  <button
                    type="button"
                    onClick={() => setComponentFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      componentFilter === 'all'
                        ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setComponentFilter('lecture')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      componentFilter === 'lecture'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    Lecture
                  </button>
                  <button
                    type="button"
                    onClick={() => setComponentFilter('laboratory')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      componentFilter === 'laboratory'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    Laboratory
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="text-[11px] text-slate-400">
          Showing <span className="font-bold text-slate-700 dark:text-slate-200">{filteredStudents.length}</span> of {students.length} students
        </div>
      </div>

      {!periodMode && (
        <p className="px-5 pt-1 text-[11px] text-amber-700 dark:text-amber-400">
          This course has no saved period Grade Weights, so the matrix shows score inputs only. Set up the weights in the Grade Weights Editor to see the category and period totals.
        </p>
      )}
      {computeNotice && <p className="px-5 pt-1 text-[11px] text-slate-500">Calculated columns: {computeNotice}</p>}
      <p className="px-5 text-[10px] text-slate-400">Calculated columns use the server's grade computation of the saved scores; they update after “Save All Matrix Scores”.</p>

      <div className="sm:hidden px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
        <p>The full matrix is easier on a larger screen. Use Single Activity View to enter scores on a phone.</p>
        <button type="button" onClick={onSingleActivityView} disabled={!canSwitchView} className="mt-2 font-bold text-clinical-600 dark:text-clinical-400 underline disabled:opacity-50">Single Activity View</button>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-30 bg-slate-50 dark:bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {/* ROW 1: Period Headers */}
            <tr>
              <th className={`${th} sticky left-0 z-20 bg-slate-50 dark:bg-slate-900`} colSpan={isPhone ? 1 : 2}>Student Info</th>
              {periodMode && visiblePeriods.map(period => (
                <th key={period.key} className={th} colSpan={periodColumnCount(period.key)}>{period.label}</th>
              ))}
              {showFinalGrade && <th className={th} colSpan={2}>Final Grade</th>}
              {ungrouped.length > 0 && <th className={th} colSpan={ungrouped.length}>{periodMode ? 'Not in a category' : 'Assessments'}</th>}
            </tr>

            {/* ROW 2: Component Separation (Lecture vs Laboratory) */}
            <tr>
              {!isPhone && <th className={`${th} sticky left-0 z-20 w-[120px] min-w-[120px] max-w-[120px] bg-slate-50 dark:bg-slate-900`} rowSpan={periodMode ? 3 : 1}>ID Number</th>}
              <th className={`${th} sticky z-20 ${isPhone ? 'left-0 w-[140px] min-w-[140px] max-w-[140px]' : 'left-[120px] w-[200px] min-w-[200px] max-w-[200px]'} text-left bg-slate-50 dark:bg-slate-900`} rowSpan={periodMode ? 3 : 1}>Full Name</th>
              {periodMode && visiblePeriods.map(period => (
                <React.Fragment key={`${period.key}-comps`}>
                  {getVisibleComponents(period.key).map(comp => (
                    <th
                      key={`${period.key}-${comp.componentKey}`}
                      className={`${th} ${
                        comp.componentKey === 'laboratory'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-extrabold'
                          : comp.componentKey === 'lecture'
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-extrabold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold'
                      }`}
                      colSpan={componentColSpan(comp)}
                    >
                      {comp.label} {comp.weight !== undefined ? `(${comp.weight}%)` : ''}
                    </th>
                  ))}
                  <th
                    className={`${th} font-extrabold min-w-[85px] ${
                      period.key === 'midterm'
                        ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800'
                        : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-800'
                    }`}
                    rowSpan={3}
                  >
                    {period.totalLabel}
                    <div className="font-normal normal-case">(100%)</div>
                  </th>
                  <th
                    className={`${th} font-extrabold min-w-[85px] ${
                      period.key === 'midterm'
                        ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800'
                        : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-800'
                    }`}
                    rowSpan={3}
                  >
                    {period.key === 'midterm' ? 'Midterm Grade' : 'Final Grade'}
                    <div className="font-normal normal-case">(1.00–5.00)</div>
                  </th>
                </React.Fragment>
              ))}
              {showFinalGrade && (
                <>
                  <th className={`${th} bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800 font-extrabold min-w-[85px]`} rowSpan={3}>
                    Final Grade<div className="font-normal normal-case">(100%)</div>
                  </th>
                  <th className={`${th} bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800 font-extrabold min-w-[85px]`} rowSpan={3}>
                    Final Grade<div className="font-normal normal-case">(1.00–5.00)</div>
                  </th>
                </>
              )}
              {ungrouped.map(assessment => (
                <th key={assessment.id} className={th} rowSpan={periodMode ? 3 : 1}>
                  {assessment.title}<div className="font-normal normal-case">({assessment.maxScore})</div>
                </th>
              ))}
            </tr>

            {/* ROW 3: Categories Under Components */}
            {periodMode && (
              <tr>
                {visiblePeriods.map(period => (
                  <React.Fragment key={`${period.key}-cats`}>
                    {getVisibleComponents(period.key).map(comp => (
                      <React.Fragment key={`${period.key}-${comp.componentKey}-cats-group`}>
                        {comp.categories.map(group => (
                          <th key={`${period.key}-${group.category.id}`} className={th} colSpan={group.assessments.length + 2}>
                            {group.category.name} ({weightLabel(group.category.weight)})
                          </th>
                        ))}
                        {comp.componentKey !== 'all' && (
                          <th
                            key={`${period.key}-${comp.componentKey}-total-header`}
                            className={`${th} ${
                              comp.componentKey === 'laboratory'
                                ? 'bg-emerald-100/70 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 font-extrabold'
                                : comp.componentKey === 'lecture'
                                  ? 'bg-blue-100/70 dark:bg-blue-950/70 text-blue-800 dark:text-blue-200 font-extrabold'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold'
                            }`}
                            rowSpan={2}
                          >
                            {comp.label} %
                            <div className="font-normal normal-case">(100%)</div>
                          </th>
                        )}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
            )}

            {/* ROW 4: Assessment Columns, Category Total & Weighted */}
            {periodMode && (
              <tr>
                {visiblePeriods.map(period => (
                  <React.Fragment key={`${period.key}-subcols`}>
                    {getVisibleComponents(period.key).map(comp => comp.categories.map(group => (
                      <React.Fragment key={`${period.key}-${group.category.id}-cols`}>
                        {group.assessments.map(assessment => (
                          <th key={assessment.id} className={`${th} min-w-[84px]`}>
                            <span className="normal-case">{assessment.title}</span>
                            <div className="font-normal">({assessment.maxScore})</div>
                          </th>
                        ))}
                        <th className={th}>Total</th>
                        <th className={th}>Weighted<div className="font-normal">({weightLabel(group.category.weight)})</div></th>
                      </React.Fragment>
                    )))}
                  </React.Fragment>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
            {filteredStudents.length === 0 ? (
              <tr><td colSpan={99} className="py-12 text-center text-slate-400 font-semibold">No matching student records found.</td></tr>
            ) : filteredStudents.map((student, studentIndex) => {
              const result = results[student.id] as { status?: string; percentage?: number; gwa?: number } | undefined;
              const computed = result?.status === 'computed';
              return (
                <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/20">
                  {!isPhone && <td className="sticky left-0 z-10 w-[120px] min-w-[120px] max-w-[120px] px-3 py-2 font-mono text-[11px] text-slate-500 break-all bg-white dark:bg-slate-900">{student.studentId}</td>}
                  <td className={`sticky z-10 ${isPhone ? 'left-0 w-[140px] min-w-[140px] max-w-[140px]' : 'left-[120px] w-[200px] min-w-[200px] max-w-[200px]'} px-3 py-2 font-bold text-slate-800 dark:text-slate-200 break-words bg-white dark:bg-slate-900`}>{student.name}{isPhone && <span className="block mt-1 font-mono text-[10px] font-normal text-slate-500 break-all">{student.studentId}</span>}</td>
                  {periodMode && visiblePeriods.map(period => (
                    <React.Fragment key={period.key}>
                      {getVisibleComponents(period.key).map(comp => (
                        <React.Fragment key={`${period.key}-${comp.componentKey}`}>
                          {comp.categories.map(group => {
                            const cells = categoryCells(student.id, period.key, group.category.id);
                            return (
                              <React.Fragment key={`${period.key}-${group.category.id}`}>
                                {group.assessments.map(assessment => scoreInput(student, assessment, studentIndex))}
                                <td className={computedCell} title={cells.title}>{cells.total}</td>
                                <td className={computedCell}>{cells.weighted}</td>
                              </React.Fragment>
                            );
                          })}
                          {comp.componentKey !== 'all' && (
                            <td
                              className={`${totalCell} font-extrabold ${
                                comp.componentKey === 'laboratory'
                                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                                  : comp.componentKey === 'lecture'
                                    ? 'bg-blue-50/60 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300'
                                    : ''
                              }`}
                              title={`${comp.label} earned percentage: ${componentPercentage(student.id, period.key, comp)}%`}
                            >
                              {componentPercentage(student.id, period.key, comp)}
                            </td>
                          )}
                        </React.Fragment>
                      ))}
                      {(() => {
                        const isMidterm = period.key === 'midterm';
                        const pct = periodBreakdown(student.id, period.key)?.percentage;
                        const cellBg = isMidterm
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 border-amber-200/70 dark:border-amber-800/60'
                          : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 border-indigo-200/70 dark:border-indigo-800/60';

                        return (
                          <>
                            <td className={`${totalCell} ${cellBg} font-extrabold`} title={`${period.totalLabel}: ${format(pct)}%`}>
                              {format(pct)}
                            </td>
                            <td className={`${totalCell} ${cellBg} font-extrabold`} title={`${isMidterm ? 'Midterm Grade' : 'Final Grade'} (1.00–5.00): ${periodEquivalentGrade(pct)}`}>
                              {periodEquivalentGrade(pct)}
                            </td>
                          </>
                        );
                      })()}
                    </React.Fragment>
                  ))}
                  {showFinalGrade && (
                    <>
                      <td className={`${totalCell} bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-extrabold`}>
                        {computed ? format(result?.percentage) : '—'}
                      </td>
                      <td className={`${totalCell} bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-extrabold`}>
                        {computed ? format(result?.gwa) : '—'}
                      </td>
                    </>
                  )}
                  {ungrouped.map(assessment => scoreInput(student, assessment, studentIndex))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
