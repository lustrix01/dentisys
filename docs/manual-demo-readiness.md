# DentiSys Manual Demo Readiness

This is the living checklist for a human demonstration of the supported local DentiSys development stack. It complements automated validation; it is not a second automated QA suite. Deterministic logic, API contracts, database persistence, RBAC, and ordinary error branches should be established through the automated coverage referenced below and should not be re-proven manually unless a human-visible presentation is the purpose of the step.

Use only the supported Docker Compose development runtime. The seeded credentials in this document are local development/demo-only credentials. Never use them outside development/testing, and never record real passwords, MFA codes, recovery codes, Google tokens, or other secrets in this document or in evidence.

## How to use this checklist

For every item, replace `Not Run` with `Pass`, `Fail`, `Blocked`, or `Skipped`. Conditional items may be `Skipped` only when the stated provider or feature is not enabled; record the reason. A `Blocked` item needs a concrete blocker in Evidence/Notes. Record links to screenshots, downloaded files, Mailpit message IDs, or other reviewable evidence without committing secrets.

The `Last reviewed` value is the repository commit set used to review this checklist. Re-review affected items whenever the implementation changes.

## Checklist

### SETUP-01 — Start supported Docker development stack

**Purpose:** Confirm that the demonstration uses the supported Docker-only local runtime and that the documented services and URLs are available.

**Prerequisites:** Docker Desktop with Docker Compose; a local checkout; a root `.env` created from `.env.example` when needed. Do not use XAMPP, native PHP, native MySQL/MariaDB, or phpMyAdmin.

**Steps:**

1. From the repository root, review [README.md](../README.md) and [docs/development-environment.md](development-environment.md).
2. Start the stack with `docker compose up --build -d` or the documented migration-safe `./scripts/start-dev.ps1`.
3. Confirm the supported services are present: PostgreSQL, PHP API, Vite frontend, Mailpit, and loopback-only pgAdmin.
4. Open the documented Frontend URL `http://localhost:5173`, API health URL `http://localhost:8080/api/health`, Mailpit URL `http://localhost:8025`, and pgAdmin URL `http://127.0.0.1:5050`.
5. Record whether each URL loads and whether the page shown matches the documented purpose.

**Expected observations:** The stack runs through Docker Compose only; the frontend and development tools load at the documented URLs; PostgreSQL is not exposed as a host service; pgAdmin is loopback-only. Startup does not load demo data.

**Automated coverage:** [README.md](../README.md), [docs/development-environment.md](development-environment.md), [docker-compose.yml](../docker-compose.yml), [tests/documentation/doc_contract_test.php](../tests/documentation/doc_contract_test.php), and [scripts/check-postgres.ps1](../scripts/check-postgres.ps1).

**Status:** `Not Run`

**Evidence:** Record the stack start time, the four URLs checked, and screenshots or links for any unavailable service.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### SETUP-02 — Verify service health

**Purpose:** Confirm that the API/database health surface and pgAdmin can be used before a demonstration.

**Prerequisites:** SETUP-01 is complete; the Docker stack is running; pgAdmin credentials are available from the local `.env`.

**Steps:**

1. Open `http://localhost:8080/api/health` and record the reported service/database health.
2. Run `./scripts/smoke.ps1 -CheckPgAdmin` from the repository root.
3. Open `http://127.0.0.1:5050` and sign in with `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` from `.env`.
4. Select the preconfigured **DentiSys PostgreSQL (development)** server and enter `DB_PASS` from `.env` when prompted.
5. Confirm that the `dentisys` database can be browsed in pgAdmin.

**Expected observations:** The health endpoint reports a healthy API/database state; the smoke check passes; pgAdmin loads, authenticates, and can reach the development PostgreSQL server. Do not treat a pgAdmin-only preference/session reset as a database reset.

**Automated coverage:** [scripts/smoke.ps1](../scripts/smoke.ps1), [scripts/check-postgres.ps1](../scripts/check-postgres.ps1), the Compose health checks in [docker-compose.yml](../docker-compose.yml), and [docs/development-environment.md](development-environment.md).

**Status:** `Not Run`

**Evidence:** Save the smoke-check result and record the health response summary without credentials.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### SETUP-03 — Load demo seed safely

**Purpose:** Load deterministic local demonstration records without deleting or reusing the normal persisted database volume.

**Prerequisites:** SETUP-02 is complete; pgAdmin is reachable; migrations have completed; [database/seeds/development-demo.sql](../database/seeds/development-demo.sql) is available.

**Steps:**

1. In pgAdmin, select the `dentisys` database and open **Tools → Query Tool**.
2. Open the complete [development demo seed](../database/seeds/development-demo.sql), copy it into Query Tool, and execute it once.
3. Confirm that the query completes without schema changes, `DROP`, or `TRUNCATE` operations.
4. Confirm that the documented Admin, Faculty, Secretary, and Student demo accounts and their fixture records are present.
5. If the seed is intentionally re-run, execute it a second time and confirm that it remains safe and does not create duplicate fixture rows.
6. Stop the stack with `docker compose down` when needed, preserving volumes. Do not use `docker compose down -v` for an ordinary demo reset; it deletes the persisted PostgreSQL volume and all local DentiSys data.

**Expected observations:** Demo data appears only after this manual import; normal startup and migrations do not seed it. The seed is transaction-wrapped, non-destructive, safe to rerun, and preserves the normal development volume.

**Automated coverage:** [database/seeds/development-demo.sql](../database/seeds/development-demo.sql), [database/README.md](../database/README.md), [scripts/check-postgres.ps1](../scripts/check-postgres.ps1) (disposable integration project only), and [docs/development-environment.md](development-environment.md).

**Status:** `Not Run`

**Evidence:** Record the import result and a non-sensitive pgAdmin view of representative fixture rows. Never record passwords or recovery codes.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### GATE-01 — Run automated validation before manual rehearsal

**Purpose:** Establish that the repository and disposable integration environment pass their required automated gates before relying on a human demonstration.

**Prerequisites:** Dependencies and Docker Desktop are available; SETUP-01 is complete when a running stack is needed for the smoke check.

**Steps:**

1. Run `./scripts/check.ps1` from the repository root.
2. Run `php tests/documentation/doc_contract_test.php` explicitly and retain its output.
3. Run `./scripts/smoke.ps1 -CheckPgAdmin` when the normal development stack is running.
4. Run `./scripts/check-postgres.ps1` for the disposable PostgreSQL/live integration validation. Do not pass a destructive option against the normal development project or volume.
5. Review failures before beginning the manual rehearsal; do not convert an automated failure into a manual pass.

**Expected observations:** The fast check, documentation contract, smoke/pgAdmin check when applicable, and disposable PostgreSQL/live integration gate pass. The disposable integration project is the only acceptable destructive test target and is removed by its script.

**Automated coverage:** [scripts/check.ps1](../scripts/check.ps1), [scripts/check-postgres.ps1](../scripts/check-postgres.ps1), [scripts/smoke.ps1](../scripts/smoke.ps1), and [tests/documentation/doc_contract_test.php](../tests/documentation/doc_contract_test.php).

**Status:** `Not Run`

**Evidence:** Attach command outputs or CI-equivalent results, including the commit checked.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### AUTH-01 — Password login, role landing, reload, and logout

**Purpose:** Demonstrate the supported password session path for each seeded role and the role-appropriate landing experience.

**Prerequisites:** SETUP-03 is complete. The following are explicitly **local development/demo-only** credentials and must not be reused outside development/testing:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@bicol-u.edu.ph` | `Admin123!` |
| Faculty | `faculty@bicol-u.edu.ph` | `Faculty123!` |
| Secretary | `secretary@bicol-u.edu.ph` | `Secretary123!` |
| Student | `student@bicol-u.edu.ph` | `Student123!` |

**Steps:**

1. Open `http://localhost:5173/login`.
2. For each of the four local demo accounts, enter the documented email and password and submit the form.
3. Confirm that the account reaches its role-appropriate landing/dashboard surface and that the displayed role/identity is the account used.
4. Reload the page and confirm that the authenticated session still presents the same role-appropriate surface.
5. Sign out through the visible logout control.
6. Confirm that the protected surface is no longer available without signing in again, then repeat for the next role.

**Expected observations:** Password authentication remains available; each account reaches only its own role experience; a reload does not silently change the role; logout returns to an unauthenticated state.

**Automated coverage:** [e2e/auth.spec.ts](../e2e/auth.spec.ts) (login/session flows), [e2e/live/live.spec.ts](../e2e/live/live.spec.ts) (administrator reload and logout invalidation), [e2e/admin.spec.ts](../e2e/admin.spec.ts), [e2e/faculty.spec.ts](../e2e/faculty.spec.ts), [e2e/secretary.spec.ts](../e2e/secretary.spec.ts), and [e2e/p03_student_auth.spec.ts](../e2e/p03_student_auth.spec.ts).

**Status:** `Not Run`

**Evidence:** Record the role and landing surface observed for each account, plus logout/reload screenshots where useful. Do not record passwords.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### AUTH-02 — Real authenticator-app MFA

**Purpose:** Demonstrate the human usability of QR enrollment, real TOTP entry, recovery-code use, revocation, and password fallback.

**Prerequisites:** A tester-controlled local demo account; a real authenticator application on a tester-controlled device; SETUP-03; a safe temporary place to hold recovery codes. Do not put codes in the repository, screenshots, logs, or this checklist.

**Steps:**

1. Sign in with the test account and open its profile/security/MFA controls.
2. Start authenticator-app enrollment and scan the displayed QR code with the real authenticator application. If the application cannot scan it, record that QR usability is blocked.
3. Enter the current six-digit code from the authenticator application and complete enrollment.
4. Store the displayed recovery codes only in the tester-controlled temporary secure location, then sign out.
5. Sign in again with the account password and enter a current authenticator code when prompted. Confirm that the account reaches its normal role surface.
6. Sign out, sign in again, and use one unused recovery code. Confirm that recovery-code authentication reaches the normal role surface and that the used code is not reusable.
7. Open the profile/security/MFA controls, revoke MFA, sign out, and sign in with the account password. Confirm that password fallback works without an MFA prompt after revocation.
8. Remove the temporary recovery-code record after the rehearsal.

**Expected observations:** A real authenticator application can scan the QR code, generate an accepted TOTP, and support recovery-code use. Revocation is reflected in the UI and password authentication remains usable. Do not describe generated TOTP values in automated tests as proof that a human can scan or use the QR code.

**Automated coverage:** [e2e/auth.spec.ts](../e2e/auth.spec.ts) covers the MFA challenge boundary and enrollment authentication requirement; [e2e/live/live.spec.ts](../e2e/live/live.spec.ts) covers the TOTP/recovery-code API contract. Those automated tests do not prove QR usability with a real authenticator application.

**Status:** `Not Run`

**Evidence:** Record only pass/fail observations, enrollment/revocation timestamps, and non-secret screenshots with QR/code values redacted.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### AUTH-03 — Google Sign-In conditional check

**Purpose:** Demonstrate the configured Google path without weakening password authentication, account linking, MFA, invitation controls, or institutional-domain policy.

**Prerequisites:** First record whether Google is configured in the active runtime. If configured, use only a tester-controlled approved institutional Google Workspace account and an existing DentiSys account that the tester is authorized to link. Never record Google credentials, ID tokens, or secrets.

**Steps when Google is configured:**

1. Open `/login` and confirm that the Google Sign-In control is presented.
2. Use the tester-controlled approved institutional account. For first-time linking, confirm the existing DentiSys password when prompted.
3. Complete the same MFA boundary used by password authentication when MFA is enabled.
4. Confirm the user reaches the expected role surface, then log out.
5. Repeat Google Sign-In and confirm that the established link is reused.
6. Log out and verify that the same account can still sign in with its DentiSys email and password, including MFA when enabled.

**Steps when Google is not configured:**

1. Open `/login` and record the honest disabled/unavailable state for Google Sign-In.
2. Sign in with the local demo account's password and confirm that password login remains available.

**Expected observations:** Google is conditional on runtime configuration and an approved tester-controlled identity; first-time linking requires the existing DentiSys password and MFA when enabled; subsequent Google login and password fallback resolve to the same account. If unconfigured, the UI does not pretend Google is available and password login remains usable.

**Automated coverage:** [e2e/auth.spec.ts](../e2e/auth.spec.ts) covers mocked direct Google login, first-time linking, domain policy errors, and GIS load failure; [docs/development-environment.md](development-environment.md) documents the real-account constraints; [spec.md](../spec.md) AUTH-001 through AUTH-010 are authoritative.

**Status:** `Not Run`

**Evidence:** Record the runtime state, role surface, and whether the configured or unavailable branch was used. Do not record personal account identifiers beyond a non-sensitive tester label.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### ADMIN-01 — Admin demonstration

**Purpose:** Present the current Admin experience and its human-visible invitation, reporting, audit, profile, settings, and logout surfaces.

**Prerequisites:** AUTH-01 Admin login passes; demo fixtures are present; use a tester-controlled local invitation target when creating or reissuing an invitation.

**Steps:**

1. Sign in as the local demo Admin and confirm the Admin dashboard/landing presentation.
2. Visit `/admin/faculty-invite`. Review the invitation form/list and, using a tester-controlled local target, demonstrate invitation presentation and reissue presentation without sending real mail.
3. Visit `/admin/reports`. Apply an available report filter and confirm that the visible report context updates coherently.
4. Visit `/admin/audit-trail`. Apply an available audit filter and confirm that the visible audit context updates coherently.
5. Visit `/admin/profile` and `/admin/settings`; confirm that the pages load and present their current controls/state.
6. Log out and confirm that the Admin-only surfaces are no longer available in the unauthenticated state.

**Expected observations:** The listed current Admin routes load for Admin, invitations and reissues are presented with honest current state, report/audit filters are understandable, and logout ends the Admin session. Rely on automated tests for exact API payloads, permission assertions, and deterministic filtering semantics.

**Automated coverage:** [e2e/admin.spec.ts](../e2e/admin.spec.ts), [e2e/auth.spec.ts](../e2e/auth.spec.ts) invitation coverage, [e2e/dfd_verification.spec.ts](../e2e/dfd_verification.spec.ts) Admin data-flow characterization, and [e2e/transmutation.spec.ts](../e2e/transmutation.spec.ts) Admin settings/transmutation presentation.

**Status:** `Not Run`

**Evidence:** Record each route visited, one redacted invitation/reissue presentation, selected filter context, and logout result.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### FACULTY-01 — Faculty demonstration

**Purpose:** Present the current Faculty workflows without duplicating deterministic API, persistence, or validation assertions already covered by automation.

**Prerequisites:** AUTH-01 Faculty login passes; at least one seeded or locally created eligible class/roster is available; Mailpit is running if the email-management portion is demonstrated.

**Steps:**

1. Sign in as the local demo Faculty account.
2. Visit `/classes` and `/students`; present the visible class, roster, eligibility, and student information for the selected class.
3. Visit `/grades`; present the assessment/grade worksheet and the visible score, category, or transmutation context without claiming more than the current data shows.
4. Visit `/attendance`; select an available class/date and present the attendance records and visible status controls.
5. Visit `/retention` and `/reports`; present the visible retention indicators and report context.
6. Visit `/email-management`; present email history and, if using a tester-controlled eligible roster, the student-invitation presentation.
7. Visit `/faculty/audit-trail`, `/faculty/profile`, and `/faculty/settings` and confirm that each surface loads.
8. Log out.

**Expected observations:** Faculty can see only the current assigned/available roster context; grades/assessments, attendance, retention, reports, email history, audit, profile, and settings are presented without obvious contradiction; logout ends the session. Exact save payloads, conflict handling, and persistence are covered by automated tests.

**Automated coverage:** [e2e/faculty.spec.ts](../e2e/faculty.spec.ts), [e2e/live/live.spec.ts](../e2e/live/live.spec.ts) live Faculty workflows, [e2e/dfd_verification.spec.ts](../e2e/dfd_verification.spec.ts), [e2e/transmutation.spec.ts](../e2e/transmutation.spec.ts), and [e2e/auth.spec.ts](../e2e/auth.spec.ts) Student invitation initiation.

**Status:** `Not Run`

**Evidence:** Record one representative route and visible state for each listed capability, plus any invitation/email-history evidence used.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### SECRETARY-01 — Secretary demonstration

**Purpose:** Present Secretary attendance-session, filtering, manual override, audit, account, and logout behavior while maintaining the explicit boundary that no CCTV integration is configured.

**Prerequisites:** AUTH-01 Secretary login passes; a local class/session context is available; use a meaningful reason supplied by the tester for any manual override.

**Steps:**

1. Sign in as the local demo Secretary.
2. Open `/secretary/start-session`; present the start-session form/state and, when the local flow permits, start a session.
3. Return to the same surface and present the active-session state, then end the session through the UI when appropriate.
4. Open `/secretary/attendance`; apply an available attendance filter and review the visible results.
5. Open `/secretary/override`; select an available attendance record, make a manual correction, and provide a clear reason before submitting.
6. Open `/secretary/audit-trail` and confirm that the audit presentation can be reviewed.
7. Open `/secretary/profile` and `/secretary/settings`.
8. Confirm that the navigation and pages do not claim an unconfigured CCTV integration or expose a CCTV simulator.
9. Log out.

**Expected observations:** Start/end session state is presented clearly; attendance filtering and manual override require the visible reason where applicable; audit visibility is understandable; the UI honestly presents CCTV as unavailable/unconfigured; logout ends the session.

**Automated coverage:** [e2e/secretary.spec.ts](../e2e/secretary.spec.ts), [e2e/live/live.spec.ts](../e2e/live/live.spec.ts) live Secretary session lifecycle, [e2e/dfd_verification.spec.ts](../e2e/dfd_verification.spec.ts) Secretary flows, and [e2e/p02_safety.spec.ts](../e2e/p02_safety.spec.ts) development location/session safety seam.

**Status:** `Not Run`

**Evidence:** Record start/end presentation, filter used, redacted override result/reason, audit view, and the absence of CCTV claims.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### STUDENT-01 — Student demonstration

**Purpose:** Present authoritative Student surfaces and explicitly bounded unavailable/prototype states according to the active runtime configuration.

**Prerequisites:** SETUP-03 and AUTH-01 Student login pass. The tester can inspect the active runtime configuration without changing it.

**Steps:**

1. Before signing in, open the active runtime configuration endpoint at `/api/runtime-config` and record the non-secret values for environment, identity providers, biometric provider, location provider, `browser_attendance_prototype`, and `student_auth_enabled`.
2. Sign in as the local demo Student and visit `/student/dashboard`.
3. Visit `/student/attendance` and `/student/attendance-logs`; present the current attendance state. If an authoritative provider or API is unavailable, record the bounded unavailable state rather than treating it as a failure.
4. Visit `/student/face-registration`; record whether it is available, unavailable, or explicitly marked as a prototype according to the runtime configuration.
5. Visit `/student/classes` and `/student/retention`; record whether each surface presents authoritative content or an honest unavailable/prototype state.
6. Visit `/student/profile` and confirm the profile presentation matches the active account.
7. Log out.

**Expected observations:** The runtime configuration is recorded before interpretation; authoritative APIs/providers are not replaced by invented browser data; unavailable surfaces explain their bounded state; prototype surfaces are clearly prototype-only and are not presented as production-ready; logout ends the session.

**Automated coverage:** [e2e/p03_student_auth.spec.ts](../e2e/p03_student_auth.spec.ts) real Student routing, unavailable states, and disabled biometric behavior; [e2e/p02_safety.spec.ts](../e2e/p02_safety.spec.ts); [e2e/dfd_verification.spec.ts](../e2e/dfd_verification.spec.ts) Student prototype characterization; [docs/frontend.md](frontend.md).

**Status:** `Not Run`

**Evidence:** Attach a redacted runtime-configuration snapshot, route/state notes, and screenshots of any unavailable/prototype messaging.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### CROSS-01 — Faculty/Student invitation and activation

**Purpose:** Demonstrate the supported Faculty-issued Student invitation, Mailpit delivery, password-backed activation, and resulting Student role boundary.

**Prerequisites:** AUTH-01 Faculty login passes; Mailpit is running; an eligible Student tied to an assigned class roster is available and is not already active. Use a tester-controlled local institutional address. If the seeded canonical Student is already active, use the supported Faculty workflow to create a new local Student fixture before inviting it.

**Steps:**

1. Sign in as Faculty and open `/email-management` or the supported class/roster invitation control.
2. Select an eligible Student from the assigned class roster and send the Student invitation.
3. Open Mailpit at `http://localhost:8025` and confirm that the invitation arrives for the selected recipient with the expected invitation context.
4. Open the activation link from the Mailpit message and confirm that it opens `/activate-student` for the intended invitation.
5. Confirm the invitation details and create the required DentiSys password; do not use a Google identity as a substitute for the password or invitation.
6. Sign in with the newly created Student email and DentiSys password.
7. Confirm that the resulting identity is Student and that only the Student's allowed surfaces are presented.
8. Log out.

**Expected observations:** The invitation is tied to the eligible class roster; Mailpit receives the message; activation requires password creation; the resulting account is an active Student; a Student email alone does not create access; role surfaces remain bounded.

**Automated coverage:** [e2e/live/live.spec.ts](../e2e/live/live.spec.ts) live Faculty-issued Student invitation, Mailpit acceptance, password login, and identity shape; [e2e/auth.spec.ts](../e2e/auth.spec.ts) Faculty invitation and roster invite coverage; [e2e/p03_student_auth.spec.ts](../e2e/p03_student_auth.spec.ts) activation token behavior.

**Status:** `Not Run`

**Evidence:** Record the redacted recipient/context, Mailpit message ID or screenshot, activation result, and resulting role/surfaces. Do not record the activation token or password.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### MFA-01 — Mailpit and activation-link presentation

**Purpose:** Verify that invitation mail is readable and that the one-time activation link is usable without leaking its token into the browser URL or browser storage after activation.

**Prerequisites:** CROSS-01 has produced a local invitation; Mailpit is reachable; browser developer tools may be used only to inspect storage without copying secrets into evidence.

**Steps:**

1. In Mailpit, open the invitation message and review the rendered text/HTML for readable layout, correct recipient, correct invitation role/context, and a visible activation link.
2. Open the activation link in the browser and confirm that the activation page loads for the intended invitation.
3. Before submitting the password, observe the address bar and note the activation-token URL state.
4. Complete activation with a tester-controlled password.
5. After activation, confirm that the token is removed from the browser URL.
6. Inspect `localStorage`, `sessionStorage`, and the application auth state without copying values; confirm that the raw token is not persisted.
7. Confirm that the activation result can be followed by normal Student login as in CROSS-01.

**Expected observations:** Mailpit rendering is readable and contextual; the link opens the intended activation page; activation completes with password creation; the raw token is scrubbed from the URL and is not retained in browser storage/auth context.

**Automated coverage:** [e2e/p03_student_auth.spec.ts](../e2e/p03_student_auth.spec.ts) token scrubbing and activation; [e2e/secretary.spec.ts](../e2e/secretary.spec.ts) invitation activation page; [e2e/live/live.spec.ts](../e2e/live/live.spec.ts) Mailpit delivery and acceptance.

**Status:** `Not Run`

**Evidence:** Record the message subject/recipient context and redacted before/after URL observations. Never save the token.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### OUTPUT-01 — Reports, CSV export, and print/PDF output

**Purpose:** Confirm the human usability of report/audit output, CSV downloads, and browser print/PDF output.

**Prerequisites:** At least one role with report/audit data; a browser download directory; a PDF viewer or print preview; use only local demo data.

**Steps:**

1. Open an available Admin, Faculty, or Secretary report/audit surface after signing in with the appropriate role.
2. Apply a meaningful filter and record the selected filter context.
3. Use the visible CSV/export control when available and confirm that the download completes.
4. Open the downloaded file and confirm that it is readable, contains the selected data context, and does not silently omit the selected filter context.
5. Repeat for a representative audit export when that screen provides an export control.
6. Use the browser print control on a representative report/audit view and preview/save it as PDF.
7. Review the PDF at normal zoom for clipping, missing columns, unreadable text, broken page boundaries, and the selected report context.

**Expected observations:** Available exports download successfully and are readable; selected filters/context are represented; browser print/PDF output is usable. If a screen has no export control, record that fact rather than inventing one. This item remains manual unless an existing automated test directly proves the output artifact.

**Automated coverage:** [e2e/dfd_verification.spec.ts](../e2e/dfd_verification.spec.ts) report/grade/export characterization; [e2e/admin.spec.ts](../e2e/admin.spec.ts), [e2e/faculty.spec.ts](../e2e/faculty.spec.ts), and [e2e/secretary.spec.ts](../e2e/secretary.spec.ts) route coverage. Existing tests do not replace manual review of downloaded files or print/PDF layout.

**Status:** `Not Run`

**Evidence:** Record downloaded filenames, filters used, and redacted screenshots or PDF review notes. Do not commit exported personal data unless already approved as a fixture.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### VISUAL-01 — Demonstration visual and responsive check

**Purpose:** Identify human-visible layout and interaction problems that automated route/contract tests do not reliably establish.

**Prerequisites:** SETUP-01 and AUTH-01 pass; a browser that can be resized or use a narrow/mobile viewport.

**Steps:**

1. Review the landing screen and `/login` at a desktop-width viewport.
2. Review the same screens at a narrow/mobile-width viewport.
3. Sign in as Admin and review `/dashboard` at both widths; repeat with one representative screen for Faculty, Secretary, and Student.
4. Check only human-visible concerns: clipping, overlapping content, unreadable text, broken navigation, inaccessible controls, horizontal overflow, or an obvious interaction failure.
5. Record the route, viewport description, observed issue, and screenshot for each issue; do not convert deterministic test coverage into a visual pass.

**Expected observations:** Landing/login and representative role screens remain legible, navigable, and usable at desktop and narrow/mobile widths, or each visible defect is recorded with a precise route and viewport.

**Automated coverage:** [e2e/admin.spec.ts](../e2e/admin.spec.ts), [e2e/faculty.spec.ts](../e2e/faculty.spec.ts), [e2e/secretary.spec.ts](../e2e/secretary.spec.ts), [e2e/p03_student_auth.spec.ts](../e2e/p03_student_auth.spec.ts), and [e2e/auth.spec.ts](../e2e/auth.spec.ts) provide route/render coverage but do not replace human responsive review.

**Status:** `Not Run`

**Evidence:** Record viewport sizes/descriptions, representative routes, and screenshots only when they contain approved local fixture data.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### DEVICE-01 — Conditional camera and geolocation behavior

**Purpose:** Check device permission and fallback presentation only when the relevant prototype/research providers are explicitly enabled.

**Prerequisites:** Record the active runtime configuration first. Run this item only when the relevant camera and/or geolocation provider is explicitly enabled and the tester has an appropriate device/browser. If it is not enabled, mark `Skipped` with the exact configuration reason.

**Steps:**

1. Record the active biometric, location, and browser-attendance provider values without recording secrets.
2. When camera behavior is enabled, open the relevant Student attendance/enrollment surface, grant camera permission, and confirm that the camera starts.
3. Exercise the visible retry path after a denied or unavailable camera permission; exercise device selection only if the browser/provider exposes it.
4. When geolocation behavior is enabled, grant location permission and confirm the inside-location presentation.
5. Deny location permission or use an outside-location condition and confirm the bounded outside/unavailable state.
6. Confirm that manual attendance remains available as the documented fallback where applicable.

**Expected observations:** Permission, retry, device-selection, inside/outside-location, and manual-fallback states are understandable. A disabled or mock provider is not treated as evidence of production device readiness.

**Automated coverage:** [e2e/p02_safety.spec.ts](../e2e/p02_safety.spec.ts), [e2e/dfd_verification.spec.ts](../e2e/dfd_verification.spec.ts), [e2e/p03_student_auth.spec.ts](../e2e/p03_student_auth.spec.ts), and [spec.md](../spec.md) BIO-006 through BIO-008 and ATT-002.

**Status:** `Not Run`

**Evidence:** Record provider configuration, permission decisions, visible states, and fallback route. Do not include camera captures or location coordinates in committed evidence.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### PROTOTYPE-01 — Conditional biometric/attendance prototype rehearsal

**Purpose:** Rehearse explicitly enabled biometric/attendance prototype surfaces while clearly separating prototype behavior from production readiness.

**Prerequisites:** The relevant prototype/research providers are explicitly enabled; Student authentication and any required development mock are enabled as documented; a tester-controlled Student account is available. Otherwise mark `Skipped` with a reason.

**Steps:**

1. Record the runtime configuration and label the rehearsal **prototype-only** before starting.
2. Open `/student/face-registration` and review the consent/privacy messaging before proceeding.
3. If the enabled prototype supports it, complete the visible enrollment flow and record the success presentation without retaining raw captures.
4. Open `/student/attendance` and present the attendance action/result. Exercise a visible failure or retry path where the provider exposes one.
5. Confirm the manual attendance fallback and use it when the biometric/provider path is unavailable or rejected.
6. Confirm that the UI does not describe the prototype as production biometric readiness, identity proofing, login, or a replacement for manual attendance.

**Expected observations:** Consent messaging is present; enrollment/attendance success and failure/retry states are understandable; manual fallback remains available; all results are explicitly prototype-only. No raw facial image or biometric material is retained in evidence.

**Automated coverage:** [e2e/p02_safety.spec.ts](../e2e/p02_safety.spec.ts), [e2e/p03_student_auth.spec.ts](../e2e/p03_student_auth.spec.ts), [e2e/dfd_verification.spec.ts](../e2e/dfd_verification.spec.ts), [docs/biometric-attendance-decisions.md](biometric-attendance-decisions.md), and [spec.md](../spec.md) BIO-001 through BIO-009.

**Status:** `Not Run`

**Evidence:** Record configuration, visible consent/fallback states, and prototype labels. Do not save camera frames, templates, raw captures, or secret tokens.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

### BOUNDARY-01 — Deferred-capability presentation boundary

**Purpose:** Confirm that incomplete, deferred, prototype, and unsupported capabilities are not presented as production-ready.

**Prerequisites:** Access to the current application and the current [features](features.md), [roadmap](roadmap.md), [single-server status](single-server.md), and relevant [specification](../spec.md) sections.

**Steps:**

1. Review the landing/login and one representative screen for each role while logged in with local demo accounts.
2. Search the visible UI and demonstration narrative for claims about production biometrics, image publishing, deployment automation, cloud infrastructure, TLS, CI/CD, public deployment, or other deferred/incomplete capabilities.
3. Review the runtime/deployment documentation and confirm that local development is supported, while the same-host single-server path remains an unfinished private-LAN prototype and public/separate-server deployment is not implemented.
4. Confirm that any biometric, camera, geolocation, or mock-provider surface is labeled according to its active configuration and prototype/deferred status.
5. Record and escalate any wording that implies production readiness for a deferred or incomplete capability.

**Expected observations:** Production biometrics, image publishing, deployment automation, cloud infrastructure, TLS, CI/CD, public deployment, and other deferred capabilities are not represented as completed production features. Prototype and mock flows remain visibly bounded and local-only.

**Automated coverage:** [docs/features.md](features.md), [docs/roadmap.md](roadmap.md), [docs/single-server.md](single-server.md), [e2e/secretary.spec.ts](../e2e/secretary.spec.ts) CCTV boundary, [e2e/p03_student_auth.spec.ts](../e2e/p03_student_auth.spec.ts) unavailable/prototype boundaries, and [spec.md](../spec.md) RUN-001/RUN-002, BIO-001/BIO-008, and DEL-001.

**Status:** `Not Run`

**Evidence:** Record the screens and documentation reviewed and quote only short, non-sensitive UI labels when a boundary issue is found.

**Last reviewed:** `47e2029c49832b84f2610a15fca092870adc420c`

**Notes:** ` `

## Demo-ready verdict

A demonstration is ready only when all of the following are true:

- [ ] All required manual items pass.
- [ ] Required automated gates pass.
- [ ] Optional/conditional items are explicitly marked `Skipped` with a reason.
- [ ] No unresolved required item is `Blocked`.
- [ ] Prototype and deferred capabilities are not represented as production-ready.
- [ ] Evidence is recorded for every completed manual item.

**Verdict:** `Not Run`

**Review date:** ` `

**Reviewer:** ` `

**Required-item exceptions or blockers:** ` `

## Update rules

Update and re-run the affected checklist items when a change touches:

| Change area | Affected checklist IDs |
| --- | --- |
| Authentication, session, or MFA | `AUTH-*`, `MFA-*` |
| Routes, layout, or navigation | The affected role section and `VISUAL-01` |
| Permissions or RBAC | The affected role section and the relevant automated references |
| Invitations or email | `CROSS-01`, `MFA-01` |
| Attendance, camera, geolocation, or biometric code | `DEVICE-01`, `PROTOTYPE-01`, `BOUNDARY-01` |
| Reports, export, or print | `OUTPUT-01` |
| Compose, runtime, or configuration | `SETUP-*`, `GATE-01`, and the applicable conditional checks |

When a change affects specified product behavior, consult the relevant sections of [spec.md](../spec.md). Do not change the authoritative specification or turn a deferred capability into a production claim through this checklist.
