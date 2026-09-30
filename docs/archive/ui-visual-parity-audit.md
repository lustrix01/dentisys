# DentiSys visual parity audit

Status: historical bounded worker report. Superseded for source-versus-destination acceptance by `docs/ui-visual-parity-acceptance.md`; retained as the earlier destination-only inventory and evidence trail.

Frozen UI baseline: `owhie_backend` at `e9ead0b3f8a4b0c49904a2274d3e80264203098b`.
Inventory and acceptance guidance: `docs/ui-source-inventory.md`, `docs/ui-migration-plan.md`, and `spec.md` §9B.

## Method and evidence

- Reviewed the inventoried source page/component set with `git show` at the frozen SHA and reconciled the current `App.tsx` route map.
- Exercised the local destination with the project-installed Chromium runner using `1440x900` desktop and `390x844` narrow/mobile viewports where the local frontend remained available.
- Checked rendered layout bounds (`scrollWidth` versus viewport width), visible headings/navigation, empty/loading states, responsive sidebar/header behavior, and the major route-level controls.
- The in-app browser surface rendered blank during this worker. The installed Chromium runner was used instead; no external provider, camera, location, or user data was used.
- Captures are stored outside the repository at:
  `C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\ui-parity\`
  (124 PNG artifacts from the route sweeps, including both desktop and narrow attempts). Representative stable captures include:
  - `public-rootlogin-desktop.png`, `public-rootlogin-mobile.png`
  - `faculty-stable-rootdashboard-desktop.png`
  - `faculty-stable-rootgrades-desktop.png`
  - `faculty-stable-rootattendance-desktop.png`
  - `faculty-stable-rootfaculty-classes-rosters-desktop.png`
  - `secretary-rootsecretary-start-session-desktop.png`

These are destination captures only. A rendered screenshot of the frozen source at the same viewport is not available in this worker, so pixel-level source-versus-destination acceptance remains open. The PDF renders remain reference material, not browser evidence.

## Route coverage

The following active routes were inspected against the current route tree and source page structure. Redirect aliases were included where they resolve to an inventoried surface.

### Public and authentication

`/`, `/landing`, `/login`, `/activate-faculty`, `/activate-student`, `/activate-secretary`, `/forgot-password`, `/reset-password`, `/2fa/verify`, `/mfa/verify`, `/recovery-codes`, `/signup`, `/register`, `/signup/student`.

Desktop and narrow captures were attempted for the public/auth pages. Login was visually checked at both sizes; the narrow layout keeps the brand panel, form fields, institutional suffix, and footer within the viewport without horizontal overflow.

### Faculty

`/dashboard`, `/classes`, `/faculty/classes`, `/faculty/classes-rosters`, `/students`, `/grades`, `/retention`, `/faculty/retention`, `/attendance`, `/reports`, `/email-management`, `/faculty/audit-trail`, `/faculty/profile`, `/faculty/settings`.

The stable desktop evidence covers the dashboard, class/roster workspace, grade computation, attendance monitoring, and the common portal shell. Reports and dashboard surfaces were explicitly included in the route sweep; their empty authoritative states were preserved rather than replaced with fabricated data.

`frontend/src/pages/faculty/ClassManagement.tsx` remains an inventoried source-identical component without a dedicated active route in the current `App.tsx`; it was reviewed as an unmounted source surface rather than incorrectly inventing a route.

### Admin

`/dashboard`, `/admin/faculty-invite`, `/admin/faculty-approval`, `/admin/reports`, `/admin/retention-criteria`, `/admin/audit-trail`, `/admin/audit`, `/admin/users`, `/admin/profile`, `/admin/settings`, `/admin/rules`.

The route sweep included Admin dashboard, reports, audit, faculty invitation, profile, and settings surfaces. Redirect aliases were checked against their target routes.

### Secretary

`/dashboard`, `/secretary/attendance`, `/secretary/start-session`, `/secretary/override`, `/secretary/audit-trail`, `/secretary/profile`, `/secretary/settings`.

The Attendance Monitoring and Start Class Session surfaces were explicitly reviewed. The current visual pass retains the consolidated monitoring layout, Secretary/Student account context switch, session-history entry point, and manual-override entry point.

### Student

`/student/dashboard`, `/student/attendance`, `/student/attendance-logs`, `/student/face-registration`, `/student/classes`, `/student/retention`, `/student/profile`.

Student routes were explicitly inspected in source and the current route tree, including the real Student dashboard/profile surfaces, academic classes/retention, attendance/logs, and face registration. The route sweep was unable to finish stable narrow Student captures before the local frontend container stopped; this remains a concrete evidence blocker, not a parity claim.

## Significant dialog and state coverage

Reviewed in the current JSX and route-level browser pass:

- Faculty Grade Computation: Single Activity View, Full Matrix View, assessment manager create/edit flow, grade-weights editor, score-entry state, and empty roster/assessment states.
- Faculty Classes & Rosters: create class, import roster, student/enrollment create/edit, class filters, historical read-only messaging, and empty-class state.
- Faculty Retention and Attendance: watchlist/manual-unlock affordance, remedial state, attendance session entry, filters, roll-call/worksheet, and session-history entry points.
- Faculty Reports and Email Management: report filters/export area, email composer/history/preview structure, and empty authoritative states.
- Admin Faculty Invitations: structured Prefix/First/Middle/Last/Suffix fields, institutional email suffix presentation, status/search controls, and lifecycle actions.
- Admin reports/audit/profile/settings: filter/export areas, profile name fields, security/settings cards, and empty audit/report states.
- Secretary Attendance: daily roll call, session-history tab, start-session controls, manual override entry, and Secretary/Student toggle.
- Student dashboard/profile/attendance/face-registration: quick actions, identity header, academic cards, biometric consent/enrollment states, security cards, and loading/unavailable states.
- Authentication: login fallback when Google is unavailable, activation missing/invalid-token states, forgot/reset forms, MFA verification, and recovery-code presentation.

Direct persisted screenshots for every modal/dialog state were not completed. Dialog pixel parity therefore remains open even where the controls and layout were reviewed.

## Findings and bounded changes

- No new JSX/CSS change was justified by the evidence available in this worker. Existing visual changes in the assigned page/component scope were preserved; functional/API/authentication differences were not altered.
- The current destination consistently uses the frozen source shell, typography hierarchy, cards, role navigation, responsive drawer behavior, and source-style empty/loading states across the stable captures.
- The approved structured-name, Secretary context, authoritative Student, attendance, grading, and historical-class behavior were intentionally retained even where the frozen source uses older functional structures. Those are not visual regressions and were not rewritten here.

## Remaining blockers

1. Render the frozen source commit and capture the same route/dialog matrix at `1440x900` and `390x844`; destination-only screenshots cannot establish pixel-level parity.
2. Re-run stable narrow Student route captures after the frontend dev container is healthy, then inspect the Student dashboard, classes, retention, attendance/logs, face-registration, and profile at both sizes.
3. Capture direct screenshots of the significant dialogs listed above, including validation/error and empty states where applicable.
4. Keep real Google GIS and real-camera acceptance separate from this visual pass; neither was enabled or claimed here.

## Checks

- Existing route capture sweep completed where the local frontend was available; no external-provider or browser-permission flow was invoked.
- No product source outside `frontend/src/pages/**`, `frontend/src/components/**`, and this audit document was modified by this worker.
- Focused automated checks from the parent batch remain the authoritative functional evidence; this document intentionally does not convert those workflow checks into visual-parity evidence.
