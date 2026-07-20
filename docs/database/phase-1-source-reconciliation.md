# Phase 1 Source Reconciliation

## Purpose and authority

Phase 1 preserves a controlled evolution: Phase 1A reproduces the original structural snapshot, Phase 1B reaches the present 20-entity snapshot, Phase 1C applies separately approved corrections, and Phase 1D validates the complete chain. No ERD is finalized by this document.

Phase 1A facts come only from `erd-sources/phase-1a-original-paper-erd.png`. Phase 1B facts come only from `erd-sources/phase-1b-present-20-entity-erd.png`. Phase 1C items below are recommendations, not source facts. The capstone paper and Gatekeeper-verified extract supply workflow, policy, and provenance context.

## Artifact provenance

The archive and hashes are recorded in [`erd-sources/README.md`](erd-sources/README.md). The original source has 15 visible entities, despite the paper prose statement of 14 tables. The Owner-designated structural image controls Phase 1A; the conflict remains recorded for confirmation.

## Phase 1A source transcription

No types, defaults, checks, indexes, referential actions, or constraint names are shown. `PK` and `FK` are transcribed only where visible.

| Entity | PK | FKs | Other visible attributes |
|---|---|---|---|
| `User Account` | `user_id` | None | `username`, `password`, `role`, `status` |
| `faculty` | `faculty_id` | `user_id` | `faculty_fname`, `faculty_lname`, `faculty_BU_email`, `faculty_is_admin` |
| `Student` | `student_id` | None | `student_number`, `student_fname`, `student_lname`, `student_BU_email`, `student_contact`, `student_yr_level`, `student_status`, `student_face_image` |
| `Student_Image` | `si_id` | `student_id` | `file_path`, `is_primary` |
| `Facial_Template` | `template_id` | `student_id` | `lbph_vector` |
| `Attendance_Session` | `se_id` | `cs_id`, `se_secretary_id` | `se_date`, `se_created_by`, `se_start`, `se_end`, `se_code`, `se_device_id` |
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
| 1A-R01 | `User Account` | `faculty` | `INS` | AMBIGUOUS (specialization) | AMBIGUOUS | `faculty.user_id` | AMBIGUOUS | Disjoint `role =` marker is visible; subtype participation and physical subtype key rule are not shown. |
| 1A-R02 | `User Account` | `Student` | `STD` | AMBIGUOUS (specialization) | AMBIGUOUS | NOT SHOWN | AMBIGUOUS | Student has no displayed `user_id`; do not infer one. |
| 1A-R03 | `faculty` | `Class_Section` | NOT SHOWN | 1 to 0..* | child optional | `Class_Section.instructor_id` | Yes | Connector is routed through the diagram; `instructor_id` does not state whether it references `faculty_id` or another identity. |
| 1A-R04 | `Course` | `Class_Section` | NOT SHOWN | 1 to 0..* | child optional | `Class_Section.course_id` | Yes | None shown beyond the FK. |
| 1A-R05 | `Class_Section` | `Attendance_Session` | NOT SHOWN | 1 to 0..* | child optional | `Attendance_Session.cs_id` | Yes | Long routed line crosses other connectors. |
| 1A-R06 | `Student` | `Attendance_Session` | NOT SHOWN | 1 to 0..* | child optional | `Attendance_Session.se_secretary_id` | AMBIGUOUS | The line reaches Student, but the FK name suggests a secretary identity; role/identity meaning is not shown. |
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

## Phase 1B source transcription

The present image contains exactly 20 entities. Source spelling is preserved, including `retreived_on`, `sat_time_recorded`, `[stg_grade]`, `[stg_remarks]`, and `User Account`.

| Entity | PK | FKs | Other visible attributes |
|---|---|---|---|
| `User Account` | `user_id` | None | `username`, `password`, `role`, `status` |
| `Faculty` | `fac_id` | `user_id` | `fac_fname`, `fac_lname`, `fac_mname`, `fac_bu_email`, `is_admin`, `contact_no`, `emp_status` |
| `Student` | `stud_id` | None | `stud_number`, `stud_fname`, `stud_lname`, `stud_mname`, `sex`, `birthdate`, `admission_date`, `stud_BU_email`, `stud_contact`, `year_level`, `is_regular`, `acc_status` |
| `Student_Image` | `si_id` | `student_id` | `file_path`, `is_primary`, `retreived_on` |
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
| `Student_Term_Grade` | `stg_id` | `en_id` | `stg_term`, `[stg_grade]`, `[stg_remarks]` |
| `Retention_Record` | `record_id` | `student_id` | `record_current_stage`, `record_status`, `record_remarks` |
| `Remedial_Logs` | `rl_id` | `record_id` | `rl_student_standing`, `rl_date_logged`, `rl_remedial_score` |
| `Retention_Risk` | `report_id` | `sg_id` | `risk_category`, `remark` |

Named present relationships include `records`, `is held for`, `attend`, `has`, `enrolls in`, `contains`, `configures`, `defines`, `can have`, `receives`, `evaluates`, and `is based on`.

### Phase 1B visible relationship transcription

| Source relationship ID | Parent/source entity | Child/target entity | Relationship name | Visible cardinality | Visible optionality | Supporting displayed FK | Connector/FK agree | Ambiguity notes |
|---|---|---|---|---|---|---|---|---|
| 1B-R01 | `User Account` | `Faculty` | `fac` | AMBIGUOUS (specialization) | AMBIGUOUS | `Faculty.user_id` | AMBIGUOUS | Disjoint `role =` marker is visible; subtype key rule is not shown. |
| 1B-R02 | `User Account` | `Student` | `stu` | AMBIGUOUS (specialization) | AMBIGUOUS | NOT SHOWN | AMBIGUOUS | Student has no displayed account FK. |
| 1B-R03 | `User Account` | `Audit_Log` | `records` | 1 to 0..* | child optional | `Audit_Log.user_id` | Yes | Historical attribution semantics are not shown. |
| 1B-R04 | `Device` | `Attendance_Session` | `records` | 1 to 0..* | child optional | `Attendance_Session.device_id` | Yes | Legacy `se_device_id` mapping is not shown. |
| 1B-R05 | `Class_Section` | `Attendance_Session` | `is held for` | 1 to 0..* | child optional | `Attendance_Session.cs_id` | Yes | None shown. |
| 1B-R06 | `Student` | `Attendance_Session` | `attend` | 1 to 0..* | child optional | `Attendance_Session.se_secretary_id` | AMBIGUOUS | Line reaches Student, while FK name suggests secretary; identity/role is unresolved. |
| 1B-R07 | `Attendance_Session` | `Attendance_Record` | `records` | 1 to 0..* | child optional | `Attendance_Record.se_id` | Yes | None shown. |
| 1B-R08 | `Enrollment` | `Attendance_Record` | NOT SHOWN | 1 to 0..* | child optional | `Attendance_Record.en_id` | Yes | Connector label is not legible/not shown. |
| 1B-R09 | `Student` | `Student_Image` | `has` | 1 to 1..* | child mandatory marker visible | `Student_Image.student_id` | AMBIGUOUS | `Student` key is `stud_id` while child label is `student_id`; physical key mapping is UNREADABLE. |
| 1B-R10 | `Student` | `Facial_Template` | `has` | 1 to 1..* | child mandatory marker visible | `Facial_Template.student_id` | AMBIGUOUS | Connector is visible; parent PK is `stud_id`, child field is `student_id`; physical key reference is not confirmed. |
| 1B-R11 | `Student` | `Enrollment` | `enrolls in` | 1 to 1..* | child mandatory marker visible | `Enrollment.student_id` | AMBIGUOUS | Connector is visible; parent PK is `stud_id`, child field is `student_id`; physical key reference is not confirmed. |
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
| 1B-R22 | `Student_Term_Grade` | `Retention_Record` | `is based on` | 1 to 0..* | child optional | NOT SHOWN | No: connector has no displayed matching FK in `Retention_Record`. | 
| 1B-R23 | `Enrollment` | `Retention_Record` | `contains` | 1 to 0..* | child optional | NOT SHOWN | No: diagrammed connector has no displayed matching FK in `Retention_Record`. |
| 1B-R24 | `Retention_Record` | `Remedial_Logs` | `contains` | 1 to 0..* | child optional | `Remedial_Logs.record_id` | Yes | None shown. |
| 1B-R25 | `Student_Assessment_Grade` | `Retention_Risk` | `is based on` | 1 to 1..* | child mandatory marker visible | `Retention_Risk.sg_id` | Yes | Risk category/model semantics are not shown. |
| 1B-R26 | `Retention_Record.student_id` | `Student` | NO DISPLAYED CONNECTOR | NOT SHOWN | NOT SHOWN | `Retention_Record.student_id` | No | A displayed FK exists without a direct Student connector; its intended parent/key is UNREADABLE. |

## Source comparison

| Source element | Present treatment |
|---|---|
| `faculty` and its direct Class_Section relationship | Renamed to `Faculty`; direct instructor relationship is replaced by Faculty–Course_Components–Class_Section |
| Student identifiers and profile fields | Renamed from `student_*` to `stud_*`; middle name, sex, birthdate, admission date, and regularity are added; `student_face_image` is removed |
| `se_device_id` | Renamed to `device_id`, marked FK, and backed by added Device |
| Course fields | `course_name→name`, `course_units→units`; detailed weights move to Course_Components/Component; year/semester/description are added |
| Class_Section | `course_id` and `instructor_id` are replaced by `cc_id`; school year is added; `cs_block_secretary→cs_block_sec` |
| Assessment | Course-level `a_type`/`course_id` are replaced by `comp_id`/`cs_id`; status is added |
| Enrollment | `date_enrolled` is added |
| Retention_Risk | Student-based risk with confidence/timestamp is replaced by score-based risk with category/remark |
| Device, Audit_Log, Course_Components, Component, Student_Term_Grade | Added |

Relationship changes include Course→Course_Components→Class_Section, Course_Components→Component→Assessment, Class_Section→Assessment, Enrollment→Student_Term_Grade, Student_Term_Grade→Retention_Record, and Student_Assessment_Grade→Retention_Risk.

## Conflict and ambiguity register

| ID | Source element | Present element | Relevant requirement | Description | Migration impact | Preservation impact | Treatment | Owner decision | Blocking |
|---|---|---|---|---|---|---|---|---|---|
| ERD-C01 | 1A image: 15 visible entities | Paper prose: 14 tables | 1A checkpoint fidelity | Counts conflict. | Do not delete/merge an image entity to force 14. | Keep both facts in evidence. | Image controls Phase 1A; retain discrepancy. | Confirm image authority/count. | No |
| ERD-C02 | `User Account.password` | Same label | Credential safety | Source label risks plaintext interpretation. | No value transformation is approved. | Never preserve plaintext credentials. | Preserve label only; allow hashes, never plaintext. | Define physical credential representation. | No |
| ERD-C03 | `faculty.user_id`; no Student account FK | Same pattern | Identity integrity | Faculty shows account link; Student does not. | No Student account backfill can run. | Do not invent source FK. | Preserve source facts. | Approve final identity model. | Identity backfill only |
| ERD-C04 | `Attendance_Session.se_created_by` | Same unmarked field | Creator attribution | No FK marker or clear identity target. | Cannot safely repoint populated values. | Retain literal value until resolved. | Preserve without inferred FK. | Define identity and key rule. | FK creation only |
| ERD-C05 | `se_device_id` without Device | `device_id` with Device | Device transition | Original session device value lacks entity/FK. | Requires deterministic device/value map. | Stop on unmappable populated values. | Require approved Device mapping. | Define legacy value/metadata mapping. | Yes |
| ERD-C06 | Course/instructor direct section links | Course_Components mediation | Configuration transition | Course/instructor relationship moves through Course_Components. | Requires sharing and key-map rule. | Prevent wrong cross-section/faculty sharing. | Preserve evidence; do not choose sharing. | Define configuration scope. | Yes |
| ERD-C07 | Course weight columns | Course_Components/Component | Grade weighting | Detailed weights become component rows. | Requires taxonomy, totals, and generated keys. | Retain legacy values until totals reconcile. | Require approved weight mapping. | Define taxonomy and zero-rule semantics. | Yes |
| ERD-C08 | Course-level Assessment | Component/section Assessment | Assessment scope | `a_type`/`course_id` are replaced by `comp_id`/`cs_id`. | May require duplication/repointing. | Every score must map exactly once. | Require target component/section rule. | Define duplication/scope rule. | Yes |
| ERD-C09 | Student-linked Retention_Record | Lines to Enrollment and Student_Term_Grade plus `student_id` | Retention integrity | Present connector lines and displayed FK disagree. | No physical FK migration is executable. | Preserve all displayed evidence. | Record inconsistency; require final relationship decision. | Choose applicable parent relationships. | Yes |
| ERD-C10 | Student risk/confidence/timestamp | Score risk/category/remark | Risk history | Risk target changes and evidence fields disappear. | Requires unique score association or archive. | Prevent loss of confidence/timestamp. | Require preservation/risk-to-score mapping. | Define mapping and archive rule. | Yes |
| ERD-C11 | `[stg_grade]`, `[stg_remarks]` | Same literal labels | Term-grade semantics | Bracket meaning is not shown. | No computation/backfill is executable. | Preserve literal labels and source values. | Do not infer derived/stored meaning. | Define meaning/formula. | Yes |
| ERD-C12 | General `Remedial_Logs` | Same general log | First/second remedial and cost recovery | A single general log cannot distinguish ordered remedials and cost recovery. | No decomposition is approved in 1B. | Preserve 1B log exactly. | Preserve through 1B; correct through separately approved 1C staged model. | Define stages, actors, outcomes, recovery. | Blocking for 1C |
| ERD-C13 | Attendance and assessment are separate | Same absence of relation | Unexcused-absence rule | No attendance-to-assessment-treatment relationship exists despite the paper rule. | No automated score treatment can be migrated. | Keep attendance and score evidence distinct. | Require 1C evidence/treatment structure. | Define rule, authority, and review. | Blocking for 1C |
| ERD-C14 | `Student_Image`, `Facial_Template` | Same | Biometric privacy lifecycle | Consent, revocation, replacement, access, and retention lifecycle are absent. | No deletion/retention automation is executable. | Preserve source artifacts without claiming lifecycle compliance. | Require Phase 1C privacy decisions. | Define consent, access, retention, deletion. | Blocking for 1C |
| ERD-C15 | No audit entity | Minimal `Audit_Log` | Audit history | Present log is too minimal for append-oriented, redacted, historically attributable events. | No source backfill can be assumed. | Preserve exact 1B source fields first. | Preserve exact 1B then expand/replace only through 1C. | Define audit event/history model. | Blocking for relevant 1C group |
| ERD-C16 | Paper thresholds `2.5 or lower`, `50%`, `over 2.4` | No explicit policy model | Policy correctness | Operators, scales, and version are ambiguous. | No policy-derived record may be calculated. | Preserve source scores/records without invented decision. | Require Owner-approved operands, operators, scale, and versioning. | Approve policy semantics. | Blocking for 1C |
| ERD-C17 | `Student.student_face_image` | Field removed; `Student_Image` remains | Image reconciliation | Duplicate, primary-image, retention, and transfer rules are not shown. | No automatic transfer/removal is executable. | Retain both source evidence and resolve conflicts. | Require duplicate/primary/retention/data-transfer rules. | Approve reconciliation rule. | Yes |

## Unresolved physical assumptions

MariaDB types, lengths, nullability, defaults, identity generation, collation, indexes, check constraints, referential actions, source identifier policy, and constraint names are not shown. They require Owner approval before implementation.

## Source-fidelity deviation register template

| Deviation ID | Source element | Physical deviation | Reason | Meaning/data impact | Owner approval | Validation evidence |
|---|---|---|---|---|---|---|
| TBD | TBD | TBD | MariaDB validity, creation order, safety, or runner compatibility only | TBD | Pending | Stage manifest |

## Phase 1C recommendations

Candidate corrections include terms/offering history, enrollment split, versioned grading, grade revision, policy/evaluation history, staged remedial and cost recovery, attendance verification/overrides, biometric consent and lifecycle, ML prediction provenance, identity support, and append-oriented audit. They are not Phase 1A or 1B source facts and are not approved by this document.
