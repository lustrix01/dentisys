# UI-first migration into lighthal5

Owner priority reset: 2026-09-24. Governed by spec.md section 9B. This amendment is documentation only; UI migration, SQL changes, and wiring remain to be implemented.

## Frozen sources

- UI: local `owhie_backend` at `bd5ab789cc537f1503fc78357ad5937e7926651a`. Do not confuse it with `owhie-backend`.
- Functional baseline: `67e16a0`; destination `lighthal5`.
- Design/requirements: `C:\Users\decha\Downloads\UI Changes.pdf`, nine pages, text and screenshots inspected. Preserve access to the original; it is not a repository artifact.

## Phase 1 - Copy the entire UI

Inventory every route, role, navigation item, component, form, table, dialog, stylesheet, asset, and responsive state. Copy the frozen source interface, then reconcile PDF requirements. Maintain a source/PDF/destination screenshot checklist; the PDF is not an exhaustive route inventory.

Carry interaction structure needed for parity and record incompatible API behavior for Phase 3. Preserve the existing backend for later wiring. Do not blindly merge source backend/schema changes or delete newer tests/helpers. The frontend diff spans 53 files and includes removal of newer authentication and biometric helpers; interface copying is not approval of all source deletions.

Failing tests are explicitly allowed during this intermediate phase. Record each command, failure, affected contract, and repair task. Do not remove assertions or claim runtime completion. Keep work isolated and reviewable. Exit: complete visual/interaction inventory and parity, with deviations and functional gaps recorded.

## Phase 2 - Database fit and normalization

Before SQL, map every UI field to its entity/key, type, optionality, owner, cardinality, current storage, proposed storage, validation, and compatibility API field. Inspect existing structured-name migrations before adding new columns.

Audit identity/accounts/invitations; Students/enrollments; courses/offerings/sections/years/rooms/schedules; periods/categories/assessments/deadlines/scores; watchlist unlocks/retention/remedial stages; attendance sessions/records/corrections. This is an audit scope, not a predetermined table design.

Document candidate keys and functional dependencies for changed relations; demonstrate 1NF, 2NF, and 3NF. Preserve justified historical snapshots. Maintain one canonical identity across roles. Split names into Prefix, First Name, Middle Name, Last Name, and Suffix, with ambiguous old names retained for reconciliation rather than guessed.

Add ordered migrations after the existing sequence, deterministic backfills, and compatibility paths. Verify row counts, links, constraints, history, and backup/restore on one disposable stack. Never reset the development volume. Exit: field map/ERD, reviewed migrations, data-preservation evidence, and explicit unresolved data.

## Phase 3 - Connect and repair

Freeze API fields, errors, ownership, examples, and reload expectations per screen. Wire to authoritative backend/PostgreSQL paths. Repair regressions and update tests for approved changes without dropping meaningful assertions. Remove temporary/source-local success paths from accepted functionality.

Verify roles, validation, persistence, audit, grades, historical read-only classes, name round-trips, invitations, Secretary context, and attendance. Run focused checks followed by `scripts/check.ps1` and `scripts/check-postgres.ps1` on the integrated tree. Real Google/camera acceptance remains separate from mocked tests. Exit: working persisted workflows and no hidden product defects.

## PDF traceability

| Page | Requirement | Source surface | Spec |
|---|---|---|---|
| 1 | Single Activity / Full Matrix and filters | faculty/GradeComputation | UI-002 |
| 2 | Optional deadline, no overlap | Assessment dialog | UI-002 |
| 3 | Clear period/category weights | faculty/GradeComputation | UI-002 / GRD-002 |
| 4 | Incomplete lock and manual unlock | faculty/RetentionMonitoring | UI-003 |
| 5 | Default email suffix | All email forms / roster | UI-004 |
| 6 | Clickable final-grade/policy progression | faculty/RetentionMonitoring | UI-003 |
| 7 | Attendance redesign / session entry | faculty/AttendanceMonitoring | UI-005 |
| 7-8 | Faculty invitation fields and status | admin/FacultyInvitation | UI-004 / ID-002 |
| 8-9 | Secretary toggle, attendance/history consolidation | Layout / Secretary pages | UI-005 / BIO-010 |
| 9 | Current-year creation / historical read-only | faculty/ClassesAndRosters and mutations | CLS-002 |
| Owner request | Five-part names and wider 3NF audit | Cross-domain data/API map | ID-002 |

## Source gaps and open details

- Source GradeComputation contains Single Activity View and Full Matrix View; this does not prove persistence.
- Source FacultyInvitation still uses one `name` field. Apply the PDF/Owner's structured form instead of reproducing that discrepancy.
- Activity overlap scope and date/time semantics are unresolved; do not invent a database uniqueness constraint.
- Aggregate watchlist lock/unlock scope and exact BUCDM policy mapping need clarification before wiring, without blocking visual copying.
- Default email suffix coexists with multi-domain allowlisting. Sample screenshot thresholds, people, grades, badges, and session actions are not backend acceptance evidence.

## Deferred evidence and blockers

Continuation evidence at `67e16a0` reports 124 mocked checks/build/lint/contracts plus disposable migrations 001-017, PostgreSQL integration, backup/restore, and smoke passing. This is not full UI acceptance.

The post-change live gate had 2/8 pass, with six unresolved failures: Admin reload/refresh timeout; TOTP recovery API timeout; Secretary lifecycle timeout; Faculty attendance heading missing; grade-weight offering selector missing; assessment manager `existingConfig.categories` undefined. Preserve and classify these in Phase 3.

Real Google linking/sign-in remains unverified: the designated Gmail test identity has no matching DentiSys account and the in-app provider chooser did not open. Never request its password or OTP. Physical-camera inspection reported blocked access/unable to play media after selecting the USB webcam and retrying; OBS Virtual Camera readiness is not physical-camera acceptance. No real enrollment/attendance success is established.

Registrar format, unapproved policy details, Google, and camera acceptance stay deferred behind UI and schema work. Do not restart the old functional-first plan.

## Next execution packet

Start Phase 1 from the frozen refs; produce the full route/state/file inventory and migrate coherent UI batches while retaining a recoverable functional baseline. Use AGENTS.md ownership rules. This priority change does not grant Gemini authority over functional code. Final integration into `lighthal5` must identify exactly which state is visual-only, schema-ready, or fully wired.
