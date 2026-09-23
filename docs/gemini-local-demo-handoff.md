# Gemini local-demo frontend handoff

**Purpose:** ready-to-relay frontend work order for the one-day DentiSys local demo.

**Baseline:** start an isolated frontend branch from reviewed commit `666ed4e` (`fix(faculty): resolve period grading findings and add regression tests`). Do not branch from an unreviewed biometric worktree, stash, or alternate history. The user relays backend contract updates manually.

**Scope:** make every existing frontend route and action complete against an authoritative backend path, or show a truthful supported-unavailable/error state with the exact dependency. Cosmetic cleanup is secondary. A mock, localStorage-only result, fixed demo metric, or success toast without a persisted response is not completion.

**Read with the relay:** `docs/local-demo-functional-delivery-plan.md` is the existing route/action inventory and batch map; `docs/integration-status.md` records the integrated `666ed4e` line and parked candidates; `docs/PRODUCT_BACKLOG.md` supplies backlog detail; `spec.md` and `docs/roadmap.md` remain authoritative for approved behavior and deferred decisions.

This handoff is a delivery plan, not a change to `spec.md`. `spec.md` remains authoritative. The backlog supplies sequencing and implementation detail only where it does not conflict with the specification. Do not change the specification, add deployment/provider infrastructure, or ask Gemini to edit backend code.

## Copy/paste initial prompt

```text
Work only on the DentiSys frontend from baseline 666ed4e in an isolated frontend branch. Do not edit PHP, migrations, Docker/Compose, provider configuration, backend tests, or backend routes. The parent/user will relay exact backend contracts and integrate after the shared gate.

Your mission is broad functional coverage for the one-day local Docker Compose demo. Every existing frontend route and action must either:
1. complete against an authoritative persisted API response;
2. show an actionable supported-unavailable/error state naming the missing API/provider; or
3. be explicitly marked as an external or Owner decision blocker.

Never report success from localStorage, hardcoded data, a fixed metric, a local face flag, or a mock provider. Never invent request fields or endpoint paths. Wait for the backend contract packet when a page requires a new API. You may prepare loading, validation, empty, error, and unavailable states before the contract arrives.

Use the owned page files listed in docs/gemini-local-demo-handoff.md. frontend/src/services/apiClient.ts, frontend/src/types/index.ts, frontend/src/types/auth.ts, shared auth/context, App.tsx, and Layout.tsx have one frontend owner; queue changes to those files instead of editing them in parallel with another page bundle.

For every mutation, verify positive response, invalid input, unauthorized/cross-owner response, and reload/refetch persistence. Refresh authoritative state after a successful write. Do not use a fallback academic value when an API call fails.

Biometric attendance is urgent but real only. The server status/challenge contract is authoritative. The current status mismatch (frontend enrolled versus backend active/not_enrolled/enrolling), ignored challenge/idempotency fields, ordered two-action liveness, cancellation race, camera permission, GPS permission, and sidecar health must be handled explicitly. The proposed 26 enrollment/12 attendance capture is a validation candidate, not an approved threshold. The specification requires 20 usable enrollment samples and no more than 30 accepted; two randomized server actions; no browser-authoritative pass/fail; and manual attendance when real infrastructure is unavailable. Simulation is not demo acceptance. Never show verified attendance unless the real server/provider response says so.

Do not merge or rebase another branch. At handoff, report changed files, consumed API contracts, assumptions, tests run, browser/runtime evidence, and blockers. Stop and report a blocker when the backend contract or Owner decision is missing; do not fill the gap with a guessed payload.
```

## Frontend ownership

Use one Gemini branch and one frontend owner for shared files. Work by page domain:

| Bundle | Owned files or domain | Required result |
|---|---|---|
| F0/F1 auth and identity | `frontend/src/pages/auth/*`, `frontend/src/services/authService.ts`, profile/settings pages, shared password/name/email controls | Password/MFA/recovery/invite flows remain real; authenticated password change uses current/new/confirm; identity fields and email suggestion follow the server allowlist |
| A1 Admin | `frontend/src/pages/admin/*`, Admin route links | Dashboard, invitation lifecycle, reports, audit, profile, settings, and legacy links use authoritative data; no dead `/admin/rules` target |
| F2 Faculty | `frontend/src/pages/faculty/*`, `frontend/src/pages/faculty/StudentManagement.tsx` | Classes/rosters, grades, attendance, retention, reports, email management, audit, profile, and settings round-trip through API state |
| S1/B1 Student | `frontend/src/pages/student/*`, `frontend/src/utils/camera.ts`, biometric tests | Student academic pages use real read APIs or supported-unavailable states; face enrollment/attendance uses server status/challenge and never simulation as success |
| C1 Secretary | `frontend/src/pages/secretary/*` | Dashboard, date-session-record attendance flow, manual override, own audit, profile/settings, and approved Student context switch use role-scoped API state |
| Shared contract owner | `frontend/src/services/apiClient.ts`, `frontend/src/types/index.ts`, `frontend/src/types/auth.ts`, `frontend/src/context/*`, minimal `App.tsx`/`Layout.tsx` | Integrate exact backend paths/types/error envelope once, with no competing edits |

Do not make broad formatting or style changes. Do not remove a route merely to hide an unfinished function; either wire it, show the approved unavailable state, or identify the external/policy blocker.

## Contract gate before wiring

Ask the parent/user for the contract packet if it is not already present. The packet must identify the exact method/path, request and response fields, role/ownership rule, error codes, idempotency/retry behavior, and reload/refetch expectation.

The following points are already required by the plan and specification:

1. Password change accepts current/new/confirm values, verifies the current password, applies a server-owned policy response, rate-limits failures, audits the event, and invalidates the session/token version. The exact modern strength/reuse policy is an Owner decision; do not encode an invented policy in frontend-only validation.
2. Institutional email uses a server-configured multi-domain allowlist. Show `@bicol-u.edu.ph` as an editable default/suffix suggestion where appropriate, while preserving existing valid emails and allowing another configured domain. Do not make the suffix an unconditional client-side rule.
3. Invitation state distinguishes pending, edited, revoked, reissued, accepted, and active. Editing a pending email invalidates the old token. Secretary promotion occurs only after Student acceptance, and removal preserves the Student record.
4. Class/roster removal changes current membership while preserving historical scores, assessments, attendance, reports, and audit. Do not cascade-delete or hide that history in the UI.
5. Notifications are database-backed. The bell consumes recipient-scoped list/unread/read/mark-read data; remedial assignment is not a local alert.
6. Attendance uses server-authoritative session time in `Asia/Manila`, server-owned class/section permissions, temporary GPS evaluation without storing exact Student coordinates, one result per session, duplicate outcomes, and correction provenance.

## Required page work

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

Run the focused frontend checks already defined in `frontend/package.json`: `npm test`, `npm run build`, and `npm run lint` as applicable to the changed files. Existing unit/contract tests are supporting evidence only; they do not replace browser and PostgreSQL verification. The parent runs the integrated repository checks and local stack/PostgreSQL gates.

Before handoff, check the diff for accidental backend files, invented API fields, fabricated fallback values, style churn, and edits to shared files outside the agreed frontend owner. Report the exact browser/runtime paths exercised separately from unit or mocked-test results.

## Communication protocol

The user relays backend contracts and blockers. Do not request routine supervision. Send one concise handoff update when a contract is consumed and one final result containing:

- branch and baseline;
- changed frontend files by bundle;
- exact backend paths/types consumed;
- tests/build/lint run and results;
- browser/runtime evidence, if available;
- unresolved blockers with the owner or prerequisite;
- any shared-file conflict requiring the parent to integrate.

If a contract, policy decision, provider prerequisite, or external file format is missing, stop that slice and report it in this form:

```text
BLOCKED: <bundle/function>
Missing: <exact contract, decision, provider, or external input>
Safe frontend work completed: <loading/error/unavailable state or page preparation>
Cannot claim: <the success behavior that lacks evidence>
Needed from: <Luna / parent / Owner / Registrar / provider owner>
```

Do not merge, rebase, apply a stash, or claim the entire demo is complete from a partial frontend branch. The parent performs the single final integration and truth check.
