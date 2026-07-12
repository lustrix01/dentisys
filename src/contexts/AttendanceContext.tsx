// src/contexts/AttendanceContext.tsx

import React, { createContext, useContext, useReducer, useEffect, Dispatch } from 'react';
import { AttendanceRecord, AttendanceCorrection } from '../types/attendance';
import { attendanceService } from '../services/mock/attendanceService';
import { auditLogService } from '../services/mock/auditLogService';

/**
 * State for Attendance module.
 */
export interface AttendanceState {
  attendanceRecords: AttendanceRecord[];
  loading: boolean;
  error?: string;
  // Simple role flag for RBAC – could be extended later
  userRole: 'faculty' | 'admin';
  // Filters (could be expanded)
  searchTerm: string;
  statusFilter: AttendanceRecord['status'] | '';
  methodFilter: AttendanceRecord['method'] | '';
}

/** Action definitions */
type Action =
  | { type: 'SET_ATTENDANCE'; payload: AttendanceRecord[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | undefined }
  | { type: 'SET_ROLE'; payload: AttendanceState['userRole'] }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_STATUS_FILTER'; payload: AttendanceState['statusFilter'] }
  | { type: 'SET_METHOD_FILTER'; payload: AttendanceState['methodFilter'] }
  | { type: 'ADD_CORRECTION'; payload: { recordId: string; correction: AttendanceCorrection } };

const initialState: AttendanceState = {
  attendanceRecords: [],
  loading: false,
  error: undefined,
  userRole: 'faculty',
  searchTerm: '',
  statusFilter: '',
  methodFilter: '',
};

function reducer(state: AttendanceState, action: Action): AttendanceState {
  switch (action.type) {
    case 'SET_ATTENDANCE':
      return { ...state, attendanceRecords: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_ROLE':
      return { ...state, userRole: action.payload };
    case 'SET_SEARCH':
      return { ...state, searchTerm: action.payload };
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.payload };
    case 'SET_METHOD_FILTER':
      return { ...state, methodFilter: action.payload };
    case 'ADD_CORRECTION': {
      const { recordId, correction } = action.payload;
      const updated = state.attendanceRecords.map((rec) =>
        rec.id === recordId
          ? { ...rec, correctionHistory: [...(rec.correctionHistory || []), correction], status: correction.newStatus, method: 'Manual Correction', verification: 'Corrected' }
          : rec
      );
      return { ...state, attendanceRecords: updated };
    }
    default:
      return state;
  }
}

// ---------- Context ----------
interface AttendanceContextProps {
  state: AttendanceState;
  dispatch: Dispatch<Action>;
  loadAttendance: () => Promise<void>;
  correctAttendance: (
    recordId: string,
    newStatus: AttendanceRecord['status'],
    reason: string
  ) => Promise<void>;
  setSearchTerm: (term: string) => void;
  setStatusFilter: (status: AttendanceState['statusFilter']) => void;
  setMethodFilter: (method: AttendanceState['methodFilter']) => void;
}

const AttendanceContext = createContext<AttendanceContextProps | undefined>(undefined);

export const AttendanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load attendance on mount
  useEffect(() => {
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAttendance = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const res = await attendanceService.fetchAttendance();
    if (res.success && res.data) {
      dispatch({ type: 'SET_ATTENDANCE', payload: res.data });
      dispatch({ type: 'SET_ERROR', payload: undefined });
    } else {
      dispatch({ type: 'SET_ERROR', payload: res.message || 'Failed to load attendance' });
    }
    dispatch({ type: 'SET_LOADING', payload: false });
  };

  const correctAttendance = async (
    recordId: string,
    newStatus: AttendanceRecord['status'],
    reason: string
  ) => {
    if (state.userRole !== 'faculty' && state.userRole !== 'admin') {
      dispatch({ type: 'SET_ERROR', payload: 'Insufficient permissions to correct attendance' });
      return;
    }
    // In a real scenario, correctedBy would be the logged‑in user ID; using role for demo
    const correctedBy = state.userRole;
    const previousStatus = state.attendanceRecords.find(r => r.id === recordId)?.status;
    const res = await attendanceService.correctAttendance(recordId, newStatus, reason, correctedBy);
    if (res.success && res.data) {
      const correction: AttendanceCorrection = {
        correctedAt: new Date().toISOString(),
        previousStatus: previousStatus || 'Present',
        newStatus,
        reason,
        correctedBy,
      };
      dispatch({ type: 'ADD_CORRECTION', payload: { recordId, correction } });
      dispatch({ type: 'SET_ERROR', payload: undefined });
      // Log audit entry
      await auditLogService.log({
        action: 'attendance_correction',
        module: 'attendance',
        performedBy: correctedBy,
        targetId: recordId,
        previousValue: previousStatus,
        newValue: newStatus,
        reason,
      });
    } else {
      dispatch({ type: 'SET_ERROR', payload: res.message || 'Correction failed' });
    }
  };

  const setSearchTerm = (term: string) => dispatch({ type: 'SET_SEARCH', payload: term });
  const setStatusFilter = (status: AttendanceState['statusFilter']) => dispatch({ type: 'SET_STATUS_FILTER', payload: status });
  const setMethodFilter = (method: AttendanceState['methodFilter']) => dispatch({ type: 'SET_METHOD_FILTER', payload: method });

  return (
    <AttendanceContext.Provider
      value={{
        state,
        dispatch,
        loadAttendance,
        correctAttendance,
        setSearchTerm,
        setStatusFilter,
        setMethodFilter,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendanceContext = () => {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error('useAttendanceContext must be used within AttendanceProvider');
  return ctx;
};
