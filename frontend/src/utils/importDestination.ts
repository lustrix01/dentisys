// Import Grade Sheets: destination options built from the saved Grade Weights, same grouping as the score matrix.
import type { FacultyGradingCategoryItem, FacultyGradingConfiguration } from '../services/apiClient.ts';

export type ImportPeriod = 'Midterm' | 'Final';
export type ImportOption = { value: string; label: string; disabled: boolean };
export type ImportGroup = { label: string | null; options: ImportOption[] };

const weightLabel = (w: number | string) => `${Number(w)}%`;

export const isPeriodConfig = (config: FacultyGradingConfiguration | null | undefined) =>
  config?.schemaMode === 'periods'
  && (config.midtermCategories?.length ?? 0) + (config.finalCategories?.length ?? 0) > 0;

export const isLectureLab = (config: FacultyGradingConfiguration | null | undefined) =>
  config?.componentMode === 'lecture_laboratory';

// Option value = "<component>|<name>" (component is '' in flat lists), so the same name in Lecture and Laboratory stays distinct.
const toValue = (component: string, name: string) => `${component}|${name}`;

export function buildImportGroups(config: FacultyGradingConfiguration | null | undefined, period: ImportPeriod): ImportGroup[] {
  if (!config) return [];
  const raw = !isPeriodConfig(config)
    ? config.categories
    : period === 'Midterm' ? config.midtermCategories : config.finalCategories;
  const cats = [...(raw ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const toOption = (c: FacultyGradingCategoryItem, component: string): ImportOption => {
    const base = `${c.name} (${weightLabel(c.weight)})`;
    const attendance = c.sourceKind === 'attendance';
    return {
      value: toValue(component, c.name),
      label: attendance ? `${base} · from attendance records` : base,
      disabled: attendance,
    };
  };
  const groups: ImportGroup[] = [];
  if (isLectureLab(config)) {
    const comp = (c: FacultyGradingCategoryItem) => (c.component ?? 'Lecture').toLowerCase();
    const lecture = cats.filter(c => comp(c) === 'lecture');
    const lab = cats.filter(c => comp(c) === 'laboratory' || comp(c) === 'lab');
    const other = cats.filter(c => !['lecture', 'laboratory', 'lab', ''].includes(comp(c)));
    const lw = config.componentWeights?.lecture ?? 60;
    const bw = config.componentWeights?.laboratory ?? 40;
    if (lecture.length) groups.push({ label: `Lecture (${weightLabel(lw)})`, options: lecture.map(c => toOption(c, 'Lecture')) });
    if (lab.length) groups.push({ label: `Laboratory (${weightLabel(bw)})`, options: lab.map(c => toOption(c, 'Laboratory')) });
    if (other.length) groups.push({ label: 'Other', options: other.map(c => toOption(c, 'Other')) });
  } else if (cats.length) {
    groups.push({ label: null, options: cats.map(c => toOption(c, '')) });
  }
  return groups;
}

// True when the list has something selectable (attendance rows are shown but not selectable).
export const hasSelectable = (groups: ImportGroup[]) => groups.some(g => g.options.some(o => !o.disabled));

// Selection survives a period switch only if a selectable category with the same component and name exists there.
export function keepSelection(groups: ImportGroup[], value: string): string {
  return groups.some(g => g.options.some(o => !o.disabled && o.value === value)) ? value : '';
}

// period is null for single-list configs (no Midterm/Final); the component is added only for Lecture/Laboratory classes.
export function importTemplateFileName(course: string, period: ImportPeriod | null, value: string, lectureLab: boolean): string {
  const [component, ...rest] = value.split('|');
  const name = rest.join('|');
  const parts = [course, period, value && lectureLab ? component : null, value ? name : null, 'Score_Template']
    .filter((p): p is string => Boolean(p))
    .map(p => p.trim().replace(/\s+/g, '_'));
  return `${parts.join('_')}.csv`;
}
