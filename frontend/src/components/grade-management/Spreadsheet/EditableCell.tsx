import React, { useState } from 'react';
import { useGradeManagementContext } from '../../../contexts/GradeManagementContext';
interface Props { studentId: string; assessmentId: string; maxScore: number; initialValue: number | null; }
export const EditableCell: React.FC<Props> = ({ studentId, assessmentId, maxScore, initialValue }) => {
  const { state, dispatch } = useGradeManagementContext();
  const [value, setValue] = useState(initialValue == null ? '' : String(initialValue));
  const [error, setError] = useState('');
  const commit = () => { if (value === '') { setError(''); dispatch({ type: 'SET_CELL', payload: { studentId, assessmentId, score: null } }); return; } const score = Number(value); if (!Number.isFinite(score) || score < 0 || score > maxScore) { setError(`Enter 0–${maxScore}`); return; } setError(''); dispatch({ type: 'SET_CELL', payload: { studentId, assessmentId, score } }); };
  return <input data-grade-cell={`${studentId}:${assessmentId}`} inputMode="decimal" aria-label={`Score out of ${maxScore}`} disabled={state.isReadOnly} className={`w-20 rounded border px-2 py-1 text-right outline-none focus:ring-2 focus:ring-emerald-400 ${error ? 'border-rose-500' : 'border-slate-200'}`} value={value} onChange={event => setValue(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { commit(); (event.currentTarget.form?.elements[0] as HTMLElement | undefined)?.focus(); } }} />;
};
