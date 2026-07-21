# DentiSys Frontend Codebase Documentation

This document provides a comprehensive technical overview of the current frontend implementation of DentiSys, an academic and clinical management portal for Bicol University College of Dental Medicine.

---

## Technical Stack Overview
- **Language:** TypeScript (`.ts`, `.tsx`)
- **Framework:** React 19 (built on Vite 8) with React Router DOM 7
- **UI & Icons:** Lucide React
- **Styling:** TailwindCSS 3 (Vanilla utility-first CSS configuration)
- **State Management:** Custom React Context (`AppContext.tsx` simulating state & persistence)
- **Visualization:** Recharts (reporting graphs and analytics)
- **Micro-interactions:** Canvas Confetti

---

## Feature: Secure Role-Based Authentication & Invitation Workflow (RBAC)

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | React Router DOM |

### 2. Feature Description
Provides a role-governed registration and invitation workflow for Faculty, Dean (Admin), and Class Secretary roles:
- **Dean (Admin)**: Default system administrator account (`admin@bicol-u.edu.ph`). Manages and approves faculty registrations.
- **Faculty**: Registers via public Sign Up form with an official Bicol University email address (`@bicol-u.edu.ph`). Account status defaults to `Pending Approval` until approved by the Dean.
- **Class Secretary**: Appointed exclusively by Faculty members through the Email Management module (`Class Secretary Invitation`). Accounts are activated via a unique invitation link (`/activate-secretary?token=...`).

### 3. How It Works
- **Faculty Sign Up**: Collects Full Name, BU Email, Password, and Terms Agreement. Validates BU domain and password strength. Upon submit, sets status to `Pending Approval` and displays a confirmation screen.
- **Faculty Approval Portal (`/admin/faculty-approval`)**: Allows the Dean to review pending registration requests, search/filter, and execute **Approve** or **Reject** actions.
  - Approving updates account status to `Active`, logs audit trail entries, and generates approval notification emails.
  - Rejecting updates account status to `Rejected` and generates rejection notification emails.
- **Class Secretary Invitations**: Faculty issue invitations from the **Email Management** portal. Generates unique tokens and activation URLs. Tracks invitation statuses (`Pending`, `Accepted`, `Expired`, `Revoked`).
- **Secretary Account Activation (`/activate-secretary`)**: Pre-fills student name, email, and role (`Class Secretary`). Allows the student to set their password and activate their account.
- **Login Validation (`Login.tsx`)**: Evaluates credentials and status flags. Blocks login for accounts that are `Pending Approval`, `Rejected`, or `Pending Invitation`.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/services/authService.ts
export const registerFaculty = async (userData: { name: string; email: string; password: string }) => {
  const newFaculty: RegisteredUser = {
    id: `user-${Date.now()}`,
    name: userData.name,
    email: userData.email,
    role: 'faculty',
    status: 'Pending Approval',
    createdAt: new Date().toISOString(),
  };
  saveRegisteredUsers([...existingUsers, newFaculty]);
  return { success: true, message: 'Registration request submitted! Awaiting Dean approval.' };
};

// Dean Approval Action
export const approveFacultyAccount = async (email: string) => {
  users[index].status = 'Active';
  logSystemEmail({ recipient: email, type: 'Faculty Registration Approved', status: 'Sent' });
  recordAudit({ action: 'Approved faculty registration', module: 'Faculty Approval', status: 'Success' });
};
```

---

## Feature: Student Management & Admission Intake

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | None |

### 2. Feature Description
Allows dental faculty members to maintain student directories, search profiles, and enroll new students.

### 3. How It Works
- Pulls lists of students matching the active block/class assigned to the faculty member.
- Prompts for student information in the Admissions Intake form and generates default curriculum subjects (including unit values and clinic status markers) based on the chosen year level.
- Pushes new records into the global React state via the `addStudent` dispatcher.
- Logs enrollment events to the audit trail.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/pages/faculty/StudentManagement.tsx (Lines 139-150)
const handleEnrollSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const yearNum = parseInt(formYearLevel) as 1 | 2 | 3 | 4;
  addStudent({
    name: formName,
    email: formEmail,
    studentId: formStudentId,
    yearLevel: yearNum,
    classId: selectedClassId,
    className: students.find(s => s.classId === selectedClassId)?.className || selectedClassId,
    clinicHoursCompleted: parseInt(formClinicHours) || 0,
    enrolledSubjects: getDefaultSubjectsForYear(yearNum),
  });
};
```

---

## Feature: Biometric Face Enrollment Simulation

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | None |

### 2. Feature Description
Simulates facial biometric capture across five angles, registering the generated face landmarks in the student's profile once privacy consent is active.

### 3. How It Works
- Confirms privacy consent status (`consentStatus === 'approved'`) before starting scans.
- Guides the user through a 5-step capture routine (Front, Left, Right, Tilt Up, Tilt Down) using visual instructions and progress indicator bars.
- Saves the captured image array using `enrollStudentFace` into global state.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/pages/faculty/StudentManagement.tsx (Lines 192-208)
const interval = setTimeout(() => {
  setCapturedPhotos(prev => [...prev, SIMULATED_CAMERA_PORTRAITS[scanStep - 1]]);
  setScanProgress(currentStepInfo.p);

  if (scanStep < 5) {
    setScanStep(prev => prev + 1);
    setScanStatusMsg(stepsInfo[scanStep].msg);
  } else {
    setIsScanning(false);
    setScanStep(0);
    enrollStudentFace(facialStudentId, capturedPhotos);
    setIsVerificationModalOpen(true);
  }
}, 1800);
```

---

## Feature: Grade Computation & Assessment Management

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | Recharts |

### 2. Feature Description
Computes grades and general weighted averages (GWA) mapped to the Philippine academic scale (1.0 to 5.0), using weights specified for quizzes, exams, practicums, and attendance.

### 3. How It Works
- Instructors assign specific weights to subjects (e.g. 40% clinical practicum weight for dentistry program courses).
- Evaluates average percentages across components and applies mathematical routing in `gradeHelper.ts` to convert percentages into GWAs (1.0 = Excellent, 3.0 = Passing, 5.0 = Failing).
- Computes overall student GWAs weighted by subject credit units.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/utils/gradeHelper.ts (Lines 7-18)
export const percentageToGWA = (pct: number): number => {
  if (pct >= 97) return 1.0;
  if (pct >= 94) return 1.25;
  if (pct >= 91) return 1.5;
  if (pct >= 88) return 1.75;
  if (pct >= 85) return 2.0;
  if (pct >= 82) return 2.25;
  if (pct >= 80) return 2.5; // Strict retention limit for dental majors
  if (pct >= 78) return 2.75;
  if (pct >= 75) return 3.0; // Passing grade
  return 5.0; // Failure
};
```

---

## Feature: Attendance Register & CCTV Camera Simulator

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | None |

### 2. Feature Description
Enables Class Secretaries to review class attendance records and integrates a live webcam simulator representing automated biometric scanning in dental clinics.

### 3. How It Works
- Requests hardware access to the local user camera via `navigator.mediaDevices.getUserMedia` when streaming is activated.
- Feeds raw video streams to a `<video>` element nested inside a clinical monitor dashboard template.
- Summarizes attendance rate metrics (Present, Late, Absent) for the class.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/pages/secretary/CCTVFeed.tsx (Lines 41-54)
try {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is unavailable in this browser context.');
  }
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 },
    audio: false,
  });
  setStream(mediaStream);
  setIsCameraAvailable(true);
} catch (err) {
  setIsCameraAvailable(false);
  setStream(null);
  setError(err instanceof Error ? err.message : 'Camera offline.');
}
```

---

## Feature: Manual Attendance Override

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | None |

### 2. Feature Description
Provides Class Secretaries with tools to correct student attendance records under a secure validation structure.

### 3. How It Works
- Validates the current session's permissions to ensure only authorized secretaries execute overrides on students belonging to their block.
- Implements length checks (8 to 240 characters) on the justification message.
- Invokes the `overrideAttendanceRecord` context action to apply edits and appends metadata records to the audit log.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/pages/secretary/ManualAttendanceOverride.tsx (Lines 75-84 & 100-110)
const cleanedReason = reason.trim().replace(/\s+/g, ' ');
if (cleanedReason.length < 8) {
  setMessage({ type: 'error', text: 'Provide a clear reason for the manual correction.' });
  return;
}
if (cleanedReason.length > 240) {
  setMessage({ type: 'error', text: 'The override reason must be 240 characters or fewer.' });
  return;
}
overrideAttendanceRecord({
  recordId: selectedRecord.id,
  studentId: selectedRecord.studentId,
  date: selectedRecord.date,
  subjectCode: selectedRecord.subjectCode,
  status,
  reason: cleanedReason,
  changedBy: secretary.email,
  changedByName: secretary.name,
  assignedClassId: classId,
});
```

---

## Feature: Academic Retention Criteria & Status Monitoring

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | Recharts |

### 2. Feature Description
Enables the Dean/Admin to configure threshold boundaries (GWA thresholds and clinical criteria) and enables Faculty to schedule remedial exams and override retention standings with justifications.

### 3. How It Works
- Evaluates student performance components and tags students with "warning" or "critical" status flags.
- Faculty can schedule remedial exams for failed subjects, record scores, or override student retention status directly using the `overrideRetentionStatus` method.
- Records changes to the retention override logs.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/pages/faculty/RetentionMonitoring.tsx (Lines 65-70 & 265-274)
const handleSaveOverride = () => {
  if (!overrideRemarks.trim()) return;
  overrideRetentionStatus(
    overrideStudentId,
    overrideStatus,
    overrideRemarks,
    currentUser.name
  );
  setIsOverrideOpen(false);
  setOverrideRemarks('');
};
```

---

## Feature: Email Management & Privacy Consent Requests

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | None |

### 2. Feature Description
Provides templates and dispatch simulations for clinical instructors to request biometric privacy consent and send academic warnings to at-risk students.

### 3. How It Works
- Analyzes students' consent and academic details, displaying totals categorized by response state (Approved, Pending, Declined).
- Integrates a modal to preview constructed emails populated with student-specific data (e.g. failing grades, clinic hours).
- Pushes dispatch details to local lists to simulate email queues, generating activity audit logs on execution.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/pages/faculty/EmailManagement.tsx (Lines 31-36)
const send = () => {
  if (!selected.length) return setNotice('Select at least one student before sending.');
  const now = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  setLogs(prev => [...selected.map(id => { 
    const student = students.find(s => s.id === id)!; 
    return { 
      id: `mail-${Date.now()}-${id}`, 
      recipient: student.name, 
      subject: isConsent ? 'Privacy Consent for Facial Recognition' : 'Academic Support & At-Risk Notification', 
      type: isConsent ? 'Privacy Consent' as const : 'At-Risk Notification' as const, 
      sentAt: now, 
      status: 'Sent' as const 
    }; 
  }), ...prev]);
};
```

---

## Feature: System Auditing & User Activity Trails

### 1. Language / Framework
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Framework | React (Vite) |
| UI Library | Lucide React |
| Styling | TailwindCSS |
| Other Libraries | None |

### 2. Feature Description
Records accountable system actions, login activities, and academic overrides to generate exportable audit reports.

### 3. How It Works
- Exposes `recordAudit` which captures information including timestamp, action description, module, status, IP addresses, and user-agent details.
- Stores logs locally inside `localStorage` under `dentisys_audit_logs`, keeping the history capped at the 1,000 most recent records.
- Provides search bars, sort orders, and category filters (e.g. status, modules, roles) in the dashboard, with export-to-CSV options.
- **"To be implemented in the backend."**

### 4. Code Snippet (Key Lines Only)

```tsx
// src/services/auditService.ts (Lines 12-14)
export const recordAudit = (input: AuditInput) => { 
  const user = currentUser(); 
  const entry: AuditLog = { 
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 
    timestamp: input.timestamp || new Date().toISOString(), 
    userName: input.userName || user.name || 'System User', 
    userRole: (input.userRole || user.role || 'admin') as AuditRole, 
    action: input.action, 
    module: input.module, 
    description: input.description, 
    status: input.status, 
    ipAddress: input.ipAddress || 'Frontend placeholder', 
    device: input.device || navigator.userAgent || 'Browser placeholder' 
  }; 
  const logs = [entry, ...getAuditLogs()]; 
  localStorage.setItem(key, JSON.stringify(logs.slice(0, 1000))); 
  return entry; 
};
```
