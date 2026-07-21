import React from 'react';
import { Modal } from '../../shared/Modal/Modal';
import { calculateCategoryAverages } from '../../../utils/calculateCategoryAverages';
import { useGradeManagementContext } from '../../../contexts/GradeManagementContext';
export const StudentSummaryDrawer: React.FC = () => {
  const { state, dispatch } = useGradeManagementContext(); const student = state.students.find(item => item.id === state.selectedStudentId); const summary = state.computedGrades.find(item => item.studentId === state.selectedStudentId);
  const close = () => { dispatch({ type: 'TOGGLE_UI', payload: { key: 'showStudentSummaryDrawer', value: false } }); dispatch({ type: 'SET_SELECTED_STUDENT', payload: null }); };
  if (!student) return null; const averages = calculateCategoryAverages(student.id, state.assessments.filter(item => item.status === 'active'), state.studentScores);
  return <Modal open={state.showStudentSummaryDrawer} onClose={close} title="Student summary"><div className="space-y-3 text-sm"><div><p className="text-lg font-semibold">{student.name}</p><p className="text-slate-500">{student.studentNumber} · {student.subjectName} · {student.className}</p></div><p><b>Attendance:</b> {student.attendancePercentage}%</p>{Object.entries(averages).map(([category, average]) => <p key={category}><b>{category} average:</b> {average == null ? 'Incomplete' : `${average}%`}</p>)}<hr/><p><b>Weighted percentage:</b> {summary?.weightedPercentage.toFixed(2) ?? '—'}%</p><p><b>Philippine GWA:</b> {summary?.gwa.toFixed(2) ?? '—'}</p><p><b>Remarks:</b> {summary?.remarks ?? 'Incomplete'}</p><p><b>Retention status:</b> {summary?.retentionStatus ?? 'Not available'}</p><hr/><p><b>Risk prediction:</b> Not Available</p><p><b>Confidence:</b> —</p><p><b>Contributing factors:</b> Waiting for backend prediction service</p><p className="text-xs text-slate-500">Last saved: {state.lastSaved?.toLocaleString() ?? 'Not saved'}</p></div></Modal>;
};
