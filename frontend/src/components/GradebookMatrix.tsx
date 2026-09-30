import React, { useEffect, useMemo, useState } from 'react';
import {
  FacultyGradeComputeResult,
  FacultyGradingCategoryItem,
  FacultyGradingConfiguration,
  FacultyPeriodBreakdown,
  getFacultyGradingConfigApi,
  previewFacultyGradesApi,
} from '../services/apiClient';

interface MatrixStudent {
  id: string;
  studentId: string;
  name: string;
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
  isValidScore: (value: string, maxScore: number) => boolean;
  /** Changes after each save so the calculated columns are fetched again. */
  refreshKey: number;
}

type PeriodKey = 'midterm' | 'final';

interface CategoryGroup {
  category: FacultyGradingCategoryItem;
  assessments: MatrixAssessment[];
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
 * grouped by the course's saved Grade Weights categories (score inputs, then
 * the category Total and Weighted), the period totals, and the Final Grade.
 * Every calculated column comes from the server's own computation (a preview
 * that saves nothing), so it reflects the saved scores.
 */
export const GradebookMatrix: React.FC<GradebookMatrixProps> = ({
  classId, offering, students, assessments, scores, onScoreChange, isValidScore, refreshKey,
}) => {
  const [config, setConfig] = useState<FacultyGradingConfiguration | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [results, setResults] = useState<Record<string, FacultyGradeComputeResult>>({});
  const [computeNotice, setComputeNotice] = useState<string | null>(null);

  const offeringKey = offering ? `${offering.courseId}|${offering.semester}|${offering.schoolYear}` : '';
  useEffect(() => {
    let active = true;
    setConfigLoaded(false);
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
    // offeringKey captures the offering's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const groups = useMemo(() => {
    const byPeriod: Record<PeriodKey, CategoryGroup[]> = { midterm: [], final: [] };
    if (!periodMode || !config) return byPeriod;
    for (const period of PERIODS) {
      const categories = [...(period.key === 'midterm' ? config.midtermCategories ?? [] : config.finalCategories ?? [])]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      byPeriod[period.key] = categories.map(category => ({
        category,
        assessments: category.sourceKind === 'attendance'
          ? []
          : assessments
            .filter(a => String(a.gradingCategoryId ?? '') === String(category.id ?? '') && (a.gradingPeriod ?? 'Midterm') === period.name)
            .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.title.localeCompare(b.title)),
      }));
    }
    return byPeriod;
  }, [assessments, config, periodMode]);

  const groupedIds = new Set(PERIODS.flatMap(p => groups[p.key].flatMap(g => g.assessments.map(a => a.id))));
  const ungrouped = assessments.filter(a => !groupedIds.has(a.id));

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

  const scoreInput = (student: MatrixStudent, assessment: MatrixAssessment) => {
    const value = scores[student.id]?.[assessment.id] ?? '';
    const valid = isValidScore(value, assessment.maxScore);
    return (
      <td key={assessment.id} className="px-1.5 py-2 text-center">
        <input
          type="number"
          min="0"
          max={assessment.maxScore}
          placeholder={`0-${assessment.maxScore}`}
          aria-label={`${assessment.title} score for ${student.name}`}
          value={value}
          onChange={event => onScoreChange(student.id, assessment.id, event.target.value)}
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

  const periodColumnCount = (key: PeriodKey) =>
    groups[key].reduce((sum, group) => sum + group.assessments.length + 2, 0) + 1;

  return (
    <div className="space-y-2">
      {!periodMode && (
        <p className="px-5 pt-3 text-[11px] text-amber-700 dark:text-amber-400">
          This course has no saved period Grade Weights, so the matrix shows score inputs only. Set up the weights in the Grade Weights Editor to see the category and period totals.
        </p>
      )}
      {computeNotice && <p className="px-5 pt-3 text-[11px] text-slate-500">Calculated columns: {computeNotice}</p>}
      <p className="px-5 pt-1 text-[10px] text-slate-400">Calculated columns use the server's grade computation of the saved scores; they update after “Save All Matrix Scores”.</p>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className={th} colSpan={2}>Student Info</th>
              {periodMode && PERIODS.map(period => (
                <th key={period.key} className={th} colSpan={periodColumnCount(period.key)}>{period.label}</th>
              ))}
              {periodMode && <th className={th} colSpan={2}>Final Grade</th>}
              {ungrouped.length > 0 && <th className={th} colSpan={ungrouped.length}>{periodMode ? 'Not in a category' : 'Assessments'}</th>}
            </tr>
            <tr>
              <th className={th} rowSpan={2}>ID Number</th>
              <th className={`${th} min-w-[200px] text-left`} rowSpan={2}>Full Name</th>
              {periodMode && PERIODS.map(period => (
                <React.Fragment key={period.key}>
                  {groups[period.key].map(group => (
                    <th key={`${period.key}-${group.category.id}`} className={th} colSpan={group.assessments.length + 2}>
                      {group.category.name} ({weightLabel(group.category.weight)})
                    </th>
                  ))}
                  <th className={th} rowSpan={2}>{period.totalLabel}<div className="font-normal normal-case">(100%)</div></th>
                </React.Fragment>
              ))}
              {periodMode && (
                <>
                  <th className={th} rowSpan={2}>Final Grade<div className="font-normal normal-case">(100%)</div></th>
                  <th className={th} rowSpan={2}>Grade<div className="font-normal normal-case">(1.00–5.00)</div></th>
                </>
              )}
              {ungrouped.map(assessment => (
                <th key={assessment.id} className={th} rowSpan={2}>
                  {assessment.title}<div className="font-normal normal-case">({assessment.maxScore})</div>
                </th>
              ))}
            </tr>
            <tr>
              {periodMode && PERIODS.map(period => groups[period.key].map(group => (
                <React.Fragment key={`${period.key}-${group.category.id}-cols`}>
                  {group.assessments.map(assessment => (
                    <th key={assessment.id} className={`${th} min-w-[84px]`}>
                      <span className="normal-case">{assessment.title}</span><div className="font-normal">({assessment.maxScore})</div>
                    </th>
                  ))}
                  <th className={th}>Total</th>
                  <th className={th}>Weighted<div className="font-normal">({weightLabel(group.category.weight)})</div></th>
                </React.Fragment>
              )))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
            {students.length === 0 ? (
              <tr><td colSpan={99} className="py-12 text-center text-slate-400 font-semibold">No matching student records found.</td></tr>
            ) : students.map(student => {
              const result = results[student.id] as { status?: string; percentage?: number; gwa?: number } | undefined;
              const computed = result?.status === 'computed';
              return (
                <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/20">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{student.studentId}</td>
                  <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">{student.name}</td>
                  {periodMode && PERIODS.map(period => (
                    <React.Fragment key={period.key}>
                      {groups[period.key].map(group => {
                        const cells = categoryCells(student.id, period.key, group.category.id);
                        return (
                          <React.Fragment key={`${period.key}-${group.category.id}`}>
                            {group.assessments.map(assessment => scoreInput(student, assessment))}
                            <td className={computedCell} title={cells.title}>{cells.total}</td>
                            <td className={computedCell}>{cells.weighted}</td>
                          </React.Fragment>
                        );
                      })}
                      <td className={totalCell}>{format(periodBreakdown(student.id, period.key)?.percentage)}</td>
                    </React.Fragment>
                  ))}
                  {periodMode && (
                    <>
                      <td className={totalCell}>{computed ? format(result?.percentage) : '—'}</td>
                      <td className={totalCell}>{computed ? format(result?.gwa) : '—'}</td>
                    </>
                  )}
                  {ungrouped.map(assessment => scoreInput(student, assessment))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
