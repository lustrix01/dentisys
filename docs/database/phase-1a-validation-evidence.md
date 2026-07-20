# Phase 1A Validation Evidence

## Environment

| Property | Value |
|---|---|
| MariaDB version | 10.4.32-MariaDB-1:10.4.32+maria~ubu2004 |
| Compose project (primary) | `dentisys-phase1a-primary-validation` |
| Compose project (failure) | `dentisys-phase1a-failure-test` |
| Port (primary) | 3309 |
| Port (failure) | 3308 |
| Port (development) | 3307 (unaffected) |
| B-08 outcome | Outcome A (no physical FK on se_created_by) |
| Credentials | Ephemeral; all output sanitized with `<REDACTED>` |

## Compose Isolation

Both environments verified via `docker compose config` before startup:

- **Primary**: project `dentisys-phase1a-primary-validation`, volume `dentisys-phase1a-primary-validation_dentisys_db_data`, port `127.0.0.1:3309→3306`, no `container_name`, only `db` service started.
- **Failure**: project `dentisys-phase1a-failure-test`, volume `dentisys-phase1a-failure-test_dentisys_db_data`, port `127.0.0.1:3308→3306`, no `container_name`, only `db` service started.
- Development database on port 3307 unaffected throughout.

Port availability verified via `Get-NetTCPConnection` before startup for both environments.

---

## PRIMARY CLEAN-BUILD VALIDATION

### V-01: Foundation State

```
Tables_in_dentisys
_schema_migrations
```

### V-02: Migration Application

All 15 migrations applied:

```
APPLY: 001_phase_1a_user_account.sql
APPLY: 002_phase_1a_student.sql
APPLY: 003_phase_1a_course.sql
APPLY: 004_phase_1a_faculty.sql
APPLY: 005_phase_1a_class_section.sql
APPLY: 006_phase_1a_enrollment.sql
APPLY: 007_phase_1a_attendance_session.sql
APPLY: 008_phase_1a_assessment.sql
APPLY: 009_phase_1a_student_image.sql
APPLY: 010_phase_1a_facial_template.sql
APPLY: 011_phase_1a_attendance_record.sql
APPLY: 012_phase_1a_student_assessment_grade.sql
APPLY: 013_phase_1a_retention_record.sql
APPLY: 014_phase_1a_remedial_log.sql
APPLY: 015_phase_1a_retention_risk.sql
```

### V-03: Business Table Count — 15

```
assessment
attendance_record
attendance_session
class_section
course
enrollment
facial_template
faculty
remedial_log
retention_record
retention_risk
student
student_assessment_grade
student_image
user_account
```

### V-04: Column Counts per Table — 98 total

```
assessment              6
attendance_record       6
attendance_session      9
class_section          11
course                 15
enrollment              4
facial_template         3
faculty                 6
remedial_log            5
retention_record        5
retention_risk          5
student                 9
student_assessment_grade 5
student_image           4
user_account            5
SUM                    98
```

### V-05: Primary Keys — 15

All 15 PKs confirmed: `a_id`, `cs_id`, `course_id`, `en_id`, `faculty_id`, `rec_id`, `record_id`, `risk_id`, `rl_id`, `se_id`, `sg_id`, `si_id`, `student_id`, `template_id`, `user_id`. All `AUTO_INCREMENT`.

### V-06: Foreign Keys — 17

```
fk_assessment_course_id
fk_attendance_record_en_id
fk_attendance_record_se_id
fk_attendance_session_cs_id
fk_attendance_session_se_secretary_id
fk_class_section_course_id
fk_class_section_instructor_id
fk_enrollment_cs_id
fk_enrollment_student_id
fk_facial_template_student_id
fk_faculty_user_id
fk_remedial_log_record_id
fk_retention_record_student_id
fk_retention_risk_student_id
fk_student_assessment_grade_a_id
fk_student_assessment_grade_en_id
fk_student_image_student_id
```

### V-07: Explicit FK Indexes — 17

All 17 FK indexes confirmed matching the constraint names (`idx_*` variants of the above).

### V-08: Supporting Indexes — 2

```
idx_attendance_session_se_created_by    (attendance_session.se_created_by)
idx_attendance_session_se_device_id     (attendance_session.se_device_id)
```

### V-09: No Duplicate Indexes

Query: `SELECT TABLE_NAME, COLUMN_NAME, COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'dentisys' AND INDEX_NAME != 'PRIMARY' GROUP BY TABLE_NAME, COLUMN_NAME HAVING COUNT(*) > 1`

Result: Empty set. No duplicate auto+explicit indexes.

### V-10: No FK on se_created_by or se_device_id

Query for FKs on attendance_session: only `cs_id` and `se_secretary_id` returned. `se_created_by` and `se_device_id` have no FK constraint. Correct.

### V-11: Boolean Check Constraints — 3

```
chk_course_has_zero_rule_bool      `has_zero_rule` in (0,1)
chk_faculty_faculty_is_admin_bool  `faculty_is_admin` in (0,1)
chk_student_image_is_primary_bool  `is_primary` in (0,1)
```

### V-12: SHOW CREATE TABLE — Boolean Default Verification

All three Boolean columns confirmed via `SHOW CREATE TABLE`:
- `faculty_is_admin` TINYINT(1) NOT NULL — no DEFAULT clause
- `is_primary` TINYINT(1) NOT NULL — no DEFAULT clause
- `has_zero_rule` TINYINT(1) NOT NULL — no DEFAULT clause

`COLUMN_DEFAULT IS NULL` for all three. All have named `IN (0,1)` check constraints.

### V-13: No Non-PK Unique Constraints

Empty set. Correct.

### V-14: Engine and Collation

All 15 tables: `InnoDB`, `utf8mb4_unicode_ci`.

### V-15: Password Safety

- `password_hash` column present in `user_account`.
- `password` column absent from `user_account`.

### V-16: No Phase 1B Tables

`device`, `audit_log`, `course_components`, `component`, `student_term_grade`: none present.

### V-17: No student.user_id FK

Column `user_id` absent from `student`. Correct.

### V-18: Identifier Regex Validation

All tables, columns, indexes, FK constraints, and check constraints match `^[a-z][a-z0-9_]*$`. Zero uppercase letters, spaces, or leading digits found.

### V-19: Migration History

15 rows in `_schema_migrations` matching the 15 migration filenames in order.

---

## RERUN VALIDATION

### V-20: Second Migration Run

```
SKIP: 001_phase_1a_user_account.sql already applied.
SKIP: 002_phase_1a_student.sql already applied.
SKIP: 003_phase_1a_course.sql already applied.
SKIP: 004_phase_1a_faculty.sql already applied.
SKIP: 005_phase_1a_class_section.sql already applied.
SKIP: 006_phase_1a_enrollment.sql already applied.
SKIP: 007_phase_1a_attendance_session.sql already applied.
SKIP: 008_phase_1a_assessment.sql already applied.
SKIP: 009_phase_1a_student_image.sql already applied.
SKIP: 010_phase_1a_facial_template.sql already applied.
SKIP: 011_phase_1a_attendance_record.sql already applied.
SKIP: 012_phase_1a_student_assessment_grade.sql already applied.
SKIP: 013_phase_1a_retention_record.sql already applied.
SKIP: 014_phase_1a_remedial_log.sql already applied.
SKIP: 015_phase_1a_retention_risk.sql already applied.
```

15 SKIP, 0 APPLY. Rerun is idempotent.

### V-21: Schema Unchanged After Rerun

All V-03 through V-20 checks produce identical results before and after rerun.

---

## ISOLATED PARTIAL-DDL FAILURE TEST

### V-22: Test Environment

| Property | Value |
|---|---|
| Project | `dentisys-phase1a-failure-test` |
| Port | 3308 (verified free) |
| Volume | Project-scoped `dentisys-phase1a-failure-test_dentisys_db_data` |
| Repository | Temporary copy in `$env:TEMP\dentisys-phase1a-failure` |

### V-23: Failure Migration

File `016_phase_1a_failure_test.sql` with two statements:
1. `CREATE TABLE probe_test_table` (valid DDL)
2. `CREATE TABLE intentional_failure` (invalid type `THIS_TYPE_DOES_NOT_EXIST`)

### V-24: Execution

Files 001–015: all `APPLY`.
File 016: `APPLY` followed by error `ERROR 1064 (42000) ... near ')' at line 4`.

### V-25: Partial-DDL Evidence

| Check | Result |
|---|---|
| `probe_test_table` exists | YES (statement 1 persisted) |
| `intentional_failure` exists | NO (statement 2 failed) |
| `_schema_migrations` row count | 15 |
| `016_phase_1a_failure_test.sql` in `_schema_migrations` | NO |
| All 15 Phase 1A tables intact | YES |

The partial DDL behavior is confirmed: the valid first statement in the file persists, the invalid second statement fails, and the migration version is not recorded.

### V-26: Unsafe Rerun

Rerun without rebuild:
- 001–015: all `SKIP`
- 016: `APPLY` then `ERROR 1050 (42S01): Table 'probe_test_table' already exists`

Rerunning after partial DDL is unsafe because the probe table from statement 1 blocks clean re-application.

### V-27: Recovery

1. `docker compose --project-name dentisys-phase1a-failure-test down -v`
2. Removed `016_phase_1a_failure_test.sql`
3. `docker compose --project-name dentisys-phase1a-failure-test up -d db`
4. Re-ran `migrate.ps1` — all 15 APPLY cleanly
5. All 15 tables, 98 columns, 17 FKs verified

### V-28: Primary Worktree

Unaffected throughout. All failure-test artifacts were in the temporary repository copy and isolated Docker project. Both deleted after evidence collection.

---

## FINAL VERIFICATION

### V-29: Secret Scan

SECRET SCAN: PASS

All 17 created files and the modified `docs/database/phase-1-owner-decision-gates.md` were scanned for the four generated ephemeral credential values. No matches found.

### V-30: No Temporary .env in Primary Worktree

No `.env` file was written to the primary worktree. The temporary `.env` existed only in `$env:TEMP\dentisys-phase1a-failure` and was deleted during cleanup.

### V-31: Repository Checks

`git diff --check` — no whitespace errors.

`scripts\check.ps1` — confirms existing checks unchanged by Phase 1A scope.

### V-32: Git Scope

```
 M docs/database/phase-1-owner-decision-gates.md
?? database/migrations/001_phase_1a_user_account.sql
?? database/migrations/002_phase_1a_student.sql
?? database/migrations/003_phase_1a_course.sql
?? database/migrations/004_phase_1a_faculty.sql
?? database/migrations/005_phase_1a_class_section.sql
?? database/migrations/006_phase_1a_enrollment.sql
?? database/migrations/007_phase_1a_attendance_session.sql
?? database/migrations/008_phase_1a_assessment.sql
?? database/migrations/009_phase_1a_student_image.sql
?? database/migrations/010_phase_1a_facial_template.sql
?? database/migrations/011_phase_1a_attendance_record.sql
?? database/migrations/012_phase_1a_student_assessment_grade.sql
?? database/migrations/013_phase_1a_retention_record.sql
?? database/migrations/014_phase_1a_remedial_log.sql
?? database/migrations/015_phase_1a_retention_risk.sql
?? docs/database/phase-1a-stage-manifest.md
?? docs/database/phase-1a-validation-evidence.md
```

Exactly 18 paths: 1 modified, 17 new. No other files changed.
