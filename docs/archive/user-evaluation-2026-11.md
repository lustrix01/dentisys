# User evaluation by the IT Faculty — November 2026

Record of the IT Faculty's system recommendations and the client's notes, received by the Owner on 2026-11-18, with what DentiSYS did at that time (`lighthal9-responsive` at ffdefa9), the gap, the open questions and a first size estimate. The backlog items 13.1–13.10 in [PRODUCT_BACKLOG.md](../PRODUCT_BACKLOG.md) point here. This file is a dated record and is not edited afterwards; decisions taken later go to the backlog item, `spec.md` or a contract.

Owner instruction: discuss each item first; nothing here is approved scope until the Owner rules on it.

## 1. Source text

### IT Faculty recommendations

#### Faculty Module (IMPORTANT)
1. Grade Submission Monitoring – Add a submission log that records the date and time each faculty member submits their grades. This will allow the Dean to monitor which faculty members submit grades on time and which submit them late.
2. Grade Submission Period Settings – Replace the semester-dependent deadline settings with a course-based configuration called Grade Submission Period Settings. This will allow administrators to set specific grade submission deadlines for each course, regardless of the semester.
3. Grade Modification Approval – Require Dean approval for any grade modifications made after the designated submission deadline.
4. Archived Class Grade Modification – Add an option to request the reactivation of grade editing for archived classes. Any changes to grades after the course has ended must be subject to Dean approval.
5. Grade Change Confirmation – Add confirmation pop-ups before finalizing grade changes or other important modifications to prevent accidental updates.

#### Facial Recognition (IMPORTANT)
1. Improve Facial Recognition Speed – Optimize the facial recognition process to reduce the time required to recognize individuals and record their attendance.
2. Data Security and Encryption – Verify whether facial recognition data is securely stored in the database. Clarify whether facial data or biometric templates are hashed or otherwise encrypted to protect users' information.

#### Attendance Module (IMPORTANT)
1. Restore Attendance Filters – Reinstate the attendance filtering options on the Faculty page to allow faculty members to easily sort and review attendance records.
2. Allow Sessions Outside Scheduled Hours – Restore the option to create attendance sessions outside the predefined class schedule when necessary.
3. Improve Attendance Processing Speed – Optimize the attendance recording process, particularly its integration with facial recognition, to minimize delays.

Owner clarification of Attendance 1: "Restore Attendance filter - user complained the filter in sessions disappeared".

#### Retention Module (IMPORTANT)
1. Display Grades in Retention Monitoring – Move or add students' grades to the top of their retention records so faculty members can easily review academic performance before sending retention risk notifications.
2. Batch Retention Notifications – Allow faculty members to send retention notification links to multiple students at once instead of sending them individually.
3. Grade Verification Before Notification – Include a review or confirmation step before sending batch notifications to ensure that the recorded grades are accurate and that the correct students are identified as being at risk.

#### Admin/Dean Module
1. Analytics-Only Access – Limit the Admin/Dean page to viewing system data analytics and generating or exporting reports and summaries. Remove functions unrelated to data monitoring and analytics.
2. Grade Submission Monitoring – Provide the Dean with access to faculty grade submission records, including submission dates and times, to monitor compliance with grade submission deadlines.
3. Grade Modification Approval – Allow the Dean to review and approve or reject requests for grade modifications submitted after the designated deadline, including requests involving archived classes.

#### Superadmin Role
1. System Management and Maintenance – Reserve the Superadmin role for system-level changes, updates, and configurations.
2. Data-Related Issue Resolution – Assign the Superadmin responsibility for investigating and resolving system-related issues, particularly problems involving data accuracy, inconsistencies, and data processing.

#### General System Improvements
1. Multiple User Capacity – Test the system's ability to handle multiple users accessing and using its features simultaneously without experiencing significant delays, errors, or crashes.
2. Confirmation Pop-ups – Implement confirmation dialogs for important user actions and system modifications to prevent accidental changes and ensure that users can review their actions before proceeding.

### Additional suggestion

Include a Report Generation Module that produces: 1. Comprehensive grading sheets; 2. Attendance sheets; and 3. Summaries of students that require remedial action.

### Client note on the export

"Please fix the export since it's include in the capstone project's paper's objective."

### Paper objective quoted by the client

**1.2 Objectives of the Study**

The study proposes an academic grading and retention monitoring system for the professors of the College of Dental Medicine of Bicol University, which aims to automate grade computation, retention monitoring, attendance tracking, and report generation. Specifically, the study aims to:

Design and develop a responsive, secure, and robust system which encompasses:
- A Grade Computation Module that integrates transmutation formulas and weighted grading structures;
- A Retention Monitoring Module that tracks remedial action and projects retention risk through rules-based risk assessment.
- An automated attendance monitoring system using real-time facial recognition.
- Include a Report Generation Module that produces:
  - Comprehensive grading sheets;
  - Attendance sheets; and
  - Summaries of students that require remedial action.

Evaluate the system to be developed using ISO/IEC 25010 software product qualities in terms of functional suitability, portability, reliability, maintainability, compatibility, performance efficiency, security, and usability.

### Client note on the remedial email

"Do not automatically send email about remedial's information, it should have a preview first. Client suggested to put it on email management instead, or as long as it's not automatically sending the email."

## 2. Analysis per backlog item

### 13.1 Face data security

Report: Facial Recognition 2.

- **Then:** the stored face reference (SFace embedding) is encrypted with AES-256-GCM in the biometric sidecar (`biometric-sidecar/app.py`, `encrypt_model`), with a server-held key that is never in the database, Git or the browser. PostgreSQL holds profile metadata and an opaque reference only. Raw photos and frames are discarded after processing (spec BIO-003, BIO-004).
- **Hashing:** not used and not usable: matching compares two similar but never identical embeddings, and a hash matches exact copies only.
- **Gap:** none in code. The faculty needs a written answer (and the defense a slide or paragraph).
- **Size:** about 30 minutes of writing.

### 13.2 Remedial email

Report: client note on the remedial email.

- **Then:** saving a pending remedial attempt with a new scheduled date sends the Remedial notice right after the commit (`backend/controllers/FacultyController.php`, `$shouldAutoSendRemedialNotice` → `faculty_send_remedial_schedule_email`), as spec EML-001 requires. The Retention page shows the delivery result in its save message. Email Management → Remedial already previews and sends explicitly, described as a retry.
- **Proposal:** saving never emails; Email Management → Remedial is the only way to send (select, preview, send); each attempt shows Not sent / Sent / Date changed since last notice.
- **Proposed EML-001 wording (not approved yet):** "A Remedial notice is never sent automatically. Faculty send it from Email Management → Remedial: they select students with a current-school-year pending attempt that has a scheduled date, preview the personalized message and recipient list, then explicitly send. The notice includes the course, attempt number and current scheduled date. Each attempt shows whether a notice was sent for its current date."
- **Open:** (a) the save also creates an in-app notice for the Student; keep it automatic? (recommended: keep, the client asked about email only). (b) After saving, the Retention message offers "Preview and send notice", opening the Remedial tab with the Student selected? (recommended: yes).
- **Size:** 1–2 hours plus a small behaviour demo; backend test that the save sends nothing.

### 13.3 Report generation

Report: additional suggestion, client note on the export, paper objective 1.2.

- **Grading sheets — covered:** Grade Computation exports the official grade sheet workbook (`LEC`, `LAB`, `TFG`, `DATA`); Faculty Reports → Grades & Assessments exports the five-sheet workbook and matching PDF (spec GRD-002, `docs/contracts/official-exports.md`).
- **Attendance sheets — partial:** Faculty Reports → Attendance exports one date only (`frontend/src/pages/faculty/Reports.tsx`, `Attendance_<course>_<date>.xlsx`); the five-sheet bundle and the Dean Attendance report are long lists (one row per student per session). There is no sheet with students down, session dates across, P/L/A/E per cell and totals/rate per student.
- **Remedial summary — partial:** Faculty `Retention_Report.xlsx` lists every student with a remedial status column; the Dean Retention export lists filtered students with a count of pending remedials. Neither lists only the students who need remedial with course, grade, attempt 1 and 2 results, scheduled date and cost recovery.
- **Suspected defects (not proven):** the Dean export's Grade column falls back to the student's first subject grade or overall GWA when no class is selected (`frontend/src/pages/admin/SystemAudit.tsx`, `gradeOf`); the Faculty retention export still has "At-Risk Courses" and "Risk Level" columns although UI-003 retired risk levels.
- **Open:** which export the client means by "fix the export" and what is wrong (numbers, missing report, layout, download); attendance sheet scope (per class for the term, or per grading period) and whether BU has an official attendance form to copy; remedial summary per class (Faculty), college-wide (Dean) or both, and its columns.
- **First step:** export every current report from the development seed and review the files against the client's complaint (about 20 minutes).
- **Size:** 1.5–2 days for the attendance sheet, the remedial summary and the export fixes.

### 13.4 Speed and capacity

Report: Facial Recognition 1, Attendance 3, General 1.

- **Then:** the 9.20 face fixes (3002ac9, ffdefa9: usable action frames kept, 640x480 frames, 120 s upload limit, Traefik read timeout 180 s) reached production on 2026-11-18, so the faculty most likely tested the earlier build. `scripts/benchmark.ps1` already measures read load (1–50 users), sign-in and 1/2/4 concurrent face check-ins on the demo (`docs/benchmark.md`); the three stored runs are from 2026-11-04, before those fixes.
- **Open:** when the faculty tested, and which step was slow (registration, check-in, upload).
- **First step:** one benchmark run on the demo at the current sha and a one-page plain-language result (about 1 hour including the 12-minute run). Optimisation is scoped only after the numbers.

### 13.5 Retention Monitoring

Report: Retention 1–3.

- **Then:** Retention Monitoring has no send action. Midterm Advisory is sent from Email Management → Midterm Advisory, which already selects many students, previews the message and recipient list, then sends explicitly (EML-001). Remedial notices: see 13.2.
- **Gap:** grades are not at the top of the retention record; sending is on another page.
- **Open:** which view is "the retention record" (the Student row, the Remedial Record dialog or another); move the send action or add a shortcut to Email Management with the students preselected.
- **Size:** about 1 day with the ui-fix-demo flow; do after 13.2.

### 13.6 Sessions filter and sessions outside class hours

Report: Attendance 1–2 and the Owner clarification.

- **Clarified:** the user says the filter in Sessions disappeared.
- **Then, filters:** the Faculty roll call keeps a school-year select, an attendance date, search, a status filter, and overridden and recorded-by filters (`frontend/src/pages/faculty/AttendanceMonitoring.tsx`). Three things were removed by the Attendance Monitoring redesign of 2026-10-11/12 (7e6ff2c and the UI-005 amendment "Assigned Classes grid, Worksheet, two-tab session modal"), compared with the Sessions view of cb400ca (2026-10-10): (1) the visible Course and Class Section selects became screen-reader-only (class cards replaced them); (2) the past-sessions list (ended and revoked) was removed, and UI-005 now says "There is no past-sessions list"; the Sessions dialog has only Current Session and Upcoming Sessions; (3) the session switch on the roll call shows only when a date has more than one session or a revoked one. Any of these may be "the filter in Sessions".
- **Then, sessions outside class hours:** Start session is filled from the class's current or next weekly meeting, but every field stays editable, and no frontend or backend rule ties a session to the meeting times (ATT-001, ATT-008). The cutoffs are under More settings, closed by default. Likely not found, or an older build; not reproduced.
- **Open:** which of (1)–(3) the user means (a screenshot of where they used to filter helps); restoring (2) reverses an approved UI-005 rule and needs the Owner's spec approval. For sessions outside class hours, the faculty member's exact steps (bug rules: no fix for a guess).
- **Size:** about half a day to restore a past-sessions list with date and status filters (UI demo needed); a few minutes if the answer is that the setting was not found.

### 13.7 Confirmation pop-ups

Report: Faculty 5, General 2.

- **Then:** confirmations exist for mutations that lose or override data: a Save that clears saved scores, the grade-sheet import, approving several Secretary requests, retiring/deleting/renaming a room in use, session overlaps, archive. Score entry auto-saves after 10 seconds (UI-002), so a confirmation per score change would conflict with auto-save.
- **Open:** the list of actions where the faculty expected a confirmation. If 13.8 is approved, "Submit grades" is the natural confirmation point.
- **Size:** depends on the list; usually small per action.

### 13.8 Grade submission and Dean approval

Report: Faculty 1–4, Admin/Dean 2–3.

- **Then:** there is no "submit grades" step and no grade deadline setting anywhere; grades are computed live from auto-saved scores. Grades lock only when a class is archived or its school year has passed (CLS-002, CLS-003). Faculty may restore a class they archived in the current school year. The only term dates are the Dean's Academic Terms (ACA-002).
- **Request:** a new workflow: Faculty submit grades (submission time logged), deadlines per course, a Dean view of on-time/late submissions, grades locked after the deadline, changes after it (and on archived classes) as requests the Dean approves or rejects.
- **Open:** what one submission covers (one per class, or Midterm and Finals separately); which "semester-dependent deadline settings" they mean (probably Academic Terms); what "course-based, regardless of semester" means; late = flagged only or blocked; what locks (scores, Grade Weights, and attendance corrections, which also change grades under ATT-004); who may request reactivation of an archived class.
- **Spec:** new requirement, migrations, Dean screen; contract and the Owner's `/grill-me` first.
- **Size:** 4–7 days.

### 13.9 Dean and Superadmin split

Report: Admin/Dean 1, Superadmin 1–2.

- **Then:** SYS-001 and ADM-001: four roles; Superadmin is a mode of the one Dean account, not a fifth role. The Owner ruled on 2026-11-15 (backlog 12.1) that the Dean and the Superadmin stay one account and permissions stay tied to roles. The Dean view has Dashboard, Reports & Analytics, Classes, Faculty Invitations, Course Catalog, Academic Terms, Rooms and an activity Audit Trail; Superadmin mode has Overview, People & Accounts, Face Enrolment Flags and the class-work Audit Trail.
- **Request:** the Dean only views analytics, reports and grade approvals (13.8); a separate Superadmin person handles setup, accounts, maintenance and data fixes.
- **Open:** whether the Owner reverses the 2026-11-15 ruling; who the Superadmin is at BU; which Dean pages move (Faculty Invitations, Course Catalog, Academic Terms, Rooms, Classes); how a Superadmin account is created and handed over.
- **Spec:** amends SYS-001 and ADM-001; contract and `/grill-me` first.
- **Size:** 3–5 days.

### 13.10 Paper objectives

Report: paper objective 1.2.

- **Reports:** see 13.3.
- **Retention risk wording:** the paper says the Retention Monitoring Module "projects retention risk through rules-based risk assessment". Spec UI-003 retired risk levels (Warning, Critical, High, Low) and has "no assumed-assessment projection"; the rules-based check that remains is the Midterm Watchlist ("At Risk" when every Midterm assessment is graded and the Midterm grade is 2.5 or worse) and the computed retention status. The defense may ask where the projection is.
- **ISO/IEC 25010 evaluation:** the evaluation of the study, not a system change. 13.4 gives performance-efficiency evidence; 13.1 gives security evidence.
- **Open:** whether the paper's wording or the system changes (for example, describing the Midterm Watchlist as the rules-based projection).
- **Size:** no code if the paper wording is adjusted.
