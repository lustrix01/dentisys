import React from 'react';
import { Toaster } from 'react-hot-toast';

/**
 * Wrap your application with this provider to enable toast notifications.
 * It renders the react-hot-toast <Toaster> component globally.
 */
const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    {children}
    <Toaster
      toastOptions={{
        // Define default styles using CSS variables for consistency
        style: {
          background: 'var(--color-surface)',
          color: 'var(--color-textPrimary)',
        },
        success: {
          style: { background: 'var(--color-success)' },
        },
        error: {
          style: { background: 'var(--color-danger)' },
        },
        loading: {
          style: { background: 'var(--color-info)' },
        },
      }}
    />
  </>
);

export default ToastProvider;
