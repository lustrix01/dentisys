// src/services/mock/facialEnrollmentService.ts

import { EnrollmentRecord } from '../../types/attendance';
import { v4 as uuidv4 } from 'uuid';

/** In‑memory mock DB */
let enrollmentDB: EnrollmentRecord[] = [];

function generateMockEnrollments(count = 20): void {
  const statuses: EnrollmentRecord['status'][] = [
    'Not Enrolled',
    'Enrollment Pending',
    'Enrolled',
    'Failed',
    'Updated',
    'Removed',
  ];
  for (let i = 1; i <= count; i++) {
    enrollmentDB.push({
      id: uuidv4(),
      studentId: `s${i}`,
      studentNumber: `2023${i.toString().padStart(4, '0')}`,
      studentName: `Student ${i}`,
      subject: 'Dentistry 101',
      section: 'A',
      status: statuses[i % statuses.length],
      imagesCaptured: i % 10,
      totalImages: 10,
      lastUpdated: new Date().toISOString(),
      deviceUsed: 'Device X',
    });
  }
}

if (enrollmentDB.length === 0) generateMockEnrollments();

function delay<T>(result: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(result), ms));
}

export const facialEnrollmentService = {
  async fetchEnrollments(): Promise<{ success: boolean; data?: EnrollmentRecord[]; message?: string }> {
    return delay({ success: true, data: [...enrollmentDB] });
  },

  async updateEnrollment(
    enrollmentId: string,
    newStatus: EnrollmentRecord['status']
  ): Promise<{ success: boolean; data?: EnrollmentRecord; message?: string }> {
    const record = enrollmentDB.find((e) => e.id === enrollmentId);
    if (!record) return delay({ success: false, message: 'Enrollment not found' });
    record.status = newStatus;
    record.lastUpdated = new Date().toISOString();
    return delay({ success: true, data: { ...record } });
  },
};
