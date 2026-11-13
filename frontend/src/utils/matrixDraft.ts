// Tab-only copy of unsaved Full Matrix scores, so a forced sign-out does not lose them.
export const MATRIX_DRAFT_PREFIX = 'dentisys_matrix_draft:';

export const matrixDraftKey = (userId: string | number, classId: string) => `${MATRIX_DRAFT_PREFIX}${userId}:${classId}`;
export const matrixDraftCellKey = (assessmentId: string, studentId: string) => `${assessmentId}|${studentId}`;

/** "5.0" typed over a saved 5 is the same score. */
export const sameMatrixScore = (a: string, b: string) =>
  a === b || (a !== '' && b !== '' && Number(a) === Number(b));

export const readMatrixDraft = (key: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    return parsed && typeof parsed.cells === 'object' && parsed.cells ? parsed.cells : {};
  } catch { return {}; }
};

const writeMatrixDraft = (key: string, cells: Record<string, string>) => {
  try {
    if (Object.keys(cells).length === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), cells }));
  } catch { /* storage unavailable */ }
};

/** value null removes the cell; the key disappears when no cells remain. */
export const setMatrixDraftCell = (key: string, cellKey: string, value: string | null) => {
  const cells = readMatrixDraft(key);
  if (value === null) delete cells[cellKey]; else cells[cellKey] = value;
  writeMatrixDraft(key, cells);
};

/** Drops draft cells the server now holds with the same score (confirmed saved). */
export const pruneSavedMatrixDraft = (key: string, saved: Record<string, string>) => {
  const cells = readMatrixDraft(key);
  let changed = false;
  for (const [cellKey, value] of Object.entries(cells)) {
    if (cellKey in saved && sameMatrixScore(value, saved[cellKey])) { delete cells[cellKey]; changed = true; }
  }
  if (changed) writeMatrixDraft(key, cells);
};

export const clearMatrixDraft = (key: string) => {
  try { sessionStorage.removeItem(key); } catch { /* storage unavailable */ }
};

export const clearAllMatrixDrafts = () => {
  try {
    for (const name of Object.keys(sessionStorage)) {
      if (name.startsWith(MATRIX_DRAFT_PREFIX)) sessionStorage.removeItem(name);
    }
  } catch { /* storage unavailable */ }
};

/** Draft cells still worth offering: known assessment and student, text differs from the saved score. */
export const matrixDraftRestoreCells = (
  draft: Record<string, string>,
  scores: Record<string, Record<string, string>>,
  assessmentIds: string[],
): Array<{ assessmentId: string; studentId: string; value: string }> => {
  const known = new Set(assessmentIds);
  const out: Array<{ assessmentId: string; studentId: string; value: string }> = [];
  for (const [cellKey, value] of Object.entries(draft)) {
    const [assessmentId, studentId] = cellKey.split('|');
    const saved = scores[studentId]?.[assessmentId];
    if (!known.has(assessmentId) || saved === undefined || typeof value !== 'string') continue;
    if (!sameMatrixScore(value, saved)) out.push({ assessmentId, studentId, value });
  }
  return out;
};
