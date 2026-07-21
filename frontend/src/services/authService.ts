import { recordAudit } from './auditService';

export type UserRole = 'admin' | 'faculty' | 'secretary';
export type AccountStatus = 'Active' | 'Pending Approval' | 'Rejected' | 'Pending Invitation';

export interface RegisteredUser {
  id: string;
  email: string;
  password: string;
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
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, message: 'Please enter a valid email format.' };
  }

  const isBicolUDomain = trimmedEmail.endsWith('@bicol-u.edu.ph') || trimmedEmail.endsWith('@bu.edu.ph');
  
  if (!isBicolUDomain) {
    return {
      isValid: false,
      message: 'Only official Bicol University email addresses (@bicol-u.edu.ph) are allowed.',
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
 * Retrieves all registered users from localStorage.
 */
export const getRegisteredUsers = (): RegisteredUser[] => {
  try {
    const data = localStorage.getItem(REGISTERED_USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to parse registered users from localStorage', error);
    return [];
  }
};

const saveRegisteredUsers = (users: RegisteredUser[]) => {
  localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
};

/**
 * Registers a new Faculty account. Status is set to 'Pending Approval'.
 */
export const registerFaculty = async (
  userData: { name: string; email: string; password: string }
): Promise<{ success: boolean; message: string; user?: RegisteredUser }> => {
  const emailVal = validateBicolUEmail(userData.email);
  if (!emailVal.isValid) {
    return { success: false, message: emailVal.message };
  }

  const passVal = validatePasswordRequirements(userData.password);
  if (!passVal.isValid) {
    return { success: false, message: 'Password does not meet all security requirements.' };
  }

  try {
    const apiRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: userData.name,
        email: userData.email,
        password: userData.password,
        role: 'faculty',
      }),
    });
    if (apiRes.ok) {
      const data = await apiRes.json();
      return { success: true, message: data.message };
    }
  } catch {
    // API offline, fallback to local storage
  }

  const lowerEmail = userData.email.trim().toLowerCase();
  const defaultEmails = ['faculty@bicol-u.edu.ph', 'admin@bicol-u.edu.ph', 'secretary@bicol-u.edu.ph'];
  const existingUsers = getRegisteredUsers();

  if (
    defaultEmails.includes(lowerEmail) ||
    existingUsers.some((u) => u.email.toLowerCase() === lowerEmail)
  ) {
    return {
      success: false,
      message: 'An account with this Bicol University email address already exists.',
    };
  }

  const newFaculty: RegisteredUser = {
    id: `user-${Date.now()}`,
    name: userData.name.trim(),
    email: lowerEmail,
    password: userData.password,
    role: 'faculty',
    title: 'Dental Faculty Member',
    status: 'Pending Approval',
    createdAt: new Date().toISOString(),
    assignedSubjects: ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'],
    assignedClasses: ['CLINIC-A', 'CLINIC-B'],
  };

  saveRegisteredUsers([...existingUsers, newFaculty]);

  recordAudit({
    userName: newFaculty.name,
    userRole: 'faculty',
    action: 'Submitted Faculty registration',
    module: 'Authentication',
    description: `Faculty registration submitted for ${newFaculty.email}. Status: Pending Approval by Dean.`,
    status: 'Success',
  });

  return {
    success: true,
    message: 'Registration request submitted successfully! Your account is pending approval by the Dean.',
    user: newFaculty,
  };
};

/**
 * Retrieves all faculty registration requests (Pending Approval, Active, Rejected).
 */
export const getFacultyRegistrationRequests = (): RegisteredUser[] => {
  const users = getRegisteredUsers();
  return users.filter((u) => u.role === 'faculty');
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
 * Dean approves a faculty account.
 */
export const approveFacultyAccount = async (
  email: string,
  deanName: string = 'Dr. Marcus Aurelius'
): Promise<{ success: boolean; message: string }> => {
  await new Promise((resolve) => setTimeout(resolve, 600));

  const users = getRegisteredUsers();
  const index = users.findIndex((u) => u.email.toLowerCase() === email.trim().toLowerCase());

  if (index === -1) {
    return { success: false, message: 'Faculty user record not found.' };
  }

  users[index].status = 'Active';
  users[index].approvedAt = new Date().toISOString();
  saveRegisteredUsers(users);

  logSystemEmail({
    recipient: `${users[index].name} (${users[index].email})`,
    subject: 'Faculty Account Approved - DentiSys Portal Access Granted',
    type: 'Faculty Registration Approved',
    status: 'Sent',
  });

  recordAudit({
    userName: deanName,
    userRole: 'admin',
    action: 'Approved faculty registration',
    module: 'Faculty Approval',
    description: `Dean approved Faculty registration for ${users[index].name} (${users[index].email}). Account is now Active.`,
    status: 'Success',
  });

  return {
    success: true,
    message: `Account for ${users[index].name} has been approved and activated.`,
  };
};

/**
 * Dean rejects a faculty account.
 */
export const rejectFacultyAccount = async (
  email: string,
  deanName: string = 'Dr. Marcus Aurelius'
): Promise<{ success: boolean; message: string }> => {
  await new Promise((resolve) => setTimeout(resolve, 600));

  const users = getRegisteredUsers();
  const index = users.findIndex((u) => u.email.toLowerCase() === email.trim().toLowerCase());

  if (index === -1) {
    return { success: false, message: 'Faculty user record not found.' };
  }

  users[index].status = 'Rejected';
  users[index].rejectedAt = new Date().toISOString();
  saveRegisteredUsers(users);

  logSystemEmail({
    recipient: `${users[index].name} (${users[index].email})`,
    subject: 'Faculty Account Registration Update - DentiSys',
    type: 'Faculty Registration Rejected',
    status: 'Sent',
  });

  recordAudit({
    userName: deanName,
    userRole: 'admin',
    action: 'Rejected faculty registration',
    module: 'Faculty Approval',
    description: `Dean rejected Faculty registration for ${users[index].name} (${users[index].email}).`,
    status: 'Warning',
  });

  return {
    success: true,
    message: `Registration request for ${users[index].name} has been rejected.`,
  };
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
  await new Promise((resolve) => setTimeout(resolve, 600));

  const emailVal = validateBicolUEmail(input.email);
  if (!emailVal.isValid) {
    return { success: false, message: emailVal.message };
  }

  const existing = getSecretaryInvitations();
  const activePending = existing.find(
    (inv) => inv.email.toLowerCase() === input.email.trim().toLowerCase() && inv.status === 'Pending'
  );

  if (activePending) {
    return {
      success: false,
      message: `A pending Class Secretary invitation already exists for ${input.studentName}.`,
    };
  }

  const token = `sec-inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const newInv: SecretaryInvitation = {
    id: `inv-${Date.now()}`,
    studentId: input.studentId,
    studentName: input.studentName,
    email: input.email.trim().toLowerCase(),
    facultyName: input.facultyName,
    className: input.className || 'Clinical Rotation A',
    classId: input.classId || 'CLINIC-A',
    token,
    status: 'Pending',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  saveSecretaryInvitations([newInv, ...existing]);

  logSystemEmail({
    recipient: `${newInv.studentName} (${newInv.email})`,
    subject: 'Class Secretary Appointment Invitation - DentiSys',
    type: 'Class Secretary Invitation',
    status: 'Sent',
  });

  recordAudit({
    userName: input.facultyName,
    userRole: 'faculty',
    action: 'Sent Class Secretary invitation',
    module: 'Email Management',
    description: `Faculty ${input.facultyName} issued Class Secretary invitation to ${input.studentName} (${input.email}).`,
    status: 'Success',
  });

  return {
    success: true,
    message: `Class Secretary invitation sent to ${input.studentName}.`,
    invitation: newInv,
  };
};

export const revokeSecretaryInvitation = async (
  invitationId: string,
  facultyName: string
): Promise<{ success: boolean; message: string }> => {
  const list = getSecretaryInvitations();
  const index = list.findIndex((i) => i.id === invitationId);
  if (index === -1) return { success: false, message: 'Invitation not found.' };

  list[index].status = 'Revoked';
  saveSecretaryInvitations(list);

  recordAudit({
    userName: facultyName,
    userRole: 'faculty',
    action: 'Revoked Class Secretary invitation',
    module: 'Email Management',
    description: `Faculty ${facultyName} revoked Class Secretary invitation for ${list[index].studentName}.`,
    status: 'Warning',
  });

  return { success: true, message: `Invitation for ${list[index].studentName} has been revoked.` };
};

export const getSecretaryInvitationByToken = (token: string): SecretaryInvitation | null => {
  const list = getSecretaryInvitations();
  const inv = list.find((i) => i.token === token);
  if (!inv) return null;

  // Auto check expiration
  if (inv.status === 'Pending' && new Date(inv.expiresAt) < new Date()) {
    inv.status = 'Expired';
    saveSecretaryInvitations(list);
  }

  return inv;
};

export const activateSecretaryAccount = async (
  token: string,
  password: string
): Promise<{ success: boolean; message: string; user?: RegisteredUser }> => {
  await new Promise((resolve) => setTimeout(resolve, 800));

  const inv = getSecretaryInvitationByToken(token);
  if (!inv) {
    return { success: false, message: 'Invalid or missing invitation token.' };
  }

  if (inv.status === 'Revoked') {
    return { success: false, message: 'This invitation has been revoked by the faculty member.' };
  }

  if (inv.status === 'Expired') {
    return { success: false, message: 'This invitation link has expired. Please request a new invitation.' };
  }

  if (inv.status === 'Accepted') {
    return { success: false, message: 'This invitation has already been accepted. Please sign in.' };
  }

  const passVal = validatePasswordRequirements(password);
  if (!passVal.isValid) {
    return { success: false, message: 'Password does not meet security requirements.' };
  }

  // Mark invitation as accepted
  const allInvs = getSecretaryInvitations();
  const invIndex = allInvs.findIndex((i) => i.id === inv.id);
  if (invIndex !== -1) {
    allInvs[invIndex].status = 'Accepted';
    saveSecretaryInvitations(allInvs);
  }

  // Create or update registered user account
  const users = getRegisteredUsers();
  const existingUserIndex = users.findIndex((u) => u.email.toLowerCase() === inv.email.toLowerCase());

  const newSecretaryUser: RegisteredUser = {
    id: `user-${Date.now()}`,
    name: inv.studentName,
    email: inv.email.toLowerCase(),
    password,
    role: 'secretary',
    title: 'Class Secretary',
    status: 'Active',
    createdAt: new Date().toISOString(),
    assignedClassId: inv.classId,
    assignedClassName: inv.className,
  };

  if (existingUserIndex !== -1) {
    users[existingUserIndex] = newSecretaryUser;
    saveRegisteredUsers(users);
  } else {
    saveRegisteredUsers([...users, newSecretaryUser]);
  }

  recordAudit({
    userName: newSecretaryUser.name,
    userRole: 'secretary',
    action: 'Activated Class Secretary account',
    module: 'Authentication',
    description: `Student ${newSecretaryUser.name} accepted invitation and activated Class Secretary account for ${inv.className}.`,
    status: 'Success',
  });

  return {
    success: true,
    message: 'Class Secretary account activated successfully! Redirecting to sign in...',
    user: newSecretaryUser,
  };
};

/**
 * Authenticates user credentials with role-based status checking.
 */
export const authenticateUser = (
  email: string,
  pass: string
): { success: boolean; message: string; user?: any; status?: AccountStatus } => {
  const trimmedEmail = email.trim().toLowerCase();

  // 1. Default Dean Demo Account
  if (trimmedEmail === 'admin@bicol-u.edu.ph' && pass === 'admin123') {
    const adminUser = {
      email: 'admin@bicol-u.edu.ph',
      role: 'admin',
      name: 'Dr. Marcus Aurelius',
      title: 'Office of the Dean',
      status: 'Active' as AccountStatus,
    };
    return { success: true, message: 'Logged in successfully.', user: adminUser, status: 'Active' };
  }

  // 2. Default Faculty Demo Account
  if (trimmedEmail === 'faculty@bicol-u.edu.ph' && pass === 'faculty123') {
    const facultyUser = {
      email: 'faculty@bicol-u.edu.ph',
      role: 'faculty',
      name: 'Dr. Eleanor Vance',
      title: 'Dental Faculty Member',
      assignedSubjects: ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'],
      assignedClasses: ['CLINIC-A', 'CLINIC-B'],
      status: 'Active' as AccountStatus,
    };
    return { success: true, message: 'Logged in successfully.', user: facultyUser, status: 'Active' };
  }

  // 3. Default Secretary Demo Account
  if (trimmedEmail === 'secretary@bicol-u.edu.ph' && pass === 'secretary123') {
    const secretaryUser = {
      email: 'secretary@bicol-u.edu.ph',
      role: 'secretary',
      name: 'Miss Clara Oswald',
      title: 'Class Secretary',
      assignedClassId: 'CLINIC-A',
      assignedClassName: 'Clinical Rotation A',
      classroomName: 'Dental Clinic B - Room 402',
      cctvCameraId: 'CCTV-CLINIC-A-01',
      status: 'Active' as AccountStatus,
    };
    return { success: true, message: 'Logged in successfully.', user: secretaryUser, status: 'Active' };
  }

  // 4. Check registered users in localStorage
  const registeredUsers = getRegisteredUsers();
  const user = registeredUsers.find((u) => u.email.toLowerCase() === trimmedEmail && u.password === pass);

  if (!user) {
    return {
      success: false,
      message: 'Invalid email or password. Please check your credentials and try again.',
    };
  }

  // Validate Account Status based on role
  if (user.role === 'faculty') {
    if (user.status === 'Pending Approval') {
      return {
        success: false,
        message: 'Your account registration is currently pending approval by the Dean. Please wait for Dean approval before signing in.',
        status: 'Pending Approval',
      };
    }
    if (user.status === 'Rejected') {
      return {
        success: false,
        message: 'Your registration request was rejected by the Dean. Please contact the Office of the Dean for details.',
        status: 'Rejected',
      };
    }
  }

  if (user.role === 'secretary') {
    if (user.status === 'Pending Invitation') {
      return {
        success: false,
        message: 'Your Class Secretary invitation has not yet been accepted. Please open your invitation link to activate your account.',
        status: 'Pending Invitation',
      };
    }
  }

  if (user.status !== 'Active') {
    return {
      success: false,
      message: `Account is inactive (Status: ${user.status}). Please contact system administrator.`,
      status: user.status,
    };
  }

  return {
    success: true,
    message: 'Logged in successfully.',
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
      title: user.title,
      assignedSubjects: user.assignedSubjects,
      assignedClasses: user.assignedClasses,
      assignedClassId: user.assignedClassId,
      assignedClassName: user.assignedClassName,
      status: user.status,
    },
    status: 'Active',
  };
};
