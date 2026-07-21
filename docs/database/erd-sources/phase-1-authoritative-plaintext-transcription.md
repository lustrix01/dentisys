# Phase 1 Authoritative Plaintext Transcription

## Authority

This file is the **primary AI-readable structural authority** for DentiSys Phase 1. It contains the Owner-provided plaintext transcription of ERD 1 (Original, Phase 1A) and ERD 2 (Revised/Capstone, Phase 1B).

The archived images (`phase-1a-original-paper-erd.png`, `phase-1b-present-20-entity-erd.png`) remain provenance evidence. Image-only labels, cardinalities, and specialization markers are provenance annotations.

Where image interpretation conflicts with this plaintext, the plaintext supersedes it. Conflicting interpretations are marked `SUPERSEDED BY OWNER PLAINTEXT` in derived documentation.

Physical SQL names (e.g., `user_account`, `faculty`) are separate from source display names (e.g., `User_Account`, `Faculty`).

Date recorded: 2026-07-20

## ERD 1 (Original)

### User_Account

**Primary Key:** user_id

**Attributes:** username, password, role, status

**Relationships:**
- Referenced by Faculty.user_id
- Used by Attendance_Session.se_secretary_id (secretary)
- Used by Attendance_Session.se_created_by (creator)

### Faculty

**Primary Key:** faculty_id

**Attributes:** faculty_fname, faculty_lname, faculty_BU_email, faculty_is_admin

**Foreign Keys:** user_id → User_Account.user_id

**Relationships:** One faculty teaches many Class_Section records.

### Student

**Primary Key:** student_id

**Attributes:** student_number, student_fname, student_lname, student_BU_email, student_contact, student_yr_level, student_status, student_face_image

**Relationships:**
- One student has many Student_Image records.
- One student has many Facial_Template records.
- One student has many Enrollment records.
- One student has one/many Retention_Record entries.
- One student has one/many Retention_Risk entries.

### Student_Image

**Primary Key:** si_id

**Attributes:** file_path, is_primary

**Foreign Keys:** student_id → Student.student_id

### Facial_Template

**Primary Key:** template_id

**Attributes:** lbph_vector

**Foreign Keys:** student_id → Student.student_id

### Course

**Primary Key:** course_id

**Attributes:** course_code, course_name, course_units, lec_weight, term_exam_weight, lec_quiz_weight, recit_weight, output_weight, lab_weight, prac_exam_weight, lab_exercise_weight, lab_quiz_weight, lab_perf_weight, has_zero_rule

**Relationships:**
- One course has many Assessments.
- One course has many Class_Sections.

### Class_Section

**Primary Key:** cs_id

**Attributes:** cs_name, cs_semester, cs_year_level, cs_lab_room, cs_lec_room, cs_block, cs_block_secretary, status

**Foreign Keys:**
- course_id → Course.course_id
- instructor_id → Faculty.faculty_id

**Relationships:**
- One class section has many Enrollments.
- One class section has many Attendance_Sessions.

### Enrollment

**Primary Key:** en_id

**Attributes:** en_status

**Foreign Keys:**
- student_id → Student.student_id
- cs_id → Class_Section.cs_id

**Relationships:**
- Connects Student and Class_Section.
- One enrollment has many Attendance_Record entries.
- One enrollment has many Student_Assessment_Grade entries.

### Attendance_Session

**Primary Key:** se_id

**Attributes:** se_date, se_created_by, se_start, se_end, se_code

**Foreign Keys:**
- se_device_id → Device (not shown)
- cs_id → Class_Section.cs_id
- se_secretary_id → User_Account.user_id

**Relationships:** One attendance session has many Attendance_Record entries.

### Attendance_Record

**Primary Key:** rec_id

**Attributes:** sat_time_recorded, rec_status, rec_verification_method

**Foreign Keys:**
- se_id → Attendance_Session.se_id
- en_id → Enrollment.en_id

### Assessment

**Primary Key:** a_id

**Attributes:** a_title, a_type, a_max_score, a_date

**Foreign Keys:** course_id → Course.course_id

**Relationships:** One assessment has many Student_Assessment_Grade entries.

### Student_Assessment_Grade

**Primary Key:** sg_id

**Attributes:** sg_raw_score, sg_grade

**Foreign Keys:**
- a_id → Assessment.a_id
- en_id → Enrollment.en_id

### Retention_Record

**Primary Key:** record_id

**Attributes:** record_current_stage, record_status, record_remarks

**Foreign Keys:** student_id → Student.student_id

**Relationships:** One retention record has many Remedial_Logs.

### Remedial_Logs

**Primary Key:** rl_id

**Attributes:** rl_student_standing, rl_date_logged, rl_remedial_score

**Foreign Keys:** record_id → Retention_Record.record_id

### Retention_Risk

**Primary Key:** risk_id

**Attributes:** risk_level, risk_confidence, rr_timestamp

**Foreign Keys:** student_id → Student.student_id

## ERD 2 (Revised/Capstone)

### User_Account

**Primary Key:** user_id

**Attributes:** username, password, role, status

**Relationships:**
- Linked to Faculty.
- Linked to Student.
- Referenced by Attendance_Session.
- Referenced by Audit_Log.

### Audit_Log

**Primary Key:** log_id

**Attributes:** action, target, timestamp, ip_add

**Foreign Keys:** user_id → User_Account.user_id

### Device

**Primary Key:** device_id

**Attributes:** device_name, ip_add, location, status

**Relationships:** One device records many Attendance_Sessions.

### Faculty

**Primary Key:** fac_id

**Attributes:** fac_fname, fac_lname, fac_mname, is_admin, contact_no, emp_status

**Foreign Keys:** user_id → User_Account.user_id

**Relationships:** Faculty configures Course_Components.

### Student

**Primary Key:** stud_id

**Attributes:** stud_number, stud_fname, stud_lname, stud_mname, sex, birthdate, admission_date, stud_BU_email, stud_contact, year_level, is_regular, acc_status

**Relationships:**
- Has Student_Image.
- Has Facial_Template.
- Has Enrollment.
- Has Retention_Record.

### Student_Image

**Primary Key:** si_id

**Attributes:** file_path, is_primary, retrieved_on

**Foreign Keys:** student_id → Student.stud_id

### Facial_Template

**Primary Key:** template_id

**Attributes:** lbph_vector, captured_on

**Foreign Keys:** student_id → Student.stud_id

### Course

**Primary Key:** course_id

**Attributes:** course_code, name, units, year_level, semester, description

### Course_Components

**Primary Key:** cc_id

**Attributes:** lab_weight, lec_weight, has_zero_rule

**Foreign Keys:**
- fac_id → Faculty.fac_id
- course_id → Course.course_id

**Relationships:**
- One course component contains many Components.
- One class section references one Course_Components.

### Component

**Primary Key:** comp_id

**Attributes:** comp_name, weight

**Foreign Keys:** cc_id → Course_Components.cc_id

### Class_Section

**Primary Key:** cs_id

**Attributes:** cs_name, cs_semester, cs_school_year, cs_lab_room, cs_lec_room, cs_block, cs_block_sec, status

**Foreign Keys:** cc_id → Course_Components.cc_id

**Relationships:**
- Has many Enrollments.
- Has many Assessments.
- Has many Attendance_Sessions.

### Enrollment

**Primary Key:** en_id

**Attributes:** en_status, date_enrolled

**Foreign Keys:**
- student_id → Student.stud_id
- cs_id → Class_Section.cs_id

**Relationships:**
- Receives Student_Assessment_Grade.
- Receives Student_Term_Grade.
- Has Attendance_Record.

### Attendance_Session

**Primary Key:** se_id

**Attributes:** se_date, se_created_by, se_start, se_end, se_code

**Foreign Keys:**
- device_id → Device.device_id
- cs_id → Class_Section.cs_id
- se_secretary_id → User_Account.user_id

### Attendance_Record

**Primary Key:** rec_id

**Attributes:** sat_time_recorded, rec_status, rec_verification_method

**Foreign Keys:**
- se_id → Attendance_Session.se_id
- en_id → Enrollment.en_id

### Assessment

**Primary Key:** a_id

**Attributes:** a_title, a_max_score, a_date, status

**Foreign Keys:**
- comp_id → Component.comp_id
- cs_id → Class_Section.cs_id

**Relationships:** Evaluates students through Student_Assessment_Grade.

### Student_Assessment_Grade

**Primary Key:** sg_id

**Attributes:** sg_raw_score, sg_grade

**Foreign Keys:**
- a_id → Assessment.a_id
- en_id → Enrollment.en_id

**Relationships:** Used as the basis for Retention_Risk.

### Student_Term_Grade

**Primary Key:** stg_id

**Attributes:** stg_term, stg_grade, stg_remarks

**Foreign Keys:** en_id → Enrollment.en_id

### Retention_Record

**Primary Key:** record_id

**Attributes:** record_current_stage, record_status, record_remarks

**Foreign Keys:** student_id → Student.stud_id

**Relationships:** Contains many Remedial_Logs.

### Remedial_Logs

**Primary Key:** rl_id

**Attributes:** rl_student_standing, rl_date_logged, rl_remedial_score

**Foreign Keys:** record_id → Retention_Record.record_id

### Retention_Risk

**Primary Key:** report_id

**Attributes:** risk_category, remark

**Foreign Keys:** sg_id → Student_Assessment_Grade.sg_id

## High-Level Relationship Summary

```
User_Account → Faculty, Student, Attendance_Session, Audit_Log

Note: The User_Account-to-Student relationship is logically confirmed by Owner plaintext.
Student has no displayed user_id FK. Do not invent a physical account FK.

Faculty → Course_Components
Course → Course_Components → Component → Assessment
Course_Components → Class_Section
Class_Section → Enrollment, Attendance_Session, Assessment
Student → Student_Image, Facial_Template, Enrollment, Retention_Record → Remedial_Logs
Enrollment → Attendance_Record, Student_Assessment_Grade, Student_Term_Grade
Attendance_Session → Attendance_Record
Assessment → Student_Assessment_Grade → Retention_Risk
```

## Resolved Corrections

| Item | Resolution |
|---|---|
| ERD 1 entity count | 15 entities |
| Source entity name | `User_Account` |
| Source entity name | `Faculty` |
| ERD 2 `Student_Image.retrieved_on` | `retrieved_on` |
| ERD 2 `Student_Term_Grade.stg_grade` | No brackets |
| ERD 2 `Student_Term_Grade.stg_remarks` | No brackets |
| `se_secretary_id` target | `User_Account.user_id` |
| `se_created_by` logical target | `User_Account` (no explicit FK marker) |
| `Student_Image.student_id` parent key | `Student.stud_id` |
| `Facial_Template.student_id` parent key | `Student.stud_id` |
| `Enrollment.student_id` parent key | `Student.stud_id` |
| ERD 2 `Retention_Record` parent | Only `student_id → Student.stud_id` |
| ERD 2 `Enrollment/Student_Term_Grade → Retention_Record` | Superseded by Owner plaintext |
| ERD 2 `User_Account → Student` linkage | Confirmed by plaintext; Student has no displayed `user_id` |
