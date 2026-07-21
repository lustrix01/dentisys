# DentiSYS: Feature Documentation

**System**: DentiSYS – BUCDM Grading and Retention Monitoring System  
**Stack**: Vite + React + TypeScript (Frontend) | Plain PHP + PDO + MariaDB (Backend)

---

## Feature: User Authentication & Role-Based Access Control (RBAC)

**Feature Description:**  
Provides portals for different user roles (Faculty, Dean/Admin, and Class Secretary) with authorization checking, redirect guards, and external provider simulation (Google Login).

**How It Works:**  
The Login page collects the user's email and password and passes them to the authentication service. The service first checks three hard-coded demo accounts for admin, faculty, and secretary roles. For all other users it searches the registered users stored locally, matches credentials, and enforces account status — Faculty accounts pending approval or rejected are blocked with descriptive messages, and Class Secretaries with pending invitations are blocked until their activation link is accepted. On a successful login the user object is saved to local storage and a login audit entry is written. A Google Login button simulates OAuth by directly injecting a Faculty session and logging the sign-in event as "signed in using Google Workspace." Every protected route in the application reads the current user from local storage on render. If no session exists the user is redirected to the login page. Each route additionally checks the user's role and redirects unauthorized users back to the dashboard, enforcing the boundary between Dean, Faculty, and Class Secretary portals.

**Code Snippet:**
```typescript
// authService.ts – block non-active accounts
const user = registeredUsers.find(
  (u) => u.email.toLowerCase() === trimmedEmail && u.password === pass
);
if (user.status === 'Pending Approval') {
  return { success: false, message: 'Your account is pending approval by the Dean.' };
}

// Login.tsx – save session and write audit entry
localStorage.setItem('dentisys_user', JSON.stringify(authResult.user));
recordAudit({ action: 'Logged in', module: 'Authentication', status: 'Success' });
navigate('/');

// Login.tsx – Google Login simulation
const handleGoogleLogin = () => {
  const user = { email: 'faculty@bicol-u.edu.ph', role: 'faculty', name: 'Dr. Eleanor Vance' };
  localStorage.setItem('dentisys_user', JSON.stringify(user));
  recordAudit({ action: 'Logged in', description: 'User signed in using Google Workspace.', status: 'Success' });
  navigate('/');
};

// App.tsx – role-based route guard
<Route
  path="/admin/faculty-approval"
  element={currentUser.role === 'admin' ? <FacultyApproval /> : <Navigate to="/" replace />}
/>
```

---

## Feature: Student Management & Admission Intake

**Feature Description:**  
Allows dental faculty members to maintain student directories, search profiles, and enroll new students.

**How It Works:**  
The Student Management page reads the logged-in faculty member's assigned class blocks and subjects from the session on mount. The student list is automatically filtered to show only students belonging to the faculty's assigned class block, preventing cross-class data access. A real-time search bar lets faculty search by student name, student ID, or email address, and dropdown filters further narrow results by year level, retention status, and face enrollment status. To enroll a new student, faculty fill in the student's name, email, ID, year level, and clinic hours. On submission, the system automatically assigns the default curriculum subjects for the selected year level, computes an initial GWA, sets the status to active, and persists the new record. Every update and deletion passes through a grade synchronization function that keeps computed GWA and retention status consistent, and writes a timestamped audit log entry for each operation.

**Code Snippet:**
```typescript
// StudentManagement.tsx – RBAC-constrained student list
const facultyStudents = useMemo(() =>
  students.filter(s =>
    s.classId === selectedClassId &&
    s.enrolledSubjects.some(sub => assignedSubjects.includes(sub.code))
  ), [students, selectedClassId, assignedSubjects]);

// StudentManagement.tsx – submit new student enrollment
const handleEnrollSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const yearNum = parseInt(formYearLevel) as 1 | 2 | 3 | 4;
  addStudent({
    name: formName, email: formEmail, studentId: formStudentId,
    yearLevel: yearNum, classId: selectedClassId,
    clinicHoursCompleted: parseInt(formClinicHours) || 0,
    enrolledSubjects: getDefaultSubjectsForYear(yearNum),
  });
};

// AppContext.tsx – addStudent() creates record and syncs grades
const created: Student = {
  ...newStudent,
  id: Math.random().toString(36).substr(2, 9),
  status: 'active',
  overallGWA: computeOverallGWA(newStudent.enrolledSubjects),
  remedialExams: [],
};
setStudents(prev => syncStudentGrades([...prev, created], assessments, assessmentScores, gradingComponents, attendanceRecords));
recordAudit({ action: 'Created student', module: 'Student Management', status: 'Success' });
```

---

## Feature: Biometric Face Enrollment Simulation

**Feature Description:**  
Simulates facial biometric capture across five angles, registering the generated face landmarks in the student's profile once privacy consent is active.

**How It Works:**  
The Facial Biometrics tab of the Student Management module gates enrollment behind RA 10173 privacy consent. If the selected student has not yet provided an approved consent response, the enrollment attempt is blocked immediately with an alert directing faculty to send a consent request first. Once consent is confirmed, the five-step scanning sequence begins. The system progresses automatically through front view, left profile, right profile, tilt up, and tilt down captures, each separated by a 1,800-millisecond delay to simulate real biometric scanner behavior. A progress bar advances 20 percent per step and a status message updates to describe the current angle. After all five captures are complete, the system registers the enrollment by setting the student's face enrolled flag to true, storing the captured portrait images, the enrollment status, and the enrollment date on the student's profile. A verification modal is then shown confirming success. Faculty can also remove an existing enrollment, which clears the biometric data from the student's record.

**Code Snippet:**
```typescript
// StudentManagement.tsx – five simulated angle portraits
const SIMULATED_CAMERA_PORTRAITS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', // Front View
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',   // Left Profile
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150', // Right Profile
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', // Tilt Up
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150', // Tilt Down
];

// StudentManagement.tsx – consent gate before scanning
const startBiometricEnrollment = () => {
  if (student?.consentStatus !== 'approved') {
    alert('Facial enrollment requires approved privacy consent. Send a request from Email Management first.');
    return;
  }
  setIsScanning(true); setScanStep(1); setScanProgress(0); setCapturedPhotos([]);
};

// StudentManagement.tsx – step-by-step capture useEffect (1800ms per step)
useEffect(() => {
  if (!isScanning || scanStep === 0) return;
  const interval = setTimeout(() => {
    setCapturedPhotos(prev => [...prev, SIMULATED_CAMERA_PORTRAITS[scanStep - 1]]);
    setScanProgress(currentStepInfo.p);
    if (scanStep < 5) { setScanStep(prev => prev + 1); }
    else { enrollStudentFace(facialStudentId, capturedPhotos); setIsVerificationModalOpen(true); }
  }, 1800);
  return () => clearTimeout(interval);
}, [isScanning, scanStep, facialStudentId]);

// AppContext.tsx – enrollStudentFace() persists enrollment details
faceEnrolled: true,
faceEnrollmentDetails: {
  images,
  status: 'Enrolled & Verified',
  enrolledAt: new Date().toISOString().split('T')[0]
}
```

---

## Feature: Grade Computation & Assessment Management

**Feature Description:**  
Computes grades and general weighted averages (GWA) mapped to the Philippine academic scale (1.0 to 5.0), using weights specified for quizzes, exams, practicums, and attendance.

**How It Works:**  
Faculty create assessments by specifying the title, type, subject code, class block, grading period, and maximum score. Scores are entered per student per assessment through the Score Entry tab. Whenever assessments, scores, grading component configurations, attendance records, or grade weights change, the system automatically re-evaluates every student's grades without any additional faculty action. For each student and subject, the system aggregates scores by assessment category, computes a category percentage, then combines them into a weighted total using each component's configured weight normalized to a 100-percent basis. The resulting weighted percentage is mapped to the Philippine academic scale where 97 percent or above earns a 1.0, 80 percent earns a 2.5 which is the clinical retention boundary, 75 percent earns a 3.0 which is the passing grade, and below 75 percent results in a failing 5.0. The overall GWA is then computed as a credit-unit-weighted average across all enrolled subjects and stored back on each student's record.

**Code Snippet:**
```typescript
// gradeHelper.ts – percentageToGWA (Philippine academic scale)
export const percentageToGWA = (pct: number): number => {
  if (pct >= 97) return 1.0;
  if (pct >= 94) return 1.25;
  if (pct >= 91) return 1.5;
  if (pct >= 88) return 1.75;
  if (pct >= 85) return 2.0;
  if (pct >= 82) return 2.25;
  if (pct >= 80) return 2.5; // Clinical retention limit
  if (pct >= 78) return 2.75;
  if (pct >= 75) return 3.0; // Passing grade
  return 5.0;                // Failure
};

// gradeHelper.ts – computeSubjectGrade (normalized weighted average)
export const computeSubjectGrade = (components, weights) => {
  const totalWeight = weights.quizzes + weights.exams + weights.practicum + weights.attendance;
  const normQ = weights.quizzes / totalWeight;
  const normE = weights.exams / totalWeight;
  const normP = weights.practicum / totalWeight;
  const normA = weights.attendance / totalWeight;
  const totalPercentage =
    components.quizzes * normQ + components.exams * normE +
    components.practicum * normP + components.attendance * normA;
  return percentageToGWA(Math.round(totalPercentage * 100) / 100);
};

// gradeHelper.ts – computeOverallGWA (unit-weighted across all subjects)
subjects.forEach(subject => {
  totalUnits += subject.units;
  weightedGradeSum += subject.grade * subject.units;
});
return Math.round((weightedGradeSum / totalUnits) * 100) / 100;
```

---

## Feature: Attendance Register

**Feature Description:**  
Enables Class Secretaries to review class attendance records and integrates a live webcam simulator representing automated biometric scanning in dental clinics.

**How It Works:**  
When the Attendance List page loads, it reads the logged-in secretary's session to determine the assigned class block. All student and attendance data is then filtered down to that class only, so the secretary can never view records outside their assigned block. The filtered records are displayed in a searchable, date-filterable table showing each student's name, date, subject, attendance status, and whether a manual override has been applied. Summary cards at the top of the page display the total count of present, late, and absent records alongside an overall attendance rate percentage for the visible data. The page is intentionally read-only — no edits can be made from this screen. Manual corrections are directed to the override page. The CCTV Feed page alongside this module displays a simulated live camera panel for the secretary's assigned clinical block, representing the biometric attendance scanner that would be integrated in a production deployment.

**Code Snippet:**
```typescript
// AttendanceList.tsx – class-scope enforcement from session
const secretary = getCurrentSecretary();
const classId = getAssignedClassId(secretary);
const classStudents = getClassStudents(students, classId);
const classAttendance = getClassAttendance(attendanceRecords, classStudents);

// AttendanceList.tsx – search and date filters with useMemo
const filteredRecords = useMemo(() => {
  const lowerQuery = query.trim().toLowerCase();
  return classAttendance
    .filter(record => !selectedDate || record.date === selectedDate)
    .filter(record => {
      const student = classStudents.find(item => item.id === record.studentId);
      if (!student || !lowerQuery) return true;
      return student.name.toLowerCase().includes(lowerQuery) ||
             student.studentId.toLowerCase().includes(lowerQuery);
    })
    .sort((a, b) => `${b.date}-${b.subjectCode}`.localeCompare(`${a.date}-${a.subjectCode}`));
}, [classAttendance, classStudents, query, selectedDate]);

// AttendanceList.tsx – summary counter aggregation
const totals = {
  present: filteredRecords.filter(record => record.status === 'present').length,
  late:    filteredRecords.filter(record => record.status === 'late').length,
  absent:  filteredRecords.filter(record => record.status === 'absent').length,
};
```

---

## Feature: Manual Attendance Override

**Feature Description:**  
Provides Class Secretaries with tools to correct student attendance records under a secure validation structure.

**How It Works:**  
The Manual Attendance Override page allows Class Secretaries to select an attendance record from their assigned class and submit a corrected status with a documented reason. Before any change is committed, the system runs five sequential validations: it verifies the session user holds the secretary role, confirms a record and student have been selected, checks that the selected student belongs to the secretary's assigned class to prevent cross-class modifications, ensures the written reason is between 8 and 240 characters long, and rejects the submission if the new status is identical to the current one. If any check fails, an error message is shown inline and no data is changed. If all checks pass, a confirmation dialog is shown before the override is applied. On confirmation, the attendance record is updated and a new entry is appended to the record's audit trail array, preserving the previous status, the new status, the written reason, the secretary's identifier, and the timestamp of the change. This creates a tamper-evident modification history on every attendance record that has been manually corrected.

**Code Snippet:**
```typescript
// ManualAttendanceOverride.tsx – sequential validations in handleSave()
if (!secretary || secretary.role !== 'secretary') {
  setMessage({ type: 'error', text: 'Only Class Secretaries can apply manual attendance overrides.' });
  return;
}
if (selectedStudent.classId !== classId) {
  setMessage({ type: 'error', text: 'Access denied. This student is outside your assigned class.' });
  return;
}
if (cleanedReason.length < 8 || cleanedReason.length > 240) {
  setMessage({ type: 'error', text: 'Provide a clear reason between 8 and 240 characters.' });
  return;
}

// ManualAttendanceOverride.tsx – dispatch override to context
overrideAttendanceRecord({
  recordId: selectedRecord.id, studentId: selectedRecord.studentId,
  date: selectedRecord.date, subjectCode: selectedRecord.subjectCode,
  status, reason: cleanedReason,
  changedBy: secretary.email, changedByName: secretary.name, assignedClassId: classId,
});

// AppContext.tsx – auditTrail append per override
auditTrail: [
  ...(existing.auditTrail || []),
  {
    id: `audit-${Math.random().toString(36).substr(2, 9)}`,
    previousStatus: existing.status,
    newStatus: status,
    reason: cleanedReason,
    changedBy,
    changedByName,
    changedAt,
  },
],
```

---

## Feature: Academic Retention Criteria & Status Monitoring

**Feature Description:**  
Enables the Dean/Admin to configure threshold boundaries (GWA thresholds and clinical criteria) and enables Faculty to schedule remedial exams and override retention standings with justifications.

**How It Works:**  
The Retention Criteria page is access-controlled so only the Dean role can view and edit it. The Dean manages named policy entries, each specifying a minimum GWA, minimum attendance percentage, maximum allowed remedial subjects, and whether the policy applies to clinical rotations. When the Dean saves or enables a criterion, the system immediately updates the global retention threshold used for grade evaluation, propagating the change to all students without any manual refresh. On every grade recalculation, each clinical subject is checked against the active threshold. Subjects that fall below the standard are flagged for remediation, and the student's overall status is automatically assigned: students with pending remedial exams become remedial status, those with two or more failing clinical subjects are marked critical, one clinical violation becomes a warning, and students clearing all criteria return to active. Faculty use the Retention Monitoring page to view the at-risk watchlist, manually schedule remedial exams for specific students and subjects, record exam scores, and apply manual status overrides with written justifications. Passing a remedial exam caps the grade at 2.5 for clinical subjects and 3.0 for non-clinical subjects. Each status override is logged with the previous status, new status, remarks, and the faculty member's identity.

**Code Snippet:**
```typescript
// RetentionCriteria.tsx – sync threshold when criterion is saved or toggled
if (target?.enabled && form.enabled) {
  updateSettings({ ...settings, retentionThreshold: form.minGrade });
}
const activeClinical = updated.find(c => c.enabled && c.appliesToClinical);
if (activeClinical) {
  updateSettings({ ...settings, retentionThreshold: activeClinical.minGrade });
}

// AppContext.tsx – retention evaluation inside syncStudentGrades()
const isClinicalViolation = subj.isClinical && computedGrade > settings.retentionThreshold;
const needsRemedial = isClinicalViolation || computedGrade === 5.0;

if (pendingRemedials.length > 0)                              { status = 'remedial'; }
else if (outrightFails.length >= 2 || clinicalFails.length >= 2) { status = 'critical'; }
else if (clinicalFails.length > 0)                            { status = 'warning'; }
else                                                          { status = 'active'; }

// AppContext.tsx – remedial exam pass cap
const isPassed = score >= 75;
resolvedGrade = isClinical ? 2.5 : 3.0; // Capped grade on passing
```

---

## Feature: Email Management & Privacy Consent Requests

**Feature Description:**  
Provides templates and dispatch simulations for clinical instructors to request biometric privacy consent and send academic warnings to at-risk students.

**How It Works:**  
The Email Management page organizes outgoing communications into four tabs. The Privacy Consent tab automatically lists students who do not yet have facial enrollment, so faculty can select them and dispatch a consent request. The At-Risk Notification tab lists students whose retention status is not active, allowing faculty to send academic support warnings to the affected individuals. The Class Secretary Invitation tab lists all students; selecting a student and sending issues a unique time-limited invitation token with a seven-day expiry that grants access to the secretary account activation page. Faculty can also copy the activation link directly to the clipboard and revoke any pending invitation. The History tab merges all dispatched emails stored in local storage with the initial seed records into a single deduped log showing recipient, subject, type, timestamp, and delivery status. A consent response modal lets faculty record the student's privacy decision — approved or declined — which is timestamped and saved to the student's profile.

**Code Snippet:**
```typescript
// EmailManagement.tsx – filter students by active tab purpose
const availableStudents = useMemo(() => {
  if (isConsent)   return students.filter(s => !s.faceEnrolled);
  if (isRisk)      return students.filter(s => s.status !== 'active');
  if (isSecretary) return students;
  return [];
}, [students, isConsent, isRisk, isSecretary]);

// EmailManagement.tsx – dispatch secretary invitation per selected student
const res = await createSecretaryInvitation({
  studentId: student.id, studentName: student.name,
  email: student.email, facultyName: user.name,
  className: student.className, classId: student.classId,
});

// EmailManagement.tsx – build consent / risk email log entries
const newLogs: EmailLog[] = selected.map(id => {
  const student = students.find(s => s.id === id)!;
  return {
    id: `mail-${Date.now()}-${id}`, recipient: student.name,
    subject: isConsent ? 'Privacy Consent for Facial Recognition' : 'Academic Support & At-Risk Notification',
    type: isConsent ? 'Privacy Consent' : 'At-Risk Notification',
    sentAt: nowStr, status: 'Sent',
  };
});

// EmailManagement.tsx – copy activation link to clipboard
const link = `${window.location.origin}/activate-secretary?token=${token}`;
navigator.clipboard.writeText(link);
```

---

## Feature: System Auditing & User Activity Trails

**Feature Description:**  
Records accountable system actions, login activities, and academic overrides to generate exportable audit reports.

**How It Works:**  
Every state-changing operation across the system — including logins, grade modifications, attendance overrides, faculty approvals, remedial exam resolutions, retention status changes, and settings updates — calls the central audit recording function. Each log entry captures a unique identifier, an ISO timestamp, the user's name and role drawn from the active session, the action performed, the module it belongs to, a human-readable description, a status of Success, Warning, or Failed, and the browser's user agent string. Entries are prepended to the audit log array stored in local storage and the array is capped at 1,000 entries to control storage size. Access to audit data is role-scoped: administrators see the complete log of all users, while faculty and secretaries see only the entries tied to their own name and role, preventing cross-user log inspection. The shared Audit Trail page component renders the log table with search, role, module, status, date, and sort order filters. An Export CSV button assembles all visible rows into a comma-separated file and triggers a browser download. The Dean's Reports page extends this with four dedicated report tabs — Student Summaries, Academic Grades, Retention Status, and Attendance — each exportable as a CSV and printable as a PDF via the browser's native print dialog.

**Code Snippet:**
```typescript
// auditService.ts – recordAudit() constructs and stores each log entry
const entry: AuditLog = {
  id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  timestamp: new Date().toISOString(),
  userName: input.userName || user.name || 'System User',
  userRole: (input.userRole || user.role || 'admin') as AuditRole,
  action: input.action, module: input.module,
  description: input.description, status: input.status,
  ipAddress: 'Frontend placeholder',
  device: navigator.userAgent,
};
localStorage.setItem(key, JSON.stringify([entry, ...getAuditLogs()].slice(0, 1000)));

// auditService.ts – role-scoped log access
export const auditForCurrentUser = () => {
  const user = currentUser();
  const logs = getAuditLogs();
  return user.role === 'admin'
    ? logs
    : logs.filter(log => log.userName === user.name && log.userRole === user.role);
};

// AuditTrailPage.tsx – CSV export triggered from Export CSV button
const exportCsv = () => {
  const rows = [
    ['Timestamp', 'User', 'Role', 'Action', 'Module', 'Description', 'Status'],
    ...filtered.map(log => [log.timestamp, log.userName, log.userRole, log.action, log.module, log.description, log.status])
  ];
  const csv = rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`) .join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = `dentisys-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
};

// SystemAudit.tsx – Student summary CSV export (Dean's Reports)
csv = `Dean's Student Summary Report\nGenerated: ${ts}\n\nStudent ID,Name,Class,Year Level,GWA,Status,Face Enrolled\n`;
csv += filtered.map(s =>
  `${s.studentId},"${s.name}",${s.classId},${s.yearLevel},${s.overallGWA.toFixed(2)},${s.status},${s.faceEnrolled ? 'Yes' : 'No'}`
).join('\n');
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
const link = document.createElement('a');
link.href = URL.createObjectURL(blob);
link.click();
```
