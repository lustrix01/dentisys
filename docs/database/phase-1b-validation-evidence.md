# Phase 1B Validation Evidence

## Environment

| Property | Value |
|---|---|
| MariaDB version | 10.4.32-MariaDB-1:10.4.32+maria~ubu2004 |
| Compose project (primary) | `dentisys-phase1b-primary` |
| Compose project (failure) | `dentisys-phase1b-failure-test` |
| Port (primary) | 3310 |
| Port (failure) | 3311 |
| Port (development) | 3307 (unaffected) |
| Credentials | Ephemeral; all output sanitized with `<REDACTED>` |

## Compose Isolation

Both environments verified via `docker compose config`:

- **Primary**: project `dentisys-phase1b-primary`, volume `dentisys-phase1b-primary_dentisys_db_data`, port `127.0.0.1:3310→3306`, only `db` service started.
- **Failure**: project `dentisys-phase1b-failure-test`, volume `dentisys-phase1b-failure-test_dentisys_db_data`, port `127.0.0.1:3311→3306`, only `db` service started.
- Development database on port 3307 unaffected throughout.

Port availability verified via `Get-NetTCPConnection` before startup for both environments.

---

## PRIMARY CLEAN-BUILD VALIDATION

### V-01: Foundation State

```
Tables_in_dentisys
_schema_migrations
```

### V-02: Phase 1A Migration Application

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

### V-03: Phase 1B Migration Application

All 33 migrations applied:

```
APPLY: 016_phase_1b_drop_attendance_record.sql
APPLY: 017_phase_1b_drop_student_assessment_grade.sql
APPLY: 018_phase_1b_drop_remedial_log.sql
APPLY: 019_phase_1b_drop_retention_risk.sql
APPLY: 020_phase_1b_drop_student_image.sql
APPLY: 021_phase_1b_drop_facial_template.sql
APPLY: 022_phase_1b_drop_enrollment.sql
APPLY: 023_phase_1b_drop_assessment.sql
APPLY: 024_phase_1b_drop_attendance_session.sql
APPLY: 025_phase_1b_drop_retention_record.sql
APPLY: 026_phase_1b_drop_class_section.sql
APPLY: 027_phase_1b_drop_faculty.sql
APPLY: 028_phase_1b_drop_student.sql
APPLY: 029_phase_1b_drop_course.sql
APPLY: 030_phase_1b_device.sql
APPLY: 031_phase_1b_audit_log.sql
APPLY: 032_phase_1b_faculty.sql
APPLY: 033_phase_1b_student.sql
APPLY: 034_phase_1b_course.sql
APPLY: 035_phase_1b_course_component.sql
APPLY: 036_phase_1b_component.sql
APPLY: 037_phase_1b_class_section.sql
APPLY: 038_phase_1b_enrollment.sql
APPLY: 039_phase_1b_attendance_session.sql
APPLY: 040_phase_1b_assessment.sql
APPLY: 041_phase_1b_student_image.sql
APPLY: 042_phase_1b_facial_template.sql
APPLY: 043_phase_1b_attendance_record.sql
APPLY: 044_phase_1b_student_assessment_grade.sql
APPLY: 045_phase_1b_student_term_grade.sql
APPLY: 046_phase_1b_retention_record.sql
APPLY: 047_phase_1b_remedial_log.sql
APPLY: 048_phase_1b_retention_risk.sql
```

### V-04: Business Table Count — 20

```
assessment
attendance_record
attendance_session
audit_log
class_section
component
course
course_component
device
enrollment
facial_template
faculty
remedial_log
retention_record
retention_risk
student
student_assessment_grade
student_image
student_term_grade
user_account
```

### V-05: Column Counts per Table — 124 total

```
assessment               7
attendance_record        6
attendance_session       9
audit_log                6
class_section           10
component                4
course                   7
course_component         6
device                   5
enrollment               5
facial_template          4
faculty                  8
remedial_log             5
retention_record         5
retention_risk           4
student                 13
student_assessment_grade 5
student_image            5
student_term_grade       5
user_account             5
SUM                    124
```

### V-06: Primary Keys — 20

All 20 PKs confirmed via `information_schema.TABLE_CONSTRAINTS`:
`a_id`, `cc_id`, `comp_id`, `course_id`, `cs_id`, `device_id`, `en_id`, `fac_id`, `log_id`, `rec_id`, `record_id`, `report_id`, `rl_id`, `se_id`, `sg_id`, `si_id`, `stg_id`, `stud_id`, `template_id`, `user_id`.
All `AUTO_INCREMENT`.

### V-07: Foreign Keys — 23

```
fk_assessment_class_section
fk_assessment_component
fk_attendance_record_attendance_session
fk_attendance_record_enrollment
fk_attendance_session_class_section
fk_attendance_session_device
fk_attendance_session_user_account
fk_audit_log_user_account
fk_class_section_course_component
fk_component_course_component
fk_course_component_course
fk_course_component_faculty
fk_enrollment_class_section
fk_enrollment_student
fk_facial_template_student
fk_faculty_user_account
fk_remedial_log_retention_record
fk_retention_record_student
fk_retention_risk_student_assessment_grade
fk_student_assessment_grade_assessment
fk_student_assessment_grade_enrollment
fk_student_image_student
fk_student_term_grade_enrollment
```

### V-08: Explicit FK Indexes — 23

All 23 FK indexes confirmed matching their constraint columns.

### V-09: Supporting Index — 1

```
idx_attendance_session_se_created_by    (attendance_session.se_created_by)
```

### V-10: No Duplicate Indexes

Query: `SELECT TABLE_NAME, COLUMN_NAME, COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'dentisys' AND INDEX_NAME != 'PRIMARY' GROUP BY TABLE_NAME, COLUMN_NAME HAVING COUNT(*) > 1`

Result: Empty set. No duplicate indexes.

### V-11: No FK on se_created_by

Query for FKs on attendance_session: only `device_id`, `cs_id`, and `se_secretary_id` returned. `se_created_by` has no FK constraint. Correct.

### V-12: Boolean Check Constraints — 4

```
chk_course_component_has_zero_rule_bool  `has_zero_rule` in (0,1)
chk_faculty_is_admin_bool                `is_admin` in (0,1)
chk_student_image_is_primary_bool        `is_primary` in (0,1)
chk_student_is_regular_bool              `is_regular` in (0,1)
```

### V-13: SHOW CREATE TABLE — Boolean Default Verification

All four Boolean columns confirmed via `information_schema.COLUMNS`: `COLUMN_DEFAULT IS NULL` for all. All have named `IN (0,1)` check constraints. No Boolean column has a DEFAULT clause.

### V-14: No Non-PK Unique Constraints

Empty set. Correct.

### V-15: Engine and Collation

All 20 tables: `InnoDB`, `utf8mb4_unicode_ci`.

### V-16: Password Safety

- `password_hash` column present in `user_account`.
- `password` column absent from `user_account`.

### V-17: No student.user_id

Column `user_id` absent from `student`. Correct.

### V-18: user_account Retained from Migration 001

`_schema_migrations` contains only `001_phase_1a_user_account.sql` referencing `user_account`. No Phase 1B file drops or recreates `user_account`. The table's physical structure matches migration 001 exactly.

### V-19: audit_log References Retained user_account

`audit_log.user_id` FK constraint `fk_audit_log_user_account` references `user_account.user_id`. Verified.

### V-20: Device and attendance_session FK

Table `device` exists with 5 columns. `attendance_session.device_id` has FK constraint `fk_attendance_session_device` referencing `device.device_id`. Verified.

### V-21: retention_record References Student Only

FK query on `retention_record`: only `student_id` referencing `student`. No Enrollment or Student_Term_Grade FK. Correct.

### V-22: retention_risk References student_assessment_grade

`retention_risk.sg_id` has FK constraint `fk_retention_risk_student_assessment_grade` referencing `student_assessment_grade.sg_id`. No `student_id` column on `retention_risk`. Correct.

### V-23: No Compatibility Fields

Query for `faculty_bu_email`, `student_face_image`, `cs_year_level`, `a_type`, `risk_confidence`, `rr_timestamp` across all tables: Empty set. All six compatibility fields absent. Correct.

### V-24: No Phase 1C Tables

No unintended tables beyond the 20 business tables and `_schema_migrations`. Correct.

### V-25: Identifier Regex Validation

All table, column, index, FK constraint, and check constraint names match `^[a-z][a-z0-9_]*$`. No uppercase letters, spaces, or leading digits found (excluding `_schema_migrations` which has an underscore prefix). No quoted identifiers used.

### V-26: Migration History — 48 rows

48 rows in `_schema_migrations` matching the 48 migration filenames in order.

---

## RERUN VALIDATION

### V-27: Second Migration Run

```
SKIP: 001_phase_1a_user_account.sql already applied.
... (48 entries) ...
SKIP: 048_phase_1b_retention_risk.sql already applied.
```

48 SKIP, 0 APPLY. Rerun is idempotent.

### V-28: Schema Unchanged After Rerun

All V-04 through V-26 checks produce identical results before and after rerun.

---

## ISOLATED PARTIAL-DDL FAILURE TEST

### V-29: Test Environment

| Property | Value |
|---|---|
| Project | `dentisys-phase1b-failure-test` |
| Port | 3311 (verified free) |
| Volume | Project-scoped `dentisys-phase1b-failure-test_dentisys_db_data` |
| Repository | Temporary copy in `$env:TEMP\dentisys-phase1b-failure` |

### V-30: Failure Migration

File `049_phase_1b_failure_test.sql` with two statements:
1. `CREATE TABLE phase_1b_partial_failure_probe (id INT UNSIGNED NOT NULL PRIMARY KEY);` (valid)
2. `CREATE TABLE intentional_failure (col THIS_TYPE_DOES_NOT_EXIST);` (invalid type)

### V-31: Execution

Files 001–048: all `APPLY`.
File 049: `APPLY` followed by error `ERROR 1064 (42000) ... near ')' at line 1`.

### V-32: Partial-DDL Evidence

| Check | Result |
|---|---|
| `_schema_migrations` row count | 48 |
| `049_phase_1b_failure_test.sql` in `_schema_migrations` | NO |
| `phase_1b_partial_failure_probe` exists | YES (statement 1 persisted) |
| `intentional_failure` exists | NO (statement 2 failed) |
| All 20 Phase 1B tables intact | YES |

The partial DDL behavior is confirmed: the valid first statement in the file persists, the invalid second statement fails, and the migration version is not recorded.

### V-33: Unsafe Rerun

Rerun without rebuild:
- 001–048: all `SKIP`
- 049: `APPLY` then `ERROR 1050 (42S01): Table 'phase_1b_partial_failure_probe' already exists`

Rerunning after partial DDL is unsafe because the probe table from statement 1 blocks clean re-application.

### V-34: Recovery

1. `docker compose --project-name dentisys-phase1b-failure-test down -v`
2. Removed `049_phase_1b_failure_test.sql` from temporary repository copy
3. `docker compose --project-name dentisys-phase1b-failure-test up -d db`
4. Re-ran `migrate.ps1` — all 48 APPLY cleanly
5. All 20 tables, 124 columns, 23 FKs verified

### V-35: Primary Worktree

Unaffected throughout. All failure-test artifacts were in the temporary repository copy and isolated Docker project. Both deleted after evidence collection.

---

## FINAL VERIFICATION

### V-36: Secret Scan

SECRET SCAN: PASS

All 40 authorized files were scanned for ephemeral credential values. No matches found.

### V-37: No Temporary .env in Primary Worktree

No `.env` file was written to the primary worktree. The temporary `.env` existed only in `$env:TEMP\dentisys-phase1b-failure` and was deleted during cleanup.

### V-38: Repository Checks

`git diff --check` — no whitespace errors.

`powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipDocker` — confirms existing checks unchanged by Phase 1B scope.

### V-39: Phase 1A Migration Files Unchanged

All 15 Phase 1A migration files verified with identical SHA-256 to the Phase 1A baseline.

### V-40: Git Scope

```
35 untracked files (33 migrations + 2 documents)
5 modified files (decision gates, migration mapping, source reconciliation, ADR, requirements traceability)
40 paths total
0 staged paths
No unauthorized paths
```
