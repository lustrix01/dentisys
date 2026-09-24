# Local demo functional delivery plan

> **Superseded execution order, 2026-09-24:** The Owner now prioritizes complete `owhie_backend` UI migration into `lighthal5`, database 3NF/schema fit, then functional wiring and test repair. Follow [UI migration plan](ui-migration-plan.md) and spec.md section 9B. This document's functional inventory remains historical context; its one-day schedule, functional-first gates, and outdated provider status do not define the current work order. Temporary test failures are allowed during UI migration and must remain tracked.

**Status: NON-AUTHORITATIVE implementation inventory.** This document is a delivery plan and review aid. It does not amend `spec.md`, `docs/PRODUCT_BACKLOG.md`, routes, runtime behavior, or database state.

**Authority correction for this update.** `spec.md` is authoritative. `docs/PRODUCT_BACKLOG.md` informs sequencing only where it is consistent with the specification. Any older audit wording that describes the backlog as more current does not override this rule; unresolved conflicts are listed as Owner approval items below.

**Audit basis.** The original route/action audit was prepared from the reviewed `666ed4e` period-grading baseline. The current evidence snapshot below was rechecked on 2026-09-24 against `gemini/local-demo-frontend` at `08dbdd8`, after the coherent auth/onboarding/Google/roster/audit/guided-capture implementation (`6f86492`) and its guidance/linking audit fixes (`08dbdd8`). The implementation review was reported clean; the two documentation updates from this snapshot are carried in the following docs-only commit. The older baseline remains historical context, and no aggregate current-tree runtime-clean claim is made. The product backlog governs delivery priorities where it is more current than the specification. Browser and running-stack validation is labelled separately from code and test evidence.

## Decision summary

The one-day target is broad functional coverage: every existing frontend route and action in the inventory below must either complete against an authoritative persisted path, show a truthful supported-unavailable/error state, or be marked with its exact external or Owner decision blocker. Cosmetic cleanup is secondary. A mock, localStorage-only result, fixed demo metric, or success toast without a persisted record is not completion.

This is a timeboxed local-demo plan, not a guarantee that every dependency can be closed in one day. Real biometric attendance, the Registrar import format, live Google verification, and any missing authoritative Student academic data remain blockers until their prerequisites are actually present. The local target uses the approved Docker Compose stack only; it does not include deployment work or database-volume replacement.

`spec.md` remains authoritative. The backlog supplies delivery priority and implementation detail only where it does not conflict with the specification. This plan records conflicts and deferred decisions for Owner review; it does not amend `spec.md`.

### Status key

- **Implemented by code/tests** — route and mutation/read path exists and has meaningful contract or integration evidence; still requires the local runtime gate.
- **Partial** — a real path exists, but the user-visible workflow, policy, data source, or error path is incomplete.
- **Missing** — the action or authoritative API does not exist.
- **Blocked** — completion depends on a genuine external/provider or approved product decision.
- **Unverified runtime** — implementation evidence exists, but no running PostgreSQL/Docker/browser confirmation is claimed.

### Current checkout completion matrix (2026-09-24)

This matrix supersedes the assessment wording in the historical route inventory wherever the two differ. It is evidence-based for the current tree and distinguishes committed code/test evidence from runtime acceptance. Documentation-only unstaged changes do not alter implementation status. No aggregate current-tree runtime-clean claim is made.

### Latest validator evidence

| Check | Result | Boundary |
|---|---|---|
| Implementation review of `08dbdd8` | **Clean** | Review result only; it does not establish camera, Google, or full runtime acceptance. |
| `scripts/check.ps1` at `6f86492` | **Passed: 124 mocked checks** | Passed before the final `08dbdd8` fix; this is pre-fix evidence, not a final aggregate pass. |
| Focused frontend checks after `08dbdd8` | **Passed: 51** | Validator-reported focused evidence for the committed implementation. |
| Google/biometric contract PHP checks after `08dbdd8` | **Passed** | Validator-reported contract checks, PHP lint, and diff checks passed. |
| Latest `scripts/check.ps1` | **Blocked** | Docker Desktop API returned HTTP 500 on `/_ping`; this is infrastructure evidence, not a product pass or fail. |
| Latest PostgreSQL gate | **Blocked during cleanup** | Disposable stack built/started, then frontend-readiness cleanup hit the same Docker API 500. Cleanup may be incomplete; inspect it before cleanup and do not blindly remove or reuse the development volume. |
| Manual camera and Google acceptance | **Unresolved** | No real camera enrollment/attendance or live Google verification was recorded. |

| Batch | Current status | Evidence in or against the current checkout | Remaining acceptance or blocker |
|---|---|---|---|
| F0 — public/auth/onboarding | **Implemented by committed code/tests; runtime gate blocked/unverified.** | `6f86492` and `08dbdd8` contain the coherent password/onboarding/Google-linking/guided-capture implementation and review fixes; 124 pre-fix mocked checks, 51 post-fix frontend checks, and Google/biometric PHP contract/lint/diff checks were reported passed. | Recover Docker Desktop, rerun only affected mandatory gates on the exact final tree, and record runtime results. Live Google remains blocked without Owner-controlled credentials and expiry/error evidence. |
| F1 — profile/identity/email | **Implemented by code/tests; runtime gate blocked/unverified.** | Additive migration 017, structured Faculty invitation payload handling, Faculty password-only activation, Student optional Google activation, profile Google-link/status, denial audit, and truthful retry seams are committed and review-clean. | Verify persistence, token invalidation, configured-domain behavior, protected identity fields, and the Owner decision on modern password strength/reuse after Docker recovery. |
| A1 — Admin | **Partial; code/tests exist for several paths, runtime unverified.** | KPI, invitation lifecycle, report, audit, profile, settings, and notification paths are present; empty/error handling is improved in portions of the frontend. | Remove or truthfully route legacy `/admin/rules`; verify report values come only from authoritative responses; run role/ownership, reload, and audit checks. |
| F2 — Faculty | **Partial; committed contract evidence, runtime unverified.** | `60ce84e` and `cb71a76` connect authoritative dashboard/report/roster/notification behavior; `b224c95` and `tests/backend/faculty_activity_contract_test.php` add scoped Faculty activity; roster reload and notification contract tests exist. | Freeze and run browser/PostgreSQL checks for edit/reload/ownership/history. Faculty schedule data remains unavailable where no authoritative source exists; Registrar import is blocked by the missing official format. |
| S1 — Student reads/profile | **Partial; no blanket completion claim.** | Student profile/classes/retention/dashboard API routes and `RealStudentSurfaces` exist, with backend academic contract tests. | The default Student dashboard and some Classes/Retention/Profile paths still retain development/local fallback or face flags. Remove those claims or show truthful unavailable state; verify real Student data and reload against PostgreSQL. |
| B1 — biometric enrollment/attendance | **Partial; provider and camera acceptance pending.** | Guided capture, consent/session rechecks, liveness guidance, retry copy, challenge/token/idempotency seams, and audit fixes are committed and review-clean. | Manual camera acceptance remains unresolved: no real enrollment, ordered actions, persisted active profile, attendance row, unique-session result, or audit record has been verified. Keep manual fallback and B1 blocked; deferred thresholds/cadence require Owner approval. |
| C1 — Secretary/session/override/audit | **Partial; code/tests exist, runtime unverified.** | Date → session → records, session lifecycle, protected override, Secretary activity, and role-scoped audit routes are present; PostgreSQL integration assertions cover session/activity paths. | Run the final role matrix and reload/audit checks. Secretary ↔ Student context switching and promotion/removal behavior remain an Owner/product decision if the current account model cannot represent them safely. |
| X1 — Registrar import/export | **Blocked.** | No official University file layout or validation contract is recorded. | Obtain the file type, headers, identifiers, course/section fields, grading encoding, and output shape before implementing parser/persistence. |
| X2 — live Google | **Blocked/unverified.** | Verification/link routes and frontend seams exist; development mock identity is not provider evidence. | Supply configured credentials/provider path and capture successful, mismatched, expired, and replay/invalid-credential outcomes. The current expiry failure root cause is unresolved. |
| X3 — biometric provider prerequisites | **Partial readiness; functional completion blocked.** | Configuration/readiness seams and review fixes are present; no manual camera result is recorded. | Confirm camera permission/cadence, calibration/model thresholds, protected storage, challenge order, cancellation/retry, geofence/time rules, and one real DB-backed enrollment plus attendance. |

## Route and meaningful-action inventory

The matrix covers active routes and actions that change or display product state. Cosmetic layout, duplicate navigation buttons, and placement-only work are excluded unless the wiring itself is missing.

### Public, onboarding, and authentication

| Surface | Meaningful actions | Current assessment | Evidence and delivery need |
|---|---|---|---|
| `/`, `/landing`, `/login`, `/signup`, `/register`, `/signup/student` | Password sign-in, Google entry point, role onboarding, student registration | **Implemented by code/tests; unverified runtime** for password/MFA; **Blocked** for live Google; **Partial** for invitation lifecycle | `App.tsx`, `SsoLogin.tsx`, auth API client and PHP routes exist. Keep Google as an explicit provider dependency. Do not turn dev/mock sign-in into completion. |
| `/2fa/verify`, `/mfa/verify`, `/recovery-codes` | Authenticator-app challenge and recovery code use | **Implemented by code/tests; unverified runtime** | Existing API/controller paths cover enrollment, verification, recovery, and settings. Run the local auth smoke and confirm token/session behavior. |
| `/forgot-password`, `/reset-password` | Issue and consume reset token | **Implemented by code/tests; unverified runtime** | Reset controller increments `token_version`; run persistence and invalidation checks. |
| `/activate-faculty`, `/activate-student`, `/activate-secretary` | Accept invitation, set credentials, activate account | **Implemented by code/tests; runtime unverified** | `6f86492` commits the additive structured Faculty names, Faculty password-only activation, and optional Student Google activation; focused contracts passed and `08dbdd8` is review-clean. Secretary promote/remove lifecycle still needs the shared account-model decision. |
| Profile/settings password actions | Change an authenticated password | **Implemented by code/tests; unverified runtime** | `POST /api/auth/password/change` has the protected current/new/confirm contract, policy validation, rate limit, audit, and token-version invalidation in `docs/contracts/demo-auth.md` and `tests/backend/password_change_test.php`. The modern strength/reuse policy remains an Owner decision and the local runtime gate is still required. |
| Email entry in onboarding/profile/invites | Suggest institutional email | **Partial** | Use `@bicol-u.edu.ph` as an editable default/suffix suggestion. Preserve existing addresses and configured allowlists; do not enforce the suffix in the UI when the server configuration permits another domain. |

### Admin

| Route/action | Assessment | Evidence and delivery need |
|---|---|---|
| `/dashboard` | **Partial** | KPI API is wired, but announcements/activity are static and the Admin quick action targets `/admin/rules`, which has no route and falls back to `/`. Remove the dead target or wire it to an approved existing action. |
| `/admin/faculty-invite` | **Partial; P0; runtime unverified** | Create/list/reissue/update/revoke paths and contract checks exist. `6f86492` commits structured Prefix/First/Middle/Last/Suffix persistence through additive migration 017; pending-state browser and Docker-backed checks remain. |
| `/admin/reports` | **Partial** | Report API exists, but current rendering can fall back to AppContext data or values such as `1.75`; with Admin AppContext empty this can be empty or misleading. Render only authoritative responses and honest unavailable states. |
| `/admin/audit-trail` | **Implemented by code/tests; unverified runtime** | Audit read/export/print wiring exists. Verify role scope and persistence against PostgreSQL. |
| `/admin/profile` | **Partial** | Read/update exists, but full-name/email/office editing does not implement the backlog’s structured identity and protected name/email policy. Add the shared password flow; make email policy server-authoritative. |
| `/admin/settings` | **Partial** | Backend settings persistence exists. UI still exposes deprecated retention/component-ratio compatibility controls that the backlog says to remove or stop treating as authoritative. |
| `/admin/retention-criteria`, `/admin/users`, `/admin/audit`, `/admin/rules` | **Missing/wiring defect where navigated** | Redirects exist for some legacy URLs. `/admin/rules` is currently a navigated-but-unrouted target; all legacy links must land on a truthful supported surface. |

### Faculty

| Route/action | Assessment | Evidence and delivery need |
|---|---|---|
| `/faculty`/`/dashboard` | **Partial; P0** | KPI API is called, then errors fall back to hardcoded classes, students, attendance, and demo metrics. Remove fabricated success and surface the API error. Static schedule/activity also needs a clear data contract. |
| `/classes`, `/faculty/classes`, `/faculty/classes-rosters` | **Partial; P0; runtime unverified** | Class/course/student CRUD, enroll/unenroll, roster edit, ownership/audit, and notification seams have committed contract evidence (`60ce84e`, `cb71a76`, focused roster/notification tests). The browser edit → reload → role-isolation path still needs the final running-stack check. |
| Roster import action | **Blocked** | `handleImportIctoFile` only parses browser text and reports success; it does not upload, validate the Registrar format, or persist. The actual external file layout is required before implementation can be accepted. |
| `/grades` | **Partial; P0** | Assessment, score, compute, and period grading configuration APIs have contract/integration evidence and the `666ed4e` frontend tests. Hardcoded subject lists and local fallback state remain; refresh from authoritative classes/scores after each mutation. |
| `/attendance` | **Partial; P0** | Worksheet, record, correction, session revoke, date/course/section filters, and server ownership APIs exist. Future-date/session rules and persistence require live stack validation. |
| `/retention`, `/faculty/retention` | **Partial; P0** | API-backed records, scheduling, resolve/status override, and the 75% rule are wired. Remove obsolete midterm/risk-rule presentation, enforce date/period semantics server-side, and emit persistent Student notifications. |
| `/reports` | **Partial; P0** | Summary API is called, but subjects/classes are hardcoded and CSV/render paths use local records and fallback component/GWA values. Reports must be derived from the API and never invent academic values. |
| `/email-management` | **Partial** | Invitation and email-log APIs exist, but class lists are hardcoded and the Student invitation lifecycle lacks a visible revoke/cancel path. Use authoritative roster/context and expose only supported lifecycle states. |
| `/faculty/audit-trail` | **Implemented by code/tests; unverified runtime** | `b224c95`, `tests/backend/faculty_activity_contract_test.php`, and the role-aware `AuditTrailPage` use the scoped Faculty activity endpoint; verify persisted scope and reload against PostgreSQL. |
| `/faculty/profile`, `/faculty/settings` | **Partial** | Read/update and theme/settings paths exist. Apply structured-name, step-up, email-default, and shared password policy; do not revive deprecated academic settings. |

### Student

| Route/action | Assessment | Evidence and delivery need |
|---|---|---|
| `/student/dashboard` | **Partial but not acceptable as authoritative** | Uses hardcoded sessions/Student ID, local face flag, fixed clinical hours, and a 92% fallback. Replace with real APIs or an explicit unavailable state. |
| `/student/classes`, `/student/retention` | **Partial; authoritative read path exists, runtime and fallback cleanup remain** | `/api/student/classes` and `/api/student/retention` plus backend academic contract checks exist, and `RealStudentSurfaces` can consume them. Some default pages still gate development mock users and retain fallback/local data; no mock/localStorage success may be accepted as demo evidence. |
| `/student/attendance`, `/student/attendance-logs` | **Partial; biometric-blocked** | Authoritative profile/challenge/session/log APIs exist; mock mode is explicitly simulated. Attendance cannot be accepted until the biometric contract and provider pass the integration gate. Logs can be reviewed only when backed by persisted records. |
| `/student/face-registration` | **Partial/provider-blocked; P0** | `6f86492`/`08dbdd8` align server status/challenge/idempotency fields, consent/session rechecks, guided capture/audio/guidance seams, and truthful retry behavior; implementation review is clean. Real ordered camera capture, usable-sample cadence, cancellation, protected storage, and the server's persisted active profile remain unverified. The proposed 26/12 cadence is a validation candidate, not an approved threshold. |
| `/student/profile` | **Partial/unavailable for real Student** | Existing profile data is local/fallback in the active implementation. Use the authoritative profile contract and shared identity/password policy. |

### Secretary and role context

| Route/action | Assessment | Evidence and delivery need |
|---|---|---|
| `/secretary`/dashboard | **Partial** | KPI API exists; announcements, activity, and default class are static. The Secretary-to-Student context switch required by the backlog is not implemented. |
| `/secretary/start-session` | **Partial; P0** | Start/end/revoke/session APIs and timing checks exist. GPS is initialized to fixed coordinates and development location is used when real geolocation is unavailable; this cannot be accepted as real attendance authority. Live counts also filter local records. |
| `/secretary/attendance` | **Partial** | Persisted attendance/profile reads exist, but the required date → session → records flow and runtime behavior need completion and validation. |
| `/secretary/override` | **Partial; P0** | Protected reason/audit mutation exists, but the UI has date/search without an explicit session selector. Enforce the session hierarchy and verify audit persistence. |
| `/secretary/audit-trail` | **Implemented by code/tests; unverified runtime** | `/api/secretary/activity` is registered and scoped to the authenticated Secretary; `AuditTrailPage` maps that response. Run the live role and PostgreSQL scope checks before marking complete. |
| `/secretary/profile`, `/secretary/settings` | **Partial** | Read/update and theme paths exist. Remove UI-only domain restriction in favor of configured server allowlists, add structured identity/password flow, and eliminate local face status as authority. |
| Secretary sidebar/context links | **Partial** | Student links are exposed in the Secretary sidebar when a linked Student exists. Replace with the approved top-right context switch and preserve role isolation. |

## Cross-cutting functional gaps

1. **Persistence truth.** `AppContext` still owns legacy/localStorage paths and several Student presentation paths retain development fallbacks. Faculty and Secretary API synchronization exists, but every accepted mutation still needs the final API → PostgreSQL → reload check. A local face flag, fixed academic value, or mock metric is not evidence.
2. **Notifications.** Migration 016, recipient-scoped list/read/read-all endpoints, remedial emission, and frontend read-state wiring now exist in committed code. The remaining gate is PostgreSQL/browser confirmation that unread counts, deduplication, recipient scope, and reload behavior are truthful.
3. **Biometric provider.** Commits `6f86492`/`08dbdd8` add guided capture, consent/session rechecks, truthful retry behavior, and a liveness-guidance endpoint. Camera permission, ordered action timing, challenge/idempotency/cancellation behavior, protected storage, and a real DB-backed enrollment/attendance remain unverified. A simulated camera or local face flag is not evidence.
4. **Identity and security.** Name changes need the structured fields and approved step-up policy. Password change needs current/new/confirm, token invalidation, accessible controls, and a current password/reuse rule. Email UI should suggest `@bicol-u.edu.ph` while retaining server-configured allowlists and existing valid addresses.
5. **Reports/imports/exports.** Reports, CSV, print, and import actions need authoritative data and truthful error states. The Registrar format and live Google provider are external dependencies; they cannot be closed by dummy success or a mock sign-in.
6. **Role and audit scope.** Admin, Faculty, and Secretary scoped activity endpoints and role-aware frontend wiring now exist with contract evidence. The final gate must verify their persisted scope. Secretary context switching and Student visibility must preserve the existing role/account lifecycle.

## One-day parallel delivery bundles

The bundles are ordered by dependency, with one integrator owning the final gate. They are work packages, not a promise that every blocked external capability fits in a day.

### A. Luna XHigh — backend, frontend functional implementation, integration, tools, and tests (P0)

- Diagnose and fix Faculty class/roster edit from request payload through PostgreSQL reload; retain ownership and audit checks.
- Add authenticated password change with current/new/confirm validation, token-version invalidation, and a clearly documented reuse/strength policy pending the separate Owner NIST decision.
- Complete Faculty invitation structured identity, configured-domain validation, edit/revoke/reissue, and acceptance state transitions; align Student/Secretary invite lifecycle where the same account is promoted or removed.
- Align biometric status names and server authority; implement challenge/idempotency/cancellation contract and guided ordered sample acceptance. Add no “success” bypass when sidecar health/calibration is unavailable.
- Add persistent notification schema/API and retention/remedial emission, read, unread, and mark-read behavior.
- Provide the smallest Student academic read contract needed by active Student pages, or return an explicit supported-unavailable response rather than empty/fallback data. Correct Secretary audit scope and session hierarchy.
- Own the functional frontend implementation for every route/action in the inventory, including API/state wiring, event handlers, validation, calculations, authentication, persistence, roles/permissions, functional accessibility/interaction, and focused tests. The required page work and function-to-batch acceptance below remain Luna-owned even where earlier wording assigned them to Gemini.

**Acceptance:** each write is authorized, audited where required, persisted, and visible after reload; API responses match active frontend types; no endpoint reports success for an external/provider action it did not perform.

### B. Gemini — UI-only visual/layout/accessibility presentation pass (P1)

- Apply visual JSX/CSS, layout, spacing, typography, responsive presentation, presentational labels, contrast, focus styling, and visual polish to Luna's functional baseline.
- Improve the presentation of existing loading, empty, error, unavailable, blocked, and success states without changing their event handlers, API/state semantics, validation, calculations, auth, persistence, roles/permissions, or authoritative business wording.
- Keep the existing route/action inventory visible. Do not add/remove actions, invent data/status, revive fallback values, or imply functional completion from presentation changes.
- Treat functional accessibility and interaction behavior as Luna-owned. Gemini may adjust presentation-only labels and contrast when they do not redefine product meaning; report semantic, keyboard, focus-order, validation, or state behavior issues to Luna.
- Coordinate exclusive ownership for any JSX/CSS or shared file overlap. Stop and report a conflict rather than editing Luna's functional code, merging, rebasing, or applying a stash.

**Acceptance:** the UI clearly presents Luna's existing functional states and does not introduce a false success, altered business meaning, or functional behavior change. Functional completion remains subject to Luna's route/action acceptance matrix and the parent's shared gate.

### C. Provider and local-operations owner (parallel; conditional)

- Run the biometric sidecar with calibration/model/checksum/storage configuration, confirm health and usable sample cadence, camera permissions, cancellation, and attendance challenge behavior.
- Confirm Docker PostgreSQL/Mailpit fixtures, configured email allowlists, geolocation behavior, and role-linked demo accounts. Validate Google only if the Owner supplies a configured local/provider test path.

**Acceptance:** provider health and one real enrollment plus one real attendance are recorded in PostgreSQL with server decision/audit; otherwise the demo labels the feature blocked and continues without claiming attendance completion.

### D. Tests, relays, and evidence owner

- Luna extends targeted frontend contract tests for profile/password, roster edit, authoritative no-fallback states, biometric response mapping, and notification reads. Gemini reports only presentation checks and visual evidence.
- Run backend PostgreSQL integration tests for invitation lifecycle, class edit, grades, attendance/override, audit scope, token invalidation, and notifications.
- Run mocked Playwright tests only as interaction evidence. Then run the local stack checks and `docs/manual-demo-readiness.md` checklist; record live browser/DB outcomes rather than inferring them from mocked tests.

**Acceptance:** checks pass on the integrated checkout, every failed live dependency is listed with its owner, and the final route/action matrix contains no unverified P0 item disguised as complete.

## Shared final integration gate

The integrator should run this after Docker Desktop is recovered, on implementation commit `08dbdd8` plus the docs-only handoff commit (the historical prepared baseline was `666ed4e`):

1. Start the approved Docker Compose stack and verify migrations/configuration without deleting persisted volumes.
2. For each role, sign in through the supported flow, exercise every P0 route/action above, reload, and confirm the persisted result, authorization boundary, and audit record.
3. Verify Faculty class/roster edit and grade/attendance/retention mutations; verify Secretary session/override/audit; verify Admin invitation/report/audit/settings; verify Student only from authoritative APIs.
4. Exercise password change and token invalidation, MFA/recovery, invitation activation, configurable email allowlist, and the editable institutional email suggestion.
5. If provider prerequisites are present, complete real biometric enrollment and attendance. If they are absent or fail calibration, leave the feature **Blocked** with the exact dependency; do not substitute simulation.
6. Run the repository’s required check scripts for the changed areas and record their results in the demo readiness record. Do not call mocked tests browser validation.

## True blockers and pending decisions

- Registrar import: exact external file layout and validation contract.
- Live Google Sign-In: configured credentials/provider path and Owner approval for the local demo.
- Facial biometrics: calibrated model/checksum/secrets, usable capture cadence/thresholds, and confirmation of the proposed 26/12 guided protocol against the sidecar. The protocol proposal is not itself evidence of completion.
- Student academic surfaces: the authoritative read routes exist; remaining work is to remove or truthfully gate legacy development fallbacks and verify a real Student fixture through reload.
- Password policy: exact modern password/reuse policy after the separate auth audit/Owner decision; the implementation can still establish current-password verification and token invalidation.
- Secretary linked Student context and promotion/removal lifecycle if the existing account model cannot represent it without a product decision.

Cosmetic gaps, duplicate quick actions, and button placement are outside this delivery gate unless they prevent reaching an existing action. A test that has not run against the local stack is an evidence gap, not permission to mark the function complete.

## Finalized execution update

This section is the executable one-day plan. It supersedes the earlier A-D bundle labels where they differ. The route/action inventory above remains the evidence-backed scope; this section adds ownership, dependency order, acceptance, and handoff rules without changing product behavior.

### Contract and ownership rules

The parent agent owns coordination. Luna XHigh owns backend and frontend functional implementation, focused tests, integration, and tools. The user manually relays the Gemini UI-only handoff. Gemini works in an isolated presentation branch from the reviewed `666ed4e` baseline and does not edit PHP, migrations, Docker, provider configuration, backend tests, or frontend functional behavior. No branch is merged until the shared gate below has evidence.

Run at most three backend slots concurrently. Keep their file ownership separate:

| Slot | Luna-owned domain | Primary files and tests |
|---|---|---|
| A - identity | Password change, structured identity/email, invitations, token invalidation, role/account decisions | `backend/controllers/AuthController.php`, `PasswordResetController.php`, `FacultyInvitationController.php`, `backend/app/account_identity.php`, auth migrations/tests |
| B - academic | Faculty classes/rosters, grades, retention, reports, persistent notifications | `backend/controllers/FacultyController.php`, academic migrations/tests, related PostgreSQL integration cases |
| C - attendance | Biometric contract, sessions, GPS authority, Secretary attendance/override/audit, Student academic reads | `backend/controllers/StudentBiometricController.php`, `backend/app/student_biometrics.php`, `backend/app/attendance_sessions.php`, `backend/controllers/SecretaryController.php`, biometric/attendance tests |

The parent is the only integrator for shared migrations, `backend/routes/api.php`, response/error conventions, Compose configuration, and the running or disposable stack. Each backend slot owns tests for its code. Do not have two slots edit the same controller, migration sequence, route table, or shared response helper without a handoff.

Luna owns frontend page wiring and tests. `frontend/src/services/apiClient.ts`, `frontend/src/types/index.ts`, `frontend/src/types/auth.ts`, shared auth/context components, event handlers, state, validation, calculations, authentication, persistence, role/permission logic, and functional accessibility/interaction have one functional owner. Page ownership is by domain: `frontend/src/pages/auth/*`, `admin/*`, `faculty/*`, `student/*`, `secretary/*`, plus the smallest required `App.tsx` or `Layout.tsx` change. Gemini may receive an exclusive presentation-only pass over a file or page for visual JSX/CSS, layout, styles, presentational labels, contrast, focus styling, and other non-authoritative visual polish. JSX/CSS and shared files may overlap; the parent coordinates exclusive ownership, and Gemini reports conflicts instead of editing functional code or resolving merges.

Before Luna wires a new API, the contract packet must identify the exact path/method, request and response fields, role/ownership rule, error codes, idempotency/retry rule, and reload expectation. Gemini does not consume new API contracts or wire actions. If a contract or state is late, Gemini may only present existing loading/error/unavailable states and must report the functional gap to Luna; it must not change local validation or claim a successful mutation.

### Function-to-batch map and acceptance

Every inventory row above belongs to one of these batches. A row closes only when its positive path, negative/validation path, unauthorized/ownership path, and reload/persistence check are recorded. "Unavailable" is acceptable only when it is the authoritative response for a known blocker and names the next actor or prerequisite.

| Batch | Inventory items covered | Positive check | Negative and permission checks | Reload/persistence check |
|---|---|---|---|---|
| F0 | Landing/login/signup, MFA/recovery, forgot/reset, invitation activation | Supported password/MFA/reset/invite flow completes | Invalid credentials/token, expired/revoked invite, wrong role/domain, and no email-code MFA path are rejected | New account/session state and token invalidation survive reload/re-login |
| F1 | All profile/settings password and email actions; structured names | Current/new/confirm password and approved name flow save; email shows editable `@bicol-u.edu.ph` suggestion | Wrong current password, policy failure, rate limit, protected email/role fields, and cross-role access are rejected | Name/settings and token invalidation persist; existing valid emails remain valid under configured allowlist |
| A1 | Admin dashboard, faculty invite, reports, audit, profile, settings, legacy links | Authoritative KPI/report/invite/audit/settings data renders and mutations complete | Ownership, domain, duplicate/revoked invite, dead `/admin/rules`, and empty-data cases are truthful | Invite state/report/audit/settings round-trip from PostgreSQL |
| F2 | Faculty dashboard, classes/rosters, grade computation, attendance, retention, reports, email management, audit/profile/settings | Assigned classes and supported mutations use API data; roster add/edit/remove works | Cross-faculty class/section, future attendance date, invalid grade schema, failed API, and Registrar-format absence are handled | Every mutation reloads from PostgreSQL; removal preserves historical scores/attendance |
| S1 | Student dashboard/classes/retention/profile and attendance logs | Real Student read contract renders, or supported-unavailable state names its dependency | No hardcoded/localStorage academic success; role/Student ownership and unresolved attendance rules are enforced | Read data and logs remain after reload; no fake GWA/attendance is retained |
| B1 | Face registration and Student attendance | Only real calibrated provider success may produce active enrollment/attendance | Status mismatch, consent refusal, challenge replay, wrong sequence, camera/GPS denial, timeout, duplicate, unavailable sidecar, and repeated failure direct to manual fallback | Server status, audit, and one attendance row persist; raw frames and biometric scores never persist |
| C1 | Secretary dashboard, start-session, attendance, override, audit, profile/settings, context switch | Date -> session -> records flow, authorized manual actions, own activity, and approved context switch work | Wrong class/role, invalid time/radius, denied geolocation, missing session, invalid reason, and cross-user audit are rejected | Session/override/audit/context state survives reload and preserves history |
| X1 | Registrar import/export | Blocked until the actual University file layout and validation contract arrive | No parser or toast may imply official support | Record the exact external blocker |
| X2 | Live Google Sign-In | Blocked unless Owner-controlled credentials/provider path is available | Development mock must never be presented as live Google | Record provider verification evidence or blocker |
| X3 | Biometric provider calibration/model/checksum/secrets and deferred thresholds | Blocked until health, calibration, protected storage, camera/GPS, and server challenge evidence exist | Never substitute mock capture for real enrollment/attendance | Record provider evidence and exact missing prerequisite |

Roster removal means deactivating or removing current membership while preserving historical scores, assessments, attendance, audit, and reports. It must not cascade-delete historical academic records. Student/Secretary role promotion and return to Student context must preserve the same identity and Student academic record.

### Stable contract checklist

Freeze these points before page wiring:

1. Password change: authenticated current/new/confirm fields; current-password verification; server-owned policy response; rate limiting; audit; token/session invalidation; accessible reveal/paste/autocomplete behavior. The exact modern strength/reuse policy is an Owner decision item, not silently selected by the frontend.
2. Identity/email: structured Prefix/First/Middle/Last/Suffix where supported; server-configured multi-domain allowlist; editable `@bicol-u.edu.ph` suggestion only; no overwrite of existing valid addresses; protected role/assignment fields.
3. Invitations: pending/edit/revoke/reissue/accept states, stale-token invalidation after email edit, canonical Student linkage, and Secretary accept-before-promote/remove lifecycle.
4. Academic mutations: ownership scope, validation errors, audit payload, and post-write authoritative read. Remove/unenroll must preserve historical scores and attendance.
5. Biometrics: server status values (`active`, `not_enrolled`, `enrolling` or the exact agreed names), server-generated `challengeId` and randomized two-action order, single-use/idempotency behavior, cancellation deadline, consent, 20 usable enrollment samples and no more than 30 accepted, protected reference storage, and manual fallback. The proposed 26 enrollment/12 attendance cadence is a validation candidate, not an approved threshold or completion claim.
6. Attendance/GPS: server-authoritative session timing in `Asia/Manila`, geofence pass/fail without persistent Student coordinates, one attendance result per session, duplicate outcome, and manual correction provenance.
7. Student reads and notifications: authoritative response versus explicit unavailable envelope; persistent notification fields, unread/read/mark-read actions, recipient scope, and remedial linkage.

Use one consistent error envelope and render the server `code` plus an actionable message. Do not parse human text to infer state. The frontend may show progress, but it may show success only after the server response and must refetch authoritative state after a mutation.

### One-day execution order

These are scheduling windows, not guaranteed completion times. The parent can stop a branch at the first unmet contract or provider prerequisite and record the blocker without hiding it.

| Local window | Work and owner | Exit evidence |
|---|---|---|
| 00:00-00:30 | Parent freezes baseline, assigns the three Luna slots, names the single stack owner, and manually relays the Gemini UI-only handoff | Contract sheet, file ownership, and blocker register exist; no spec edit or volume reset |
| 00:30-02:00 | Luna A/B/C inspect current routes/tests and publish exact API contracts. Luna maps every page to F0-C1 and owns loading/error/unavailable behavior; Gemini may receive a later presentation assignment | No frontend payload invented; every inventory item has a batch and owner |
| 02:00-05:00 | Luna A implements identity/invite contracts; Luna B fixes roster/academic persistence; Luna C fixes attendance/biometric/Secretary contracts and the required frontend functional behavior. Gemini remains UI-only against released functional surfaces | Focused tests pass per slot; response shapes and permission failures are documented |
| 05:00-07:00 | Parent integrates backend and frontend functional slices in dependency order, resolves shared route/types/migration conflicts, and assigns any exclusive Gemini presentation pass | Frontend build/tests and backend focused tests pass on one integrated tree; visual changes do not alter behavior |
| 07:00-08:30 | Stack owner runs Docker Compose, migrations/config checks, Mailpit, camera/GPS permission checks, and role fixtures. Biometric owner attempts real enrollment/attendance only if prerequisites exist | Runtime evidence is recorded; failed prerequisites are labeled blocked |
| 08:30-10:30 | Parent runs the role-by-role browser/DB matrix: public/auth, Admin, Faculty, Student, Secretary; each mutation gets negative, permission, reload, and audit checks | No P0 item is marked complete from mocks or static data |
| 10:30-12:00 | Freeze the tree, run required repository gates, capture final evidence and exact blockers, and prepare the local walkthrough | One final status matrix and test outputs identify what can be shown |

If the day is shorter, preserve the final integration/evidence block and drop cosmetic work first. Do not drop permission, reload, audit, or provider truth checks.

### Shared final integration gate

The parent runs this once on the integrated checkout, using the same stack owner throughout:

1. Verify `docker compose config --quiet`, migrations/configuration, health, and fixtures without deleting or reusing a persisted database volume. Run the repository checks required for changed areas, then the PostgreSQL gate for authentication, attendance, database, or milestone changes.
2. Sign in with each available role through the supported flow. Exercise every row mapped to F0-C1, including every visible button and route action; record positive result, rejected input, unauthorized role, and post-reload state.
3. Confirm PostgreSQL/audit state for invites, roster add/edit/remove, grades, attendance/session/override, retention/remedial, notifications, profiles, password token invalidation, and Secretary activity. Check that roster removal leaves historical scores and attendance intact.
4. Verify no Faculty/Admin/Student/Secretary metric, academic value, notification, face status, or attendance result comes from localStorage, fixed demo data, or a fabricated fallback. A supported-unavailable state must name the missing API/provider.
5. For biometrics, require camera permission, consent, server challenge order, real enrollment and attendance, geofence/timing, duplicate prevention, cancellation, audit, and protected storage evidence. If any prerequisite is absent, show manual attendance guidance and mark B1/X3 blocked.
6. Record X1/X2 and every policy decision separately. Do not call mocked Playwright, unit tests, or code paths browser/runtime evidence.

### Owner, policy, and external blockers

- **Password policy decision:** choose and approve the current/new/confirm strength and reuse behavior after the auth audit. Until then, implement current-password verification, rate limiting, token invalidation, and a server-owned policy response without claiming a new standard is approved.
- **Biometric deferred parameters:** the specification leaves numeric LBPH threshold, repeated-match count, image-quality, liveness, pose, timing, internal protocol, and storage layout deferred. The proposed 26 enrollment/12 attendance capture is only a validation candidate; it cannot silently become a product decision.
- **Secretary/Student role model:** the approved behavior is one account with Secretary default context and applicable own-Student self-service. If current route guards cannot implement it safely, return technical options to the Owner; do not create a second account or silently change RBAC.
- **Registrar:** official import/export remains blocked until the University provides file type, headers, Student identifier, course/section fields, grading encoding, and output shape.
- **Google:** live verification remains Owner-controlled. Development mock identity is not live-provider evidence.
- **Student academics:** if no authoritative read API/data is available in the day, keep the page visibly unavailable and record the smallest contract needed for a follow-up; do not revive local fallback data.

The items above are approval or external blockers. No change to `spec.md`, no new cloud/provider/deployment file, no persisted-volume reset, and no unreviewed candidate ref or stash integration is part of this plan. Cosmetic gaps remain secondary unless they prevent reaching a real supported action.
