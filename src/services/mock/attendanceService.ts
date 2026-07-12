// src/services/mock/attendanceService.ts

import { AttendanceRecord, AttendanceCorrection } from '../../types/attendance';
import { v4 as uuidv4 } from 'uuid';

/** In‑memory mock database */
let attendanceDB: AttendanceRecord[] = [];

/** Generate mock attendance data */
function generateMockData(count = 30): void {
  const statuses: AttendanceRecord['status'][] = ['Present', 'Late', 'Absent', 'Excused'];
  const methods: AttendanceRecord['method'][] = ['Face Recognition', 'Manual Entry'];
  const verifications: AttendanceRecord['verification'][] = ['Verified', 'Pending'];
  for (let i = 1; i <= count; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (i % 7));
    attendanceDB.push({
      id: uuidv4(),
      studentId: `s${i}`,
      studentNumber: `2023${i.toString().padStart(4, '0')}`,
      studentName: `Student ${i}`,
      subject: 'Dentistry 101',
      section: 'A',
      date: date.toISOString().split('T')[0],
      timeIn: i % 2 === 0 ? `${8 + (i % 3)}:${(i % 60).toString().padStart(2, '0')} AM` : null,
      status: statuses[i % statuses.length],
      method: methods[i % methods.length],
      verification: verifications[i % verifications.length],
    });
  }
}

// Initialise mock data on first import
if (attendanceDB.length === 0) generateMockData();

/** Simulated async latency */
function delay<T>(result: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(result), ms));
}

export const attendanceService = {
  async fetchAttendance(): Promise<{ success: boolean; data?: AttendanceRecord[]; message?: string }> {
    return delay({ success: true, data: [...attendanceDB] });
  },

  async correctAttendance(
    recordId: string,
    newStatus: AttendanceRecord['status'],
    reason: string,
    correctedBy: string
  ): Promise<{ success: boolean; data?: AttendanceRecord; message?: string }> {
    const record = attendanceDB.find((r) => r.id === recordId);
    if (!record) return delay({ success: false, message: 'Record not found' });
    const correction: AttendanceCorrection = {
      correctedAt: new Date().toISOString(),
      previousStatus: record.status,
      newStatus,
      reason,
      correctedBy,
    };
    record.correctionHistory = [...(record.correctionHistory || []), correction];
    record.status = newStatus;
    record.method = 'Manual Correction';
    record.verification = 'Corrected';
    return delay({ success: true, data: { ...record } });
  },

  // Additional helper for statistics (optional)
  async getStatistics(): Promise<{ present: number; late: number; absent: number; excused: number }> {
    const stats = attendanceDB.reduce(
      (acc, cur) => {
        switch (cur.status) {
          case 'Present':
            acc.present++;
            break;
          case 'Late':
            acc.late++;
            break;
          case 'Absent':
            acc.absent++;
            break;
          case 'Excused':
            acc.excused++;
            break;
        }
        return acc;
      },
      { present: 0, late: 0, absent: 0, excused: 0 }
    );
    return delay(stats);
  },
};
