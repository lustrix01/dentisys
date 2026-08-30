import { Student, AttendanceRecord, AttendanceStatus } from '../../types';

export interface SecretaryUser {
  email: string;
  role: string;
  name: string;
  title: string;
  assignedClassId?: string;
  assignedClassName?: string;
  classroomName?: string;
}

let _currentSecretary: SecretaryUser | null = null;

export function setCurrentSecretaryUser(user: SecretaryUser | null): void {
  _currentSecretary = user;
}
export function clearCurrentSecretaryUser(): void {
  _currentSecretary = null;
}

export const getCurrentSecretary = (): SecretaryUser | null => {
  return _currentSecretary;
};

export const getAssignedClassId = (user: SecretaryUser | null) => user?.assignedClassId || '';

export const getAssignedClassName = (user: SecretaryUser | null) => user?.assignedClassName || '';

export const getClassStudents = (students: Student[], classId: string) =>
  students.filter(student => student.classId === classId);

export const getClassAttendance = (records: AttendanceRecord[], classStudents: Student[]) => {
  const classStudentIds = new Set(classStudents.map(student => student.id));
  return records.filter(record => classStudentIds.has(record.studentId));
};

export const formatStatus = (status: AttendanceStatus) =>
  status.charAt(0).toUpperCase() + status.slice(1);

export const getStatusClasses = (status: AttendanceStatus) => {
  if (status === 'present') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (status === 'late') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  if (status === 'absent') return 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
  return 'bg-sky-500/10 text-sky-700 dark:text-sky-400';
};

export const getAttendanceRate = (records: AttendanceRecord[]) => {
  if (records.length === 0) return 0;
  const attended = records.filter(record => record.status === 'present' || record.status === 'late').length;
  return Math.round((attended / records.length) * 100);
};
