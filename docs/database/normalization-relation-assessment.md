# DentiSys relation-by-relation normalization assessment

**Date:** 2026-09-25
**Scope owner:** normalization assessment only
**Status:** evidence-based assessment; this document does not claim whole-schema 3NF

## Current handoff — 2026-09-26

The normal development database is now at migration 028 after a verified
pre-migration dump and additive application of 022-028. Migrations 026-028 do
not alter preserved grade facts: 026 tightens attendance-update validation and
027 records compatibility metadata and 028 establishes the canonical
`retention_policy.retention_threshold` value in existing configuration.
The kept disposable `dentisys-final-0926b` run is separate historical evidence:
it passed the ledger through 025 and the post-change PostgreSQL/live gates, but
does not cover the current 026-028 tree. Earlier Docker failures and the
pre-022-025 4/8 live result are historical, not current status. The focused
normal-stack probes verified canonical identity synchronization and grading
membership projection inside rolled-back transactions.

This assessment covers every application relation present in the active PostgreSQL
schema after migrations 001-028. It is a read-only classification of the current
tree; it does not change runtime code, migrations, tests, frontend files, or any
other document. `_schema_migrations` is included
only as migration-control metadata, not as product data in the 3NF scope.

The assessment uses declared keys and constraints first. A JSON column, repeated
display value, or compatibility copy is not called a 3NF violation unless an
actual dependency is demonstrated and the copied value is supposed to be the
same current fact. Historical labels, audit snapshots, and delivery snapshots
are intentionally not reconstructed from current master data.

## Classification

- **Normalized source record:** the relation is the authoritative current record
  for the facts it owns.
- **Derived current projection:** the relation is a scalar or relational view of
  another current source and must not silently become an independent writer.
- **Compatibility representation:** an older API/storage shape retained while
  readers and writers migrate. It may be an alternate source during the
  compatibility period; that is not proof of a 3NF violation by itself.
- **Historical snapshot:** values intentionally captured as they were at an
  event or delivery time. Current-master joins must not overwrite them.

## Evidence inspected

Read-only repository inspection covered:

- `spec.md`, especially ID-001, ID-002, REG-001 through REG-007, GRD-001,
  GRD-002, ATT-001 through ATT-006, BIO-001 through BIO-010, and the 9B UI and
  normalized-data amendment.
- Ordered active migrations `database/migrations/001_baseline_schema.sql`
  through `028_authoritative_course_grade_threshold.sql`, with particular
  attention to 005, 008-016, 017-028.
- Current active consumers under `backend/app`, `backend/controllers`, and
  `backend/routes/api.php`, including `AdminController.php`,
  `FacultyController.php`, `SecretaryController.php`, `StudentAcademicController.php`,
  `StudentAuthController.php`, `StudentBiometricController.php`,
  `FacultyInvitationController.php`, `GoogleAuthController.php`,
  `account_identity.php`, `student_auth.php`, `student_biometrics.php`,
  `attendance_sessions.php`, `auth.php`, `auth_runtime.php`, `mfa_runtime.php`,
  `audit.php`, and `notifications.php`.
- The existing `docs/database/ui-field-normalization-audit.md`, read as prior
  audit context and left unmodified.

A read-only `information_schema` inventory of the active database returned these
26 application relations:

```text
assessment_scores                    assessments
attendance_records                   attendance_sessions
audit_events                         auth_sessions
biometric_profiles                   class_sections
class_watchlist_unlocks              courses
email_outbox                         enrollment_grade_breakdown_categories
enrollment_grade_breakdowns          enrollment_remedial_states
enrollments                           grading_categories
grading_category_period_memberships   grading_category_periods
grading_configs                       notifications
person_identities                     role_permissions
security_tokens                       students
system_settings                       user_accounts
```

The inventory showed migrations 021-025's normalized relations, identity
foreign keys, attendance-session reference, table-level uniqueness, and the
canonical period/identity write guards. Migration inspection supplied the
conditional indexes and synchronization-trigger definitions; the disposable
PostgreSQL runs and decimal trigger probe supplied their applied/runtime
evidence. Evidence below is labeled by the tree and change set it actually
covers.

## Active-consumer summary

The current application is not uniformly canonical yet:

| Area | Current active use | Assessment |
|---|---|---|
| Person names and Student authentication | `account_identity.php`, `student_auth.php`, `StudentAcademicController.php`, `AdminController.php`, `SecretaryController.php`, `StudentAuthController.php`, `FacultyInvitationController.php`, and `student_biometrics.php` use `person_identities` for approved identity reads and fail closed where the account/role/person link is inconsistent. | ID-002's composed structured name rule is the canonical write contract. `account_identity_sync_canonical_person()` updates the canonical row and compatibility copies in one transaction. Non-empty legacy mismatches are preserved in `legacy_conflicts_json` and rejected for reconciliation; null/empty copies may be filled deterministically. |
| Period category membership | Faculty snapshots, validation, computation, watchlist checks, and configuration save/delete paths use `grading_category_period_memberships`. Ownership is derived by joining `category_id` to `grading_categories`. | Migration 022 makes the canonical relation authoritative and projects one-way to `grading_category_periods`; direct legacy writes are rejected while nested projection writes are allowed. |
| Current grade facts | Student Academic and selected Faculty reads use `enrollment_grade_breakdowns` and retain the legacy fallback. Grade writes still update `enrollments` scalar fields and `grade_components_json`; migration 020/021 refreshes the normalized projection. | Projection is synchronized and decimal-safe, but the full JSON contract is not represented relationally. |
| Remedial state | Current API consumers still need the full `remedial_state_json` payload. `enrollment_remedial_states` contains only known current fields. | Safe scalar projection only; no attempt history or BUCDM stage is inferred. |
| Attendance | Session-aware consumers use `attendance_sessions` and `attendance_session_id`; `attendance_records` retains date/code/time values. | Linked rows have an authoritative session relationship; historical/unlinked rows retain snapshots. |
| Invitations and onboarding | Faculty, Secretary, Student, and Google invitation flows use `security_tokens` plus role-specific account/Student rows and canonical person joins where the flow represents the same person. | Token identity is normalized by token keys; ID-002 resolves shared-name conflict precedence to the composed canonical person, while unsafe non-empty legacy mismatches are preserved and rejected rather than silently overwritten. |
| Biometric attendance | Biometric controllers use `biometric_profiles`, challenge tokens, sessions, and attendance records. | Current relation is one profile per Student; provider/camera acceptance is separate from this schema assessment. |
| Audit, email, notifications, settings | These consumers use their respective append-only, delivery, recipient, or key-value relations. | Snapshot and message payloads are intentionally not current-master duplicates. |

## Relation inventory

For each relation, `K -> all non-key attributes` means the candidate key
determines the row's remaining attributes. Conditional keys apply only to rows
where the partial unique predicate is true.

### Identity and account relations

#### `person_identities`

- **Classification:** normalized source record for shared structured identity;
  `legacy_display_name` is a preserved ambiguous-name snapshot.
- **Candidate keys and FDs:** `person_id ->` all five name parts, the preserved
  display value, and timestamps. No name part is a determinant. No uniqueness
  of a human-readable name is assumed.
- **3NF result:** no demonstrated violation. `legacy_display_name` does not
  functionally determine the structured name and is not used as a key.
- **Required implementation:** keep one explicit canonical person link for
  each account/Student that is known to be the same person. Never parse or
  overwrite an ambiguous legacy display name automatically. ID-002 now makes
  this the sole authoritative structured-name source; non-empty conflicting
  compatibility values remain preserved for reconciliation instead of being
  silently selected or overwritten.

#### `user_accounts`

- **Classification:** normalized account/auth source with compatibility name
  fields and `display_name`; `title` semantics remain unresolved.
- **Candidate keys and FDs:** `user_id ->` all account attributes;
  `login_email ->` all account attributes by the unique constraint;
  conditional non-null `google_subject -> user_id` and the account row; for
  linked rows, conditional non-null `person_id -> user_id` by the partial unique
  index. Role, display name, and title are not candidate keys.
- **3NF result:** no relation-local 3NF violation is demonstrated. The
  structured name fields are a controlled compatibility copy of
  `person_identities`, not proof that both are independent canonical sources.
- **Required implementation:** retain account-specific status, role,
  credentials, theme, provider binding, and approval fields here. Profile and
  invitation identity reads now join the canonical person; the account fields
  remain controlled compatibility/API copies. Keep `title` unchanged until an
  actual stored-value/UI requirement clarifies whether it is a person honorific
  or an account/profile designation.

#### `students`

- **Classification:** normalized Student/academic identity source with legacy
  `user_id`, canonical `student_account_user_id`, and compatibility structured
  name fields linked to `person_identities`.
- **Candidate keys and FDs:** `student_id ->` all Student attributes;
  `student_number ->` all attributes; conditional non-null unique
  `student_account_user_id`, `user_id`, and `person_id` each identify at most
  one Student row. Name parts are atomic attributes; a name is not a key.
- **3NF result:** no relation-local violation is demonstrated. Because the
  link keys are unique, a linked `person_id` determines the Student row; the
  repeated role-row name fields are a controlled compatibility copy. The old
  Secretary link is not assumed to be interchangeable with the canonical
  Student account link.
- **Required implementation:** canonical person reads and the composed-name
  write path are used across Admin, Secretary, onboarding, biometric, and
  shared profile/session paths. Preserve both legacy links until every existing
  Secretary/Student relationship is reconciled; do not collapse them by role
  assumption. Structured Student initialization may enrich an otherwise-empty
  canonical person, but later non-empty role conflicts fail closed and remain
  preserved.

### Authorization, token, and history relations

#### `role_permissions`

- **Classification:** normalized policy source.
- **Candidate keys and FDs:** `rp_id ->` all attributes;
  `(role_name, resource, action, scope) ->` all attributes by the unique
  constraint.
- **3NF result:** no demonstrated violation. Role, resource, action, and scope
  are the policy tuple; no display labels are stored as determinants.
- **Required implementation:** retain the composite uniqueness and keep role
  authorization independent of external identity providers. No decomposition is
  justified by current consumers.

#### `auth_sessions`

- **Classification:** normalized session-lifecycle source; token-version and
  authentication-source values are session facts/snapshots.
- **Candidate keys and FDs:** `session_id ->` all attributes;
  `session_uuid ->` all attributes. `user_id` identifies an owner, not a
  session.
- **3NF result:** no demonstrated violation. `issued_token_version` and
  `authentication_source` describe this session and are not derived current
  account values.
- **Required implementation:** preserve session history and migrate only
  display/identity joins that need canonical person names. Do not replace
  session-source history with the account's current provider state.

#### `security_tokens`

- **Classification:** normalized token-lifecycle source with purpose-specific
  nullable attributes and an extensible metadata payload.
- **Candidate keys and FDs:** `token_id ->` all attributes; conditional
  non-null `token_digest ->` the token row; conditional non-null
  `parent_token_id ->` the child row. Purpose-specific partial indexes also
  identify live invitation rows under their predicates.
- **3NF result:** no demonstrated violation. Nullable purpose-specific columns
  do not by themselves establish a dependency violation; the token ID owns
  the lifecycle row. `metadata_json` is not decomposed without a declared
  token-purpose contract.
- **Required implementation:** keep purpose checks, partial uniqueness, and
  foreign keys. If a future approved purpose gains independently queried facts,
  add a purpose-specific relation and backfill; do not discard existing token
  lineage or metadata.

#### `audit_events`

- **Classification:** append-only historical snapshot and tamper-evident audit
  source.
- **Candidate keys and FDs:** `event_id ->` all attributes;
  `event_uuid ->` all attributes; `sequence_number ->` all attributes.
- **3NF result:** no demonstrated violation. `actor_username`, `actor_role`,
  `actor_display_name`, `before_state_json`, and `after_state_json` are
  historical/event snapshots. `actor_user_id` and `session_id` are references,
  not instructions to rewrite the captured event.
- **Required implementation:** preserve append-only behavior and MAC fields.
  Keep polymorphic `target_type`/`target_id` unless a concrete target contract
  is approved; do not normalize away the evidence needed to explain past events.

### Catalog, offering, and membership relations

#### `courses`

- **Classification:** normalized course-catalog source with legacy
  `grading_config` compatibility configuration.
- **Candidate keys and FDs:** `course_id ->` all attributes;
  `course_code ->` all attributes. No dependency from `name`, units, or a
  semester label is declared.
- **3NF result:** no demonstrated relation-local 3NF violation. The JSON
  configuration may contain a legacy repeated configuration shape, but current
  inspection does not prove a specific non-key determinant inside this relation.
- **Required implementation:** use `grading_configs`, `grading_categories`,
  and period memberships for authoritative saved grading configuration. Retain
  `grading_config` while fallback readers/writers exist; retire it only after
  parity evidence and explicit preservation approval.

#### `class_sections`

- **Classification:** normalized offering/section source.
- **Candidate keys and FDs:** `cs_id ->` all attributes. No business key is
  declared for course, instructor, semester, school year, or section name, so
  none is assumed.
- **3NF result:** no demonstrated violation. Course, instructor, secretary,
  rooms, term labels, and status are facts of the offering row. Repeated labels
  in reports are joins, not stored dependencies here.
- **Required implementation:** preserve distinct course identity, term identity,
  lecture room, laboratory room, and schedule concepts. Do not add a Room or
  schedule relation without a real multiplicity/ownership requirement.

#### `enrollments`

- **Classification:** normalized Student-to-offering membership source with
  current academic compatibility fields and JSON payloads.
- **Candidate keys and FDs:** `enrollment_id ->` all attributes;
  `(student_id, cs_id) ->` all attributes by the unique membership key.
  Student and offering labels are not stored as enrollment attributes.
- **3NF result:** no demonstrated relation-local violation. `grade_components_json`,
  `remedial_state_json`, `final_percentage`, `final_gwa`, and `retention_state`
  are compatibility/current-state fields with synchronized projections, not
  proof that every JSON member is a separate relation.
- **Required implementation:** keep the membership source and migrate approved
  grade/remedial consumers to their normalized projections. Preserve JSON until
  every required response field has a relational owner and unknown/policy fields
  have an approved contract. Do not invent remedial attempts.

#### `class_watchlist_unlocks`

- **Classification:** normalized current class-level override; audit events are
  the historical unlock trail.
- **Candidate keys and FDs:** `cs_id -> unlocked_by, unlocked_at`.
- **3NF result:** no demonstrated violation. Class and actor details remain in
  their parent relations; the row does not copy them.
- **Required implementation:** retain one current class unlock row and the audit
  event history. Do not make the unlock a per-Student grade mutation.

### Grading and academic-fact relations

#### `grading_configs`

- **Classification:** normalized authoritative saved configuration source.
- **Candidate keys and FDs:** `config_id ->` all attributes;
  `(faculty_user_id, course_id, semester, school_year) ->` all attributes by
  the offering uniqueness constraint.
- **3NF result:** no demonstrated violation. Term weights, date ranges, schema
  mode, version, and updater are facts of this configuration row.
- **Required implementation:** keep explicit saved-vs-unsaved behavior and
  preserve raw scores when recomputing. If immutable configuration history is
  later required, add a version/history relation rather than treating the
  mutable row as historical evidence.

#### `grading_categories`

- **Classification:** normalized category definition source under a saved
  configuration.
- **Candidate keys and FDs:** `category_id ->` all attributes;
  `(config_id, normalized grading_period, normalized name) ->` all attributes
  by the expression unique index. `config_id` alone and `name` alone are not
  keys.
- **3NF result:** no demonstrated violation. Category ownership is represented
  by `config_id`; assessment references use `category_id`.
- **Required implementation:** preserve category IDs and assessment references.
  Use the period-membership relation for period-specific facts rather than
  copying them into assessment scores.

#### `grading_category_periods`

- **Classification:** legacy compatibility projection for the period-membership
  API/storage shape; it contains `config_id` because that is the old storage
  shape, not because it owns current configuration.
- **Candidate keys and FDs:** declared `category_period_id ->` all attributes;
  `(config_id, category_id, grading_period) ->` all attributes; the expression
  `(config_id, grading_period, normalized name) ->` all attributes. Semantically,
  `category_id -> config_id` through `grading_categories`, but the old relation
  stores that derived ownership explicitly.
- **3NF result:** this is the concrete remaining normalization issue in the
  grading configuration path: if category ownership is treated as an actual
  dependency, `category_id -> config_id` is a non-key dependency in the old
  storage shape for a category that can appear in more than one period. The
  dependency is why migration 020's canonical relation omits `config_id` and
  enforces `(category_id, grading_period)` instead.
- **Required implementation:** migration 022 completed the active writer move.
  Canonical membership insert/update/delete projects to this relation through
  one one-way trigger, deriving `config_id` through `grading_categories`.
  Direct legacy writes are guarded and fail; the relation remains preserved for
  legacy reads/recovery until a separate additive retirement decision. Do not
  drop it in this phase.

#### `grading_category_period_memberships`

- **Classification:** normalized current period-membership source; it is the
  authoritative write/read relation while the legacy table is retained as a
  compatibility projection.
- **Candidate keys and FDs:** `category_period_id ->` all attributes;
  `(category_id, grading_period) ->` all attributes by the unique constraint.
  Category ownership is obtained by joining `category_id` to
  `grading_categories`, not by copying `config_id`.
- **3NF result:** no demonstrated violation. Name, weight, sort order, and
  source kind are period-membership facts; `category_id` and period jointly
  identify one membership.
- **Required implementation:** direct configuration create/update/delete now
  target this relation and preserve `category_period_id` values. Ownership is
  derived through `grading_categories`; the one-way projection trigger updates
  the legacy row without a circular trigger. Focused integration assertions
  cover ownership, null rejection, updates, deletes, and transaction rollback.
  Synchronized copies remain compatibility evidence only and are not treated
  as a second canonical source.

#### `assessments`

- **Classification:** normalized assessment-definition source, with transmutation
  defaults stored as an intentional assessment-time snapshot.
- **Candidate keys and FDs:** `assessment_id ->` all attributes. No uniqueness
  of `(cs_id, title)` is assumed; the specification permits repeated/overlapping
  due dates and titles are not a key.
- **3NF result:** no demonstrated violation. `transmutation_minimum_percentage`
  and maximum are snapshots of the defaults/customization at assessment time,
  not current settings to be recomputed from `system_settings`.
- **Required implementation:** preserve raw assessment facts and category IDs.
  If approved attendance-session identity is needed, add an additive nullable
  session FK and backfill only unambiguous `(class, date, code)` matches;
  retain existing date/code values as snapshots until historical semantics are
  closed.

#### `assessment_scores`

- **Classification:** normalized authoritative score source shared by Single
  Activity and Full Matrix views.
- **Candidate keys and FDs:** `score_id ->` all attributes;
  `(assessment_id, student_id) -> score, submitted_at, remarks`.
- **3NF result:** no demonstrated violation. Student and assessment attributes
  are reached through foreign keys; no student name, class label, or assessment
  title is copied into the score row.
- **Required implementation:** keep one score relation for both UI views,
  preserve raw points, and do not create a second matrix table.

#### `enrollment_grade_breakdowns`

- **Classification:** derived current grade projection from the enrollment's
  scalar fields and `grade_components_json`.
- **Candidate keys and FDs:** `enrollment_id ->` calculation mode, final
  percentage, final GWA, retention state, threshold, and projection timestamp.
- **3NF result:** no relation-local violation is demonstrated because the
  projection has one row per enrollment. Its scalar values duplicate current
  enrollment values by design; this is a source/projection issue, not evidence
  that the projection is a second independent source.
- **Required implementation:** migrate all approved current-grade reads to this
  relation, keep trigger/backfill parity while legacy writes remain, and choose
  one authoritative write path before retiring duplicate scalar fields. The
  full JSON contract still contains fields not represented here.

#### `enrollment_grade_breakdown_categories`

- **Classification:** derived current category-fact projection from the
  enrollment grade payload.
- **Candidate keys and FDs:** `(enrollment_id, grading_period, category_key) ->`
  all category attributes. `category_key` is a source-payload key and may be a
  category ID, name, or generated position key.
- **3NF result:** no violation is claimed for `category_name`: when a source
  payload label is preserved for a current projection/compatibility response,
  it is not proven to be required to equal the current category-table name.
  If product semantics later require current `grading_categories.name` to be
  authoritative, then `category_id -> current category_name` is a demonstrated
  dependency and `category_name` should be removed from the current projection
  or explicitly marked as a historical label.
- **Required implementation:** stabilize the category identity contract before
  making this a durable source. Preserve unknown/generated keys and raw JSON;
  do not collapse two source categories merely because their display names match.

#### `enrollment_remedial_states`

- **Classification:** derived current known-field projection from
  `remedial_state_json`; not an attempt-history relation.
- **Candidate keys and FDs:** `enrollment_id -> status, original_grade,
  remedial_score, remedial_grade, exam_date, notes, updated_at`.
- **3NF result:** no relation-local violation is demonstrated. The duplicated
  known fields are a controlled projection. The JSON retains extra keys such as
  override metadata and counters, but those keys have not been assigned a
  policy-defined dependency or history meaning.
- **Required implementation:** keep the projection for known scalar reads;
  migrate only responses whose semantics are fully represented. A future
  attempt relation requires an approved definition of an attempt, attempt
  number, outcome, policy version, and ordering. Do not derive attempt history
  from a current JSON object or audit text.

### Attendance and biometric relations

#### `attendance_sessions`

- **Classification:** normalized attendance-session lifecycle source.
- **Candidate keys and FDs:** `session_id ->` all attributes;
  `(cs_id, session_date, session_code) ->` all attributes by the unique
  session index. `cs_id ->` one active session only under the partial active
  index, not for all historical sessions.
- **3NF result:** no demonstrated violation. Owner, Secretary, timing,
  geofence, biometric requirement, and revocation facts are session facts.
- **Required implementation:** keep session ownership and lifecycle authoritative.
  Use this relation for linked attendance. Preserve historical session dates,
  codes, and outcomes in attendance records where the record is intentionally
  a snapshot.

#### `attendance_records`

- **Classification:** normalized attendance outcome source with two legitimate
  representations: linked current session rows and unlinked historical/manual
  snapshot rows.
- **Candidate keys and FDs:** `record_id ->` all attributes;
  `(enrollment_id, session_date, session_code) ->` all attributes for the
  declared legacy key; conditional `(enrollment_id, attendance_session_id) ->`
  all attributes for linked rows. `attendance_session_id -> session_date,
  session_code` is a cross-relation dependency for linked rows.
- **3NF result:** the duplicated date/code/start/end fields are not called a
  violation because migration 020 explicitly preserves them as immutable
  historical snapshots and validates linked rows against the session. They
  would become a violation only if treated as independently mutable current
  session facts.
- **Required implementation:** continue deriving/validating linked session
  fields from `attendance_sessions`; audit all consumers; retain unlinked
  legacy snapshots. Physical removal of snapshot columns requires a separate
  preservation decision and evidence that no historical/report contract needs
  them.

#### `biometric_profiles`

- **Classification:** normalized one-current-profile-per-Student source;
  protected-object references and expiry are privacy-controlled current facts.
- **Candidate keys and FDs:** `profile_id ->` all attributes;
  `student_id ->` all profile attributes by the unique constraint.
- **3NF result:** no demonstrated violation. `image_references` is not
  automatically a violation: current policy prohibits retaining raw facial
  images, and the present schema does not establish a stable independently
  queried image entity.
- **Required implementation:** keep one active/revoked/expired profile state,
  preserve consent and revocation evidence, and never create historical usable
  template rows contrary to BIO-005. Real camera/provider acceptance remains a
  separate manual gate.

### Configuration, notification, and delivery relations

#### `system_settings`

- **Classification:** normalized key/value configuration source with explicitly
  extensible JSON values.
- **Candidate keys and FDs:** `setting_id ->` all attributes;
  `setting_key -> setting_value, is_internal, description, timestamps, updater`
  by the unique setting key.
- **3NF result:** no demonstrated violation. A JSON value is a single setting
  payload at this relation's grain; nested keys are not treated as separate
  facts without a concrete contract and dependency. `academic.current_school_year`
  is intentionally a scalar JSON setting while class school year remains a
  historical offering fact.
- **Required implementation:** keep authoritative setting ownership in one row.
  Add typed relations only for settings that acquire independent querying,
  history, or referential semantics; backfill and preserve the original payload.

#### `notifications`

- **Classification:** normalized recipient-scoped notification source; title
  and body are message snapshots.
- **Candidate keys and FDs:** `notification_id ->` all attributes;
  conditional `(recipient_user_id, deduplication_key) ->` one notification.
  Notification type/entity does not determine message text by current contract.
- **3NF result:** no demonstrated violation. Message text is intentionally
  stored as delivered, not regenerated from a current academic row.
- **Required implementation:** preserve recipient ownership, read state,
  deduplication, and delivered message content. Do not replace the body with a
  live join to a changed grade or class.

#### `email_outbox`

- **Classification:** normalized delivery/outbox source with recipient and
  message snapshots.
- **Candidate keys and FDs:** `email_id ->` all attributes;
  `operation_uuid ->` all attributes. Sender, recipient, subject, and body do
  not form a business key.
- **3NF result:** no demonstrated violation. `recipient_name` and the message
  fields are delivery-time snapshots and need not track a later person-name
  change.
- **Required implementation:** preserve idempotency by `operation_uuid`, audit
  sender ownership, and keep delivery history separate from person identity.

## Exact unresolved decisions

These decisions are separate from executable normalization work. None authorizes
inventing schema rows or deleting preserved data.

### 1. Identity-conflict handling (resolved by ID-002)

**Concrete anonymized example:** one canonical person is linked to an account
whose structured name is `Dr. Mira Santos`, while the linked Student row says
`Mira L. Santos`. Migration 020 propagates structured role-row writes into the
shared person row; without an explicit conflict rule, the last role-row write
can replace the shared person values. A similar conflict can occur between the
legacy `display_name` and structured fields because the legacy string is
intentionally not parsed.

ID-002 resolves this in favor of one composed structured identity:
`person_identities` is authoritative for shared identity displays, and account
or Student name fields are compatibility copies. The canonical write helper
updates the person and copies together. A non-empty mismatch is preserved in
`legacy_conflicts_json` and rejected for that write until reconciliation; null
or empty legacy fields may be backfilled. No role-specific authoritative-name
alternative remains an approved choice. The current disposable data reports
zero non-empty identity conflicts, so a hypothetical conflict does not block
the independent canonical implementation.

### 2. `title` versus name-prefix semantics

**Concrete anonymized example:** an account may have `name_prefix = 'Dr.'` and
`title = 'Dean'`, while another may have `title = 'Dr.'` and no prefix. Treating
both values as the same field would either lose an honorific or lose an
account/profile designation.

**Plain-language choice required:**

- **Choice A — prefix is honorific, title is account designation:** keep
  `name_prefix` with the canonical person name and keep `user_accounts.title`
  for account/profile wording such as Dean or Instructor.
- **Choice B — title is honorific:** move its meaning into canonical person
  identity and define a separate account designation before migrating existing
  values.

No value should be reclassified by string matching. The current evidence shows
that callers expose `title` in account profile responses, but does not prove its
meaning for every existing row.

### 3. BUCDM and authoritative stage transitions

**Concrete anonymized example:** a current enrollment could contain final GWA
`2.50`, original grade `4.75`, remedial score `78.5`, and remedial grade `2.25`.
Those numbers alone do not establish whether the Student is retained, warned,
remedial-passed, or in another BUCDM stage, nor whether the remedial event is
attempt one or a later attempt.

**Plain-language choice required:** provide the approved BUCDM policy/version
and the mapping from final grades/GWA/remedial outcomes to retention stages and
transitions. Also define whether an “attempt” exists, what event starts it, and
which outcome closes it. If the policy does not require attempt history, keep
the current remedial object as a current-state snapshot and do not add an
attempt table. If it does require history, add a policy-versioned attempt/event
relation only after the Owner defines those facts. The application currently
does not record enough information to reconstruct attempts safely.

Real Google identity/provider acceptance and physical camera acceptance are
separate manual/provider gates; neither is a reason to defer the independent
relation work above.

## Additive implementation and retirement conditions

For any remaining compatibility relation or column:

1. Add the canonical relation/constraint and preserve all existing rows.
2. Backfill only values with an unambiguous deterministic mapping; retain the
   source payload and ambiguous legacy values.
3. During the compatibility period, dual-write through one transaction or a
   database trigger and run parity checks that include nulls, decimal precision,
   unknown JSON keys, and deletions.
4. Migrate every active reader and writer, including Admin, Secretary,
   invitation/onboarding, biometric, and shared auth/session consumers.
5. Mark the old shape read-only or move it to an explicitly named preserved
   archive only through an additive migration. Record the retention location and
   prove that required historical/API values can still be recovered.
6. Only after explicit preservation approval, complete physical retirement.
   No current relation or compatibility column is approved for deletion by this
   assessment.

This sequence distinguishes normalized source records, derived caches, and
historical snapshots. Trigger synchronization is a consistency mechanism; it is
not, by itself, evidence that the old relation has ceased to be an independent
application dependency.

## Read-only evidence and validation carried forward

- The live `information_schema` inventory confirmed the relation/key shape
  listed above, including primary keys, unique constraints/indexes, foreign
  keys, migration-020 projections, migration-022/023/024/025 guards and
  backfills, and the current 028 policy configuration.
- Static migration inspection confirmed that 020 creates
  `person_identities`, `grading_category_period_memberships`,
  `enrollment_grade_breakdowns`, `enrollment_grade_breakdown_categories`, and
  `enrollment_remedial_states`, preserves legacy JSON/session fields, and that
  021 replaces the overescaped decimal regex and regenerates projections from
  preserved JSON. Migrations 022-025 then move period writes to the canonical
  relation, enforce ID-002 canonical identity writes, reconcile empty copies,
  and permit only deterministic initial Student enrichment. Migration 026
  closes the enrollment-change validation event, while 027 records the
  compatibility operator and 028 updates the existing configuration so
  `retention_policy.retention_threshold` is the single canonical active
  consumer value of `2.50`. The older `initial_trigger_grade` and
  `grading_defaults.retention_gwa_threshold` keys are retained synchronized
  compatibility metadata, not second consumer authorities. Migrations 027-028
  do not invent attempts or bulk-recompute
  historical outcomes.
- The completed consumer audit covers Admin, Secretary, invitation/onboarding,
  biometric, shared auth/session, reporting, and profile paths. The remaining
  legacy access is classified: compatibility writes and fallback response
  fields are still required for contracts whose canonical decomposition is not
  complete; they are not silently treated as independent current sources.
  Therefore this assessment still does not claim whole-schema 3NF.
- Existing focused decimal assertions remain in the tree, including decimal
  parser, threshold, ratio, weight, contribution, and remedial-grade checks.
  The historical 8/8 live workflow pass belongs to the earlier integrated tree
  before migrations 022-025 and is not post-fix proof. Current post-fix focused
  evidence includes the migration ledger through 025, the UI migration
  database/API pass, canonical identity assertions, and the four disposable
  dialog captures. The kept integrated-tree disposable run is
  `dentisys-final-0926b` with backend `18082`, frontend `15175`, and Mailpit
  `18027`; it passed the ledger through 025, focused and full PostgreSQL tests,
  smoke/log checks, and all 8/8 live Playwright workflows. That result is
  historical for the current 026-028 tree. The current disposable project
  `dentisys-final-0926c` passed the 001-028 ledger, focused and full PostgreSQL
  tests, smoke/log checks, and all 8/8 live Playwright workflows.
- Migrations 022-028 are additive; no database volume or preserved data was
  deleted.

The policy settings updated by migrations 027-028 are configuration metadata, not a
new relation or a claim that all progression facts are normalized. The current
grade projection retains the authoritative stored grade and its captured
calculation context; historical snapshots and compatibility JSON remain
separate classifications. The remedial-exam percentage rule and later BUCDM
stages remain unresolved, so no attempt-history relation is invented here.
