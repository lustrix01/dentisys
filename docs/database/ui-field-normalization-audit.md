# UI data normalization audit - preparation

Status: targeted implementation and dependency audit; not a completed whole-database 3NF conversion. Migrations 018-029 are additive, with 020 and corrective 021 plus the approved remedial-attempt migration 029 applied to the existing development volume. Canonical consumer wiring for Admin, Secretary, onboarding/invitations, biometric identity, Student authentication, profiles, reports, grading-period configuration, and approved academic projections is implemented and covered by focused contracts. Browser screenshot comparison and selected manual/provider checks remain separate.

## Existing storage to reuse

| UI concept | Existing storage | Key / relationship | Phase 2 check |
|---|---|---|---|
| Account/Faculty five-part name | Migration 017 adds `name_prefix`, `first_name`, `middle_name`, `last_name`, `name_suffix` to `user_accounts` | `user_id`; unique login email | Reuse fields. Reconcile legacy `display_name` and clarify `title` versus name prefix; never parse ambiguous names automatically. |
| Student name | `students.name_prefix`, `first_name`, `middle_name`, `last_name`, `name_suffix` | `student_id`; unique student number; canonical `student_account_user_id` added by 005 | Migration 018 adds optional affixes without parsing old data. API/UI round-trip all five parts. |
| Secretary identity | Canonical Student/account link plus legacy Secretary link | `students.student_account_user_id`; legacy `students.user_id` | Migration 005 intentionally preserves the legacy link for reconciliation. Inspect both and their active consumers; do not collapse them blindly or duplicate people by role. |
| Course identity | `courses` | `course_id`; unique course code | Keep catalog attributes separate from offering/section attributes. |
| Section/offering/year/rooms | `class_sections` | `cs_id`, course/instructor/secretary foreign keys | Audit repeated term facts and schedule representation. Room labels alone do not establish a separate room entity. |
| Roster membership | `enrollments` | unique `(student_id, cs_id)` | Preserve historical scores/attendance when membership changes. |
| Activity due date | `assessments.due_date DATE NULL` | `assessment_id`, class-section FK | Null deadlines supported. Owner explicitly allows all date overlaps; no uniqueness constraint. |
| Matrix and single-activity scores | `assessment_scores` | unique `(assessment_id, student_id)` | Two UI views must share rows; do not create a separate matrix table. |
| Grade configuration | `grading_configs`, `grading_categories`, `grading_category_periods` (014), ranges/source kind (015) | unique Faculty/course/semester/year configuration | Preserve saved category IDs and period memberships; inspect legacy JSON compatibility and the category-to-config dependency before normalization. |
| Retention/remedial | Enrollment state and JSON in baseline, later migrations and APIs | enrollment FK relationships | Determine individual attempts, policy version, stage, and decision dependencies from approved contracts; don't normalize guessed policy. |
| Attendance | `attendance_sessions` from 009, records and later migrations | session/enrollment relationships | Separate current session facts from immutable historical snapshots; preserve correction/audit provenance. |
| Watchlist manual unlock | `class_watchlist_unlocks` (019) | `cs_id` primary key and FK; actor FK | Owner approved class-wide scope. One row per class; actor/time and audit retained; no grade mutation. |

## Required proof before claiming 3NF

For every affected relation record its attributes, candidate keys, functional dependencies, and decomposition. Verify that each nontrivial dependency has a superkey determinant or a prime dependent attribute. Demonstrate lossless joins and identify any dependency that needs enforcement across relations. Repeated display values, immutable historical snapshots, and JSON payloads require semantic inspection rather than automatic removal.

Complete the audit against all ordered migrations and active writes, not only migration 001. Map every new UI field, including optionality and multiplicity. Maintain a backfill/reconciliation plan and compatibility period for old consumers. Validate constraints and data preservation on the separate disposable stack before development-data application.

## Unresolved decisions

- Exact policy/version mapping for displayed retention progression.
- Whether existing account `title` stores a prefix, a professional designation, or another profile attribute in each caller; inspect before consolidation.

These items do not block copying their visual controls. They do block inventing authoritative schema/behavior for the unresolved meaning.

## Dependency assessment for the changed relations

| Relation | Candidate key / dependency | Assessment |
|---|---|---|
| `students` | `student_id` and `student_number` determine five name parts and profile facts | Affixes are atomic optional attributes, with no new partial/transitive dependency. Existing account links remain unchanged. |
| `class_watchlist_unlocks` | `cs_id -> unlocked_by, unlocked_at` | 3NF: the only nontrivial determinant is the primary key. Actor details remain in `user_accounts`, class details in `class_sections`. FK joins are lossless for the optional unlock relation. |
| `system_settings` | `setting_key -> setting_value` | Current school year stored once as a JSON string, not copied into each UI control. Class school year remains a historical fact. |
| `assessment_scores` | `(assessment_id, student_id) -> score, submitted_at, remarks` | Existing unique pair serves both single and matrix views. No separate matrix relation needed. |
| `enrollments` | `(student_id, cs_id) -> membership and recorded grade facts` | Existing membership relation retained; grade breakdown and remedial JSON still require semantic decomposition, especially repeated student/class/subject labels. |
| `grading_category_periods` | `category_period_id`, `(config_id, category_id, grading_period)` | Category belongs to a config, so repeated config ownership and compatibility names/weights require additional decomposition/constraint work. Not claimed 3NF. |
| `attendance_records` | `record_id`, `(enrollment_id, session_date, session_code)` | Newer session FK can duplicate date/code facts. Legacy/manual rows and historical snapshots require an explicit compatibility migration before removal. |

No existing rows, keys, or name fields are removed. Existing affix values default to null. Structured account names are synchronized when roster/profile writes occur; legacy `display_name` remains a compatibility cache, not independently editable for a new name. Existing account/Student duplication still requires a measured canonical-person migration if strict whole-schema 3NF is required. That migration is not implemented here.

## Migration 020 implementation

Migration `020_3nf_identity_academic_facts.sql` adds the first relational decomposition beyond names and watchlist unlocks:

| Relation | Candidate key / functional dependency | Backfill and compatibility contract |
|---|---|---|
| `person_identities` | `person_id ->` five structured name parts and preserved ambiguous display value | One deterministic row per existing account, then one per unlinked Student. Linked Student/account rows share the account's person key. `user_accounts.person_id` and `students.person_id` are controlled foreign-key links; legacy `display_name` is retained and never parsed. Database triggers keep structured writes synchronized. |
| `grading_category_period_memberships` | `category_period_id -> category_id, grading_period, name, weight, sort_order, source_kind`; `(category_id, grading_period)` is also unique | Backfilled one-for-one from `grading_category_periods`. The old `config_id` is functionally determined by `category_id` through `grading_categories`, so it remains only in the compatibility cache. A trigger mirrors existing API writes into the normalized relation. |
| `enrollment_grade_breakdowns` / `_categories` | `enrollment_id ->` current calculation summary; `(enrollment_id, grading_period, category_key) ->` one atomic category fact | Existing JSON breakdowns are parsed deterministically into scalar summary/category rows. A trigger refreshes the current normalized projection whenever the legacy JSON or final summary changes. The JSON column remains an immutable-compatible response cache until readers migrate. |
| `enrollment_remedial_states` | `enrollment_id ->` current remedial status, score, grade, date, and notes | Known fields from the current remedial object are copied without inventing attempts or BUCDM stages. A trigger keeps the current normalized state synchronized; the existing JSON remains for compatibility and unknown fields. Historical audit events remain untouched. |
| `attendance_records.attendance_session_id` | `attendance_session_id -> session date/code` for linked rows | Migration backfills only unique `(class, date, code)` matches. A trigger rejects future linked rows whose legacy snapshot disagrees with the authoritative session. Unlinked historical rows retain their immutable date/code snapshot. |

The decompositions are lossless for their controlled relationships: each child row joins to its parent by a declared foreign key, and compatibility projections retain original values. Candidate-key constraints enforce the nontrivial dependencies that can be proven from current semantics. The migration is additive, ordered, rerunnable through the migration ledger, and does not delete or rewrite historical records.

The remaining whole-schema work is intentionally explicit: later BUCDM stages and cost-recovery completion remain unresolved; account/Student name conflicts preserve non-empty legacy values for reconciliation; and old JSON/session snapshot columns cannot be retired until all active readers and writers use the normalized relations. The approved first/second course-remedial attempt relation is implemented, but ambiguous legacy JSON is not assigned attempt numbers. The repository must not claim strict whole-schema 3NF until those compatibility consumers and policy decisions are closed.

## Consumer audit and bounded wiring — 2026-09-25

This pass maps the active consumers that can safely use migration 020's
relations without inventing policy. It does not claim whole-schema 3NF. The
decimal conversion defect in `normalization_jsonb_number` is corrected by
ordered migration 021, which backfills from preserved legacy JSON; the focused
decimal regression and final disposable gate are the acceptance checks for it.

### Canonical consumer mappings

| Concern | Canonical reads now used | Writes and consistency boundary | Compatibility retained |
|---|---|---|---|
| Person identity | `StudentAcademicController` profile reads, Faculty student/retention/report/profile reads, and `student_auth.php` use `person_identities` through `person_id`. Student authentication additionally requires the account and Student rows to share the same canonical person. | `account_identity.php` and existing structured Student/account writes continue writing the role rows. Migration 020's database triggers create/update the shared `person_identities` row in the same transaction; the application no longer treats `display_name` as an independently editable name when structured fields are supplied. | `user_accounts`/`students` structured columns remain because role-specific consumers and existing write contracts still use them. `display_name` remains an unparsed compatibility snapshot. |
| Grading category-period membership | Faculty grading snapshots, period recomputation, assessment-category validation, grade computation joins, watchlist-period checks, and the existing-membership lookup read `grading_category_period_memberships`, joined to `grading_categories` to derive `config_id`. | Configuration saves now insert/update/delete the canonical memberships. Migration 022 maintains `grading_category_periods` as a guarded one-way compatibility projection without circular triggers; direct legacy writes are rejected. | `grading_category_periods` remains as a synchronized compatibility representation until all external consumers are retired; it is not an independent configuration source. |
| Current grade facts | Student academic rows and Faculty student/retention/report/grade-computation reads use `enrollment_grade_breakdowns` for final percentage, GWA, and retention state, with a legacy-column fallback only for compatibility with a missing projection. | Grade recomputation continues to update `enrollments.final_percentage`, `final_gwa`, `retention_state`, and `grade_components_json`; migration 020's trigger refreshes the normalized scalar/category projection in the same transaction. | Full `grade_components_json` remains because active responses need `calculationMode`, term ratios, period status, incomplete reasons, attendance sessions/date ranges, and other fields not represented by the current normalized projection. The JSON is therefore a controlled response/cache compatibility column, not an independently maintained normalized source. |
| Remedial state and approved attempts | Faculty/Student retention consumers use `enrollment_remedial_attempts` for the approved first/second course-remedial progression; `enrollment_remedial_states` remains a known-field projection of legacy current-state JSON. | Canonical Faculty writes lock the enrollment and attempt rows, derive Pass/Fail at 50%, enforce order/ownership/uniqueness, and never modify original grades. Legacy remedial JSON remains preserved and synchronized only through the existing compatibility path. | `remedial_state_json` is retained for policy-opaque override metadata, counters and unknown fields. Ambiguous legacy rows are exposed as `legacy_unclassified` and require reconciliation; no attempt history is inferred. |

### Exact files changed in this pass

- `backend/app/account_identity.php`: canonical person-identity aliases for profile consumers and a locked lookup that sees the linked `person_identities` row.
- `backend/app/student_auth.php`: canonical authentication join requires `students.person_id = user_accounts.person_id` and an existing `person_identities` row.
- `backend/controllers/StudentAcademicController.php`: canonical person-name reads and normalized scalar grade/retention reads; full JSON remains for the unchanged API contract.
- `backend/controllers/FacultyController.php`: canonical person-name/scalar grade reads; canonical period-membership reads for snapshots, validation, computation, and watchlist checks; compatibility membership writes remain on `grading_category_periods`.
- `database/migrations/021_fix_normalization_decimal_backfill.sql`: replaces the overescaped decimal regex and regenerates normalized grade/remedial facts from the preserved JSON source.
- `tests/database/ui_migration_test.php`: asserts decimal parser behavior plus ratio, weight, contribution, threshold, and remedial grade precision.

### Remaining blockers and audit limits

1. Migration 021 is applied to the development database and directly verified; the disposable migration/backfill regression and full PostgreSQL gate pass on the final tree.
2. Full grade-breakdown JSON cannot be retired until its period/attendance/incomplete metadata has an approved relational representation and all readers use it.
3. The approved first/second course-remedial attempts and 50% stage transitions are implemented in migration 029. Remaining BUCDM progression, cost-recovery completion, policy versioning, and later authoritative stages still require an Owner decision; no application consumer invents them.
4. The completed consumer pass covers Admin, Secretary, invitation/onboarding, biometric, Student authentication, profile, report, and approved normalized academic reads. Remaining legacy access is limited to compatibility writes/fallback response fields whose full relational contract is not yet approved; migration 020/021 keeps those copies transactionally synchronized and preserves unknown JSON fields.
5. Canonical-person conflict reconciliation for ambiguous legacy account/Student names still needs an approved precedence rule. The current joins are fail-closed for authentication and activation and use canonical aliases for display; no automatic winner is invented.
