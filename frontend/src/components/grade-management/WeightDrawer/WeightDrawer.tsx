import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../shared/Modal/Modal';
import { useGradeManagementContext } from '../../../contexts/GradeManagementContext';
export const WeightDrawer: React.FC = () => {
  const { state, dispatch } = useGradeManagementContext(); const [weights, setWeights] = useState(state.weights);
  useEffect(() => setWeights(state.weights), [state.weights, state.showWeightDrawer]);
  const total = weights.reduce((sum, weight) => sum + (Number(weight.weight) || 0), 0);
  const close = () => dispatch({ type: 'TOGGLE_UI', payload: { key: 'showWeightDrawer', value: false } });
  const save = () => { if (Math.abs(total - 100) > 0.001) { toast.error('Total grading weight must equal exactly 100%.'); return; } dispatch({ type: 'SET_WEIGHTS', payload: weights }); close(); };
  return <Modal open={state.showWeightDrawer} onClose={close} title="Grading weight configuration"><div className="space-y-3">{weights.map((weight, index) => <label key={weight.category} className="flex items-center justify-between gap-3"><span>{weight.category}</span><input className="w-24 rounded border p-2 text-right" type="number" min="0" max="100" value={weight.weight} onChange={event => setWeights(weights.map((item, itemIndex) => itemIndex === index ? { ...item, weight: Number(event.target.value) } : item))}/></label>)}<p className={`rounded p-3 text-sm font-semibold ${Math.abs(total - 100) < 0.001 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>Total Weight: {total}%{Math.abs(total - 100) > 0.001 && <><br/>⚠ Total grading weight must equal exactly 100%.</>}</p><button className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={Math.abs(total - 100) > 0.001} onClick={save}>Save weights</button></div></Modal>;
};
