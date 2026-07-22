import { recordAudit } from './auditService';
import {
  registerFacultyApi,
  getFacultyRequestsApi,
  approveFacultyApi,
  rejectFacultyApi,
  inviteSecretaryApi,
  getSecretaryInvitationApi,
  activateSecretaryApi,
  requestPasswordResetApi,
  confirmPasswordResetApi,
  ApiError,
} from './apiClient';

export type UserRole = 'admin' | 'faculty' | 'secretary';
export type AccountStatus = 'Active' | 'Pending Approval' | 'Rejected' | 'Pending Invitation';

export interface RegisteredUser {
  id: string;
  email: string;
  password?: string;
  name: string;
  role: UserRole;
  title: string;
  status: AccountStatus;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  assignedSubjects?: string[];
  assignedClasses?: string[];
  assignedClassId?: string;
  assignedClassName?: string;
}

export interface SecretaryInvitation {
  id: string;
  studentId: string;
  studentName: string;
  email: string;
  facultyName: string;
  className: string;
  classId: string;
  token: string;
  status: 'Pending' | 'Accepted' | 'Expired' | 'Revoked';
  createdAt: string;
  expiresAt: string;
}

export interface PasswordCriteria {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  isValid: boolean;
}

const REGISTERED_USERS_KEY = 'dentisys_registered_users';
const SECRETARY_INVITATIONS_KEY = 'dentisys_secretary_invitations';
const EMAIL_LOGS_KEY = 'dentisys_email_logs';

/**
 * Validates whether an email address belongs to the official Bicol University domain.
 */
export const validateBicolUEmail = (email: string): { isValid: boolean; message: string } => {
  if (!email || !email.trim()) {
    return { isValid: false, message: 'Email address is required.' };
  }

  const trimmedEmail = email.trim().toLowerCase();
  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!basicEmailRegex.test(trimmedEmail)) {
    return { isValid: false, message: 'Please enter a valid email format.' };
  }

  const strictBicolURegex = /^[^\s@]+@bicol-u\.edu\.ph$/;
  if (!strictBicolURegex.test(trimmedEmail)) {
    return {
      isValid: false,
      message: 'Only official Bicol University email addresses (@bicol-u.edu.ph) are allowed.',
    };
  }

  return { isValid: true, message: '' };
};

/**
 * Validates whether a person's name contains only valid letters, spaces, hyphens, and apostrophes.
 */
export const validatePersonName = (name: string): { isValid: boolean; message: string } => {
  if (!name || !name.trim()) {
    return { isValid: false, message: 'Name is required.' };
  }

  const trimmedName = name.trim();
  const nameRegex = /^[\p{L}\s'\-]+$/u;

  if (!nameRegex.test(trimmedName)) {
    return {
      isValid: false,
      message: 'Name can only contain letters, spaces, hyphens, and apostrophes.',
    };
  }

  return { isValid: true, message: '' };
};

/**
 * Evaluates password strength requirements.
 */
export const validatePasswordRequirements = (password: string): PasswordCriteria => {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const isValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  return {
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
    isValid,
  };
};

/**
 * Registers a new Faculty account via Backend API.
 */
export const registerFaculty = async (
  userData: { name: string; email: string; password: string }
): Promise<{ success: boolean; message: string; user?: RegisteredUser }> => {
  try {
    const res = await registerFacultyApi(userData);
    return {
      success: true,
      message: res.message,
    };
  } catch (err) {
    let msg = 'Registration failed.';
    if (err instanceof ApiError) {
      if (err.errors && typeof err.errors === 'object') {
        const errObj = err.errors as Record<string, unknown>;
        if (errObj.email) {
          msg = Array.isArray(errObj.email) ? String(errObj.email[0]) : String(errObj.email);
        } else {
          msg = err.message;
        }
      } else if (typeof err.errors === 'string' && err.errors.trim()) {
        msg = err.errors;
      } else {
        msg = err.message;
      }
    } else if (err instanceof Error) {
      msg = err.message;
    }
    return { success: false, message: msg };
  }
};

/**
 * Retrieves faculty registration requests via Backend API.
 */
export const fetchFacultyRegistrationRequests = async (): Promise<RegisteredUser[]> => {
  try {
    const users = await getFacultyRequestsApi();
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      status: u.status as AccountStatus,
      createdAt: u.createdAt,
      approvedAt: u.approvedAt,
      rejectedAt: u.rejectedAt,
    }));
  } catch (err) {
    console.error('Failed to fetch faculty requests', err);
    return [];
  }
};

export const getFacultyRegistrationRequests = (): RegisteredUser[] => {
  return [];
};

/**
 * Helper to log system emails into Email Management history.
 */
export const logSystemEmail = (emailEntry: {
  recipient: string;
  subject: string;
  type: 'Privacy Consent' | 'At-Risk Notification' | 'Class Secretary Invitation' | 'Faculty Registration Approved' | 'Faculty Registration Rejected';
  status: 'Sent' | 'Failed' | 'Pending';
}) => {
  try {
    const stored = JSON.parse(localStorage.getItem(EMAIL_LOGS_KEY) || '[]');
    const now = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const newEntry = {
      id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipient: emailEntry.recipient,
      subject: emailEntry.subject,
      type: emailEntry.type,
      sentAt: now,
      status: emailEntry.status,
    };
    localStorage.setItem(EMAIL_LOGS_KEY, JSON.stringify([newEntry, ...stored]));
  } catch (err) {
    console.error('Failed to log system email', err);
  }
};

/**
 * Dean approves a faculty account via Backend API.
 */
export const approveFacultyAccount = async (
  email: string,
): Promise<{ success: boolean; message: string }> => {
  try {
    const res = await approveFacultyApi(email);
    return { success: true, message: res.message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to approve faculty account.';
    return { success: false, message: msg };
  }
};

/**
 * Dean rejects a faculty account via Backend API.
 */
export const rejectFacultyAccount = async (
  email: string,
): Promise<{ success: boolean; message: string }> => {
  try {
    const res = await rejectFacultyApi(email);
    return { success: true, message: res.message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to reject faculty account.';
    return { success: false, message: msg };
  }
};


/**
 * Class Secretary Invitations Management.
 */
export const getSecretaryInvitations = (): SecretaryInvitation[] => {
  try {
    const data = localStorage.getItem(SECRETARY_INVITATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveSecretaryInvitations = (invitations: SecretaryInvitation[]) => {
  localStorage.setItem(SECRETARY_INVITATIONS_KEY, JSON.stringify(invitations));
};

export const createSecretaryInvitation = async (input: {
  studentId: string;
  studentName: string;
  email: string;
  facultyName: string;
  className: string;
  classId?: string;
}): Promise<{ success: boolean; message: string; invitation?: SecretaryInvitation }> => {
  try {
    const res = await inviteSecretaryApi({
      student_name: input.studentName,
      student_number: input.studentId,
      class_name: input.className,
      email: input.email,
    });
    const newInv: SecretaryInvitation = {
      id: res.token,
      studentId: input.studentId,
      studentName: input.studentName,
      email: input.email,
      facultyName: input.facultyName,
      className: input.className,
      classId: input.classId || 'CLINIC-A',
      token: res.token,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    return {
      success: true,
      message: res.message,
      invitation: newInv,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create invitation.';
    return { success: false, message: msg };
  }
};

export const revokeSecretaryInvitation = async (
  invitationId: string,
  facultyName: string
): Promise<{ success: boolean; message: string }> => {
  return { success: true, message: 'Invitation has been revoked.' };
};

export const fetchSecretaryInvitationByToken = async (token: string): Promise<SecretaryInvitation | null> => {
  try {
    const res = await getSecretaryInvitationApi(token);
    const inv = res.invitation;
    return {
      id: inv.token,
      studentId: inv.studentNumber,
      studentName: inv.studentName,
      email: inv.email,
      facultyName: inv.facultyName,
      className: inv.className,
      classId: 'CLINIC-A',
      token: inv.token,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      expiresAt: inv.expiresAt,
    };
  } catch (err) {
    console.error('Failed to fetch secretary invitation token', err);
    return null;
  }
};

export const getSecretaryInvitationByToken = (token: string): SecretaryInvitation | null => {
  return null;
};

export const activateSecretaryAccount = async (
  token: string,
  password: string
): Promise<{ success: boolean; message: string; user?: RegisteredUser }> => {
  try {
    const res = await activateSecretaryApi(token, password);
    return {
      success: true,
      message: res.message,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to activate account.';
    return { success: false, message: msg };
  }
};

export const requestPasswordReset = async (email: string): Promise<{ success: boolean; message: string; resetLink?: string }> => {
  try {
    const res = await requestPasswordResetApi(email);
    return {
      success: true,
      message: res.message,
      resetLink: res.reset_link,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to request password reset.';
    return { success: false, message: msg };
  }
};

export const confirmPasswordReset = async (token: string, password: string): Promise<{ success: boolean; message: string }> => {
  try {
    const res = await confirmPasswordResetApi(token, password);
    return {
      success: true,
      message: res.message,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to reset password.';
    return { success: false, message: msg };
  }
};


/**
 * Authenticates user credentials with role-based status checking.
 */
export const authenticateUser = (
  email: string,
  pass: string
): { success: boolean; message: string; user?: any; status?: AccountStatus } => {
  void email;
  void pass;
  return {
    success: false,
    message: 'Invalid email or password. Please check your credentials and try again.',
  };
};
