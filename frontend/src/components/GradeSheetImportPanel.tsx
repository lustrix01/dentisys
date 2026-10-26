import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, FileSpreadsheet, Save, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { requestConfirmation } from './FeedbackCenter';
import type { Assessment, AssessmentScore, Student } from '../types';
import type { FacultyGradingCategoryItem, FacultyGradingConfiguration } from '../services/apiClient';
import {
  buildPlan, buildPreview, checkWorkbookFile, emptyDecisions, OUT, parseWorkbook,
  type Cell, type CellView, type Component, type Decisions, type GradeSheetImportPlan, type ImportContext,
  type ItemView, type ParsedSheet, type Period, type SavedAssessment, type SavedCategory,
} from '../utils/gradeSheetImport';

export type { GradeSheetImportPlan } from '../utils/gradeSheetImport';

interface Props {
  classId: string;
  classLabel: string; // e.g. "DM 116 · DMD-3A"
  cls: { courseName: string; semester: string; schoolYear: string };
  config: FacultyGradingConfiguration | null;
  configStatus: 'loading' | 'configured' | 'unconfigured' | 'error';
  configError?: string;
  onRetryConfig: () => void;
  onOpenWeights: () => void;
  assessments: Assessment[]; // this class, not archived
  scores: AssessmentScore[];
  students: Student[]; // this class's roster
  /** Saves the plan in one all-or-nothing request. Resolve = saved (the panel resets); reject = keep the preview (the caller shows the error). */
  onImport: (plan: GradeSheetImportPlan) => Promise<void>;
}

const noteBase = 'p-3 rounded-xl border text-[11px] leading-relaxed';
const note = {
  amber: `${noteBase} bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-400`,
  rose: `${noteBase} bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30 text-rose-700 dark:text-rose-400`,
  green: `${noteBase} bg-clinical-50 dark:bg-clinical-950/30 border-clinical-200 dark:border-clinical-900/40 text-clinical-700 dark:text-clinical-300`,
};
const chip = 'inline-flex items-center px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300';
const statChip = (tone: 'green' | 'amber' | 'rose' | 'plain') => ({
  green: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  plain: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
}[tone]);
const selectCls = 'px-2.5 py-1.5 rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500 max-w-full';
const btnCls = 'px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-clinical-600 dark:text-clinical-400 hover:border-clinical-400 cursor-pointer';
const sectionTitle = 'text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider';
const rowCls = 'flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40';
const rowBlocked = 'flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20';
const subtle = 'block text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-0.5';
const periodLabel = (p: Period) => (p === 'Final' ? 'Finals' : 'Midterm');

export const GradeSheetImportPanel: React.FC<Props> = ({
  classId, classLabel, cls, config, configStatus, configError, onRetryConfig, onOpenWeights, assessments, scores, students, onImport,
}) => {
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dec, setDec] = useState<Decisions>(emptyDecisions);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName(''); setSheets([]); setError(''); setDec(emptyDecisions());
    if (inputRef.current) inputRef.current.value = '';
  };
  useEffect(reset, [classId]);

  const periodMode = config?.schemaMode === 'periods';
  const ctx = useMemo<ImportContext>(() => {
    const cats: SavedCategory[] = [];
    const add = (list: FacultyGradingCategoryItem[] | undefined, period: Period) => {
      for (const c of list ?? []) {
        if (c.id === null || c.id === undefined) continue;
        cats.push({ id: c.id, name: c.name, weight: Number(c.weight), period, component: c.component ?? null, attendance: c.sourceKind === 'attendance' });
      }
    };
    add(config?.midtermCategories, 'Midterm');
    add(config?.finalCategories, 'Final');
    const catById = new Map(cats.map(c => [String(c.id), c]));
    const ids = new Set(assessments.map(a => a.id));
    const saved: Record<string, number> = {};
    for (const s of scores) if (ids.has(s.assessmentId)) saved[`${s.assessmentId}|${s.studentId}`] = s.score;
    const savedAssessments: SavedAssessment[] = assessments.map(a => {
      const c = a.gradingCategoryId === null || a.gradingCategoryId === undefined ? undefined : catById.get(String(a.gradingCategoryId));
      return {
        id: a.id, title: a.title, maxScore: a.maxScore, period: a.gradingPeriod, component: c?.component ?? null,
        categoryId: a.gradingCategoryId ?? null, attendance: !!c?.attendance || !!a.attendanceSessionDate || !!a.attendanceSessionCode,
      };
    });
    return {
      classId, categories: cats, assessments: savedAssessments, saved, cls, lectureOnly: config?.componentMode === 'lecture',
      students: students.map(s => ({ id: s.id, name: s.name, firstName: s.firstName, middleName: s.middleName, lastName: s.lastName })),
    };
  }, [classId, config, assessments, scores, students, cls]);

  const preview = useMemo(() => buildPreview(sheets, ctx, dec), [sheets, ctx, dec]);
  const nameOf = (id: string) => students.find(s => s.id === id)?.name ?? id;

  const readFile = async (file: File) => {
    setError(''); setSheets([]); setDec(emptyDecisions()); setFileName(file.name);
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const problem = checkWorkbookFile(file, head);
    if (problem) { setError(problem); return; }
    setReading(true);
    try {
      const { default: readExcelFile } = await import('read-excel-file/browser');
      const parsed = parseWorkbook((await readExcelFile(file)) as Array<{ sheet: string; data: Cell[][] }>);
      if (!parsed.length) setError('No grade sheet was found in this workbook. Each sheet needs the official layout (maximum points in row 9).');
      else setSheets(parsed);
    } catch {
      setError('This file could not be read. Check that it is an Excel .xlsx workbook that is not password protected.');
    } finally {
      setReading(false);
    }
  };

  const setIn = <K extends keyof Decisions>(group: K, key: string | number, value: Decisions[K][keyof Decisions[K]] | undefined) =>
    setDec(d => {
      const next = { ...(d[group] as Record<string | number, unknown>) };
      if (value === undefined || value === false || value === '') delete next[key]; else next[key] = value;
      return { ...d, [group]: next } as Decisions;
    });

  const askRemove = async (a: SavedAssessment, component: Component | null, count: number, checked: boolean) => {
    if (!checked) { setIn('remove', a.id, undefined); return; }
    const ok = await requestConfirmation(
      `${a.title} (${periodLabel(a.period)}${component ? ` · ${component}` : ''}) · ${count} saved score${count === 1 ? '' : 's'} will be deleted. Grades are recalculated and this is recorded in the audit trail. It happens only when you click Import scores.`,
      `Remove ${a.title}?`, 'Remove',
    );
    if (ok) setIn('remove', a.id, true);
  };

  const plan = useMemo(() => buildPlan(preview, ctx, dec), [preview, ctx, dec]);
  const nothingToDo = !plan.items.length && !plan.removeAssessmentIds.length && !plan.scores.length;
  const importDisabled = saving || reading || preview.blockers.length > 0 || nothingToDo;

  const doImport = async () => {
    setSaving(true);
    try { await onImport(plan); reset(); }
    catch { /* the caller already showed the error; keep the preview so nothing is lost */ }
    finally { setSaving(false); }
  };

  // ---------- pieces ----------
  const where = (v: ItemView) => `${periodLabel(v.item.period)} · ${v.component ?? 'Lecture or Laboratory'}`;
  const scoreCount = (v: ItemView) => sheets[v.item.sheetIndex]?.rows.filter(r => r.cells[v.item.key]?.kind !== 'blank').length ?? 0;
  const allItems = preview.sheets.flatMap(s => s.items);
  const fresh = allItems.filter(v => !v.assessment);
  const diffMax = allItems.filter(v => v.assessment && v.maxDiff);
  const matched = allItems.filter(v => v.assessment && !v.maxDiff && !v.noScores);
  const noScoresMatched = allItems.filter(v => v.assessment && v.noScores && !v.maxDiff);

  // One tick for every new item with scores; items without scores stay unticked (G2d) and each item can still be changed.
  const createAllEligible = fresh.filter(v => !v.noScores && v.component && !dec.link[v.item.key]);
  const setCreateAll = (checked: boolean) => setDec(prev => ({
    ...prev, create: { ...prev.create, ...Object.fromEntries(createAllEligible.map(v => [v.item.key, checked])) },
  }));
  const freshRow = (v: ItemView) => {
    const k = v.item.key;
    const needsCategory = !!dec.create[k] && !v.category;
    return (
      <div key={k} className={needsCategory ? rowBlocked : rowCls}>
        <div className="min-w-0 text-xs font-bold text-slate-800 dark:text-slate-100">
          {v.item.title} <span className="font-normal text-slate-500 dark:text-slate-400">· {where(v)} · max {v.item.maxScore}{v.item.kind === 'percent' ? ' (percentage)' : ''}</span>
          <small className={subtle}>
            {v.noScores ? 'No scores yet in the sheet. ' : `Not in DentiSys yet. Its ${scoreCount(v)} ${scoreCount(v) === 1 ? 'score is' : 'scores are'} imported only if you create it. `}
            {v.item.kind === 'percent' ? 'Created with max 100, transmutation off.' : ''}
          </small>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!dec.link[k] && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="checkbox" checked={!!dec.create[k]} disabled={!v.component} onChange={e => setIn('create', k, e.target.checked)} />
              Create it
            </label>
          )}
          {dec.create[k] && !dec.link[k] && (
            <select aria-label={`Category for ${v.item.title}`} className={selectCls} value={v.category ? String(v.category.id) : ''} onChange={e => setIn('category', k, e.target.value)}>
              {!v.category && <option value="">Choose a category…</option>}
              {v.categoryChoices.map(c => <option key={String(c.id)} value={String(c.id)}>{c.name} ({c.weight}%)</option>)}
            </select>
          )}
          {v.component && !dec.create[k] && (v.linkChoices.length > 0 || dec.link[k]) && (
            <select aria-label={`Use existing for ${v.item.title}`} className={selectCls} value={dec.link[k] ?? ''} onChange={e => setIn('link', k, e.target.value)}>
              <option value="">Use existing…</option>
              {(dec.link[k] ? [...v.linkChoices, ...ctx.assessments.filter(a => a.id === dec.link[k])] : v.linkChoices).map(a => (
                <option key={a.id} value={a.id}>{a.title} (max {a.maxScore})</option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };

  const diffRow = (v: ItemView) => {
    const k = v.item.key;
    return (
      <div key={k} className={v.blockers.length ? rowBlocked : rowCls}>
        <div className="min-w-0 text-xs font-bold text-slate-800 dark:text-slate-100">
          {v.assessment!.title} <span className="font-normal text-slate-500 dark:text-slate-400">· {where(v)}</span>
          <small className={subtle}>DentiSys max <b>{v.maxDiff!.saved}</b> → sheet max <b>{v.maxDiff!.sheet}</b>. Choose one before importing.</small>
          {v.maxError && <small className="block text-[11px] text-rose-700 dark:text-rose-400 font-semibold mt-0.5">{v.maxError}</small>}
        </div>
        <select aria-label={`Max for ${v.assessment!.title}`} className={selectCls} value={dec.maxChoice[k] ?? ''} onChange={e => setIn('maxChoice', k, e.target.value as 'keep' | 'change')}>
          <option value="">Choose…</option>
          <option value="keep">Keep {v.maxDiff!.saved} (scores above it stay out)</option>
          <option value="change">Change to {v.maxDiff!.sheet}</option>
        </select>
      </div>
    );
  };

  const cellView = (c: CellView | undefined, studentId: string | null, max: number) => {
    if (!c) return null;
    switch (c.kind) {
      case 'blank': return <span className="text-slate-500 dark:text-slate-400">blank</span>;
      case 'held': return <span className="text-rose-700 dark:text-rose-400 font-semibold" title="Not imported">{c.reason} · held back</span>;
      case 'skipped': return <span className="text-slate-500 dark:text-slate-400">{c.value}</span>;
      case 'same': return <span className="text-slate-500 dark:text-slate-400" title="Same as saved">{c.value}</span>;
      case 'new': return <span className="font-semibold text-slate-800 dark:text-slate-100">{c.value}<span className="sr-only"> of {max}</span></span>;
      case 'changed': return (
        <label className="flex items-center gap-1 whitespace-nowrap text-amber-700 dark:text-amber-400 font-semibold cursor-pointer">
          <input type="checkbox" checked={c.replace} onChange={e => studentId && setIn('replace', `${c.itemKey}|${studentId}`, e.target.checked)} />
          {c.old} → {c.value}
        </label>
      );
    }
  };

  const studentTable = (sv: typeof preview.sheets[number]) => {
    const used = sv.items;
    if (!used.length) return null;
    return (
      <div className="space-y-2">
        <h4 className={sectionTitle}>Students · {sv.sheet.name}{sv.component ? ` · ${sv.component}` : ''}</h4>
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-auto max-h-96">
          <table className="min-w-full divide-y dark:divide-slate-800 text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
              <tr className="text-left font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Name in sheet</th>
                <th className="px-3 py-2">DentiSys student</th>
                {used.map(v => (
                  <th key={v.item.key} className="px-3 py-2 whitespace-nowrap">{periodLabel(v.item.period)} {v.item.title}{v.item.kind === 'percent' ? ' %' : ` /${v.effMax}`}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {sv.rows.map(r => {
                const blocked = r.state === 'pick' || r.state === 'duplicate';
                const options = r.candidates.length > 1 ? r.candidates : students.map(s => s.id);
                return (
                  <tr key={r.row.rowNo} className={blocked ? 'bg-rose-50/60 dark:bg-rose-950/20' : ''}>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.row.no || r.row.rowNo}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{r.row.name || <span className="text-slate-500 dark:text-slate-400 font-normal">(no name)</span>}</td>
                    <td className="px-3 py-2 min-w-[14rem]">
                      {r.state === 'matched' && <span className="text-emerald-700 dark:text-emerald-400 font-semibold"><Check className="inline w-3.5 h-3.5 mr-1" />{nameOf(r.studentId!)}</span>}
                      {r.state === 'empty' && <span className="text-slate-500 dark:text-slate-400">No scores in this row</span>}
                      {r.state === 'out' && (
                        <span className="text-slate-500 dark:text-slate-400">Left out <button type="button" className={`${btnCls} ml-2`} onClick={() => setIn('pick', r.decisionKey, undefined)}>Undo</button></span>
                      )}
                      {r.state === 'duplicate' && (
                        <span className="text-rose-700 dark:text-rose-400 font-semibold">{nameOf(r.studentId!)} is on two rows{' '}
                          <button type="button" className={btnCls} onClick={() => setIn('pick', r.decisionKey, OUT)}>Leave out</button></span>
                      )}
                      {r.state === 'pick' && (
                        <span className="flex flex-wrap items-center gap-2">
                          <select aria-label={`Student for row ${r.row.rowNo}`} className={selectCls} value={dec.pick[r.decisionKey] ?? ''} onChange={e => setIn('pick', r.decisionKey, e.target.value)}>
                            <option value="">{r.candidates.length > 1 ? 'Several matches: choose…' : 'No match: choose…'}</option>
                            {options.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
                          </select>
                          <button type="button" className={btnCls} onClick={() => setIn('pick', r.decisionKey, OUT)}>Leave out</button>
                        </span>
                      )}
                    </td>
                    {used.map(v => (
                      <td key={v.item.key} className="px-3 py-2">
                        {r.state === 'out' || r.state === 'empty' ? null : cellView(r.cells.find(c => c.itemKey === v.item.key), r.studentId, v.effMax)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ---------- render ----------
  const configProblem = configStatus === 'loading' ? 'Loading Grade Weights…'
    : configStatus === 'error' ? (configError || 'Grade Weights could not be loaded.')
    : configStatus === 'unconfigured' ? 'Grade weights required. Save this course\'s Grade Weights first.'
    : !periodMode ? 'Importing a grade sheet needs Midterm and Finals Grade Weights for this course.'
    : '';

  return (
    <Card className="max-w-6xl mx-auto shadow-sm border border-slate-200/90 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
              <Upload className="w-5 h-5 text-clinical-600 dark:text-clinical-400" />
              <span>Import Grade Sheets</span>
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Upload the official grade sheet workbook (.xlsx) exactly as the school gives it. Only raw scores are imported; DentiSys calculates the grades.
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 self-start">
            Official grade sheet (.xlsx)
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-6 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{classLabel}</span>
          <input ref={inputRef} id="grade-sheet-upload" type="file" accept=".xlsx" className="hidden" disabled={!!configProblem}
            onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
          <label htmlFor="grade-sheet-upload"
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${configProblem ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-clinical-600 hover:bg-clinical-700 text-white cursor-pointer'}`}>
            <FileSpreadsheet className="w-3.5 h-3.5" />Choose file
          </label>
          <span className="text-xs text-slate-600 dark:text-slate-300 min-w-0 truncate">{reading ? 'Reading the file in your browser…' : fileName || 'No file chosen'}</span>
          {fileName && <button type="button" className={btnCls} onClick={reset}>Remove</button>}
        </div>

        {configProblem && (
          <div className={note.amber}>
            <p>{configProblem}</p>
            <div className="mt-2 flex gap-2">
              {configStatus === 'error' && <button type="button" className={btnCls} onClick={onRetryConfig}>Retry</button>}
              {configStatus === 'unconfigured' && <button type="button" className={btnCls} onClick={onOpenWeights}>Open Grade Weights Editor</button>}
            </div>
          </div>
        )}
        {error && <div className={note.rose}><b className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</b></div>}

        {sheets.length > 0 && !configProblem && (
          <>
            {preview.sheets.length > 0 && (
              <div className={note.green}>
                Found: {preview.sheets.map(s => `${s.component ?? 'a sheet'} ("${s.sheet.name}")`).join(', ')}. Summary and grade-table sheets are not imported, and nothing is saved until you click Import scores. The file never leaves your browser.
              </div>
            )}
            {preview.skippedSheets.length > 0 && (
              <div className={note.amber}>This class has no Laboratory, so the LAB sheet is skipped.</div>
            )}
            {preview.sheets.map(s => s.headerWarnings.length > 0 && (
              <div key={`h${s.sheet.index}`} className={note.amber}>
                <b>This sheet ("{s.sheet.name}") may be for another class.</b> You can still continue.
                <ul className="list-disc pl-5 mt-1">{s.headerWarnings.map(w => <li key={w}>{w}</li>)}</ul>
              </div>
            ))}
            {preview.weightWarnings.length > 0 && (
              <div className={note.amber}>
                <b>The sheet's weights differ from your saved Grade Weights.</b> Import does not change them.
                <ul className="list-disc pl-5 mt-1">{preview.weightWarnings.map(w => <li key={w}>{w}</li>)}</ul>
              </div>
            )}
            {preview.sheets.some(s => s.needsComponent) && (
              <div className="space-y-2">
                {preview.sheets.filter(s => s.needsComponent).map(s => (
                  <div key={s.sheet.index} className={rowBlocked}>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Sheet "{s.sheet.name}" has no (LEC) or (LAB) in its title. What is it?</span>
                    <select aria-label={`Component of sheet ${s.sheet.name}`} className={selectCls} value={dec.sheetComponent[s.sheet.index] ?? ''} onChange={e => setIn('sheetComponent', s.sheet.index, e.target.value as Component)}>
                      <option value="">Choose…</option><option value="Lecture">Lecture</option><option value="Laboratory">Laboratory</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statChip('green')}`}>{preview.counts.toSave} scores to save</span>
              {preview.counts.blanks > 0 && <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statChip('plain')}`}>{preview.counts.blanks} blank cells not imported</span>}
              {preview.counts.held > 0 && <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statChip('rose')}`}>{preview.counts.held} cells held back</span>}
              {preview.counts.changedUnticked > 0 && <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statChip('amber')}`}>{preview.counts.changedUnticked} changed scores not ticked</span>}
              {preview.counts.itemsToCreate > 0 && <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statChip('plain')}`}>{preview.counts.itemsToCreate} to create</span>}
              {preview.counts.toRemove > 0 && <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statChip('rose')}`}>{preview.counts.toRemove} to remove</span>}
            </div>

            {matched.length > 0 && (
              <section className="space-y-2">
                <h4 className={sectionTitle}>Matched (scores will be imported)</h4>
                <div className="flex flex-wrap gap-1.5">
                  {matched.map(v => <span key={v.item.key} className={chip}>{v.item.title} · {v.item.kind === 'percent' ? '%' : `/${v.item.maxScore}`} · {where(v)}</span>)}
                </div>
              </section>
            )}
            {fresh.length > 0 && (
              <section className="space-y-2">
                <h4 className={sectionTitle}>New in the sheet</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Nothing is created unless you tick it. Or use an existing assessment with a different name.</p>
                {createAllEligible.length > 1 && (
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={createAllEligible.every(v => dec.create[v.item.key])} onChange={e => setCreateAll(e.target.checked)} />
                    Create all {createAllEligible.length} new items that have scores
                  </label>
                )}
                {fresh.map(freshRow)}
              </section>
            )}
            {preview.notInSheet.length > 0 && (
              <section className="space-y-2">
                <h4 className={sectionTitle}>Not in the sheet</h4>
                {preview.notInSheet.map(n => (
                  <div key={n.assessment.id} className={rowCls}>
                    <div className="min-w-0 text-xs font-bold text-slate-800 dark:text-slate-100">
                      {n.assessment.title} <span className="font-normal text-slate-500 dark:text-slate-400">· {periodLabel(n.assessment.period)}{n.component ? ` · ${n.component}` : ''} · max {n.assessment.maxScore}</span>
                      <small className={subtle}>In DentiSys with {n.savedScores} saved scores. Kept unless you tick Remove.</small>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 cursor-pointer">
                      <input type="checkbox" checked={n.removing} onChange={e => void askRemove(n.assessment, n.component, n.savedScores, e.target.checked)} />
                      Remove
                    </label>
                  </div>
                ))}
              </section>
            )}
            {diffMax.length > 0 && (
              <section className="space-y-2">
                <h4 className={sectionTitle}>Different max</h4>
                {diffMax.map(diffRow)}
              </section>
            )}
            {noScoresMatched.length > 0 && (
              <section className="space-y-2">
                <h4 className={sectionTitle}>No scores yet</h4>
                <div className="flex flex-wrap gap-1.5">
                  {noScoresMatched.map(v => <span key={v.item.key} className={chip}>{v.item.title} · {where(v)}</span>)}
                </div>
              </section>
            )}

            {preview.sheets.map(s => <div key={s.sheet.index}>{studentTable(s)}</div>)}
          </>
        )}

        <div className="flex max-[369px]:flex-wrap items-center justify-between gap-2 pt-4 border-t dark:border-slate-800">
          <span className="text-[11px] text-slate-600 dark:text-slate-300 min-w-0">
            {sheets.length > 0 && preview.blockers.length > 0 ? `${preview.blockers.length} thing${preview.blockers.length === 1 ? '' : 's'} to decide first: ${preview.blockers[0]}`
              : sheets.length > 0 && nothingToDo ? 'Nothing to import yet. Tick something to create or a changed score to replace.' : ''}
          </span>
          <button type="button" disabled={importDisabled} onClick={() => void doImport()}
            className={`flex items-center gap-1.5 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-xs ${importDisabled ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-clinical-600 hover:bg-clinical-700 text-white cursor-pointer'}`}>
            <Save className="w-3.5 h-3.5" /><span>{saving ? 'Importing…' : 'Import scores'}</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
};
