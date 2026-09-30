# Gemini local-demo frontend handoff

**Purpose:** ready-to-relay frontend work order for the one-day DentiSys local demo.

**Baseline:** start an isolated presentation branch from reviewed commit `666ed4e` (`fix(faculty): resolve period grading findings and add regression tests`) after Luna's functional baseline is ready. Do not branch from an unreviewed biometric worktree, stash, or alternate history. The user manually relays this UI-only prompt.

**Functional scope:** every existing frontend route and action still needs an authoritative backend path, or a truthful supported-unavailable/error state with the exact dependency. Luna XHigh owns that functional implementation, including API/state/business logic, event handlers, validation, calculations, authentication, functional accessibility/interaction, focused tests, integration, and tools. A mock, localStorage-only result, fixed demo metric, or success toast without a persisted response is not completion.

**Gemini UI-only scope:** after Luna's functional baseline is available, Gemini may make presentation changes only: visual JSX/CSS, layout, styles, spacing, typography, presentational labels, contrast, focus styling, and other non-authoritative visual accessibility polish. Gemini must not change API calls/routes/types, event handlers, React state/context, validation, calculations, auth, persistence, role/permission logic, business wording that defines product behavior, or test expectations. Luna owns functional accessibility and interaction behavior. JSX/CSS and shared files may overlap, so the parent assigns exclusive ownership for each pass; Gemini reports conflicts rather than resolving functional code.

**Read with the relay:** `docs/local-demo-functional-delivery-plan.md` is the existing route/action inventory and batch map; `docs/integration-status.md` records the integrated `666ed4e` line and parked candidates; `docs/PRODUCT_BACKLOG.md` supplies backlog detail; `spec.md` and `docs/roadmap.md` remain authoritative for approved behavior and deferred decisions.

This handoff is a delivery plan, not a change to `spec.md`. `spec.md` remains authoritative. The backlog supplies sequencing and implementation detail only where it does not conflict with the specification. Do not change the specification, add deployment/provider infrastructure, or ask Gemini to edit backend code or functional frontend behavior. The user manually relays this UI-only handoff; the parent handles detailed dispatch and waits without routine supervision.

## Copy/paste initial prompt

```text
Work only on presentational frontend changes on top of Luna XHigh's functional baseline from reviewed commit 666ed4e. Do not edit PHP, migrations, Docker/Compose, provider configuration, backend tests, backend routes, API clients/routes/types, event handlers, state/context, validation, calculations, authentication, persistence, roles/permissions, business logic, or functional accessibility/interaction behavior.

Your mission is a UI-only presentation pass for the one-day local Docker Compose demo. You may adjust visual JSX/CSS, layout, styles, spacing, typography, responsive presentation, presentational labels, contrast, focus styling, and loading/error/empty/unavailable presentation when those states already exist. Do not add or remove routes/actions, invent data or status, change authoritative business wording, or make any UI imply a successful API/provider result that the functional code did not receive.

If you find a missing API, state transition, validation rule, calculation, auth/permission issue, persistence problem, or functional accessibility/interaction defect, leave the behavior unchanged and report it to Luna. Do not use localStorage, hardcoded data, a fixed metric, a local face flag, or a mock provider to make a screen look complete.

Visual JSX/CSS may touch files that Luna owns functionally, including shared pages and layout. The parent assigns exclusive file ownership for each pass; stop and report a conflict rather than editing functional code or resolving a merge. Do not merge, rebase, or apply another branch or stash.

At handoff, report the branch and baseline, changed presentation files, visual/accessibility checks run, screenshots or browser paths if available, and any functional blocker or shared-file conflict. Do not report API contracts consumed or functional tests as Gemini-owned evidence; Luna and the parent own those checks.
```

## Frontend ownership

Luna XHigh owns all frontend functional implementation and tests, including the shared contract files. Gemini may receive an exclusive presentation-only pass over a file or page after Luna's functional work; the pass may include visual JSX/CSS and presentational labels/contrast/layout, but never event handlers, API/state/business logic, validation, calculations, auth, persistence, roles/permissions, functional accessibility/interaction, or authoritative business wording. Work by page domain for Luna's functional delivery:

| Bundle | Owned files or domain | Required result |
|---|---|---|
| F0/F1 auth and identity | `frontend/src/pages/auth/*`, `frontend/src/services/authService.ts`, profile/settings pages, shared password/name/email controls | Password/MFA/recovery/invite flows remain real; authenticated password change uses current/new/confirm; identity fields and email suggestion follow the server allowlist |
| A1 Admin | `frontend/src/pages/admin/*`, Admin route links | Dashboard, invitation lifecycle, reports, audit, profile, settings, and legacy links use authoritative data; no dead `/admin/rules` target |
| F2 Faculty | `frontend/src/pages/faculty/*`, `frontend/src/pages/faculty/StudentManagement.tsx` | Classes/rosters, grades, attendance, retention, reports, email management, audit, profile, and settings round-trip through API state |
| S1/B1 Student | `frontend/src/pages/student/*`, `frontend/src/utils/camera.ts`, biometric tests | Student academic pages use real read APIs or supported-unavailable states; face enrollment/attendance uses server status/challenge and never simulation as success |
| C1 Secretary | `frontend/src/pages/secretary/*` | Dashboard, date-session-record attendance flow, manual override, own audit, profile/settings, and approved Student context switch use role-scoped API state |
| Shared contract owner (Luna) | `frontend/src/services/apiClient.ts`, `frontend/src/types/index.ts`, `frontend/src/types/auth.ts`, `frontend/src/context/*`, minimal `App.tsx`/`Layout.tsx` | Integrate exact backend paths/types/error envelope once, with no competing functional edits; Gemini may touch presentation only when explicitly assigned |

Do not make broad formatting or style changes. Do not remove a route merely to hide an unfinished function; Luna must wire it, show the approved unavailable state, or identify the external/policy blocker. Gemini must leave missing behavior visible and report it.

## Contract gate before functional wiring (Luna-owned)

Luna owns contract packets and functional wiring. The packet must identify the exact method/path, request and response fields, role/ownership rule, error codes, idempotency/retry behavior, and reload/refetch expectation. Gemini does not consume new API contracts or wire actions; report any missing state or dependency to Luna.

The following points are already required by the plan and specification:

1. Password change accepts current/new/confirm values, verifies the current password, applies a server-owned policy response, rate-limits failures, audits the event, and invalidates the session/token version. The exact modern strength/reuse policy is an Owner decision; do not encode an invented policy in frontend-only validation.
2. Institutional email uses a server-configured multi-domain allowlist. Show `@bicol-u.edu.ph` as an editable default/suffix suggestion where appropriate, while preserving existing valid emails and allowing another configured domain. Do not make the suffix an unconditional client-side rule.
3. Invitation state distinguishes pending, edited, revoked, reissued, accepted, and active. Editing a pending email invalidates the old token. Secretary promotion occurs only after Student acceptance, and removal preserves the Student record.
4. Class/roster removal changes current membership while preserving historical scores, assessments, attendance, reports, and audit. Do not cascade-delete or hide that history in the UI.
5. Notifications are database-backed. The bell consumes recipient-scoped list/unread/read/mark-read data; remedial assignment is not a local alert.
6. Attendance uses server-authoritative session time in `Asia/Manila`, server-owned class/section permissions, temporary GPS evaluation without storing exact Student coordinates, one result per session, duplicate outcomes, and correction provenance.

## Required functional page work (Luna-owned; retained scope)

The following requirements remain the approved functional scope for Luna and the integrated demo. Gemini may only present the resulting states visually and must not implement or alter their behavior.

### F0/F1: authentication, profiles, and email

- Preserve password login, optional authenticator-app MFA, recovery codes, forgot-password, reset-password, and Google entry-point behavior. Do not reintroduce email-code MFA.
- Add or wire the authenticated password change form with current/new/confirm fields, accessible reveal controls, paste/autocomplete support, server error mapping, loading state, and post-success reauthentication/session-expiry handling.
- Apply the structured Prefix/First/Middle/Last/Suffix flow where the backend contract supports it. Keep institutional email, role, assignment, Student number, and other protected fields read-only unless the contract explicitly permits the action.
- Use the editable `@bicol-u.edu.ph` suggestion. Existing addresses must not be rewritten, and the UI must reflect the configured allowlist from the server.
- Exercise wrong current password, policy rejection, rate limit, expired token, and unauthorized role paths visibly and truthfully.

### A1: Admin

- Replace static announcements/activity/KPI fallbacks with the available API response or a truthful empty/unavailable state.
- Wire Faculty invitation structured identity fields, configured-domain validation, pending edit, revoke, reissue, and acceptance state. Show the current state after reload.
- Render reports only from authoritative responses. Remove values such as fixed GWA/component numbers when the API has no record.
- Keep audit/export/print actions bound to the Admin-scoped result and show empty/error states.
- Repair the Admin quick action that currently targets `/admin/rules` without a supported route; point it at a real approved surface or show the correct unavailable state.
- Remove or stop presenting deprecated settings as authoritative where the backlog marks them obsolete.

### F2: Faculty

- Remove hardcoded classes, students, attendance, schedule, activity, subjects, component ratios, and GWA fallbacks from Dashboard, Classes/Rosters, Grades, Attendance, Retention, Reports, and Email Management.
- Repair roster add/edit/remove, refresh after save, preserve historical scores/attendance on removal, and enforce Faculty class/section ownership in the UI and API error display.
- Keep Registrar import/export visibly blocked until the University file layout is supplied. Remove any browser-text parser or dummy success message that implies persistence.
- Use authoritative class, score, attendance, retention, remedial, notification, report, invitation, and email-log data. Confirm before consequential mutations, not ordinary navigation.
- Remove obsolete retention-rule presentation and use the approved course-grade/risk terminology. Show a persistent-notification result only after the backend confirms it.
- Keep Faculty audit/course-attendance activity scoped to the Faculty's authorized classes; do not reuse Admin-wide data silently.

### S1/B1: Student and biometrics

- Replace Student Dashboard fixed Student ID, sessions, clinical hours, face flag, and attendance/GWA fallback with the Student read contract or an explicit unavailable state.
- Student Classes and Retention must not imply academic data when no authoritative API exists. The empty state must identify the missing backend contract.
- Student attendance and logs must read persisted sessions/records and preserve unresolved, present, late, excused, and duplicate outcomes from the server.
- Face registration must use the exact backend status mapping. Do not translate `active` into an arbitrary local `enrolled` flag without preserving all server states.
- Show consent before capture; request the server-generated challenge; display the randomized actions returned by the server; send `challengeId` and idempotency data exactly as contracted; cancel the operation when the server/client deadline is reached; clear camera frames from client state.
- Camera denial, no/multiple face, liveness failure, wrong action order, provider health failure, geolocation denial, timeout, and repeated failure must direct the Student to manual attendance. Never mark attendance from a local camera result.
- A real success requires provider/server evidence, persisted attendance, and audit. If calibration/model/checksum/secrets or real camera/GPS evidence is absent, show blocked/manual fallback and report the prerequisite.

### C1: Secretary

- Replace static dashboard/activity/default-class values with scoped API responses or truthful unavailable states.
- Implement the required selection hierarchy: date, then session on that date, then attendance records. Do not filter a local record list as the authority.
- Require server-authorized class/session access, valid session timing, reason fields, and appropriate override/Excused behavior. Surface server rejection without optimistic success.
- Connect My Activity to the Secretary-scoped endpoint, not an Admin-wide audit endpoint.
- Use real geolocation permission/error behavior. Fixed coordinates or development location cannot be shown as verified attendance.
- Implement the approved top-right Student/Secretary context switch if the backend contract is available. Preserve one identity and the Student record; do not add duplicate Student navigation to the Secretary sidebar.
- Apply the same structured profile/password/email policy and remove client-only domain restrictions.

## Acceptance and evidence

For each bundle, record a compact row in the handoff result:

| Check | Required evidence |
|---|---|
| Positive | User action receives the expected server response and renders the resulting state |
| Negative | Invalid input, missing dependency, timeout, or provider failure renders the server error/unavailable state |
| Permission | A different role, user, class, section, or Student cannot read or mutate the action |
| Persistence | Reload or re-login shows the server result; no localStorage-only business state is required |
| Audit/history | Required audit/notification/history event appears when the contract calls for it |

Luna owns the focused functional frontend checks already defined in `frontend/package.json`: `npm test`, `npm run build`, and `npm run lint` as applicable to functional changes. Gemini may run build/lint or targeted visual/accessibility checks for presentation-only changes. Existing unit/contract tests are supporting evidence only; they do not replace browser and PostgreSQL verification. The parent runs the integrated repository checks and local stack/PostgreSQL gates.

Before handoff, check the diff for accidental backend files, API/state/business-logic edits, invented fields, fabricated fallback values, style churn, and edits to shared files outside the exclusive presentation assignment. Report visual/browser paths separately from Luna's functional and PostgreSQL evidence.

## Communication protocol

The user manually relays this UI-only prompt. Gemini does not consume backend contracts or request routine supervision. Send one concise update when a presentation pass is ready and one final result containing:

- branch and baseline;
- changed presentation files by page/domain;
- visual/accessibility checks and build/lint run, if any;
- browser or screenshot evidence, if available;
- unresolved functional blockers reported to Luna;
- any shared-file conflict requiring the parent to assign or integrate.

If a contract, policy decision, provider prerequisite, or external file format is missing, stop that slice and report it in this form:

```text
BLOCKED: <bundle/function>
Missing: <exact contract, decision, provider, or external input>
Safe frontend work completed: <loading/error/unavailable state or page preparation>
Cannot claim: <the success behavior that lacks evidence>
Needed from: <Luna / parent / Owner / Registrar / provider owner>
```

Do not merge, rebase, apply a stash, or claim the entire demo is complete from a partial frontend branch. The parent performs the single final integration and truth check.
