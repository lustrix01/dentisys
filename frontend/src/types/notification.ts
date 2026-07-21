// src/types/notification.ts
export interface Notification {
  id: string;
  type: 'assessmentCreated' | 'gradeSaved' | 'autosaveComplete' | 'publishSuccessful' | 'importSuccessful' | 'attendanceUpdated' | 'validationError';
  title: string;
  message: string;
  createdAt: string; // ISO date string
  read?: boolean;
}
