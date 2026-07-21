# Phase 1 Source Reconciliation

## Purpose and authority

Phase 1 preserves a controlled evolution: Phase 1A reproduces the original structural snapshot, Phase 1B reaches the present 20-entity snapshot, Phase 1C applies separately approved corrections, and Phase 1D validates the complete chain. No ERD is finalized by this document.

Primary AI-readable structural authority comes from `erd-sources/phase-1-authoritative-plaintext-transcription.md`, which contains the Owner-provided plaintext transcription of both ERDs.

Archived images (`erd-sources/phase-1a-original-paper-erd.png`, `erd-sources/phase-1b-present-20-entity-erd.png`) remain provenance evidence. Image-only visual labels, cardinalities, and specialization markers are provenance annotations.

Where image interpretation conflicts with the Owner plaintext, the plaintext supersedes it. Conflicting interpretations are marked `SUPERSEDED BY OWNER PLAINTEXT`.

Physical SQL names (e.g., `user_account`, `faculty`) are separate from source display names (e.g., `User_Account`, `Faculty`). Phase 1C items below are recommendations, not source facts.

## Artifact provenance

The archive and hashes are recorded in [`erd-sources/README.md`](erd-sources/README.md). The authoritative plaintext transcription is in [`erd-sources/phase-1-authoritative-plaintext-transcription.md`](erd-sources/phase-1-authoritative-plaintext-transcription.md). The original source has 15 visible entities, despite the paper prose statement of 14 tables. The Owner-designated structural image controls Phase 1A; the conflict remains recorded for confirmation.

## Phase 1A source transcription

No types, defaults, checks, indexes, referential actions, or constraint names are shown. `PK` and `FK` are transcribed only where visible.

| Entity | PK | FKs | Other visible attributes |
|---|---|---|---|
| `User_Account` | `user_id` | None | `username`, `password`, `role`, `status` |
| `Faculty` | `faculty_id` | `user_id` | `faculty_fname`, `faculty_lname`, `faculty_BU_email`, `faculty_is_admin` |
| `Student` | `student_id` | None | `student_number`, `student_fname`, `student_lname`, `student_BU_email`, `student_contact`, `student_yr_level`, `student_status`, `student_face_image` |
| `Student_Image` | `si_id` | `student_id` | `file_path`, `is_primary` |
| `Facial_Template` | `template_id` | `student_id` | `lbph_vector` |
| `Attendance_Session` | `se_id` | `cs_id`, `se_secretary_id`, `se_device_id` | `se_date`, `se_created_by`, `se_start`, `se_end`, `se_code` |
| `Attendance_Record` | `rec_id` | `se_id`, `en_id` | `sat_time_recorded`, `rec_status`, `rec_verification_method` |
| `Course` | `course_id` | None | `course_code`, `course_name`, `course_units`, `lec_weight`, `term_exam_weight`, `lec_quiz_weight`, `recit_weight`, `output_weight`, `lab_weight`, `prac_exam_weight`, `lab_exercise_weight`, `lab_quiz_weight`, `lab_perf_weight`, `has_zero_rule` |
| `Class_Section` | `cs_id` | `course_id`, `instructor_id` | `cs_name`, `cs_semester`, `cs_year_level`, `cs_lab_room`, `cs_lec_room`, `cs_block`, `cs_block_secretary`, `status` |
| `Enrollment` | `en_id` | `student_id`, `cs_id` | `en_status` |
| `Assessment` | `a_id` | `course_id` | `a_title`, `a_type`, `a_max_score`, `a_date` |
| `Student_Assessment_Grade` | `sg_id` | `a_id`, `en_id` | `sg_raw_score`, `sg_grade` |
| `Retention_Record` | `record_id` | `student_id` | `record_current_stage`, `record_status`, `record_remarks` |
| `Remedial_Logs` | `rl_id` | `record_id` | `rl_student_standing`, `rl_date_logged`, `rl_remedial_score` |
| `Retention_Risk` | `risk_id` | `student_id` | `risk_level`, `risk_confidence`, `rr_timestamp` |

### Phase 1A visible relationship transcription

`AMBIGUOUS`, `NOT SHOWN`, and `UNREADABLE` record the image evidence without adding physical assumptions. Cardinality notation is transcribed only where it is legible; an endpoint shown as `0..*` is optional on that child side.

| Source relationship ID | Parent/source entity | Child/target entity | Relationship name | Visible cardinality | Visible optionality | Supporting displayed FK | Connector/FK agree | Ambiguity notes |
|---|---|---|---|---|---|---|---|---|
| 1A-R01 | `User_Account` | `Faculty` | NOT SHOWN | NOT SHOWN | NOT SHOWN | `Faculty.user_id` | Yes | Image shows `INS` connector label and disjoint `role =` marker (image provenance only). Plaintext defines ordinary FK: `Faculty.user_id → User_Account.user_id`. |
| 1A-R02 | SUPERSEDED | SUPERSEDED | SUPERSEDED BY OWNER PLAINTEXT | SUPERSEDED | SUPERSEDED | SUPERSEDED | SUPERSEDED | Owner plaintext ERD 1 does not define User_Account → Student. Image showed `STD` specialization connector (image provenance only). |
| 1A-R03 | `Faculty` | `Class_Section` | NOT SHOWN | 1 to 0..* | child optional | `Class_Section.instructor_id` | Yes | Connector is routed through the diagram; `instructor_id` does not state whether it references `faculty_id` or another identity. |
| 1A-R04 | `Course` | `Class_Section` | NOT SHOWN | 1 to 0..* | child optional | `Class_Section.course_id` | Yes | None shown beyond the FK. |
| 1A-R05 | `Class_Section` | `Attendance_Session` | NOT SHOWN | 1 to 0..* | child optional | `Attendance_Session.cs_id` | Yes | Long routed line crosses other connectors. |
| 1A-R06 | `User_Account` | `Attendance_Session` | NOT SHOWN | NOT SHOWN | NOT SHOWN | `Attendance_Session.se_secretary_id` | Yes | `se_secretary_id` references `User_Account.user_id` per Owner plaintext; identifies the secretary account. |
| 1A-R07 | `Attendance_Session` | `Attendance_Record` | NOT SHOWN | 1 to 0..* | child optional | `Attendance_Record.se_id` | Yes | None shown. |
| 1A-R08 | `Enrollment` | `Attendance_Record` | NOT SHOWN | 1 to 0..* | child optional | `Attendance_Record.en_id` | Yes | None shown. |
| 1A-R09 | `Student` | `Student_Image` | NOT SHOWN | 1 to 1..* | child mandatory marker visible | `Student_Image.student_id` | Yes | Image lifecycle and uniqueness are not shown. |
| 1A-R10 | `Student` | `Facial_Template` | NOT SHOWN | 1 to 1..* | child mandatory marker visible | `Facial_Template.student_id` | Yes | Template lifecycle is not shown. |
| 1A-R11 | `Student` | `Enrollment` | NOT SHOWN | 1 to 1..* | child mandatory marker visible | `Enrollment.student_id` | Yes | None shown. |
| 1A-R12 | `Class_Section` | `Enrollment` | NOT SHOWN | 1 to 0..* | child optional | `Enrollment.cs_id` | Yes | Routed line is visually crowded. |
| 1A-R13 | `Course` | `Assessment` | NOT SHOWN | 1 to 0..* | child optional | `Assessment.course_id` | Yes | None shown. |
| 1A-R14 | `Assessment` | `Student_Assessment_Grade` | NOT SHOWN | 1 to 1..* | child mandatory marker visible | `Student_Assessment_Grade.a_id` | Yes | None shown. |
| 1A-R15 | `Enrollment` | `Student_Assessment_Grade` | NOT SHOWN | 1 to 0..* | child optional | `Student_Assessment_Grade.en_id` | Yes | None shown. |
| 1A-R16 | `Student` | `Retention_Record` | NOT SHOWN | 1 to 0..* | child optional | `Retention_Record.student_id` | Yes | None shown. |
| 1A-R17 | `Retention_Record` | `Remedial_Logs` | NOT SHOWN | 1 to 0..* | child optional | `Remedial_Logs.record_id` | Yes | None shown. |
| 1A-R18 | `Student` | `Retention_Risk` | NOT SHOWN | 1 to 1..* | child mandatory marker visible | `Retention_Risk.student_id` | Yes | Risk meaning and model provenance are not shown. |
| 1A-R19 | `User_Account` | `Attendance_Session` | NOT SHOWN | NOT SHOWN | NOT SHOWN | `Attendance_Session.se_created_by` | AMBIGUOUS | Logical target is `User_Account.user_id` per Owner plaintext; no explicit FK marker displayed. |
| 1A-R20 | `Device` | `Attendance_Session` | NOT SHOWN | NOT SHOWN | NOT SHOWN | `Attendance_Session.se_device_id` | DANGLING SOURCE FK | `se_device_id` FK references Device per Owner plaintext; Device entity not displayed in ERD 1. |

## Phase 1B source transcription

The present image contains exactly 20 entities. Plaintext-authoritative spellings supersede earlier image-based readings where noted. Source spelling `sat_time_recorded` is preserved.

| Entity | PK | FKs | Other visible attributes |
|---|---|---|---|
| `User_Account` | `user_id` | None | `username`, `password`, `role`, `status` |
| `Faculty` | `fac_id` | `user_id` | `fac_fname`, `fac_lname`, `fac_mname`, `is_admin`, `contact_no`, `emp_status` |
| `Student` | `stud_id` | None | `stud_number`, `stud_fname`, `stud_lname`, `stud_mname`, `sex`, `birthdate`, `admission_date`, `stud_BU_email`, `stud_contact`, `year_level`, `is_regular`, `acc_status` |
| `Student_Image` | `si_id` | `student_id` | `file_path`, `is_primary`, `retrieved_on` |
| `Facial_Template` | `template_id` | `student_id` | `lbph_vector`, `captured_on` |
| `Device` | `device_id` | None | `device_name`, `ip_add`, `location`, `status` |
| `Attendance_Session` | `se_id` | `device_id`, `cs_id`, `se_secretary_id` | `se_date`, `se_created_by`, `se_start`, `se_end`, `se_code` |
| `Attendance_Record` | `rec_id` | `se_id`, `en_id` | `sat_time_recorded`, `rec_status`, `rec_verification_method` |
| `Audit_Log` | `log_id` | `user_id` | `action`, `target`, `timestamp`, `ip_add` |
| `Course` | `course_id` | None | `course_code`, `name`, `units`, `year_level`, `semester`, `description` |
| `Class_Section` | `cs_id` | `cc_id` | `cs_name`, `cs_semester`, `cs_school_year`, `cs_lab_room`, `cs_lec_room`, `cs_block`, `cs_block_sec`, `status` |
| `Enrollment` | `en_id` | `student_id`, `cs_id` | `en_status`, `date_enrolled` |
| `Course_Components` | `cc_id` | `fac_id`, `course_id` | `lab_weight`, `lec_weight`, `has_zero_rule` |
| `Component` | `comp_id` | `cc_id` | `comp_name`, `weight` |
| `Assessment` | `a_id` | `comp_id`, `cs_id` | `a_title`, `a_max_score`, `a_date`, `status` |
| `Student_Assessment_Grade` | `sg_id` | `a_id`, `en_id` | `sg_raw_score`, `sg_grade` |
| `Student_Term_Grade` | `stg_id` | `en_id` | `stg_term`, `stg_grade`, `stg_remarks` |
| `Retention_Record` | `record_id` | `student_id` | `record_current_stage`, `record_status`, `record_remarks` |
| `Remedial_Logs` | `rl_id` | `record_id` | `rl_student_standing`, `rl_date_logged`, `rl_remedial_score` |
| `Retention_Risk` | `report_id` | `sg_id` | `risk_category`, `remark` |

Named image-provenance relationship labels include `records`, `is held for`, `has`, `enrolls in`, `contains`, `configures`, `defines`, `can have`, `receives`, `evaluates`, and `is based on`.

### Phase 1B visible relationship transcription

| Source relationship ID | Parent/source entity | Child/target entity | Relationship name | Visible cardinality | Visible optionality | Supporting displayed FK | Connector/FK agree | Ambiguity notes |
|---|---|---|---|---|---|---|---|---|
| 1B-R01 | `User_Account` | `Faculty` | NOT SHOWN | NOT SHOWN | NOT SHOWN | `Faculty.user_id` | Yes | Image shows `fac` connector label and disjoint `role =` marker (image provenance only). Plaintext defines ordinary FK: `Faculty.user_id → User_Account.user_id`. |
| 1B-R02 | `User_Account` | `Student` | NOT SHOWN | NOT SHOWN | NOT SHOWN | NOT SHOWN | AMBIGUOUS | Owner plaintext states that `User_Account` is linked to Student, but Student has no displayed `user_id`. Image `stu` notation is provenance only; do not invent a physical account FK. |
| 1B-R03 | `User_Account` | `Audit_Log` | `records` | 1 to 0..* | child optional | `Audit_Log.user_id` | Yes | Historical attribution semantics are not shown. |
| 1B-R04 | `Device` | `Attendance_Session` | `records` | 1 to 0..* | child optional | `Attendance_Session.device_id` | Yes | Legacy `se_device_id` mapping is not shown. |
| 1B-R05 | `Class_Section` | `Attendance_Session` | `is held for` | 1 to 0..* | child optional | `Attendance_Session.cs_id` | Yes | None shown. |
| 1B-R06 | `User_Account` | `Attendance_Session` | NOT SHOWN | NOT SHOWN | NOT SHOWN | `Attendance_Session.se_secretary_id` | Yes | `se_secretary_id` references `User_Account.user_id` per Owner plaintext; identifies the secretary account. |
| 1B-R07 | `Attendance_Session` | `Attendance_Record` | `records` | 1 to 0..* | child optional | `Attendance_Record.se_id` | Yes | None shown. |
| 1B-R08 | `Enrollment` | `Attendance_Record` | NOT SHOWN | 1 to 0..* | child optional | `Attendance_Record.en_id` | Yes | Connector label is not legible/not shown. |
| 1B-R09 | `Student` | `Student_Image` | `has` | 1 to 1..* | child mandatory marker visible | `Student_Image.student_id` | Yes | Owner plaintext confirms parent PK is `Student.stud_id`; `student_id` child label references `stud_id`. |
| 1B-R10 | `Student` | `Facial_Template` | `has` | 1 to 1..* | child mandatory marker visible | `Facial_Template.student_id` | Yes | Owner plaintext confirms parent PK is `Student.stud_id`; `student_id` child label references `stud_id`. |
| 1B-R11 | `Student` | `Enrollment` | `enrolls in` | 1 to 1..* | child mandatory marker visible | `Enrollment.student_id` | Yes | Owner plaintext confirms parent PK is `Student.stud_id`; `student_id` child label references `stud_id`. |
| 1B-R12 | `Class_Section` | `Enrollment` | `contains` | 1 to 0..* | child optional | `Enrollment.cs_id` | Yes | None shown. |
| 1B-R13 | `Faculty` | `Course_Components` | `configures` | 1 to 0..* | child optional | `Course_Components.fac_id` | Yes | Faculty identity relationship beyond this FK is not shown. |
| 1B-R14 | `Course` | `Course_Components` | `defines` | 1 to 0..* | child optional | `Course_Components.course_id` | Yes | Configuration sharing scope is not shown. |
| 1B-R15 | `Course_Components` | `Class_Section` | `has` | 1 to 0..* | child optional | `Class_Section.cc_id` | Yes | No uniqueness/cardinality constraint is shown. |
| 1B-R16 | `Course_Components` | `Component` | `contains` | 1 to 1..* | child mandatory marker visible | `Component.cc_id` | Yes | Component taxonomy is not shown. |
| 1B-R17 | `Component` | `Assessment` | `can have` | 1 to 0..* | child optional | `Assessment.comp_id` | Yes | None shown. |
| 1B-R18 | `Class_Section` | `Assessment` | `has` | 1 to 0..* | child optional | `Assessment.cs_id` | Yes | None shown. |
| 1B-R19 | `Assessment` | `Student_Assessment_Grade` | `evaluates` | 1 to 1..* | child mandatory marker visible | `Student_Assessment_Grade.a_id` | Yes | None shown. |
| 1B-R20 | `Enrollment` | `Student_Assessment_Grade` | `receives` | 1 to 0..* | child optional | `Student_Assessment_Grade.en_id` | Yes | None shown. |
| 1B-R21 | `Enrollment` | `Student_Term_Grade` | `receives` | 1 to 0..* | child optional | `Student_Term_Grade.en_id` | Yes | Bracketed grade/remarks meaning is UNREADABLE. |
| 1B-R22 | SUPERSEDED | SUPERSEDED | SUPERSEDED BY OWNER PLAINTEXT | SUPERSEDED | SUPERSEDED | SUPERSEDED | SUPERSEDED | Owner plaintext ERD 2 does not define Student_Term_Grade → Retention_Record. Image-based connector superseded. |
| 1B-R23 | SUPERSEDED | SUPERSEDED | SUPERSEDED BY OWNER PLAINTEXT | SUPERSEDED | SUPERSEDED | SUPERSEDED | SUPERSEDED | Owner plaintext ERD 2 does not define Enrollment → Retention_Record. Image-based connector superseded. |
| 1B-R24 | `Retention_Record` | `Remedial_Logs` | `contains` | 1 to 0..* | child optional | `Remedial_Logs.record_id` | Yes | None shown. |
| 1B-R25 | `Student_Assessment_Grade` | `Retention_Risk` | `is based on` | 1 to 1..* | child mandatory marker visible | `Retention_Risk.sg_id` | Yes | Risk category/model semantics are not shown. |
| 1B-R26 | `Student` | `Retention_Record` | `has` | NOT SHOWN | NOT SHOWN | `Retention_Record.student_id` | Yes | `student_id` references `Student.stud_id` per Owner plaintext. |
| 1B-R27 | `User_Account` | `Attendance_Session` | NOT SHOWN | NOT SHOWN | NOT SHOWN | `Attendance_Session.se_created_by` | AMBIGUOUS | Logical target is `User_Account.user_id` per Owner plaintext; no explicit FK marker displayed. |

## Source comparison

| Source element | Present treatment |
|---|---|
| `Faculty` and its direct Class_Section relationship | Attribute names shortened (`faculty_* → fac_*`); entity name unchanged (`Faculty`); direct instructor relationship replaced by Faculty → Course_Components → Class_Section |
| Student identifiers and profile fields | Renamed from `student_*` to `stud_*`; middle name, sex, birthdate, admission date, and regularity are added; `student_face_image` is removed |
| `se_device_id` | 1A already marks `se_device_id` as FK to Device (not shown in 1A); 1B renames to `device_id` and adds Device entity |
| Course fields | `course_name→name`, `course_units→units`; detailed weights move to Course_Components/Component; year/semester/description are added |
| Class_Section | `course_id` and `instructor_id` are replaced by `cc_id`; school year is added; `cs_block_secretary→cs_block_sec` |
| Assessment | Course-level `a_type`/`course_id` are replaced by `comp_id`/`cs_id`; status is added |
| Enrollment | `date_enrolled` is added |
| Retention_Risk | Student-based risk with confidence/timestamp is replaced by score-based risk with category/remark |
| Device, Audit_Log, Course_Components, Component, Student_Term_Grade | Added |
| `Faculty.faculty_BU_email` | Removed in ERD 2 |

Relationship changes include Course→Course_Components→Class_Section, Course_Components→Component→Assessment, Class_Section→Assessment, Enrollment→Student_Term_Grade, and Student_Assessment_Grade→Retention_Risk.

## Conflict and ambiguity register

| ID | Source element | Present element | Relevant requirement | Description | Migration impact | Preservation impact | Treatment | Owner decision | Blocking |
|---|---|---|---|---|---|---|---|---|---|
| ERD-C01 | 1A image: 15 visible entities | Paper prose: 14 tables | 1A checkpoint fidelity | Counts conflict. | Do not delete/merge an image entity to force 14. | Keep both facts in evidence. | Preserve all 15 entities. | Resolved by Owner (2026-07-20): preserve all 15 entities; 14 is a documentation discrepancy. | No |
| ERD-C02 | `User_Account.password` | Same label | Credential safety | Source label risks plaintext interpretation. | No value transformation is approved. | Never preserve plaintext credentials. | Preserve label only; allow hashes, never plaintext. | Define physical credential representation. | No |
| ERD-C03 | `Faculty.user_id`; no Student account FK | Same pattern | Identity integrity | Faculty shows account link; Student does not. | No Student account backfill can run. | Do not invent source FK. | Preserve source facts. | Approve final identity model. | Identity backfill only |
| ERD-C04 | `Attendance_Session.se_created_by` | Same unmarked field | Creator attribution | Logical target is `User_Account.user_id` per Owner plaintext; no explicit FK marker is shown in source. | Physical FK creation requires approval. | Retain literal value; physical FK unresolved. | Preserve literal value; do not create physical FK without approval. | Resolved by Owner (2026-07-20): B1-D07 — INT UNSIGNED NULL, supporting index, no physical FK. Phase 1A treatment extended to Phase 1B. | No |
| ERD-C05 | `se_device_id` FK to Device (not shown in 1A) | `device_id` with explicit Device entity | Device transition | 1A shows `se_device_id` as FK to a Device entity not present; 1B introduces Device entity. | Requires deterministic device/value map. | Stop on unmappable populated values. | Require approved Device mapping. | Resolved by Owner (2026-07-20): Device entity implemented. attendance_session.device_id FK to device.device_id, NOT NULL per B1-D08. Under P1-D02 Option A no legacy value mapping is needed. | No |
| ERD-C06 | Course/instructor direct section links | Course_Components mediation | Configuration transition | Course/instructor relationship moves through Course_Components. | Requires sharing and key-map rule. | Prevent wrong cross-section/faculty sharing. | Preserve evidence; do not choose sharing. | Define configuration scope. | Yes |
| ERD-C07 | Course weight columns | Course_Components/Component | Grade weighting | Detailed weights become component rows. | Requires taxonomy, totals, and generated keys. | Retain legacy values until totals reconcile. | Require approved weight mapping. | Define taxonomy and zero-rule semantics. | Yes |
| ERD-C08 | Course-level Assessment | Component/section Assessment | Assessment scope | `a_type`/`course_id` are replaced by `comp_id`/`cs_id`. | May require duplication/repointing. | Every score must map exactly once. | Require target component/section rule. | Define duplication/scope rule. | Yes |
| ERD-C09 | Student-linked Retention_Record | `Retention_Record.student_id` FK only | Retention integrity | Owner plaintext ERD 2 defines only `student_id → Student.stud_id`. Previous image-based connectors to Enrollment and Student_Term_Grade are superseded. | Only `student_id` FK is authoritative. | Preserve `student_id` FK evidence. | Implement `student_id` FK; do not add Enrollment or Student_Term_Grade links. | Resolved by Owner plaintext: Student FK only. | No |
| ERD-C10 | Student risk/confidence/timestamp | Score risk/category/remark | Risk history | Risk target changes and evidence fields disappear. | Requires unique score association or archive. | Prevent loss of confidence/timestamp. | Require preservation/risk-to-score mapping. | Define mapping and archive rule. | Yes |
| ERD-C11 | `stg_grade`, `stg_remarks` | Same labels | Term-grade semantics | Grade/remarks semantics are not shown. | No computation/backfill is executable. | Preserve labels and source values. | Do not infer derived/stored meaning. | Define meaning/formula. | Yes |
| ERD-C12 | General `Remedial_Logs` | Same general log | First/second remedial and cost recovery | A single general log cannot distinguish ordered remedials and cost recovery. | No decomposition is approved in 1B. | Preserve 1B log exactly. | Preserve through 1B; correct through separately approved 1C staged model. | Define stages, actors, outcomes, recovery. | Blocking for 1C |
| ERD-C13 | Attendance and assessment are separate | Same absence of relation | Unexcused-absence rule | No attendance-to-assessment-treatment relationship exists despite the paper rule. | No automated score treatment can be migrated. | Keep attendance and score evidence distinct. | Require 1C evidence/treatment structure. | Define rule, authority, and review. | Blocking for 1C |
| ERD-C14 | `Student_Image`, `Facial_Template` | Same | Biometric privacy lifecycle | Consent, revocation, replacement, access, and retention lifecycle are absent. | No deletion/retention automation is executable. | Preserve source artifacts without claiming lifecycle compliance. | Require Phase 1C privacy decisions. | Define consent, access, retention, deletion. | Blocking for 1C |
| ERD-C15 | No audit entity | Minimal `Audit_Log` | Audit history | Present log is too minimal for append-oriented, redacted, historically attributable events. | No source backfill can be assumed. | Preserve exact 1B source fields first. | Preserve exact 1B then expand/replace only through 1C. | Define audit event/history model. | Blocking for relevant 1C group |
| ERD-C16 | Paper thresholds `2.5 or lower`, `50%`, `over 2.4` | No explicit policy model | Policy correctness | Operators, scales, and version are ambiguous. | No policy-derived record may be calculated. | Preserve source scores/records without invented decision. | Require Owner-approved operands, operators, scale, and versioning. | Approve policy semantics. | Blocking for 1C |
| ERD-C17 | `Student.student_face_image` | Field removed; `Student_Image` remains | Image reconciliation | Duplicate, primary-image, retention, and transfer rules are not shown. | No automatic transfer/removal is executable. | Retain both source evidence and resolve conflicts. | Require duplicate/primary/retention/data-transfer rules. | Resolved by Owner (2026-07-20): B1-D02 — strict ERD treatment. Field omitted. Under P1-D02 Option A no reconciliation is needed. | No |
| ERD-C18 | `Faculty.faculty_BU_email` | No corresponding ERD 2 Faculty field | Faculty-profile preservation | ERD 2 omits the Faculty email attribute present in ERD 1. | No populated-row migration is required while P1-D02 Option A remains in force; a data-bearing transition would require an archive or approved target. | Do not silently discard populated email values. | Record the removal and require a preservation rule before any data-bearing migration. | Resolved by Owner (2026-07-20): B1-D01 — strict ERD treatment. Field omitted. Under P1-D02 Option A no preservation is needed. | No |

## Unresolved physical assumptions

MariaDB types, lengths, nullability, defaults, identity generation, collation, indexes, check constraints, referential actions, source identifier policy, and constraint names are not shown. They require Owner approval before implementation.

## Source-fidelity deviation register template

| Deviation ID | Source element | Physical deviation | Reason | Meaning/data impact | Owner approval | Validation evidence |
|---|---|---|---|---|---|---|
| TBD | TBD | TBD | MariaDB validity, creation order, safety, or runner compatibility only | TBD | Pending | Stage manifest |

## Phase 1C recommendations

Candidate corrections include terms/offering history, enrollment split, versioned grading, grade revision, policy/evaluation history, staged remedial and cost recovery, attendance verification/overrides, biometric consent and lifecycle, ML prediction provenance, identity support, and append-oriented audit. They are not Phase 1A or 1B source facts and are not approved by this document.
