# Current continuation: UI migration and normalization on lighthal5

Continue the existing `lighthal5` tree and preserve the accepted visual evidence. The current working batch adds ordered migrations 026-029, focused password-recovery and grading assertions, the narrow Owner-approved provisional course-grade trigger, and the approved two-attempt remedial progression. The two password-recovery page files remain Gemini-owned presentation work until handoff. Read [ui-migration-status.md](ui-migration-status.md) first; older implementation narratives below are historical. Do not rerun unchanged route/dialog comparisons or the earlier camera/Google investigation.

Owner clarifications: overlapping activity deadlines are allowed; watchlist unlock covers the selected class; current school year is 2026-2027.

## Current closeout - 2026-09-26

The normal development database is migrated through 029. A verified backup
preceded the additive application of 022-029; no development volume or existing
data was reset, deleted, or bulk-recomputed. Migration 026 tightens the linked
attendance update trigger. Migration 027 records compatibility metadata, and
Migration 028 establishes `retention_policy.retention_threshold` as the
canonical Owner-approved professional-course trigger (`< 2.50` allowed,
`>= 2.50` remedial), synchronizing the retained grading-default mirror without
rewriting historical outcomes. Migration 029 adds two transaction-safe,
server-derived remedial attempts and leaves the original grade untouched.

The historical Docker interruption and pre-022-025 4/8 live result belong to an
earlier tree. The successful kept disposable `dentisys-final-0926b` run is also
historical: it covered migrations 001-025, not the current 029 tree. The current
tree passed `scripts/check-postgres.ps1 -KeepStack -ComposeProject
dentisys-final-0926k -BackendHttpPort 18090 -FrontendHttpPort 15183
-MailpitUiPort 18035`: the 001-029 ledger, focused PostgreSQL integration,
smoke/log checks, and all 8/8 live workflows passed. The accepted 156-capture
visual matrix and dialog evidence remain unchanged; invitation Edit is
destination-only, while Secretary review/override is shared source and
destination.

Focused visual follow-up evidence now covers the changed password-recovery
presentation at both required viewports; it is recorded as a scoped destination
presentation deviation with the source semantics preserved. Focused local
behavior evidence covers the seven exact course-grade boundaries,
unresolved missing grades, password-reset delivery/expiry/replay, and migration
026's cross-class attendance update rejection. Whole-schema 3NF is not
certified. BUCDM policy beyond the approved provisional course-grade and
two-attempt remedial amendment,
title semantics if an actual ambiguous value arises, real Google provider
acceptance, and physical-camera acceptance remain separate decisions or manual
checks. The application does not invent remedial attempt history.

# DentiSys session handoff — 2026-09-24

This is the durable continuation note for the current local-demo work. It records the repository state and evidence available at the handoff point. It does not amend `spec.md`, change product policy, or declare the one-day demo complete.

## Current Owner direction - 2026-09-24 priority reset

Continue from [UI-first migration plan](ui-migration-plan.md), not the older functional-first continuation prompt below. The Owner explicitly approved specification amendments based on UI Changes.pdf and prioritizes copying the entire `owhie_backend` UI into `lighthal5`, then normalizing the database to 3NF, then wiring and repairing tests. The current implementation batch refreshed and froze source UI at `e9ead0b3f8a4b0c49904a2274d3e80264203098b`; `bd5ab789cc537f1503fc78357ad5937e7926651a` is historical evidence only. Functional baseline: `67e16a0`.

Docker recovery and newer validation supersede the outage described below. The plan records continuation-reported passing checks and all six unresolved live failures. Google and real-camera acceptance remain unverified/deferred. Preserve parked work, existing development volumes, and historical evidence. No UI migration or database normalization is claimed complete.

Next action for a continuation is to repair Docker Desktop's locked runtime socket without resetting volumes, then rerun the post-fix aggregate gates once. The migration correction, canonical-consumer wiring, and source/destination visual comparison are already evidenced above; do not repeat those unchanged checks. The remainder of this handoff is historical evidence, including its obsolete ready-to-paste prompt.

## Executive state

The implementation baseline is `gemini/local-demo-frontend` at `08dbdd8935281a2561a4291950d13589200f9d8b` (`fix: close biometric guidance and linking audit gaps`). The implementation review of this commit was reported clean by Luna XHigh. This handoff and the delivery-plan update are carried in the following docs-only commit; the final repository `HEAD` is therefore the handoff commit, immediately after `08dbdd8`. There is no aggregate current-tree runtime-clean claim because Docker-backed mandatory gates were blocked.

The current implementation batch is `6f86492` (coherent auth/onboarding/Google, roster/audit, guided capture, and test-harness changes), followed by `08dbdd8` (guidance/consent/session rechecks, profile-link denial audit, and truthful retry-copy fixes). The validator reported the pre-fix `scripts/check.ps1` pass at `6f86492` with 124 mocked checks, then 51 focused frontend checks plus Google/biometric contract PHP checks, PHP lint, and diff checks after `08dbdd8`. The earlier `60ce84e`/`b224c95`/`cb71a76` results remain historical context; do not combine them into a whole-tree aggregate pass.

The earlier camera flow was reported as too fast/stuck; `6f86492`/`08dbdd8` add ordered orientation handling, consent/session rechecks, audio feedback, pause/retry behavior, and truthful linking/audit paths. No human camera acceptance result is recorded. A real camera enrollment followed by a persisted active profile and a real biometric attendance record has not been verified. Manual Google acceptance is also unresolved. Guided capture and live Google therefore remain provider/user acceptance work, with manual attendance as the truthful fallback.

## Exact repository state

Captured at 2026-09-24 18:14 +08:00 from `C:\Users\decha\Desktop\Github\dentisys`:

| Item | State |
|---|---|
| Branch / implementation baseline | `gemini/local-demo-frontend` / `08dbdd8` |
| Docs-only handoff state | Both handoff documents are committed immediately after the implementation baseline; the post-commit working tree is expected to be clean |
| Manual checklist | `docs/manual-demo-readiness.md` remains `Not Run` with last review at the older `47e2029` baseline |
| Runtime state | Latest `scripts/check.ps1` was blocked by Docker Desktop API HTTP 500 on `/_ping`; no current aggregate runtime pass is claimed |
| PostgreSQL gate | Disposable stack built/started, then frontend-readiness cleanup hit Docker HTTP 500; cleanup may be incomplete. Inspect volumes/logs before any cleanup and never blindly delete or reuse the development volume |
| Active process/log state | No owned commands or active validation session; only the Docker backend process was reported. No persisted validator logs were found in `.agents`/`.codex`; evidence was console-only |
| Database safety | Preserve the existing Docker Compose PostgreSQL volume; do not run a volume reset or destructive migration against it |

Preserved worktrees and parked changes are documented in [integration-status.md](integration-status.md). In particular, keep the biometric timing candidate `4e73c91`, detached model-hardening commit `87b0fa8`, and `stash@{0}` auth refresh/reuse/logout WIP parked until separately reviewed. Do not merge alternate histories or apply the stash as part of this handoff.

## Evidence-backed implementation state

| Area | What is present | What the evidence does not prove |
|---|---|---|
| Auth/password/MFA | Password-change route/contract, server policy validation, rate limiting, audit, token-version invalidation, onboarding, and Google-linking paths are committed; focused PHP/contract checks, lint, and diff checks passed. | Docker-backed persistence, re-login invalidation, live Google verification, and manual MFA/Google acceptance remain unverified. |
| Faculty academic work | Period-grading line is integrated; roster edit/reload, notification read-state, and scoped Faculty activity have focused evidence; current implementation review is clean. | A final browser → PostgreSQL → reload run for the current tree and all role/ownership negatives is still required after Docker recovery. |
| Secretary | Session lifecycle, date/class/session attendance queries, protected manual override, and own-activity endpoint are present with integration assertions. | Current running-stack role matrix, geolocation behavior, and the approved Secretary ↔ Student context switch are not complete evidence. |
| Student reads | Backend routes for Student profile, classes, retention, dashboard, notifications, and attendance-related reads exist; `RealStudentSurfaces` consumes the academic contracts. | The default Student dashboard and some Classes/Retention/Profile paths still retain development/local fallback or face flags. No fixed academic value or localStorage success is acceptable as authority. |
| Invitations/identity | Faculty invitation update/revoke/reissue, additive structured names, Faculty password-only activation, optional Student Google activation, profile-link status/denial audit, and configured seams are committed and review-clean. | Configured-domain/identity persistence, live Google verification, and the Owner’s modern password strength/reuse policy remain unresolved. |
| Biometrics | Server challenge/token/idempotency, consent/session rechecks, guided capture, audio/guidance endpoint, and truthful retry/fallback paths are committed; focused frontend and biometric contract checks passed. | Camera permission, ordered neutral/action capture, usable sample counts, cancellation/retry, protected reference, active profile, one attendance row, duplicate outcome, and attendance audit are unverified. |

## Remaining plan, by priority

| Priority | Next action | Exit evidence / owner |
|---|---|---|
| P0 | Recover Docker Desktop first. Inspect the Docker backend state, disposable project/volumes, and available console output after the HTTP 500 `/_ping` failure. Clean up only the disposable integration resources when their exact targets are confirmed; do not blindly delete or reuse the development volume. | Docker health restored and disposable cleanup state understood. Parent/stack owner owns. |
| P0 | Rerun only the affected mandatory gates on exact commit `08dbdd8`: Compose/config, PostgreSQL/authentication gate, then role-by-role browser reload/permission/audit checks. Do not repeat unrelated focused checks that already passed. | Outputs tied to `08dbdd8`; failures classified as fixture, infrastructure, provider, or product. Parent/Luna owns. |
| P0 | Verify Faculty roster edit, grades, attendance, retention/notifications, scoped activity; Secretary session/date → session → records/override/activity; Admin invite/report/audit/settings; Student authoritative reads. | Each write survives reload and has ownership/audit evidence. Do not infer from mocked Playwright. Luna owns functional fixes. |
| P0 conditional | Attempt genuine biometric enrollment and attendance with camera, calibrated sidecar, challenge order, geofence/time, idempotency, duplicate prevention, protected storage, and audit. | If any prerequisite or camera step fails, record exact blocker and keep B1/X3 blocked with manual fallback. Provider owner plus parent. |
| P1 | Resolve live Google provider credentials and the invalid/expired credential failure root cause; test matching, mismatch, expiry, replay, MFA, linking, and password fallback. | Owner-controlled provider evidence or explicit unavailable state. Do not call development mock evidence live. |
| P1 | Remove or truthfully gate remaining Student local/dev fallback paths and any fabricated metrics; verify Faculty schedule/report data only when authoritative. | No visible fixed GWA, attendance, face flag, or success toast without persisted authority. Luna owns. |
| P1 | Obtain the Registrar import specification and decide Secretary linked-Student/context-switch behavior. | Exact external contract or Owner decision recorded before implementation. |
| P1 | Decide and record the password strength/reuse policy and final institutional-email suggestion/allowlist behavior. | Owner-approved policy; preserve existing valid addresses and server-configured domains. Do not silently rewrite `spec.md`. |
| P2 | Relay Gemini’s visual-only work separately after functional behavior is frozen. | Presentation changes reviewed for no event/API/state/validation/role/business-wording changes. Gemini reports conflicts. |

## Required approvals and external inputs

- `spec.md` remains authoritative. Any conflict about Google-assisted registration, Secretary/Student role context, password policy, biometric thresholds/cadence, or identity protection needs explicit Owner resolution before a durable product decision or `spec.md` edit.
- Live Google needs Owner-controlled credentials/provider configuration and a safe tester account. No token or secret belongs in source, logs, or this document.
- Registrar import needs the official file type, headers, Student identifier, course/section fields, grading encoding, and output shape.
- Real biometric completion needs camera access plus calibrated model/checksum/secrets, protected storage, and a real persisted enrollment/attendance result. Health alone is readiness evidence, not attendance completion.

## Ready-to-paste continuation prompt

```text
Continue DentiSys local-demo work in C:\Users\decha\Desktop\Github\dentisys.

Start by reading AGENTS.md, C:\Users\decha\.codex\RTK.md, spec.md only for affected sections, docs/SESSION_HANDOFF.md, docs/local-demo-functional-delivery-plan.md, docs/integration-status.md, docs/contracts/demo-auth.md, docs/contracts/demo-academics.md, docs/demo-biometrics.md, and docs/manual-demo-readiness.md. Treat spec.md as authoritative; preserve conflicts as explicit Owner approval items and never rewrite the spec, AGENTS.md, or the database volume implicitly.

Current implementation baseline: branch gemini/local-demo-frontend, commit 08dbdd8, with the docs-only handoff committed immediately after it. The implementation review is clean. Docker-backed mandatory gates are blocked by Docker Desktop HTTP 500 on /_ping; the disposable PostgreSQL stack may have incomplete cleanup. Recover Docker and inspect exact disposable resources/logs before rerunning affected gates. Preserve the existing PostgreSQL development volume. Preserve unrelated user changes, .agent-worktrees, worktrees, and parked stash/candidate commits. Use rtk for every shell command. Docker Compose is the only runtime. Use contract-first work, cheap fixture checks, focused tests per batch, then the required final gates once on the final tree. Do not repeat unchanged passing suites. Do not treat mocks, localStorage, fixed metrics, or success toasts as persisted functionality.

Luna XHigh owns functional backend/frontend implementation, tests, integration, and tools. The committed implementation review is clean. After Docker recovery, prioritize: (1) rerun only affected mandatory auth/PostgreSQL/runtime gates on 08dbdd8; (2) run the auth and role matrix with negative, ownership, reload, and audit checks; (3) verify authoritative Student pages and remove or truthfully gate local fallback; (4) verify Faculty roster/academic/notification and Secretary date-session-record/activity flows; (5) attempt real biometric camera enrollment and attendance only when sidecar/camera prerequisites are present, otherwise record the exact blocker and preserve manual fallback; (6) investigate live Google invalid/expired credential evidence; (7) leave Registrar format, Secretary/Student context model, password-policy choice, and biometric deferred thresholds as explicit external or Owner decisions.

Gemini is a separate UI-only presentation pass after functional freeze. It may change visual JSX/CSS, layout, contrast, focus styling, and presentational labels only; it must not change handlers, API clients/routes/types, state, validation, calculations, authentication, persistence, roles/permissions, or authoritative business wording. Report any shared-file conflict.

At closeout, report exact branch/commit/status, commands and outputs, code/test evidence versus live-runtime evidence, current blockers, required Owner/external inputs, and the next single action. No owned validation command/session or persisted validator log exists in this handoff; evidence so far is console-only. Never state that all existing functions are complete while any current-tree runtime, provider, fixture, or policy item is unresolved.
```

## Handoff closeout rule

The handoff is complete only when the parent has reviewed this document against the final frozen tree and records the final validator result. Until then, this document intentionally keeps “implemented by code/tests”, “unverified runtime”, “pending review”, and “blocked” separate.
# September 25 UI-first continuation

Owner's revised AGENTS.md explicitly defers intermediate test repairs to wiring. Continue the remaining source presentation migration; do not spend the UI phase rerunning aggregate gates. Real Student dashboard/profile presentation was extended, including five separately displayed name parts. Login labels now associate with inputs and the password reveal button has an accessible name. Latest frontend build and diff whitespace check pass.

Database evidence: migrations 018/019, focused UI API tests, full PostgreSQL PHP integration tests, backup/restore and health checks passed on the disposable stack. Fixed roster reload query's missing school-year parameter and a unit-test dependency. Initial live browser gate passed 7/8; remaining failure was old Secretary sidebar navigation, now updated. Subsequent gate session output could not be recovered; no aggregate completion claim. Mocked Admin/auth focus passed 24/25; remaining Faculty invitation test uses obsolete whole-name fields/request data. Preserve assertions and repair in wiring phase. Auto Review export still awaits authorization; do not bypass its earlier rejection. See `docs/ui-migration-status.md` for remaining scope.
