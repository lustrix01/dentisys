# Phase 1A Stage Manifest

## Authority

| Property | Value |
|---|---|
| Artifact | `docs/database/erd-sources/phase-1-authoritative-plaintext-transcription.md` |
| SHA-256 | `1B0C845A90794D048CE568058B63E32255E00CD8307A82FA90D1F213F58C7800` |
| Commit | `49e9e71d687a05238ce005b342adbad6927cbffe` |

## Stage

- Phase 1A — historical clean-build checkpoint (P1-D02 Option A)
- Target: MariaDB 10.4.32, InnoDB, utf8mb4, utf8mb4_unicode_ci
- Runner: `scripts/migrate.ps1`
- Approval date: 2026-07-20

## Resolved Decisions

| ID | Topic |
|---|---|
| P1-D01 | 15 entities (not 14) |
| P1-D02 | Option A: historical clean-build checkpoints only |
| P1-D03 | SQL-safe physical identifiers; source names in documentation/manifests |
| P1-D04 | MariaDB 10.4.32 physical baseline |
| P1-D10 | Retention_Record FK: student_id only |
| P1-D19 | Gatekeeper validation standard |

## Partially Resolved Decisions

| ID | Resolved | Unresolved |
|---|---|---|
| P1-D29 | Fully resolved 2026-07-20: physical FK explicitly rejected for Phase 1A source fidelity. Column `se_created_by` is INT UNSIGNED NULL with supporting index `idx_attendance_session_se_created_by` and no FK constraint. Logical target: `user_account.user_id`. | None |
| P1-D30 | FK target resolved: `user_account.user_id` | Secretary role/assignment/permission model (Phase 1C) |

## Owner Physical-Policy Decisions

| ID | Question | Response | Approval Date |
|---|---|---|---|
| B-01 | Exact VARCHAR lengths | Per-column lengths for 35 bounded-text VARCHAR columns (per Section 7 of the implementation plan) | 2026-07-20 |
| B-02 | Non-PK nullability | 7 columns NULL (student_face_image, cs_lab_room, cs_lec_room, cs_block_secretary, se_created_by, se_device_id, record_remarks); all others NOT NULL | 2026-07-20 |
| B-03 | Numeric units, precision, scale | Proportion convention; DECIMAL(5,4) weights/confidence, DECIMAL(6,2) scores, DECIMAL(5,2) grades | 2026-07-20 |
| B-04 | student_face_image storage | VARCHAR(500) NULL — resolves the 36th physical VARCHAR column, independent of the 35 columns governed by B-01; no FK to student_image | 2026-07-20 |
| B-05 | lbph_vector BLOB class | LONGBLOB NOT NULL | 2026-07-20 |
| B-06 | course_units type and precision | DECIMAL(3,1) NOT NULL | 2026-07-20 |
| B-07 | rl_date_logged type | DATETIME(6) NOT NULL (UTC semantics) | 2026-07-20 |
| B-08 | se_created_by FK, nullability, index | Outcome A: INT UNSIGNED NULL, supporting index only (no FK) | 2026-07-20 |
| B-09 | se_device_id nullability, index | INT UNSIGNED NULL, supporting index only (no FK — Device absent) | 2026-07-20 |

**Physical VARCHAR count**: B-01 approves exact lengths for 35 bounded-text VARCHAR columns. B-04 independently selects `student.student_face_image` as VARCHAR(500) NULL. The final Phase 1A physical schema therefore contains 36 VARCHAR columns in total: 35 governed by B-01 and 1 governed by B-04. This distinction does not change the total business column count of 98.

## Approved Naming/Security Deviations: 18

| DEV | Source | Physical |
|---|---|---|
| DEV-01 | `User_Account` | `user_account` |
| DEV-02 | `Faculty` | `faculty` |
| DEV-03 | `Student` | `student` |
| DEV-04 | `Student_Image` | `student_image` |
| DEV-05 | `Facial_Template` | `facial_template` |
| DEV-06 | `Course` | `course` |
| DEV-07 | `Class_Section` | `class_section` |
| DEV-08 | `Enrollment` | `enrollment` |
| DEV-09 | `Attendance_Session` | `attendance_session` |
| DEV-10 | `Attendance_Record` | `attendance_record` |
| DEV-11 | `Assessment` | `assessment` |
| DEV-12 | `Student_Assessment_Grade` | `student_assessment_grade` |
| DEV-13 | `Retention_Record` | `retention_record` |
| DEV-14 | `Remedial_Logs` | `remedial_log` |
| DEV-15 | `Retention_Risk` | `retention_risk` |
| DEV-16 | `password` | `password_hash` |
| DEV-17 | `faculty_BU_email` | `faculty_bu_email` |
| DEV-18 | `student_BU_email` | `student_bu_email` |

## Resolved Physical-Treatment Deviations

| DEV | Source | Treatment |
|---|---|---|
| DEV-19 | `Attendance_Session.se_created_by` — logical relationship to `User_Account`; no FK marker in source | Resolved: column present, INT UNSIGNED NULL, supporting index `idx_attendance_session_se_created_by`, no FK constraint |
| DEV-20 | `Attendance_Session.se_device_id` — dangling source FK to Device; Device absent from Phase 1A | Resolved: column present, INT UNSIGNED NULL, supporting index `idx_attendance_session_se_device_id`, no FK constraint |

## Approved Object Counts

| Object | Count |
|---|---|---|
| Business tables | 15 |
| Business columns | 98 |
| Physical VARCHAR columns (total) | 36 |
|   B-01-governed VARCHAR columns | 35 |
|   B-04-governed VARCHAR columns | 1 |
| Primary keys | 15 |
| Executable foreign keys | 17 |
| Approved explicit FK indexes | 17 |
| Approved non-FK supporting indexes | 2 |
| Unconstrained relationship fields | 2 |
| Named Boolean check constraints | 3 |
| Policy/range checks | 0 |
| Non-PK unique constraints | 0 |
| Business defaults | 0 |

## Exclusions (Phase 1B Only)

- `device`
- `audit_log`
- `course_components`
- `component`
- `student_term_grade`
- `student`.`user_id` FK

## UTC Semantic Notes

- `attendance_record.sat_time_recorded`: DATETIME(6), stored in UTC
- `remedial_log.rl_date_logged`: DATETIME(6), stored in UTC
- `retention_risk.rr_timestamp`: DATETIME(6), stored in UTC

## Table Inventory

| Table | Source | Columns | PK |
|---|---|---|---|
| `user_account` | `User_Account` | 5 | `user_id` |
| `student` | `Student` | 9 | `student_id` |
| `course` | `Course` | 15 | `course_id` |
| `faculty` | `Faculty` | 6 | `faculty_id` |
| `class_section` | `Class_Section` | 11 | `cs_id` |
| `enrollment` | `Enrollment` | 4 | `en_id` |
| `attendance_session` | `Attendance_Session` | 9 | `se_id` |
| `assessment` | `Assessment` | 6 | `a_id` |
| `student_image` | `Student_Image` | 4 | `si_id` |
| `facial_template` | `Facial_Template` | 3 | `template_id` |
| `attendance_record` | `Attendance_Record` | 6 | `rec_id` |
| `student_assessment_grade` | `Student_Assessment_Grade` | 5 | `sg_id` |
| `retention_record` | `Retention_Record` | 5 | `record_id` |
| `remedial_log` | `Remedial_Logs` | 5 | `rl_id` |
| `retention_risk` | `Retention_Risk` | 5 | `risk_id` |

## Migration Files

| File | Table | SHA-256 |
|---|---|---|
| `001_phase_1a_user_account.sql` | `user_account` | `5DC5369171E54FC8B316C90CDD41D4715E10AF50A0985745248F0DA2286DAC1C` |
| `002_phase_1a_student.sql` | `student` | `CBE0821E0CBC19C1C68CC2239C2030FFD587E81CA3C603F5A90B41EF24C543F5` |
| `003_phase_1a_course.sql` | `course` | `6558ACD36008002C6C133696806B866088B7017926DE0B927E5DC8CFF5D70B13` |
| `004_phase_1a_faculty.sql` | `faculty` | `1FA2CA403D8F57840FF5CB427CEF8FBAB11D77616E9451F201081FB01BA2109F` |
| `005_phase_1a_class_section.sql` | `class_section` | `9B94BF5F4E44C24B12746E4C42350E7DD9CBCCD8FB88C0DD2EE331BBA9692CC0` |
| `006_phase_1a_enrollment.sql` | `enrollment` | `6F24F710B28D4F6683E31C6EA3D4205F60AC2B241CB34FE313F939339EB5ED02` |
| `007_phase_1a_attendance_session.sql` | `attendance_session` | `37322505872474ECAE530DA794E9D101BA59AF9C24BA5D6A8457BFD1DC38DC1A` |
| `008_phase_1a_assessment.sql` | `assessment` | `C638DFC529207D8FE5387ECB830DCB24F3E93CC90E8E105A349EE4C52237B55D` |
| `009_phase_1a_student_image.sql` | `student_image` | `9E8ECCF19AD2C40F12E85C8E8258351F80127129D212B32DA1A4F86C8B4EC707` |
| `010_phase_1a_facial_template.sql` | `facial_template` | `74023C2BDB517E90AD0327D8721155C1727D543F07298A95884229073D871F0C` |
| `011_phase_1a_attendance_record.sql` | `attendance_record` | `DCE8A7B692781B8640D7E649586CE3D0B0C3CAADDFFA8561B83B518D79895A46` |
| `012_phase_1a_student_assessment_grade.sql` | `student_assessment_grade` | `53036FD6FD6B0DAA1D08A3E3B98AC16A19C3141A9EE0A96954EB40614E7C124F` |
| `013_phase_1a_retention_record.sql` | `retention_record` | `D16D056066D1A2F9AFDD18A3CDE9F34F7442EDF51C9A82E35911151B865BB14B` |
| `014_phase_1a_remedial_log.sql` | `remedial_log` | `B473EC62B20B0FBB79F5E73A3072321145D5112443148D1C81BAE6968ADF7056` |
| `015_phase_1a_retention_risk.sql` | `retention_risk` | `059ADDEAE8C54170A0979710A8D0F30F109673AFFAA12E814276921AD70A6819` |

## Validation Evidence

Reference: `docs/database/phase-1a-validation-evidence.md`
