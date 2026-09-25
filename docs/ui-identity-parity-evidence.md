# Identity and Student UI parity evidence

Date: 2026-09-24
Source UI for the historical slice: `owhie_backend` at `bd5ab789cc537f1503fc78357ad5937e7926651a`; the current implementation batch refreshes the source to `e9ead0b3f8a4b0c49904a2274d3e80264203098b`.
Working branch: `codex/owhie-ui-migration` in the `c9fe` worktree; intended destination: `lighthal5` (not yet integrated)
Scope: Phase 1 identity, Admin, Faculty Profile, and Secretary Profile slice

## Runtime files changed

The bounded slice changed these seven files:

- `frontend/src/pages/admin/Dashboard.tsx`
- `frontend/src/pages/admin/FacultyInvitation.tsx`
- `frontend/src/pages/admin/Profile.tsx`
- `frontend/src/pages/auth/ForgotPassword.tsx`
- `frontend/src/pages/auth/SsoLogin.tsx`
- `frontend/src/pages/faculty/Profile.tsx`
- `frontend/src/pages/secretary/Profile.tsx`

No Student page was changed. `frontend/src/pages/student/studentGates.ts` remains unchanged. Shared services, types, contexts, `App.tsx`, `Layout`, backend code, migrations, and database volumes were not changed by this slice.

## Parity classification

Existing layouts were already substantially aligned with the frozen source in Admin Profile, SSO Login, Forgot Password, Faculty Profile, Secretary Profile, Student Dashboard, and Student Profile. Their current destination handlers and security controls were retained.

Safe source/PDF parity was applied in the seven changed files:

- Admin Dashboard now uses the source-style Announcements, System Health, and Recent Audit sidebar widgets while retaining the destination KPI/API data and truthful runtime wording.
- Faculty Invitation opens in structured Prefix, First Name, Middle Name, Last Name, and Suffix mode. This reuses the existing structured invitation API fields and does not duplicate the name model.
- Invitation and email-entry controls show a visible `@bicol-u.edu.ph` suffix for local-part input. A complete address hides the suffix affordance and remains supported. Submit handlers complete local parts once and preserve configured allowlisted domains.
- Password, Google Sign-In, MFA, invitation lifecycle, profile API, audit, and account-linking behavior remain destination behavior.

## Intentional source deviations

The following source files were inspected but deliberately not copied because their source behavior would regress approved authority, privacy, or live functionality:

- `frontend/src/pages/student/Attendance.tsx`: source uses development fixture sessions, simulated geolocation, and simulated biometric attendance success; destination retains camera/liveness, location, API submission, and authoritative Student gates.
- `frontend/src/pages/student/AttendanceLogs.tsx`: source renders local mock attendance records; destination retains authoritative attendance-log loading and verification-method handling.
- `frontend/src/pages/student/Classes.tsx`: source renders local fallback academic data and hardcoded thresholds; destination retains the authoritative academic classes API and guarded real-Student state.
- `frontend/src/pages/student/FaceRegistration.tsx`: source uses localStorage and simulated scan completion; destination retains consent, camera capture, liveness guidance, enrollment API, revoke behavior, and unavailable-state protection.
- `frontend/src/pages/student/RealStudentSurfaces.tsx`: source exposes mock identity/profile surfaces; destination retains authoritative Student API loading, account identity, and security cards.
- `frontend/src/pages/student/RetentionMonitoring.tsx`: source derives retention from local mock subjects and hardcoded policy values; destination retains authoritative retention API data and unresolved policy-state handling.
- `frontend/src/pages/auth/ActivateFaculty.tsx`: source drops the destination password-strength requirements and changes live Google verification behavior; destination protections were retained.
- `frontend/src/pages/auth/ActivateStudent.tsx`: same password-strength and live Google-verification conflict as Faculty activation; destination protections were retained.
- `frontend/src/pages/admin/Profile.tsx`, `frontend/src/pages/faculty/Profile.tsx`, and `frontend/src/pages/secretary/Profile.tsx`: source removes Google-link and password-change cards; destination account-security controls were retained while the safe visual structure was preserved.

These are visual-parity deviations for the later wiring phase. They are not claims that the destination Student screens are source-identical or fully integrated.

## Validation evidence

Focused checks completed:

- `git diff --check -- frontend/src/pages/admin/Dashboard.tsx frontend/src/pages/admin/FacultyInvitation.tsx frontend/src/pages/admin/Profile.tsx frontend/src/pages/auth/ForgotPassword.tsx frontend/src/pages/auth/SsoLogin.tsx frontend/src/pages/faculty/Profile.tsx frontend/src/pages/secretary/Profile.tsx` passed.
- `rtk npm run build` from `frontend` passed. TypeScript compilation completed; Vite transformed 2,400 modules and produced the production bundle in 17.17 seconds.
- The build reported existing non-blocking warnings about an ineffective `apiClient.ts` dynamic import, a bundle larger than 500 kB, and plugin timings.

No Docker stack, browser live gate, camera acceptance, Google provider acceptance, database migration, or integration test was run for this slice. No live workflow completion is claimed. No commit or cherry-pick was created; the changes remain in the shared working tree for parent integration review.
