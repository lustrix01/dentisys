// src/hooks/useAttendance.ts

import { useAttendanceContext } from '../contexts/AttendanceContext';

export const useAttendance = () => {
  const ctx = useAttendanceContext();
  return ctx;
};
