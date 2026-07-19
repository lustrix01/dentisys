# DentiSys Backend Features Required

This document provides a comprehensive list of all backend features required for DentiSys, organized into **General System**, **Faculty**, **Class Secretary**, and **Dean (Admin)** categories.

---

## 1. General System Features (Shared Infrastructure)

- **User Authentication & Session Management**: Processes user logins for official BU email addresses (`@bicol-u.edu.ph` / `@bu.edu.ph`), checks bcrypt password hashes, issues JWT tokens, handles session verification, and manages password resets.
- **Role-Based Access Control (RBAC)**: Enforces API security and route authorization middleware for `admin`, `faculty`, and `secretary` roles.
- **System-Wide Audit Trail Logging**: Automatically captures security logs for all authentication events, administrative approvals, attendance overrides, and grade edits with timestamp, IP, and device metadata.
- **Shared Email & SMTP Service**: Manages HTML template rendering, email dispatch via Nodemailer, and delivery log tracking (`Sent`, `Failed`, `Pending`).
- **System Settings & Global Configurations**: Maintains system retention thresholds (default GWA = 2.50), default component weights (Quizzes 20%, Exams 30%, Practicum 40%, Attendance 10%), and portal themes.

---

## 2. Faculty Features

- **Faculty Self-Registration**: Accepts new faculty registrations, validates BU email domains and password strength, and assigns initial `Pending Approval` status.
- **Student Directory & CSV Intake/Export**: Manages student profile CRUD operations, auto-assigns curriculum subjects, processes bulk CSV student imports, and generates CSV exports.
- **Assessment & Score Management**: Handles creation, editing, scoring, weighting, and archiving for quizzes, laboratory work, activities, midterm exams, and final exams.
- **Grade Computation & GWA Helper**: Computes weighted subject component grades, converts numeric marks to the 1.00–5.00 GWA scale, and updates overall student GWA.
- **Retention Monitoring & Standing Progression**: Tracks students exceeding the retention limit (GWA > 2.50), automatically updates academic standing (`active` -> `warning` -> `critical`), and logs status overrides.
- **Remedial Exam Management**: Schedules remedial exams for failing grades, inputs remedial scores, caps passed remedial grades at 2.50, and updates student standing.
- **Class Secretary Invitation System**: Allows faculty to issue 7-day invitation tokens to students, track invitation statuses (`Pending`, `Accepted`, `Expired`, `Revoked`), copy activation links, or revoke pending invitations.
- **Biometric Facial Enrollment & Privacy Consent (RA 10173)**: Stores encrypted facial feature vectors for automated clinic attendance and tracks explicit student Data Privacy Act consent status.
- **Academic At-Risk Notifications & Bulk Emailing**: Dispatches academic support emails and privacy consent requests to individual or selected bulk students.
- **Random Forest Retention Risk Analytics (AI)**: Serves machine learning predictions for student academic retention risk and feature importance metrics based on academic performance trends.

---

## 3. Class Secretary Features

- **Secretary Account Activation**: Verifies unique 7-day invitation tokens, pre-fills non-editable student information, allows password creation, and activates the Class Secretary account (`status: 'Active'`).
- **Daily Attendance Recording**: Logs daily student attendance statuses (`present`, `absent`, `late`, `excused`) for assigned clinical rotation blocks.
- **Manual Attendance Override & Auditing**: Allows secretaries to manually update attendance records with a mandatory change reason and records audit logs.
- **Live CCTV Video Gateway**: Connects CCTV camera feed metadata and automated face detection events to clinic classroom feeds.

---

## 4. Dean (Admin) Features

- **Faculty Approval Management Portal**: Provides a dedicated portal (`/admin/faculty-approval`) to view pending faculty requests, search/filter, and execute **Approve** (activates account & sends notification) or **Reject** actions.
- **System-Wide Academic Reports & PDF Export**: Aggregates college-wide academic performance metrics and generates downloadable, formatted PDF summary reports.
- **College Audit Trail Review**: Monitors all system actions, user logins, and administrative overrides across all faculty and secretary accounts.
- **Retention Policy Management**: Configures academic retention criteria, clinical passing limits, and grading policy parameters for the College of Dental Medicine.
- **Executive Dashboard Analytics**: Calculates real-time KPI card summary metrics (Total Students, Average GWA, Critical At-Risk Count, Overall Attendance Rate).
