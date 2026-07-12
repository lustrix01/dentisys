// src/contexts/FacialEnrollmentContext.tsx

import React, { createContext, useContext, useReducer, useEffect, Dispatch } from 'react';
import { EnrollmentRecord } from '../types/attendance';
import { facialEnrollmentService } from '../services/mock/facialEnrollmentService';
import { auditLogService } from '../services/mock/auditLogService';

export interface FacialEnrollmentState {
  enrollmentRecords: EnrollmentRecord[];
  loading: boolean;
  error?: string;
  userRole: 'faculty' | 'admin';
}

type Action =
  | { type: 'SET_ENROLLMENTS'; payload: EnrollmentRecord[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | undefined }
  | { type: 'SET_ROLE'; payload: FacialEnrollmentState['userRole'] }
  | { type: 'UPDATE_ENROLLMENT'; payload: EnrollmentRecord };

const initialState: FacialEnrollmentState = {
  enrollmentRecords: [],
  loading: false,
  error: undefined,
  userRole: 'faculty',
};

function reducer(state: FacialEnrollmentState, action: Action): FacialEnrollmentState {
  switch (action.type) {
    case 'SET_ENROLLMENTS':
      return { ...state, enrollmentRecords: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_ROLE':
      return { ...state, userRole: action.payload };
    case 'UPDATE_ENROLLMENT': {
      const updated = state.enrollmentRecords.map((e) => (e.id === action.payload.id ? action.payload : e));
      return { ...state, enrollmentRecords: updated };
    }
    default:
      return state;
  }
}

interface FacialEnrollmentContextProps {
  state: FacialEnrollmentState;
  dispatch: Dispatch<Action>;
  loadEnrollments: () => Promise<void>;
  updateEnrollment: (id: string, newStatus: EnrollmentRecord['status']) => Promise<void>;
  setRole: (role: FacialEnrollmentState['userRole']) => void;
}

const FacialEnrollmentContext = createContext<FacialEnrollmentContextProps | undefined>(undefined);

export const FacialEnrollmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    loadEnrollments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEnrollments = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    const res = await facialEnrollmentService.fetchEnrollments();
    if (res.success && res.data) {
      dispatch({ type: 'SET_ENROLLMENTS', payload: res.data });
      dispatch({ type: 'SET_ERROR', payload: undefined });
    } else {
      dispatch({ type: 'SET_ERROR', payload: res.message || 'Failed to load enrollments' });
    }
    dispatch({ type: 'SET_LOADING', payload: false });
  };

  const updateEnrollment = async (id: string, newStatus: EnrollmentRecord['status']) => {
    if (state.userRole !== 'faculty' && state.userRole !== 'admin') {
      dispatch({ type: 'SET_ERROR', payload: 'Insufficient permissions to update enrollment' });
      return;
    }
    const previousStatus = state.enrollmentRecords.find(e => e.id === id)?.status;
    const res = await facialEnrollmentService.updateEnrollment(id, newStatus);
    if (res.success && res.data) {
      dispatch({ type: 'UPDATE_ENROLLMENT', payload: res.data });
      dispatch({ type: 'SET_ERROR', payload: undefined });
      // Audit log entry
      await auditLogService.log({
        action: 'enrollment_update',
        module: 'facialEnrollment',
        performedBy: state.userRole,
        targetId: id,
        previousValue: previousStatus,
        newValue: newStatus,
        reason: 'Status change via UI',
      });
    } else {
      dispatch({ type: 'SET_ERROR', payload: res.message || 'Update failed' });
    }
  };

  const setRole = (role: FacialEnrollmentState['userRole']) => dispatch({ type: 'SET_ROLE', payload: role });

  return (
    <FacialEnrollmentContext.Provider
      value={{ state, dispatch, loadEnrollments, updateEnrollment, setRole }}
    >
      {children}
    </FacialEnrollmentContext.Provider>
  );
};

export const useFacialEnrollmentContext = () => {
  const ctx = useContext(FacialEnrollmentContext);
  if (!ctx) throw new Error('useFacialEnrollmentContext must be used within FacialEnrollmentProvider');
  return ctx;
};
