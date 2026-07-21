# Phase 1B Stage Manifest

## Authority

| Property | Value |
|---|---|
| Artifact | `docs/database/erd-sources/phase-1-authoritative-plaintext-transcription.md` |
| SHA-256 | `1B0C845A90794D048CE568058B63E32255E00CD8307A82FA90D1F213F58C7800` |
| Commit | `49e9e71d687a05238ce005b342adbad6927cbffe` |

## Stage

- Phase 1B — historical clean-build checkpoint (P1-D02 Option A)
- Target: MariaDB 10.4.32, InnoDB, utf8mb4, utf8mb4_unicode_ci
- Runner: `scripts/migrate.ps1`
- Approval date: 2026-07-20

## Phase 1A Baseline

| Property | Value |
|---|---|
| Commit | `22b0805f74f0afa2f2416f273fc80603dcdea9a8` |
| Subject | Implement Phase 1A historical clean-build database checkpoint |
| Tables | 15 |
| Columns | 98 |
| PKs | 15 |
| FKs | 17 |
| FK indexes | 17 |
| Supporting indexes | 2 |
| Boolean checks | 3 |
| Unique constraints | 0 |
| Policy checks | 0 |
| Defaults | 0 |

### Phase 1A Migration Hashes

| File | SHA-256 |
|---|---|
| `001_phase_1a_user_account.sql` | `5DC5369171E54FC8B316C90CDD41D4715E10AF50A0985745248F0DA2286DAC1C` |
| `002_phase_1a_student.sql` | `CBE0821E0CBC19C1C68CC2239C2030FFD587E81CA3C603F5A90B41EF24C543F5` |
| `003_phase_1a_course.sql` | `6558ACD36008002C6C133696806B866088B7017926DE0B927E5DC8CFF5D70B13` |
| `004_phase_1a_faculty.sql` | `1FA2CA403D8F57840FF5CB427CEF8FBAB11D77616E9451F201081FB01BA2109F` |
| `005_phase_1a_class_section.sql` | `9B94BF5F4E44C24B12746E4C42350E7DD9CBCCD8FB88C0DD2EE331BBA9692CC0` |
| `006_phase_1a_enrollment.sql` | `6F24F710B28D4F6683E31C6EA3D4205F60AC2B241CB34FE313F939339EB5ED02` |
| `007_phase_1a_attendance_session.sql` | `37322505872474ECAE530DA794E9D101BA59AF9C24BA5D6A8457BFD1DC38DC1A` |
| `008_phase_1a_assessment.sql` | `C638DFC529207D8FE5387ECB830DCB24F3E93CC90E8E105A349EE4C52237B55D` |
| `009_phase_1a_student_image.sql` | `9E8ECCF19AD2C40F12E85C8E8258351F80127129D212B32DA1A4F86C8B4EC707` |
| `010_phase_1a_facial_template.sql` | `74023C2BDB517E90AD0327D8721155C1727D543F07298A95884229073D871F0C` |
| `011_phase_1a_attendance_record.sql` | `DCE8A7B692781B8640D7E649586CE3D0B0C3CAADDFFA8561B83B518D79895A46` |
| `012_phase_1a_student_assessment_grade.sql` | `53036FD6FD6B0DAA1D08A3E3B98AC16A19C3141A9EE0A96954EB40614E7C124F` |
| `013_phase_1a_retention_record.sql` | `D16D056066D1A2F9AFDD18A3CDE9F34F7442EDF51C9A82E35911151B865BB14B` |
| `014_phase_1a_remedial_log.sql` | `B473EC62B20B0FBB79F5E73A3072321145D5112443148D1C81BAE6968ADF7056` |
| `015_phase_1a_retention_risk.sql` | `059ADDEAE8C54170A0979710A8D0F30F109673AFFAA12E814276921AD70A6819` |

## Resolved Phase 1B Decisions

| ID | Topic | Resolution | Approval Date |
|---|---|---|---|
| B1-D01 | Omit faculty_bu_email | Strict ERD treatment; not present in authoritative ERD 2 | 2026-07-20 |
| B1-D02 | Omit student_face_image | Strict ERD treatment; not present in authoritative ERD 2 | 2026-07-20 |
| B1-D03 | Omit cs_year_level | Strict ERD treatment; not present in authoritative ERD 2 | 2026-07-20 |
| B1-D04 | Omit assessment.a_type | Strict ERD treatment; not present in authoritative ERD 2 | 2026-07-20 |
| B1-D05 | Omit retention_risk.risk_confidence | Strict ERD treatment; not present in authoritative ERD 2 | 2026-07-20 |
| B1-D06 | Omit retention_risk.rr_timestamp | Strict ERD treatment; not present in authoritative ERD 2 | 2026-07-20 |
| B1-D07 | se_created_by | INT UNSIGNED NULL, no physical FK, supporting index `idx_attendance_session_se_created_by`, no ON UPDATE/ON DELETE action. Secretary FK retains name `fk_attendance_session_user_account`. | 2026-07-20 |
| B1-D08 | New FK nullability | All 10 new FKs use INT UNSIGNED NOT NULL | 2026-07-20 |
| B1-D09 | New attribute nullability | 32-attribute matrix: 14 nullable, 18 not nullable (see approved matrix) | 2026-07-20 |
| B1-D10 | Exact bounded-text types | 20 VARCHAR lengths approved for new/renamed fields | 2026-07-20 |
| B1-D11 | Numeric precision | course_component.lab_weight/lec_weight DECIMAL(5,4); component.weight DECIMAL(5,4); student_term_grade.stg_grade DECIMAL(5,2) | 2026-07-20 |
| B1-D12 | Audit timestamp | Source `Audit_Log.timestamp` mapped to physical `audit_log.logged_at` DATETIME(6) NOT NULL (UTC). Approved naming deviation. | 2026-07-20 |
| B1-D13 | Image/template timestamps | student_image.retrieved_on DATETIME(6) NULL (UTC); facial_template.captured_on DATETIME(6) NULL (UTC) | 2026-07-20 |
| B1-D14 | is_regular | TINYINT(1) NOT NULL with CHECK `chk_student_is_regular_bool` IN (0,1) | 2026-07-20 |
| B1-D15 | Referential actions | All new and recreated FKs use ON UPDATE RESTRICT ON DELETE RESTRICT | 2026-07-20 |
| B1-D16 | Migration strategy | 14 single-table DROP migrations (016-029) + 19 single-table CREATE migrations (030-048); no IF EXISTS/IF NOT EXISTS; user_account retained from 001; no data-copy, seed, or compatibility migration | 2026-07-20 |

## Resolved Decisions Carried from Phase 1A

| ID | Topic |
|---|---|
| P1-D01 | 15 entities (not 14) |
| P1-D02 | Option A: historical clean-build checkpoints only |
| P1-D03 | SQL-safe physical identifiers; source names in documentation/manifests |
| P1-D04 | MariaDB 10.4.32 physical baseline |
| P1-D10 | Retention_Record FK: student_id only |
| P1-D19 | Gatekeeper validation standard |
| P1-D29 | se_created_by FK rejected for Phase 1A source fidelity |
| P1-D30 | se_secretary_id FK target: user_account.user_id |

## Approved Naming/Security Deviations

### Carried from Phase 1A

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
| DEV-17 | `faculty_BU_email` | `faculty_bu_email` (Phase 1A only) |
| DEV-18 | `student_BU_email` | `student_bu_email` (Phase 1A) |
| DEV-19 | `Attendance_Session.se_created_by` | no FK; INT UNSIGNED NULL; supporting index |
| DEV-20 | `Attendance_Session.se_device_id` | INT UNSIGNED NULL; supporting index (Phase 1A only) |

### Phase 1B Deviations

| DEV | Source | Physical | Reason |
|---|---|---|---|
| DEV-1B-01 | `Audit_Log.timestamp` | `audit_log.logged_at` | Reserved word avoidance (`TIMESTAMP` is a keyword) |
| DEV-1B-02 | `Faculty.faculty_id` | `faculty.fac_id` | ERD 2 PK rename |
| DEV-1B-03 | `Faculty.faculty_fname` | `faculty.fac_fname` | ERD 2 rename |
| DEV-1B-04 | `Faculty.faculty_lname` | `faculty.fac_lname` | ERD 2 rename |
| DEV-1B-05 | `Faculty.faculty_is_admin` | `faculty.is_admin` | ERD 2 rename |
| DEV-1B-06 | `Student.student_id` | `student.stud_id` | ERD 2 PK rename |
| DEV-1B-07 | `Student.student_number` | `student.stud_number` | ERD 2 rename |
| DEV-1B-08 | `Student.student_fname` | `student.stud_fname` | ERD 2 rename |
| DEV-1B-09 | `Student.student_lname` | `student.stud_lname` | ERD 2 rename |
| DEV-1B-10 | `Student.student_bu_email` | `student.stud_bu_email` | ERD 2 rename |
| DEV-1B-11 | `Student.student_contact` | `student.stud_contact` | ERD 2 rename |
| DEV-1B-12 | `Student.student_yr_level` | `student.year_level` | ERD 2 rename |
| DEV-1B-13 | `Student.student_status` | `student.acc_status` | ERD 2 rename; semantic change |
| DEV-1B-14 | `Course.course_name` | `course.name` | ERD 2 rename |
| DEV-1B-15 | `Course.course_units` | `course.units` | ERD 2 rename |
| DEV-1B-16 | `Class_Section.cs_block_secretary` | `class_section.cs_block_sec` | ERD 2 rename |
| DEV-1B-17 | `Attendance_Session.se_device_id` | `attendance_session.device_id` | ERD 2 rename; FK backed by Device |
| DEV-1B-18 | `Retention_Risk.risk_id` | `retention_risk.report_id` | ERD 2 PK rename |
| DEV-1B-19 | `Retention_Risk.risk_level` | `retention_risk.risk_category` | ERD 2 rename; semantic change |
| DEV-1B-20 | `Course_Components` | `course_component` | P1-D03 singular form |

## Approved Object Counts

| Object | Count |
|---|---|
| Business tables | 20 |
| Physical columns | 124 |
| Primary keys | 20 |
| Executable foreign keys | 23 |
| FK indexes | 23 |
| Supporting indexes (non-FK) | 1 |
| Boolean check constraints | 4 |
| Non-PK unique constraints | 0 |
| Policy/range checks | 0 |
| Business defaults | 0 |
| Seed rows | 0 |

## Table Inventory

| Table | Source | Columns | PK |
|---|---|---|---|
| `user_account` | `User_Account` | 5 | `user_id` |
| `audit_log` | `Audit_Log` | 6 | `log_id` |
| `device` | `Device` | 5 | `device_id` |
| `faculty` | `Faculty` | 8 | `fac_id` |
| `student` | `Student` | 13 | `stud_id` |
| `student_image` | `Student_Image` | 5 | `si_id` |
| `facial_template` | `Facial_Template` | 4 | `template_id` |
| `course` | `Course` | 7 | `course_id` |
| `course_component` | `Course_Components` | 6 | `cc_id` |
| `component` | `Component` | 4 | `comp_id` |
| `class_section` | `Class_Section` | 10 | `cs_id` |
| `enrollment` | `Enrollment` | 5 | `en_id` |
| `attendance_session` | `Attendance_Session` | 9 | `se_id` |
| `attendance_record` | `Attendance_Record` | 6 | `rec_id` |
| `assessment` | `Assessment` | 7 | `a_id` |
| `student_assessment_grade` | `Student_Assessment_Grade` | 5 | `sg_id` |
| `student_term_grade` | `Student_Term_Grade` | 5 | `stg_id` |
| `retention_record` | `Retention_Record` | 5 | `record_id` |
| `remedial_log` | `Remedial_Logs` | 5 | `rl_id` |
| `retention_risk` | `Retention_Risk` | 4 | `report_id` |

## Field Reconciliation

### Phase 1A to Phase 1B

| Category | Count |
|---|---|
| Phase 1A columns | 98 |
| Retained unchanged | 59 |
| Renamed | 18 |
| Carried forward | 77 |
| Removed entirely | 6 |
| Moved to another table | 3 |
| Replaced by new structure | 4 |
| Moved and split into Component | 8 |
| Removed/moved/replaced | 21 |
| Phase 1B target fields not classified as retained or renamed | 47 |
| Phase 1B total | 124 |

### Removed Entirely (6)

faculty_bu_email, student_face_image, cs_year_level, a_type, risk_confidence, rr_timestamp

### Moved to Another Table (3)

lec_weight, lab_weight, has_zero_rule (course → course_component)

### Replaced by New Structure (4)

class_section.course_id, class_section.instructor_id, assessment.course_id, retention_risk.student_id

### Moved and Split into Component (8)

term_exam_weight, lec_quiz_weight, recit_weight, output_weight, prac_exam_weight, lab_exercise_weight, lab_quiz_weight, lab_perf_weight

## FK Constraint Names

| # | Constraint | Child | Parent |
|---|---|---|---|
| 1 | `fk_faculty_user_account` | faculty | user_account |
| 2 | `fk_audit_log_user_account` | audit_log | user_account |
| 3 | `fk_student_image_student` | student_image | student |
| 4 | `fk_facial_template_student` | facial_template | student |
| 5 | `fk_enrollment_student` | enrollment | student |
| 6 | `fk_retention_record_student` | retention_record | student |
| 7 | `fk_enrollment_class_section` | enrollment | class_section |
| 8 | `fk_attendance_session_class_section` | attendance_session | class_section |
| 9 | `fk_attendance_session_user_account` | attendance_session | user_account |
| 10 | `fk_attendance_record_attendance_session` | attendance_record | attendance_session |
| 11 | `fk_attendance_record_enrollment` | attendance_record | enrollment |
| 12 | `fk_remedial_log_retention_record` | remedial_log | retention_record |
| 13 | `fk_student_assessment_grade_assessment` | student_assessment_grade | assessment |
| 14 | `fk_student_assessment_grade_enrollment` | student_assessment_grade | enrollment |
| 15 | `fk_attendance_session_device` | attendance_session | device |
| 16 | `fk_course_component_course` | course_component | course |
| 17 | `fk_course_component_faculty` | course_component | faculty |
| 18 | `fk_class_section_course_component` | class_section | course_component |
| 19 | `fk_component_course_component` | component | course_component |
| 20 | `fk_assessment_component` | assessment | component |
| 21 | `fk_assessment_class_section` | assessment | class_section |
| 22 | `fk_retention_risk_student_assessment_grade` | retention_risk | student_assessment_grade |
| 23 | `fk_student_term_grade_enrollment` | student_term_grade | enrollment |

## Index Names

### FK Indexes (23)

idx_faculty_user_id, idx_audit_log_user_id, idx_student_image_student_id, idx_facial_template_student_id, idx_enrollment_student_id, idx_retention_record_student_id, idx_enrollment_cs_id, idx_attendance_session_cs_id, idx_attendance_session_se_secretary_id, idx_attendance_record_se_id, idx_attendance_record_en_id, idx_remedial_log_record_id, idx_student_assessment_grade_a_id, idx_student_assessment_grade_en_id, idx_attendance_session_device_id, idx_course_component_course_id, idx_course_component_fac_id, idx_class_section_cc_id, idx_component_cc_id, idx_assessment_comp_id, idx_assessment_cs_id, idx_retention_risk_sg_id, idx_student_term_grade_en_id

### Supporting Index (1)

idx_attendance_session_se_created_by

## Check Constraints (4)

| Check | Expression |
|---|---|
| `chk_faculty_is_admin_bool` | `is_admin IN (0,1)` |
| `chk_student_is_regular_bool` | `is_regular IN (0,1)` |
| `chk_student_image_is_primary_bool` | `is_primary IN (0,1)` |
| `chk_course_component_has_zero_rule_bool` | `has_zero_rule IN (0,1)` |

## Exclusions

- The six Phase 1A compatibility fields (faculty_bu_email, student_face_image, cs_year_level, a_type, risk_confidence, rr_timestamp) are intentionally omitted
- No student.user_id column or FK
- user_account is retained from migration 001; not dropped or recreated by Phase 1B
- No Enrollment or Student_Term_Grade FK on retention_record
- se_created_by has no physical FK
- Phase 1C tables are not present

## UTC Semantic Notes

- `attendance_record.sat_time_recorded`: DATETIME(6), stored in UTC
- `remedial_log.rl_date_logged`: DATETIME(6), stored in UTC
- `audit_log.logged_at`: DATETIME(6), stored in UTC
- `student_image.retrieved_on`: DATETIME(6) NULL, stored in UTC
- `facial_template.captured_on`: DATETIME(6) NULL, stored in UTC

## Migration Files

| File | Table Operation | SHA-256 |
|---|---|---|
| `001_phase_1a_user_account.sql` | CREATE user_account | `5DC5369171E54FC8B316C90CDD41D4715E10AF50A0985745248F0DA2286DAC1C` |
| `002_phase_1a_student.sql` | CREATE student | `CBE0821E0CBC19C1C68CC2239C2030FFD587E81CA3C603F5A90B41EF24C543F5` |
| `003_phase_1a_course.sql` | CREATE course | `6558ACD36008002C6C133696806B866088B7017926DE0B927E5DC8CFF5D70B13` |
| `004_phase_1a_faculty.sql` | CREATE faculty | `1FA2CA403D8F57840FF5CB427CEF8FBAB11D77616E9451F201081FB01BA2109F` |
| `005_phase_1a_class_section.sql` | CREATE class_section | `9B94BF5F4E44C24B12746E4C42350E7DD9CBCCD8FB88C0DD2EE331BBA9692CC0` |
| `006_phase_1a_enrollment.sql` | CREATE enrollment | `6F24F710B28D4F6683E31C6EA3D4205F60AC2B241CB34FE313F939339EB5ED02` |
| `007_phase_1a_attendance_session.sql` | CREATE attendance_session | `37322505872474ECAE530DA794E9D101BA59AF9C24BA5D6A8457BFD1DC38DC1A` |
| `008_phase_1a_assessment.sql` | CREATE assessment | `C638DFC529207D8FE5387ECB830DCB24F3E93CC90E8E105A349EE4C52237B55D` |
| `009_phase_1a_student_image.sql` | CREATE student_image | `9E8ECCF19AD2C40F12E85C8E8258351F80127129D212B32DA1A4F86C8B4EC707` |
| `010_phase_1a_facial_template.sql` | CREATE facial_template | `74023C2BDB517E90AD0327D8721155C1727D543F07298A95884229073D871F0C` |
| `011_phase_1a_attendance_record.sql` | CREATE attendance_record | `DCE8A7B692781B8640D7E649586CE3D0B0C3CAADDFFA8561B83B518D79895A46` |
| `012_phase_1a_student_assessment_grade.sql` | CREATE student_assessment_grade | `53036FD6FD6B0DAA1D08A3E3B98AC16A19C3141A9EE0A96954EB40614E7C124F` |
| `013_phase_1a_retention_record.sql` | CREATE retention_record | `D16D056066D1A2F9AFDD18A3CDE9F34F7442EDF51C9A82E35911151B865BB14B` |
| `014_phase_1a_remedial_log.sql` | CREATE remedial_log | `B473EC62B20B0FBB79F5E73A3072321145D5112443148D1C81BAE6968ADF7056` |
| `015_phase_1a_retention_risk.sql` | CREATE retention_risk | `059ADDEAE8C54170A0979710A8D0F30F109673AFFAA12E814276921AD70A6819` |
| `016_phase_1b_drop_attendance_record.sql` | DROP attendance_record | `60F07A0E2DFF72A0B1C88F3DEFB008D829EA255AF392A20CE77BF5799DD470D5` |
| `017_phase_1b_drop_student_assessment_grade.sql` | DROP student_assessment_grade | `A4CE6FC91AA6A39BA1F4BBAC0DD79A30071E3BFBD235631ED230C0EE7F3AEDC6` |
| `018_phase_1b_drop_remedial_log.sql` | DROP remedial_log | `73C8AADA1D61E25A65AF62CAE732B30419751FE7AE1DCC1C28060C104255B941` |
| `019_phase_1b_drop_retention_risk.sql` | DROP retention_risk | `F13347F5992B4B97A98405768636DCBF3282311B9BF1AAA858426D173BDA5797` |
| `020_phase_1b_drop_student_image.sql` | DROP student_image | `460C992796B4617FEF13ECD288F52423F428740C33D1BFD87AB42F940C060A90` |
| `021_phase_1b_drop_facial_template.sql` | DROP facial_template | `78E3005DCA06556273B4FD30719D1A5CFDF78F05FB8281F63F2114B216C225AF` |
| `022_phase_1b_drop_enrollment.sql` | DROP enrollment | `0666755B4B36309298E29226521E23DBCC967B0FC1B391304C8AC5BEB9636AEA` |
| `023_phase_1b_drop_assessment.sql` | DROP assessment | `69BA21B5DEB1B644602DDEE21E7F96CDB56388F7098801B281366AF9FDA82A4F` |
| `024_phase_1b_drop_attendance_session.sql` | DROP attendance_session | `076B2D4B0BAD7184C91A8EA369E20A3574760235DF3DAF08AB25528FBEC6A978` |
| `025_phase_1b_drop_retention_record.sql` | DROP retention_record | `DF2516A3CECB1E512492827D1D97DC93EF1D2BF8B6312B38D9E5744C04C33D42` |
| `026_phase_1b_drop_class_section.sql` | DROP class_section | `8B1580A2655D11D2DBBAC4CEBEBACA7B851925C132ED90BB5E4E5F71CA3D7EB5` |
| `027_phase_1b_drop_faculty.sql` | DROP faculty | `CE179C95E30318CAA0EA76553EB110DE413B681736EB227019FD8BC56E34CD0C` |
| `028_phase_1b_drop_student.sql` | DROP student | `E8B10772D7ECFA1A73D90B07BCFB0969F73B59513EEB34B9F3AFEAB12F32103C` |
| `029_phase_1b_drop_course.sql` | DROP course | `C3A9615941D175664C51E762B378265405A7DF0722588E9F4B086A84A950C91D` |
| `030_phase_1b_device.sql` | CREATE device | `B1DB8FC8CECF2DA65957E6E9C94A5D7378489F274AE24B3D0A63AC383E5B2BE9` |
| `031_phase_1b_audit_log.sql` | CREATE audit_log | `EBDF977459FC9F55E3803BDB6BE7CC015AC16EC0C116CCE84662F9ED2FE0A485` |
| `032_phase_1b_faculty.sql` | CREATE faculty | `DE21A6D9C4A44E7CA1BB9603D2B1B3FBC9D3C9D9586B28A2347DC260BDE91A9A` |
| `033_phase_1b_student.sql` | CREATE student | `A78FDF7F299FB15CB28460447B192F44D5F06B07F4B68DC501FD3B70C5832CF5` |
| `034_phase_1b_course.sql` | CREATE course | `F1B2F25517BAEDA0E834378D31F2758AEA65447A7AECCB348C568499EFFA6D48` |
| `035_phase_1b_course_component.sql` | CREATE course_component | `B2EE8165FC4BCC188DA4E282B894986286A1C6802B665A0543E5672411D605C3` |
| `036_phase_1b_component.sql` | CREATE component | `78480E5C5FFCEE4598C5AC8726D01879FC0996FFBF51638B471D84A8B26B2C0D` |
| `037_phase_1b_class_section.sql` | CREATE class_section | `9D92A912694F1CE7E6CB53E6988694A391B1240532127AAE009ACBF0A2A736E1` |
| `038_phase_1b_enrollment.sql` | CREATE enrollment | `93DB9595930D0F902E24B30C07D38A3C7D592FAF557BC7EC039B00834F5231DC` |
| `039_phase_1b_attendance_session.sql` | CREATE attendance_session | `7960FE1C88E0291BC62EDEFA68D5E9905C39146649B2C1A24558CE8280FF594D` |
| `040_phase_1b_assessment.sql` | CREATE assessment | `D31FC266A18C5A6593163AF86FFDD68F27281C1BB42437597B1CF02F0D1310C1` |
| `041_phase_1b_student_image.sql` | CREATE student_image | `BDDDAE8944E2AEBFC565B51C81DE2864C15D9E813657434D2DD3F5E3F67ADE53` |
| `042_phase_1b_facial_template.sql` | CREATE facial_template | `7C22AD8B49606A1C5FECCC731EEF404404D8E81E4F663567B7DD7037DD0D7B94` |
| `043_phase_1b_attendance_record.sql` | CREATE attendance_record | `9EBB6BBC6FB1301D221AABC8F071690BBFE04F4E0FCB115B351A2D230202799B` |
| `044_phase_1b_student_assessment_grade.sql` | CREATE student_assessment_grade | `E5059CF6DF7E075F7785E2CB7B8DB917E7D93680BEDC0039C86EF180617429CC` |
| `045_phase_1b_student_term_grade.sql` | CREATE student_term_grade | `4963E709A9275064C4F5696F232510FAA92F912A669275232A97113DB3E704A7` |
| `046_phase_1b_retention_record.sql` | CREATE retention_record | `3F9876E7E82B6A3A67EED2D35C99CC2C8AEE168C05ED0F5E6B31304C198AF449` |
| `047_phase_1b_remedial_log.sql` | CREATE remedial_log | `30FC18C0CDCD94C7423ACCF9F067EEAF78D908B709A8482F7954B5AD93C855C1` |
| `048_phase_1b_retention_risk.sql` | CREATE retention_risk | `7F236215AD09F03B74035C96962C83DF87C84804B4A100F8CE45F7EAC1DD4BC1` |

## Validation Evidence

Reference: `docs/database/phase-1b-validation-evidence.md`
