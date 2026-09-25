# UI migration status

Current destination: local `lighthal5`, based on `f9ac7df`. The original functional baseline is `67e16a0`; the refreshed and frozen source UI for this batch is `owhie_backend@e9ead0b3f8a4b0c49904a2274d3e80264203098b` (fast-forwarded from the prior pin `bd5ab789cc537f1503fc78357ad5937e7926651a`). Recovered changes from the `c9fe` checkout are already included. Do not copy them again.

## Current handoff — 2026-09-26

The normal development database is migrated through 027 after a verified
pre-migration dump; no volume or existing data was reset, deleted, or bulk-
recomputed. Migrations 026-027 are additive: 026 closes the linked-attendance
update validation gap, and 027 records the Owner-approved provisional
professional-course trigger in the existing retention-policy configuration.
The historical Docker interruption and earlier pre-022-025 4/8 live result are
separate from the successful kept disposable `dentisys-final-0926b` run, which
passed migrations 001-025 and all 8/8 live workflows. That run is historical for
the older tree. The current tree passed `scripts/check-postgres.ps1 -KeepStack
-ComposeProject dentisys-final-0926c -BackendHttpPort 18084
-FrontendHttpPort 15177 -MailpitUiPort 18029`: the 001-027 ledger, focused
PostgreSQL integration, smoke/log checks, and all 8/8 live workflows passed.
The accepted route and dialog visual evidence below is unchanged. Whole-schema
3NF, remaining BUCDM decisions, and real Google/camera acceptance remain
explicitly unresolved or manual.

## Implemented in this working batch

- Integrated approved specification/roadmap changes. Recorded Owner clarifications: deadlines may overlap everywhere, watchlist manual unlock covers the selected class, current school year is 2026-2027.
- Faculty single/matrix score views retained; blank deadlines supported and weight instructions clarified.
- Invitation five-part names and institutional email suffix entry; roster creation/edit now uses five fields and never splits a display name on spaces.
- Admin/Faculty/Secretary profile forms use five-part names. Student academic profile returns all five parts. Existing ambiguous account display names are retained until explicitly entered as separate parts.
- Secretary sidebar toggle uses the same authenticated account and existing linked-Student permissions. Attendance monitoring includes roll call, session history and start/override entry points; old routes remain available.
- Faculty attendance adds source-style monitoring/session presentation. Student attendance/logs/classes/retention receive targeted presentation updates while preserving authoritative reads, camera, consent and liveness.
- Real Student dashboard now uses the source's two-column workspace, quick actions and verification guidance. Real Student profile has the source identity-header treatment and Google linking alongside password/MFA controls; saved data remains authoritative.
- The retained Faculty Student Management enrollment form now also exposes Prefix/Suffix and accepts local-part institutional email with the default suffix. Its existing API payload carries the five separate name fields. Focused TypeScript/Vite build passed after this UI batch.
- Midterm watchlist is separate from final retention. Completion uses the existing backend period calculation without writing grades. Manual class unlock is persistent, ownership-checked, idempotent and audited.
- Migration 018 adds nullable Student prefix/suffix and the authoritative school-year setting; 019 stores class watchlist unlocks. Historical class create/edit/enrollment/invitation and historical-only roster profile changes are guarded.
- Migration 020 adds canonical person links, normalized period-category memberships, normalized current grade/remedial facts, and deterministic attendance-session links while retaining compatibility caches and historical snapshots.
- Migration 021 is the ordered corrective migration for 020's overescaped decimal regex. It repairs `normalization_jsonb_number` and regenerates normalized grade/remedial facts from preserved legacy JSON. The focused decimal assertions and the final disposable PostgreSQL/live-browser gate pass.
- Migration 022 moves active Faculty grading-period configuration create/update/delete to `grading_category_period_memberships`, derives ownership through `grading_categories`, and keeps `grading_category_periods` as a guarded one-way compatibility projection without circular triggers.
- Migrations 023-025 complete the ID-002 canonical structured-name write path. Canonical person updates synchronize compatibility fields in one transaction, preserve non-empty conflicting legacy values for reconciliation, backfill empty copies, and allow only deterministic initial Student enrichment. Role-specific authoritative names are not an approved alternative.
- Migration 026 applies the existing attendance-session consistency function to enrollment changes as well as inserts/session-field updates, preventing a cross-class reassignment from bypassing validation.
- Migration 027 records `initial_trigger_operator = GTE` in the existing `retention_policy` configuration. `retention_policy.retention_threshold` remains the sole active course-grade trigger value at `2.50`; the older `initial_trigger_grade` field is retained compatibility metadata and is not a second consumer authority. Active computation compares the authoritative GWA at stored precision: values below 2.50 are `active`, values at or above 2.50 are `remedial`, and missing/incomplete values remain unresolved. The remedial-exam percentage threshold remains a separate unanswered policy item.
- Password-recovery API/database coverage exercises generic responses, Mailpit delivery, opaque links, expiry, replay, password-policy rejection, and successful token consumption. The two recovery-page presentation files remain separately owned until their handoff.

## PDF and visual evidence

- The nine-page reference was available at `C:\Users\decha\Downloads\UI Changes.pdf`; `pdfinfo` confirmed nine letter-sized pages and all nine pages were rendered and visually inspected.
- Rendered page evidence is retained under `tmp/pdfs/ui-changes-1.png` through `tmp/pdfs/ui-changes-9.png` for this working batch. These are reference screenshots, not browser acceptance evidence.
- The PDF/source checklist covers Grade Computation single/matrix, optional overlapping deadlines, grading weights, class-wide watchlist unlock, structured invitation/email fields, retention progression, Attendance Monitoring/start-session, Secretary toggle/history, and current-year class restrictions. Browser screenshots at matching desktop and narrow/mobile sizes remain required for final UI acceptance.
- Stable source-versus-destination acceptance is documented in `docs/ui-visual-parity-acceptance.md`. The final isolated seeded matrix contains 156 captures (39 active route states × 2 sides × desktop/mobile), with zero capture errors and zero route mismatches. The paired source/destination PNGs are under `C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\matched-source-destination-stable`; safe dialog states are under the `dialogs` directory. A disposable live fixture subsequently enabled the two previously disabled dialog states; four destination follow-up captures (Faculty correction and Secretary confirmation at desktop/mobile) are under the `dialog-follow-up` directory. The comparison records current-contract, authoritative-data, Google configuration, and camera/provider deviations rather than treating them as pixel parity.

## Validation

- Local TypeScript/Vite build passed after profile changes (2,401 modules). Existing bundle-size/dynamic-import warnings remain.
- All 51 frontend contract/unit checks passed again after the profile changes. `git diff --check` passed.
- PHP syntax, backend contract, and documentation checks pass in the final aggregate gate.
- The pre-fix integrated tree passed `scripts/check.ps1`, including the production frontend build, PHP checks, documentation contract, backend contracts, and 124 mocked UI E2E tests. Its separate pre-022-025 PostgreSQL/live run passed only 4/8 live workflows; those results remain historical evidence for that earlier tree and are not used for current acceptance.
- Historical integrated-tree PostgreSQL/live evidence is the kept disposable project `dentisys-final-0926b`, run with backend `18082`, frontend `15175`, and Mailpit `18027`. `scripts/check-postgres.ps1 -KeepStack -ComposeProject dentisys-final-0926b ...` exited 0 for migrations 001-025/idempotency, seed/sequence checks, backup/restore, UI migration/API tests, full PostgreSQL integration, smoke/log checks, and all 8/8 live Playwright workflows. It used offline Google configuration and is not evidence for current migrations 026-027 or real Google-provider/camera acceptance.
- `scripts/migrate.ps1` applied additive migrations 018-027 to the existing development volume. Migration 020/021 preserve and regenerate 25 normalized grade-breakdown rows and 1 remedial-state row; 027 changes only retention-policy configuration and does not bulk-recompute historical outcomes. No development volume was reset or deleted. The updated normal stack passed smoke checks and rollback-only canonical identity/grading probes left no persistent fixture data.
- The disposable browser gate sets `GOOGLE_CLIENT_ID=''` so offline validation does not depend on Google GIS network/provider behavior. Real Google provider and camera acceptance remain separate manual checks.
- Focused disposable API/database test at `tests/database/ui_migration_test.php` passes. It includes compound-name round-trips, null clearing, validation, year restrictions, ownership, unlock reload/idempotency and audit. `tests/database/postgres_integration_test.php` retains the decimal/backfill assertions and now exercises canonical period create/update/delete, derived ownership, null rejection, rollback, onboarding person reuse, cross-role profile consistency, and mismatched identity/biometric denial; its earlier polluted-stack attempt is not counted as a final pass.
- Independent review found that migration 020's decimal parser returned NULL for `0.9` and `22.5`. Migration 021 is applied to the preserved development database; the direct parser probe, rollback-only trigger probe, strengthened decimal/backfill regression, and complete final gates all pass.
- Auto Review was previously unavailable under sandbox restrictions and the dirty-tree bundle exceeded its input limit because preserved `tmp/` evidence was untracked. The committed change is reviewed separately after commit; no prior historical review is relabeled as current.
- September 26 continuation: the stable source/destination route matrix remains accepted without rerun. The remaining disabled Faculty and Secretary dialog states were enabled with a disposable API/DB fixture and captured at both required viewports. Canonical period/identity code and focused behavior checks are integrated. Docker recovered through ordinary non-destructive use; the current 027 disposable PostgreSQL/live gate and repository gate are green.

## Remaining work — no full-completion claim

1. Full whole-schema 3NF remains unclaimed: compatibility storage is still required for attendance/incomplete fields, remedial policy-opaque fields, and other response fields whose relational contract is not approved. Period configuration and structured identity now have canonical active writers.
2. The Owner-approved provisional course-grade trigger is implemented. Remaining BUCDM decisions include the remedial-exam percentage boundary/cost-recovery rule, scope and recording authority for clinic/revalida/pre-board stages, and any required date/threshold boundaries. Do not manufacture historical attempts.
3. ID-002 resolves identity-conflict precedence: canonical composed person names win; non-empty legacy conflicts are preserved and fail closed. `title` semantics remain unchanged until an actual ambiguous stored value or concrete UI requirement is supplied.

## Next action

Owner reiterated UI-first sequencing on September 25. The decimal correction, canonical-consumer wiring, stable route/dialog comparison, focused functional/database evidence, final disposable PostgreSQL/live gate, and repository gate are complete for this continuation. Do not reinterpret mocked or offline Google results as live provider evidence.

The disposable integration and final validation stacks are intentionally kept for evidence and focused follow-up. Do not reset the existing development volume. Pending review-export, BUCDM-rule, camera, and Google-provider questions must not be treated as answered.
