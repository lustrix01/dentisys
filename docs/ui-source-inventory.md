# UI source file inventory

Source: `owhie_backend` at frozen batch SHA `e9ead0b3f8a4b0c49904a2274d3e80264203098b` (the prior inventory pin `bd5ab789cc537f1503fc78357ad5937e7926651a` was refreshed from `origin/owhie_backend`). Includes all source page/component/assets and entrypoint files. Comparison ignores only CRLF versus LF. A difference is not proof of a visual mismatch: target-only API, security, and persistence behavior must remain. File identity is not browser/responsive acceptance.

| Source file | Current classification |
|---|---|
| `frontend/public/3d-tooth-transparent.png` | Source-identical |
| `frontend/public/3d-tooth.jpg` | Source-identical |
| `frontend/public/bu-cdm-logo.png` | Source-identical |
| `frontend/public/favicon.svg` | Source-identical |
| `frontend/public/icons.svg` | Source-identical |
| `frontend/public/tooth-logo.png` | Source-identical |
| `frontend/src/App.tsx` | Different; review presentation and retained functionality |
| `frontend/src/components/AuditTrailPage.tsx` | Different; review presentation and retained functionality |
| `frontend/src/components/Card.tsx` | Source-identical |
| `frontend/src/components/FeedbackCenter.tsx` | Source-identical |
| `frontend/src/components/Layout.tsx` | Different; review presentation and retained functionality |
| `frontend/src/components/MfaSettingsCard.tsx` | Source-identical |
| `frontend/src/components/Modal.tsx` | Source-identical |
| `frontend/src/components/ProtectedRoute.tsx` | Source-identical |
| `frontend/src/components/email/EmailHistoryTable.tsx` | Source-identical |
| `frontend/src/components/email/EmailPreviewModal.tsx` | Source-identical |
| `frontend/src/index.css` | Source-identical |
| `frontend/src/pages/LandingPage.tsx` | Source-identical |
| `frontend/src/pages/admin/AuditTrail.tsx` | Source-identical |
| `frontend/src/pages/admin/Dashboard.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/admin/FacultyInvitation.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/admin/Profile.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/admin/Settings.tsx` | Source-identical |
| `frontend/src/pages/admin/SystemAudit.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/auth/ActivateFaculty.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/auth/ActivateSecretary.tsx` | Source-identical |
| `frontend/src/pages/auth/ActivateStudent.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/auth/ForgotPassword.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/auth/MfaVerify.tsx` | Source-identical |
| `frontend/src/pages/auth/RecoveryCodes.tsx` | Source-identical |
| `frontend/src/pages/auth/ResetPassword.tsx` | Source-identical |
| `frontend/src/pages/auth/SsoLogin.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/AttendanceMonitoring.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/AuditTrail.tsx` | Source-identical |
| `frontend/src/pages/faculty/ClassManagement.tsx` | Source-identical |
| `frontend/src/pages/faculty/ClassesAndRosters.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/Dashboard.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/EmailManagement.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/GradeComputation.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/Profile.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/Reports.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/RetentionMonitoring.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/faculty/Settings.tsx` | Source-identical |
| `frontend/src/pages/faculty/StudentManagement.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/secretary/AttendanceList.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/secretary/AuditTrail.tsx` | Source-identical |
| `frontend/src/pages/secretary/Dashboard.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/secretary/ManualAttendanceOverride.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/secretary/Profile.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/secretary/Settings.tsx` | Source-identical |
| `frontend/src/pages/secretary/StartSession.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/secretary/utils.ts` | Source-identical |
| `frontend/src/pages/student/Attendance.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/student/AttendanceLogs.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/student/Classes.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/student/Dashboard.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/student/FaceRegistration.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/student/Profile.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/student/RealStudentSurfaces.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/student/RetentionMonitoring.tsx` | Different; review presentation and retained functionality |
| `frontend/src/pages/student/studentGates.ts` | Different; review presentation and retained functionality |

## Refreshed inventory reconciliation

The frozen `e9ead0b3` source contains 87 tracked UI/assets paths. Every source-routed page, role surface, entrypoint, stylesheet, asset, service, type, and utility has a destination counterpart. The destination additionally contains the preserved-security and normalized-data paths below:

- `frontend/src/components/GoogleLinkCard.tsx`, `PasswordChangeCard.tsx`, and `PersonNameFields.tsx`
- `frontend/src/services/attendanceNormalization.ts`
- `frontend/src/tests/attendanceNormalization.test.ts`, `biometricAttendance.test.ts`, `guidedCapture.test.ts`, `periodGradingContract.test.ts`, `retentionMonitoringContract.test.ts`, and `rosterNotificationContract.test.ts`
- `frontend/src/utils/biometricErrors.ts`, `camera.ts`, `guidanceAudio.ts`, `guidedCapture.ts`, and `periodGradingHelper.ts`

The source-only `InstitutionalEmailInput.tsx` is intentionally not copied as an active destination component: the destination uses its own controlled email suffix handling and preserves full allowlisted addresses. No source page is missing from the active destination route tree. These file-level results are only reconciliation evidence; browser comparison at desktop and narrow/mobile sizes remains the acceptance gate.
