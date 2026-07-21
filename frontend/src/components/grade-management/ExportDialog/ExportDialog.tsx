// src/components/grade-management/ExportDialog/ExportDialog.tsx

import React from 'react';
import { Modal } from '../../shared/Modal/Modal';
import { Button } from '../../shared/Button/Button';
import { useGradeManagementContext } from '../../../contexts/GradeManagementContext';

/** Export grades as CSV (and mock PDF placeholder) */
export const ExportDialog: React.FC = () => {
  const { state, dispatch } = useGradeManagementContext();
  const open = state.showExportDialog;

  const close = () => {
    dispatch({ type: 'TOGGLE_UI', payload: { key: 'showExportDialog', value: false } });
  };

  const generateCsv = () => {
    const headers = ['studentId', ...state.assessments.map((a) => a.name)];
    const rows: string[] = [];
    const scoresByStudent: Record<string, Record<string, number | null>> = {};
    state.studentScores.forEach((s) => {
      if (!scoresByStudent[s.studentId]) scoresByStudent[s.studentId] = {};
      scoresByStudent[s.studentId][s.assessmentId] = s.score;
    });
    const studentIds = Object.keys(scoresByStudent);
    studentIds.forEach((sid) => {
      const row = [sid];
      state.assessments.forEach((a) => {
        const val = scoresByStudent[sid][a.id];
        row.push(val != null ? String(val) : '');
      });
      rows.push(row.join(','));
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'grades_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    generateCsv();
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Export Grades">
      <div className="space-y-4">
        <p>Download the current grade data as a CSV file.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={handleExport}>Download CSV</Button>
        </div>
        <div className="border p-2 rounded bg-gray-50 text-sm text-gray-600">
          <em>PDF preview placeholder – to be implemented.</em>
        </div>
      </div>
    </Modal>
  );
};

export default ExportDialog;
