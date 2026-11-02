# Walkthrough fixes, November 2026 (batch 1)

Six defects from the October walkthrough audit, fixed and approved by the Owner on 2026-11-03 after a Before/After demo of real screenshots: [Walkthrough Fixes Batch 1](https://claude.ai/artifact/8QR3cGMKNCdxcXJosc3jqe). Finding IDs are from the [walkthrough recheck](https://claude.ai/artifact/NKi4MbAVtYghCjttN3Guez).

## What users see now

| ID | Where | Now |
|---|---|---|
| A1 | Faculty · Attendance Monitoring | Every class with a session running shows **Live** on its card, not only the class you opened. Past-year classes say **Past term** instead of "Archived" (which now means only a class you archived). The cards refresh after you start, end or revoke a session. |
| T1 | Student · Dashboard, Enrolled Subjects | Where the card is narrow (phones in portrait, tablets in landscape at 1024–1279 px) each subject is a block like the Dean's Faculty Invitations list: subject with the Standing chip at the top right, then section · units, then Grade and Score. Everywhere else the full table. The Standing chip never splits over two lines. |
| D1 | Dean · Reports & Analytics | At 1366 and 1440 px the Export Excel / Print PDF pair moves to its own line instead of being cut off (1440 used to fit only by splitting "School year"). Wide screens are unchanged. |
| F2 | Faculty · Grade Computation | Saving invalid scores says which: "2 scores need fixing: Name 150 (max 100), Name -5 (cannot be negative)." (up to 3 names, then "…and N more"). The boxes turn red and the page scrolls to the first one. Single sheet and Full Matrix. |
| N8 | /reset-password without a link | "Reset link needed" with a **Send a new link** button, instead of a form that can only fail. With a link the page is unchanged. |
| S1 | Secretary · Dashboard, Profile, roll call | "send attendance change requests for Faculty approval" instead of "manual overrides"; the non-existent classroom camera is no longer mentioned; "kept in the tamper-evident audit log"; the roll-call filter says **Changed** (Faculty keep "Overridden"). |

## Owner rulings (2026-11-02/03)

- T1: stacked blocks on phones and landscape tablets, laid out like Faculty Invitations; chips never wrap.
- S1: request wording as above.
- A1: "Past term" for past-year classes.
- F2: name the rows.
- D1: wrapping at 1440 approved.

## How it was checked

- Before/After screenshots of each changed spot against the real backend (A1 during a live session in the local test data), verified pair by pair; T1 on all 15 audit devices, 1920 pixel-identical.
- New tests: class card Live / Idle / Past term, reset page with and without a link, the score message (single, plural, more than three).
- `scripts/check.ps1`.

## Code

- `backend/controllers/FacultyController.php`: `/faculty/classes` returns `liveSession` per class (same rule as the session pop-up, Asia/Manila time).
- `frontend/src/pages/faculty/AttendanceMonitoring.tsx`, `student/RealStudentSurfaces.tsx`, `admin/SystemAudit.tsx`, `faculty/GradeComputation.tsx` with `faculty/gradeScoreErrors.ts` and `components/GradebookMatrix.tsx`, `auth/ResetPassword.tsx`, `secretary/Dashboard.tsx`, `Profile.tsx`, `AttendanceList.tsx`.

## Lessons

- Two Vite review servers that share `node_modules` through a junction invalidate each other's dependency cache (504 "Outdated Optimize Dep"); run one at a time.
- A per-device sweep found a second narrow-card case (landscape tablets) that the phone-only check missed.
