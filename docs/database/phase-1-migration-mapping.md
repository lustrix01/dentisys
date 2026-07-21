# Phase 1 Migration Mapping

This is a non-executable mapping and decision record. It contains no SQL and does not authorize a migration whose Owner decision is unresolved.

## Stage definitions

- **1A:** create the 15 visible entities in the Owner-designated original image, using only approved physical deviations.
- **1B:** move forward into the exact Owner-designated 20-entity image without replacing 1A history.
- **1C:** separately approved corrected groups for academic history, grading, retention/remedial, attendance/biometric lifecycle, identity, and audit.
- **1D:** validate an empty MariaDB 10.4.32 chain through every stage, reruns, fixtures, failures, and recovery.

## Operation vocabulary

`unchanged`, `rename`, `add`, `remove`, `split`, `merge`, `relationship change`, `cardinality change`, `optionality change`, and `unresolved` are source-comparison classifications. Only approved rows may become executable work.

## Complete source comparison matrix

| 1A object | 1B object | Classification | Mapping state |
|---|---|---|---|
| User_Account | User_Account | unchanged | Direct |
| Faculty | Faculty | rename/remove/add | Attribute names shortened; entity name unchanged; `faculty_BU_email` removed |
| Student | Student | rename/remove/add | Direct matching fields; added fields unpopulated unless approved |
| Student_Image | Student_Image | unchanged/add | Timestamp meaning unresolved |
| Facial_Template | Facial_Template | unchanged/add | Timestamp meaning unresolved |
| Attendance_Session | Attendance_Session + Device | rename/add/relationship change | Device mapping unresolved |
| Attendance_Record | Attendance_Record | unchanged | Direct |
| Course | Course + Course_Components + Component | split | Weight/component mapping unresolved |
| Class_Section | Class_Section + Course_Components | relationship change | Course/faculty configuration map unresolved |
| Enrollment | Enrollment + Student_Term_Grade | unchanged/add | Term-grade computation unresolved |
| Assessment | Assessment + Component + Class_Section | relationship change | Component/section mapping unresolved |
| Student_Assessment_Grade | Student_Assessment_Grade | unchanged | Assessment remap may be required |
| Retention_Record | Retention_Record | unchanged | `student_id` FK confirmed by Owner plaintext |
| Remedial_Logs | Remedial_Logs | unchanged | Direct |
| Retention_Risk | Retention_Risk | rename/remove/relationship change | Risk-to-score and lost-field preservation unresolved |
| None | Audit_Log | add | Empty target unless approved backfill |

## Detailed 1A-to-1B mapping matrix

| Source | Target | Operation and transfer | Key/remapping and compatibility | Preservation/destructive gate | Owner approval |
|---|---|---|---|---|---|
| `User_Account` | Same | Preserve values; hashes only for `password` | Preserve `user_id` | No destructive change | Identifier policy |
| `Faculty.*` | `Faculty.*` | Rename direct counterparts; remove `faculty_BU_email`; new fields have no invented values | `faculty_id→fac_id` map | Verify dependent references before removal | Nullability/new fields; email removal per P1-D02 |
| `Student.*` | renamed Student fields | Copy matching values | `student_id→stud_id` map | Preserve all dependent relationships | New fields and source identity |
| `student_face_image` | Student_Image | Reconcile only with approved duplicate/primary rule | Student map | Stop on conflict | Image-retention rule |
| `se_device_id` | Device and `device_id` | Create/repoint only under approved device rule | Device key map | Stop on populated unmappable value | Device metadata/backfill |
| Course names/units | Course names/units | Direct rename | Preserve `course_id` | Equality check | None |
| Course weights | Course_Components and Component | Copy aggregates; generate detail rows only after approved taxonomy | CC and Component maps | Retain legacy values until totals verify | Component semantics/sharing |
| Section course/instructor | `cc_id` | Resolve through generated CC row | `cs_id` preserved; CC map required | Stop without unique mapping | Per-section/shared configuration |
| `Assessment.a_type/course_id` | `comp_id/cs_id` | Map only by approved component/section rule | Old-to-new Assessment map | Never choose arbitrary section | Duplication rule |
| Student assessment grades | Same | Preserve; repoint only if assessment mapping splits | Preserve `sg_id` where possible | Every score maps exactly once | Score duplication rule |
| Retention risk | score-based Retention_Risk | Rename only after unique score association | Risk/report and student/score map | Stop if confidence/timestamp would be lost | Risk mapping/archive rule |
| No source | Audit_Log, Student_Term_Grade | Add structures only | New IDs | No speculative backfill | Backfill/derived-grade policy |

## Data, compatibility, and recovery expectations

- Preserve stable IDs for direct renames.
- Use explicit mapping evidence for generated Course_Components, Component, duplicated Assessment, Device, and Retention_Risk rows.
- Do not fabricate dates, statuses, demographic values, school years, computed grades, component names, or risk links.
- Do not remove source columns until counts, key coverage, totals, and orphan reports pass.
- Stop a populated-data transformation when a unique approved target cannot be established.
- Use backup/export, row counts, key maps, and stage manifests before destructive work.
- Current tooling has no down-migration support; recovery must use clean disposable rebuilds or approved compensating work and backups.

## Expanded source-observed comparison matrix

This matrix supersedes no source fact above; it makes each observed 1A-to-1B attribute, key, and relationship change inspectable. `UNRESOLVED — OWNER DECISION REQUIRED` is non-executable.

| Source object or relationship | Target object or relationship | Classification | Observed transformation / mapping state |
|---|---|---|---|
| `User_Account` all fields/key | `User_Account` all fields/key | unchanged | `user_id`, `username`, `password`, `role`, `status` remain displayed; credential representation remains a physical decision. |
| `Faculty.faculty_id` | `Faculty.fac_id` | rename/key change | Direct identifier map required. |
| `Faculty.faculty_fname` | `Faculty.fac_fname` | rename | Direct value rename. |
| `Faculty.faculty_lname` | `Faculty.fac_lname` | rename | Direct value rename. |
| no source field | `Faculty.fac_mname` | add | No invented value. |
| `Faculty.faculty_BU_email` | no target field | remove | UNRESOLVED — OWNER DECISION REQUIRED: preservation handling if populated data exists. |
| `Faculty.faculty_is_admin` | `Faculty.is_admin` | rename | Direct value rename. |
| `Faculty.user_id` | `Faculty.user_id` | unchanged | Displayed FK retained. |
| no source field | `Faculty.contact_no`, `Faculty.emp_status` | add | No invented values. |
| `Student.student_id` | `Student.stud_id` | rename/key change | Direct identifier map required; child labels still say `student_id`. |
| `student_number`, `student_fname`, `student_lname` | `stud_number`, `stud_fname`, `stud_lname` | rename | Direct value renames. |
| no source field | `Student.stud_mname`, `sex`, `birthdate`, `admission_date` | add | No invented values. |
| `student_BU_email`, `student_contact` | `stud_BU_email`, `stud_contact` | rename | Direct value renames. |
| `student_yr_level` | `year_level` | rename | Direct value rename. |
| `student_status` | `acc_status` | rename | Semantics are not explicitly confirmed; UNRESOLVED — OWNER DECISION REQUIRED. |
| no source field | `Student.is_regular` | add | No invented value. |
| `Student.student_face_image` | no Student field; `Student_Image` remains | remove/relationship reconciliation | UNRESOLVED — OWNER DECISION REQUIRED: duplicate, primary, retention, and transfer rule. |
| `Student_Image.si_id`, `file_path`, `is_primary`, `student_id` | same | unchanged | Direct preservation subject to Student key rule. |
| no source field | `Student_Image.retrieved_on` | add | Plaintext-authoritative spelling; meaning/default is unresolved. |
| `Facial_Template.template_id`, `lbph_vector`, `student_id` | same | unchanged | Direct preservation subject to Student key rule. |
| no source field | `Facial_Template.captured_on` | add | No invented timestamp. |
| `Attendance_Session.se_device_id` | `Attendance_Session.device_id` plus `Device` | rename/add/relationship change | 1A shows `se_device_id` as FK to Device per Owner plaintext; Device entity not shown in 1A. UNRESOLVED — OWNER DECISION REQUIRED: legacy Device value and metadata map. |
| `Attendance_Session.se_created_by` | same | unchanged/ambiguous | Logical target is `User_Account.user_id` per Owner plaintext; no explicit FK marker in source. UNRESOLVED — OWNER DECISION REQUIRED: creator identity/key and physical FK. |
| `Attendance_Session.se_date`, `se_start`, `se_end`, `se_code`, `cs_id`, `se_secretary_id` | same labels | unchanged | `se_secretary_id` references `User_Account.user_id` per Owner plaintext. |
| no source entity | `Device.device_id`, `device_name`, `ip_add`, `location`, `status` | add | No speculative backfill. |
| `Attendance_Record` all fields/keys | same | unchanged | Preserve `rec_id`, `sat_time_recorded`, status, verification method, `se_id`, `en_id`. |
| no source entity | `Audit_Log` all fields/key | add | Empty target unless Owner approves attributable historical backfill. |
| `Course.course_name` | `Course.name` | rename | Direct value rename. |
| `Course.course_units` | `Course.units` | rename | Direct value rename. |
| `Course.course_id`, `course_code` | same | unchanged | Preserve identifiers and codes. |
| no source field | `Course.year_level`, `semester`, `description` | add | No invented values. |
| `lec_weight`, `lab_weight`, `has_zero_rule` | `Course_Components` | move | UNRESOLVED — OWNER DECISION REQUIRED: configuration scope and value semantics. |
| `term_exam_weight`, `lec_quiz_weight`, `recit_weight`, `output_weight`, `prac_exam_weight`, `lab_exercise_weight`, `lab_quiz_weight`, `lab_perf_weight` | `Component.weight` / `Component.comp_name` | remove/move/split | UNRESOLVED — OWNER DECISION REQUIRED: every taxonomy/name/weight mapping and totals rule. |
| `Class_Section.course_id`, `instructor_id` | removed; mediated by `cc_id` | remove/relationship change | UNRESOLVED — OWNER DECISION REQUIRED: course/faculty configuration mapping. |
| no source field | `Class_Section.cc_id` | add | Required generated/reused configuration key; non-executable until sharing rule approved. |
| `Class_Section.cs_year_level` | removed | remove | Preserve source value until its target/retention rule is approved. |
| no source field | `Class_Section.cs_school_year` | add | No invented value. |
| `Class_Section.cs_block_secretary` | `Class_Section.cs_block_sec` | rename | Relationship/identity semantics UNRESOLVED — OWNER DECISION REQUIRED. |
| remaining Class_Section fields/key | same labels | unchanged | Preserve `cs_id`, name, semester, rooms, block, status. |
| `Enrollment.en_id`, `en_status`, `student_id`, `cs_id` | same | unchanged | Preserve direct records subject to Student key rule. |
| no source field | `Enrollment.date_enrolled` | add | No invented date. |
| no source entity | `Course_Components.cc_id`, `fac_id`, `course_id`, weights/zero rule | add/merge | UNRESOLVED — OWNER DECISION REQUIRED: direct Course/Faculty/Section link replacement. |
| no source entity | `Component.comp_id`, `comp_name`, `weight`, `cc_id` | add/split | UNRESOLVED — OWNER DECISION REQUIRED: component taxonomy and key map. |
| `Assessment.a_type`, `Assessment.course_id` | removed | remove/relationship change | Preserve until component/section scope is approved. |
| no source field | `Assessment.comp_id`, `Assessment.cs_id`, `Assessment.status` | add | `comp_id`/`cs_id` are non-executable pending scope/duplication rule; status has no invented value. |
| `Assessment.a_id`, `a_title`, `a_max_score`, `a_date` | same | unchanged | Preserve and repoint only through approved assessment map. |
| `Student_Assessment_Grade` all fields/keys | same | unchanged/repoint potential | Preserve every row; a split assessment must map each score exactly once. |
| no source entity | `Student_Term_Grade.stg_id`, `stg_term`, `stg_grade`, `stg_remarks`, `en_id` | add | UNRESOLVED — OWNER DECISION REQUIRED: grade/remarks semantics, source/backfill, formula. |
| `Retention_Record` fields and `student_id` | same labels | unchanged | `student_id` references `Student.stud_id` per Owner plaintext. |
| `Remedial_Logs` all fields/keys | same | unchanged | Preserve 1B exact; no first/second/cost model until 1C. |
| `Retention_Risk.risk_id` | `Retention_Risk.report_id` | rename/key change | UNRESOLVED — OWNER DECISION REQUIRED: identifier/key map. |
| `Retention_Risk.risk_level` | `Retention_Risk.risk_category` | rename/semantic change | UNRESOLVED — OWNER DECISION REQUIRED: category crosswalk. |
| `Retention_Risk.risk_confidence`, `rr_timestamp` | removed | remove | UNRESOLVED — OWNER DECISION REQUIRED: archive/preservation rule. |
| `Retention_Risk.student_id` | removed; `Retention_Risk.sg_id` added | relationship/FK change | UNRESOLVED — OWNER DECISION REQUIRED: unique student-risk to score-risk association. |
| 1A-R01/1A-R02 | 1B-R01/1B-R02 | unchanged/ambiguous | 1A-R02 superseded by Owner plaintext. Faculty account FK retained; Student account FK remains not shown. |
| 1A-R03 Faculty–Class_Section | 1B-R13/1B-R15 Faculty–Course_Components–Class_Section | relationship change | UNRESOLVED — OWNER DECISION REQUIRED: configuration sharing/key map. |
| 1A-R04 Course–Class_Section | 1B-R14/1B-R15 Course–Course_Components–Class_Section | relationship change | UNRESOLVED — OWNER DECISION REQUIRED: configuration key map. |
| 1A-R05 Class_Section–Attendance_Session | 1B-R05 | unchanged | Direct `cs_id` relationship remains. |
| 1A-R06 `User_Account`–Attendance_Session | 1B-R06 | unchanged | `se_secretary_id` references `User_Account.user_id` per Owner plaintext. |
| 1A-R07/1A-R08 attendance record links | 1B-R07/1B-R08 | unchanged | `se_id` and `en_id` remain. |
| 1A-R09/1A-R10 image/template links | 1B-R09/1B-R10 | unchanged | Confirmed by Owner plaintext: child `student_id` references `Student.stud_id`. |
| 1A-R11/1A-R12 enrollment links | 1B-R11/1B-R12 | unchanged | Confirmed by Owner plaintext: child `student_id` references `Student.stud_id`. |
| 1A-R13 Course–Assessment | 1B-R17/1B-R18 | relationship change | Course link removed; component and section links added; non-executable pending scope. |
| 1A-R14/1A-R15 grade links | 1B-R19/1B-R20 | unchanged/repoint potential | Grade links remain after approved assessment mapping. |
| 1A-R16 Student–Retention_Record | 1B-R26 | unchanged | `student_id` FK confirmed by Owner plaintext; 1B-R22/1B-R23 superseded. |
| 1A-R17 Retention_Record–Remedial_Logs | 1B-R24 | unchanged | Direct `record_id` remains. |
| 1A-R18 Student–Retention_Risk | 1B-R25 | relationship change | Student risk becomes score risk; non-executable pending mapping. |
| no 1A relationship | 1B-R03 `User_Account`–Audit_Log | add | Backfill only with approved historical attribution. |
| no 1A relationship | 1B-R04 Device–Attendance_Session | add | Device map required. |
| no 1A relationship | 1B-R16 Course_Components–Component | add | Taxonomy/key map required. |
| no 1A relationship | 1B-R21 Enrollment–Student_Term_Grade | add | Derived/backfill meaning unresolved. |

## Expanded detailed migration mapping matrix

No row marked `UNRESOLVED — OWNER DECISION REQUIRED` is executable.

| Source object | Target object | Operation | Data-transfer rule | Key-remapping rule | Compatibility requirement | Preservation check | Destructive-operation gate | Recovery method | Owner decision | Executability status |
|---|---|---|---|---|---|---|---|---|---|---|
| `Faculty.*` | `Faculty.*` | rename/add/remove | Copy renamed counterparts; leave `fac_mname`, `contact_no`, `emp_status` unset unless supplied; remove `faculty_BU_email`. | `faculty_id`→`fac_id`; preserve `user_id`. | All dependent references resolve. | Counts and key coverage equal. | Do not remove source names before reconciliation. | Backup/export and key map. | Field/nullability/email-removal policy. | Non-executable pending physical policy. |
| `Student.*` | `Student.*` | rename/add | Copy explicit counterparts; do not fabricate profile additions. | `student_id`→`stud_id`; reconcile child `student_id` labels. | Every Enrollment/image/template/session reference resolves. | Counts, orphans, and values reconcile. | Stop on identity/key mismatch. | Backup/export and key map. | Student identity/key rule. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Student.student_face_image` | `Student_Image` | remove/reconcile | Transfer only under approved duplicate/primary/retention rule. | Use approved Student and image keys. | No silent duplicate or loss. | Compare source field and target image evidence. | No drop/removal before reconciliation. | Retain source/backup and exception report. | Image reconciliation rule. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Student_Image` | `Student_Image.retrieved_on` | add | Do not invent timestamp. | Existing `si_id`. | Plaintext-authoritative spelling. | Existing rows unchanged. | No default/backfill without approval. | Clean rebuild or approved compensating change. | Timestamp meaning/default. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Facial_Template` | `Facial_Template.captured_on` | add | Do not invent timestamp. | Existing `template_id`. | Existing template linkage remains valid. | Existing rows unchanged. | No default/backfill without approval. | Clean rebuild or approved compensating change. | Timestamp meaning/default. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Attendance_Session.se_device_id` | `Device` + `Attendance_Session.device_id` | rename/add | Map each legacy value only to approved Device metadata/row. | Deterministic Device key map. | Every populated session maps once. | Unmapped/duplicate report is empty or approved. | Stop on unmappable value. | Backup/export, device map, clean rebuild. | Legacy Device value/metadata mapping. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Attendance_Session.se_created_by` | same field | preserve/ambiguity | Preserve literal value; do not create FK. Logical target is `User_Account.user_id` per Owner plaintext. | No inferred map. | Existing sessions remain readable. | Value counts preserved. | No FK or data rewrite without approval. | Backup/export. | Creator identity/key rule; physical FK approval. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Faculty.faculty_BU_email` | removed | remove | Do not retain unless approved preservation policy applies. | N/A (no target). | P1-D02 defines 1A/1B as clean-build checkpoints. | Value present in 1A source only. | No drop/removal before approval if data-bearing. | Backup/export. | Preservation policy. | UNRESOLVED — OWNER DECISION REQUIRED if data-bearing; non-executable pending P1-D02 Option A. |
| Course direct fields | Course direct fields | rename/add | Rename `course_name`→`name`, `course_units`→`units`; do not fabricate year/semester/description. | Preserve `course_id`. | Course code/key uniqueness retained. | Value/count equality. | No removal before check. | Backup/export. | Terminology and new-field policy. | Non-executable pending physical policy. |
| Every legacy Course weight | `Course_Components` / `Component` | split/move | Map each listed weight via approved taxonomy; totals must reconcile. | Generated CC/Component key maps. | A Component belongs to approved configuration. | Per-course totals and zero-rule evidence. | Stop if any weight has no unique target. | Backup/export, mapping table, clean rebuild. | Taxonomy, sharing, zero-rule semantics. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Class_Section.course_id`, `instructor_id` | `Class_Section.cc_id` | relationship change | Generate/reuse CC only under approved scope. | Preserve `cs_id`; deterministic `cc_id` map. | Course/faculty section semantics retained. | Every section has approved configuration. | Stop without unique map. | Backup/export and CC map. | Configuration-sharing rule. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `cs_year_level`; `cs_block_secretary` | removal; `cs_block_sec` | remove/rename | Retain year value until target rule; rename secretary field only after identity rule. | Preserve `cs_id`. | No meaning is silently changed. | Value and exception reports. | No drop/rewrite before approval. | Backup/export. | Year retention and secretary relationship. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Enrollment` | `Enrollment.date_enrolled` | add | Do not fabricate date. | Preserve `en_id`. | Existing student/section links resolve. | Existing counts/keys equal. | No default/backfill without approval. | Clean rebuild or compensating change. | Date source/default. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Assessment.a_type`, `course_id` | `Assessment.comp_id`, `cs_id`, `status` | remove/add/repoint | Create/repoint only under approved component/section and duplication rule; do not invent status. | Assessment old-to-new map; preserve/derive IDs only by approval. | Each grade links to exactly one target assessment. | Counts and grade coverage exact. | Stop on ambiguous target. | Backup/export, map, clean rebuild. | Assessment scope/duplication/status rules. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Student_Assessment_Grade` | same | preserve/repoint | Copy score/grade once after assessment map. | Preserve `sg_id` where compatible. | `a_id` and `en_id` resolve. | Every source score maps once. | Stop on split ambiguity. | Backup/export and grade map. | Assessment mapping rule. | UNRESOLVED — OWNER DECISION REQUIRED. |
| no source term grade | `Student_Term_Grade` | add | No speculative backfill/calculation; retain source labels literally. | New IDs; `en_id` only when approved. | No false historical grade. | Rows absent unless approved input exists. | No derived-data creation. | Clean rebuild. | Grade/formula/backfill policy. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Retention_Record` | same `student_id` FK only | unchanged | Preserve fields and `student_id` FK confirmed by Owner plaintext. | Preserve `record_id`. | `student_id` references `Student.stud_id`. | FK integrity verified. | No FK creation or repointing without approval. | Backup/export and clean rebuild. | Retention FK confirmation. | UNRESOLVED — OWNER DECISION REQUIRED. |
| `Remedial_Logs` | same | unchanged | Copy exact 1B fields; no staged remedial interpretation. | Preserve `rl_id`, `record_id`. | Record relationship resolves. | Counts/values equal. | No decomposition in 1B. | Backup/export. | 1C remedial model. | Executable only for exact source preservation after physical approval. |
| `Retention_Risk` | score-based `Retention_Risk` | rename/remove/repoint | Crosswalk level→category only if approved; archive confidence/timestamp; map to one score. | `risk_id`→`report_id` and student→score map required. | No risk evidence loss. | Every source row mapped or explicitly retained. | Stop on missing/ambiguous score. | Backup/export, risk archive, map. | Risk mapping/archive policy. | UNRESOLVED — OWNER DECISION REQUIRED. |
| no Audit_Log | `Audit_Log` | add | Create exact 1B fields only; no historical events without attribution rule. | New `log_id`. | No false actor/time history. | Empty/approved-backfill evidence. | No speculative backfill. | Clean rebuild. | Audit historical-attribution policy. | UNRESOLVED — OWNER DECISION REQUIRED. |
| all relationship changes above | target connectors/FKs | relationship change | Implement only after source/target maps and physical FK decisions are approved. | Use explicit key maps. | Connector and FK policy agree. | Orphan/cardinality reports pass. | Stop on disagreement. | Backup/export, manifest, clean rebuild. | All referenced decision gates. | UNRESOLVED — OWNER DECISION REQUIRED. |

## Candidate Phase 1C groups

1. Academic terms, offerings, faculty assignments, and enrollment history.
2. Versioned grading schemes/components, score records, grade summaries, and revisions.
3. Retention policies/evaluations, first and second remedials, and cost recovery.
4. Attendance verification, override history, and attendance-assessment treatment.
5. Consent, facial image/template lifecycle, and access boundaries.
6. Official retention decisions separated from model predictions, with model versions and snapshots.
7. Identity, roles, MFA/session/reset/login-attempt support, and append-oriented audit.

## Phase 1B Implementation (2026-07-20)

### Migration Inventory

Phase 1B uses 33 granular migrations (016–048):

**DROP phase (016–029):** One DROP TABLE per file, child-first dependency order.
- 016: attendance_record
- 017: student_assessment_grade
- 018: remedial_log
- 019: retention_risk
- 020: student_image
- 021: facial_template
- 022: enrollment
- 023: assessment
- 024: attendance_session
- 025: retention_record
- 026: class_section
- 027: faculty
- 028: student
- 029: course

user_account is NOT dropped (retained from migration 001).

**CREATE phase (030–048):** One CREATE TABLE per file, parent-first dependency order.
- 030: device
- 031: audit_log
- 032: faculty
- 033: student
- 034: course
- 035: course_component
- 036: component
- 037: class_section
- 038: enrollment
- 039: attendance_session
- 040: assessment
- 041: student_image
- 042: facial_template
- 043: attendance_record
- 044: student_assessment_grade
- 045: student_term_grade
- 046: retention_record
- 047: remedial_log
- 048: retention_risk

### Phase 1B Object Counts

- 20 business tables
- 124 physical columns
- 20 primary keys
- 23 foreign keys (fk_<child>_<parent> naming)
- 23 FK indexes (idx_<table>_<column> naming)
- 1 supporting index (idx_attendance_session_se_created_by)
- 4 Boolean check constraints
- 0 business defaults, unique constraints, policy checks
- 48 migration-history rows (15 Phase 1A + 33 Phase 1B)

### Resolved Phase 1B Decisions

See `docs/database/phase-1-owner-decision-gates.md` for B1-D01 through B1-D16, all resolved 2026-07-20.

### Key Implementation Decisions

- Six Phase 1A compatibility fields omitted: faculty_bu_email, student_face_image, cs_year_level, a_type, risk_confidence, rr_timestamp
- se_created_by: INT UNSIGNED NULL, supporting index, no FK
- All 10 new FKs: INT UNSIGNED NOT NULL
- All FKs use ON UPDATE RESTRICT ON DELETE RESTRICT
- Audit_Log.timestamp mapped to audit_log.logged_at (reserved word avoidance)
- user_account retained from migration 001; not dropped or recreated
- All 23 FK names use fk_<child>_<parent> convention
- No IF EXISTS or IF NOT EXISTS on any migration

### Stage Manifests

- Phase 1A: `docs/database/phase-1a-stage-manifest.md`
- Phase 1B: `docs/database/phase-1b-stage-manifest.md`
- Validation evidence: `docs/database/phase-1a-validation-evidence.md`, `docs/database/phase-1b-validation-evidence.md`
