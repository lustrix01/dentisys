export interface Faculty {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  role: 'admin' | 'faculty' | 'staff';
}
