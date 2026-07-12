// src/components/grade-management/AutosaveIndicator/AutosaveIndicator.tsx

import React, { useEffect } from 'react';
import { useGradeManagementContext } from '../../../contexts/GradeManagementContext';
import { toast, Toaster } from 'react-hot-toast';

/**
 * Displays autosave status using toast notifications.
 * - When status is 'saving', shows a spinner toast.
 * - When status transitions to 'saved', shows a success toast.
 * The component also renders a <Toaster /> for toast rendering.
 */
export const AutosaveIndicator: React.FC = () => {
  const { state, saveWorkspace } = useGradeManagementContext();

  useEffect(() => {
    if (state.autosaveStatus === 'saving') {
      toast.loading('Saving changes...', { id: 'autosave' });
    } else if (state.autosaveStatus === 'saved') {
      toast.success('All changes saved', { id: 'autosave' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.autosaveStatus]);

  // Trigger autosave on unmount or periodically – for demo we trigger on every render change via context.
  // In a real app you'd debounce this. Here we simply expose the function for manual call elsewhere.

  return <Toaster position="top-right" toastOptions={{ duration: 2000 }} />;
};

export default AutosaveIndicator;
