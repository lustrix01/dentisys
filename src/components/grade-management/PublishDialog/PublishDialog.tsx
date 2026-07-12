// src/components/grade-management/PublishDialog/PublishDialog.tsx

import React from 'react';
import { Modal } from '../../shared/Modal/Modal';
import { Button } from '../../shared/Button/Button';
import { useGradeManagementContext } from '../../../contexts/GradeManagementContext';
import toast from 'react-hot-toast';

/** Confirmation dialog before publishing grades */
export const PublishDialog: React.FC = () => {
  const { state, dispatch, publishWorkspace } = useGradeManagementContext();
  const open = state.showPublishDialog;

  const close = () => {
    dispatch({ type: 'TOGGLE_UI', payload: { key: 'showPublishDialog', value: false } });
  };

  const handlePublish = async () => {
    const toastId = toast.loading('Publishing grades...');
    try {
      await publishWorkspace();
      toast.success('Grades published – workspace is now read‑only');
      close();
    } catch (e) {
      toast.error('Failed to publish grades');
    } finally {
      toast.dismiss(toastId);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Publish Grades">
      <div className="space-y-4">
        <p>Confirm publishing. After this, the workspace becomes read‑only.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={handlePublish}>Publish</Button>
        </div>
      </div>
    </Modal>
  );
};

export default PublishDialog;
