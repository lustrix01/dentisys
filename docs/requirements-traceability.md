# Requirements Traceability Matrix

## Source Register

| Source ID | Source | Type | Repository status | Notes |
|---|---|---|---|---|
| SRC-CAP-SAD | Owner-provided DentiSys capstone/SAD paper | Archived owner source | Found at `docs/database/erd-sources/dentisys-capstone-paper.pdf` | Workflow, policy, and provenance source; the Gatekeeper-verified extract remains the planning-time paper input because the PDF was not parsed by Codex. |
| SRC-ERD-1A | Owner-designated original Phase 1A ERD image | Archived owner source (provenance evidence) | Found at `docs/database/erd-sources/phase-1a-original-paper-erd.png` | Provenance evidence for the Phase 1A source-fidelity stage; not claimed pixel-identical to the paper appendix. |
| SRC-ERD-1B | Owner-designated present Phase 1B ERD image | Archived owner source (provenance evidence) | Found at `docs/database/erd-sources/phase-1b-present-20-entity-erd.png` | Provenance evidence for the exact present 20-entity stage. |
| SRC-PHASE-1-RECON | Phase 1 source reconciliation | Repository documentation | Found at `docs/database/phase-1-source-reconciliation.md` | Records source transcription, differences, conflicts, and unresolved physical assumptions; it does not approve a final ERD. |
| SRC-PLAINTEXT | Phase 1 authoritative plaintext transcription | Repository documentation (primary structural authority) | Found at `docs/database/erd-sources/phase-1-authoritative-plaintext-transcription.md` | Primary AI-readable structural authority for Phase 1A and Phase 1B. Contains Owner-provided ERD 1 and ERD 2 plaintext transcription. Recorded 2026-07-20. |
| SRC-IAS-A | Owner-provided IAS Module A specification | External owner source | Not found as a repository file | Requirements are represented from the approved execution prompt. |
| SRC-IAS-C | Owner-provided IAS Module C specification | External owner source | Not found as a repository file | Requirements are represented from the approved execution prompt. The supplied Module C material indicates that the specification continues on another page, and the closing-paragraph instruction is truncated. The missing wording must be obtained from the Owner and must not be inferred. |
| SRC-REPO-DOCS | Existing repository documentation | Repository evidence | Found | Includes `README.md`, `docs/architecture.md`, `docs/features.md`, `docs/frontend.md`, `docs/frontend-documentation.md`, `docs/local-development.md`, and `database/migrations/README.md`. |
| SRC-FE-PROTO | Existing frontend prototype evidence | Repository evidence | Found | Includes React routes, pages, types, context state, localStorage services, role guards, and mock workflows under `frontend/src/`. |
| SRC-BE-DB | Existing backend and database evidence | Repository evidence | Found | Plain PHP health API, MariaDB `_schema_migrations` foundation, no business tables, and no DentiSys CRUD/auth/security implementation. |

## Known Source Gaps

Module C is currently incomplete. The Phase 0 IAS-C traceability covers only the requirements actually supplied. Future requirements from the missing continuation page must be added through a controlled documentation update. No unknown requirement text has been invented.

## Status Values

Use only these values:

- `Confirmed`: confirmed as a requirement or architecture fact, not necessarily implemented.
- `Prototype Only`: represented by frontend mock UI, frontend localStorage, or in-browser state only.
- `Documented Future Requirement`: documented as future work but not implemented.
- `Missing`: not found in repository evidence.
- `Conflict`: conflicting repository guidance or incompatible assumptions exist.
- `Owner Decision Required`: cannot be finalized without Owner approval.

Status values describe current repository representation and implementation coverage. They do not determine whether an Owner-provided requirement is optional.

## Capstone and SAD Requirements

| Requirement ID | Requirement description | Requirement source | Current repository evidence | Current status | Expected implementation phase | Expected validation or evidence artifact | Related decision ID | Open issue or Owner decision |
|---|---|---|---|---|---|---|---|---|
| CAP-SAD-001 | Centralized web-based academic grading | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | `docs/features.md`; `docs/frontend.md`; `frontend/src/pages/faculty/GradeComputation.tsx` | Prototype Only | Phase 3 | Backend API tests, grading workflow tests, approved grading evidence | DEC-011 | Define authoritative backend grading model. |
| CAP-SAD-002 | Lecture and laboratory grading components | SRC-CAP-SAD, SRC-FE-PROTO | Frontend types include quiz, exam, practicum, laboratory assessment categories | Prototype Only | Phase 3 | Grading policy tests and grade sheet examples | DEC-011 | Decide final lecture/lab component taxonomy. |
| CAP-SAD-003 | Customizable grading weights | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | `docs/features.md`; settings and retention criteria prototype pages | Prototype Only | Phase 3 | Settings persistence tests and policy-version evidence | DEC-011 | Decide scope of per-subject, per-term, and institution weights. |
| CAP-SAD-004 | Score validation | SRC-CAP-SAD, SRC-FE-PROTO | Some frontend form validation exists; backend validation absent | Prototype Only | Phase 3 | Server-side validation tests | DEC-026 | Define authoritative validation rules. |
| CAP-SAD-005 | Grade computation | SRC-CAP-SAD, SRC-FE-PROTO | `frontend/src/utils/gradeHelper.ts` computes GWA in prototype | Prototype Only | Phase 3 | Computation unit tests and parity evidence | DEC-011 | Confirm final computation formula. |
| CAP-SAD-006 | Grade transmutation | SRC-CAP-SAD, SRC-FE-PROTO | Percentage-to-GWA helper exists in frontend prototype | Prototype Only | Phase 3 | Transmutation table tests | DEC-011 | Approve final transmutation scale. |
| CAP-SAD-007 | Comprehensive grading sheets | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Printable reports and grade pages are documented/prototyped | Prototype Only | Phase 4 | Generated report samples and export tests | DEC-022 | Decide official grade-sheet format. |
| CAP-SAD-008 | Student enrollment and academic records | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Student management prototype and TypeScript `Student` type | Prototype Only | Phase 3 | CRUD API tests and database evidence | DEC-009, DEC-010 | Approve ERD student/enrollment structure. |
| CAP-SAD-009 | BUCDM retention-policy monitoring | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Retention monitoring prototype and feature docs | Prototype Only | Phase 4 | Retention policy tests and history evidence | DEC-013 | Approve retention policy versioning. |
| CAP-SAD-010 | First remedial examination | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | General remedial exam prototype exists | Prototype Only | Phase 4 | Remedial workflow tests | DEC-014 | Distinguish first remedial from other stages. |
| CAP-SAD-011 | Second remedial examination | SRC-CAP-SAD | No explicit second remedial model found | Missing | Phase 4 | Remedial stage tests and approved policy evidence | DEC-014 | Define second remedial rules. |
| CAP-SAD-012 | Cost-recovery stage | SRC-CAP-SAD | No explicit cost-recovery model found | Missing | Phase 4 | Cost-recovery workflow evidence | DEC-014 | Define cost-recovery status, triggers, and records. |
| CAP-SAD-013 | Retention-status history | SRC-CAP-SAD, SRC-FE-PROTO | `RetentionLog` type and frontend retention history prototype | Prototype Only | Phase 4 | Persistence tests and audit evidence | DEC-013 | Approve historical tracking semantics. |
| CAP-SAD-014 | Random Forest retention-risk prediction | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Feature docs and frontend Random Forest simulator | Prototype Only | Phase 6 | Model evaluation report and prediction-history tests | DEC-021 | Decide model boundary and approved input features. |
| CAP-SAD-015 | Facial enrollment | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Face enrollment simulation and consent checks in frontend docs | Prototype Only | Phase 5 | Biometric enrollment tests and consent evidence | DEC-016, DEC-017 | Approve biometric enrollment process. |
| CAP-SAD-016 | Haar Cascade face detection | SRC-CAP-SAD | No repository implementation or doc found | Missing | Phase 5 | Computer-vision service tests | DEC-019 | Confirm Haar Cascade as required detector. |
| CAP-SAD-017 | LBPH face recognition | SRC-CAP-SAD | No repository implementation or doc found | Missing | Phase 5 | Recognition service tests | DEC-019 | Confirm LBPH as required recognizer. |
| CAP-SAD-018 | Facial template storage | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Docs mention encrypted feature vectors; frontend stores simulated image details | Owner Decision Required | Phase 5 | Storage design review and privacy test evidence | DEC-017, DEC-018 | Decide image vs template retention and encryption boundary. |
| CAP-SAD-019 | Student biometric consent | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Consent status exists in frontend type and consent-request prototype | Prototype Only | Phase 5 | Consent workflow tests and audit evidence | DEC-016 | Approve consent lifecycle and revocation. |
| CAP-SAD-020 | Real-time or session-based attendance | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Attendance pages and CCTV placeholder exist; no backend session model | Prototype Only | Phase 5 | Attendance session tests | DEC-015 | Decide real-time vs session-based scope. |
| CAP-SAD-021 | Attendance verification | SRC-CAP-SAD, SRC-FE-PROTO | CCTV/facial-recognition-ready prototype, no verified backend workflow | Prototype Only | Phase 5 | Verification tests and audit evidence | DEC-015, DEC-019 | Define verification authority and manual fallback. |
| CAP-SAD-022 | Manual attendance correction or override | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Manual override page and local audit trail exist | Prototype Only | Phase 5 | Override API tests and audit evidence | DEC-015 | Approve override permissions and history model. |
| CAP-SAD-023 | Attendance reports | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Printable attendance summaries documented/prototyped | Prototype Only | Phase 4 | Report samples and export tests | DEC-022 | Decide report output formats. |
| CAP-SAD-024 | Retention and remedial reports | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Retention/remedial reports documented/prototyped | Prototype Only | Phase 4 | Report samples and policy trace evidence | DEC-022 | Decide official retention/remedial report contents. |
| CAP-SAD-025 | Dean/Admin workflows | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Admin dashboard, faculty approval, retention criteria, reports, audit pages | Prototype Only | Phase 2 onward | RBAC matrix and workflow tests | DEC-006 | Approve final admin permissions. |
| CAP-SAD-026 | Faculty workflows | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Faculty pages for students, grades, retention, attendance, reports, email, audit | Prototype Only | Phase 2 onward | RBAC matrix and workflow tests | DEC-006 | Approve final faculty resource scope. |
| CAP-SAD-027 | Class Secretary workflows | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Secretary attendance, override, CCTV, audit, profile, settings pages | Prototype Only | Phase 2 onward | RBAC matrix and workflow tests | DEC-006 | Approve secretary authority and limits. |
| CAP-SAD-028 | Relevant student actions | SRC-CAP-SAD, SRC-FE-PROTO | Secretary activation uses student-as-secretary flow; general student portal not found | Owner Decision Required | Phase 2 onward | RBAC matrix and workflow tests | DEC-006 | Decide whether students have a separate role beyond Class Secretary. |

## IAS Module A Requirements

| Requirement ID | Requirement description | Requirement source | Current repository evidence | Current status | Expected implementation phase | Expected validation or evidence artifact | Related decision ID | Open issue or Owner decision |
|---|---|---|---|---|---|---|---|---|
| IAS-A-001 | TOTP-based Multi-Factor Authentication | SRC-IAS-A | Not found in repository evidence | Missing | Phase 2 | MFA enrollment and login tests | DEC-004 | Approve MFA scope and required roles. |
| IAS-A-002 | TOTP secret provisioning | SRC-IAS-A | Not found in repository evidence | Missing | Phase 2 | Secret provisioning tests and recovery evidence | DEC-004 | Decide provisioning and reset process. |
| IAS-A-003 | TOTP enrollment flow | SRC-IAS-A | Existing auth screens do not include TOTP enrollment | Missing | Phase 2 | TOTP enrollment and verification flow diagram; enrollment flow tests | DEC-004 | Decide enrollment timing and enforcement. |
| IAS-A-004 | TOTP verification and validation flow | SRC-IAS-A | Existing login is mock/localStorage only | Missing | Phase 2 | TOTP enrollment and verification flow diagram; login challenge tests | DEC-004 | Decide retry, drift, and lockout rules. |
| IAS-A-005 | Strict Role-Based Access Control | SRC-IAS-A, SRC-REPO-DOCS, SRC-FE-PROTO | Frontend route guards and docs exist; backend enforcement absent | Prototype Only | Phase 2 | Server-side authorization tests | DEC-006 | Approve backend enforcement model. |
| IAS-A-006 | Complete roles x resources x permitted-actions matrix | SRC-IAS-A | Not found as a repository artifact | Missing | Phase 2 | Approved RBAC matrix | DEC-006 | Decide complete resource/action matrix. |
| IAS-A-007 | Hashing and MAC/HMAC rationale | SRC-IAS-A | Password hashing is documented as future need; HMAC rationale not found | Missing | Phase 2 | Security design rationale document | DEC-003, DEC-004 | Document hashing and TOTP/HMAC rationale. |
| IAS-A-008 | Authentication rationale | SRC-IAS-A | Auth requirements are scattered; no unified rationale found | Owner Decision Required | Phase 2 | Approved authentication design rationale | DEC-003 | Approve final auth strategy. |
| IAS-A-009 | Privilege-management rationale | SRC-IAS-A | RBAC noted, no complete privilege rationale found | Missing | Phase 2 | Approved RBAC rationale | DEC-006 | Document least-privilege model. |

## IAS Module C Requirements

| Requirement ID | Requirement description | Requirement source | Current repository evidence | Current status | Expected implementation phase | Expected validation or evidence artifact | Related decision ID | Open issue or Owner decision |
|---|---|---|---|---|---|---|---|---|
| IAS-C-001 | API rate limiting | SRC-IAS-C, SRC-REPO-DOCS | Mentioned as future requirement in `docs/frontend.md`; not implemented | Documented Future Requirement | Phase 2 | Rate-limit tests and logs | DEC-024 | Decide limits and protected endpoints. |
| IAS-C-002 | JWT rotation | SRC-IAS-C, SRC-REPO-DOCS | Mentioned as future security requirement; not implemented | Documented Future Requirement | Phase 2 | Token refresh and replay tests | DEC-005 | Decide token lifetime and rotation rules. |
| IAS-C-003 | JWT revocation or blacklisting | SRC-IAS-C | Not found in repository evidence | Missing | Phase 2 | Logout/revocation tests | DEC-005 | Decide revocation storage strategy. |
| IAS-C-004 | Input validation | SRC-IAS-C, SRC-REPO-DOCS, SRC-FE-PROTO | Frontend validation exists in places; server-side validation is future work | Prototype Only | Phase 2 onward | Endpoint validation tests | DEC-026 | Define request validation policy. |
| IAS-C-005 | Input sanitization | SRC-IAS-C, SRC-REPO-DOCS | Mentioned as future requirement; not implemented | Documented Future Requirement | Phase 2 onward | Sanitization tests and code review evidence | DEC-026 | Define sanitization and output-encoding rules. |
| IAS-C-006 | Parameterized database queries | SRC-IAS-C, SRC-BE-DB | PDO foundation exists; no business queries exist | Missing | Phase 2 onward | Query review evidence and tests | DEC-025 | Parameterized queries are mandatory for future dynamic SQL; the helper pattern, conventions, review process, and documented static-query exceptions require approval. |
| IAS-C-007 | Extended network ACL rules | SRC-IAS-C | Not found in repository evidence | Missing | Phase 7 | Network ACL evidence | DEC-023 | Requires deployment/network target. |
| IAS-C-008 | Wildcard-mask calculations | SRC-IAS-C | Not found in repository evidence | Missing | Phase 7 | ACL calculation worksheet | DEC-023 | Requires approved network ranges. |
| IAS-C-009 | Endpoint-by-endpoint security-control table | SRC-IAS-C | Not found as repository artifact | Missing | Phase 2 onward | Approved endpoint control table | DEC-024 | Requires approved API surface. |
| IAS-C-010 | OWASP Top 10 design rationale | SRC-IAS-C | Security checklist exists; OWASP rationale not found | Missing | Phase 2 onward | Security rationale document | DEC-026 | Map controls to OWASP risks. |
| IAS-C-011 | Network-layer restrictions protecting backend services | SRC-IAS-C | Local Docker/XAMPP docs exist; no production network restrictions | Missing | Phase 7 | Deployment/network evidence | DEC-023 | Requires deployment environment decision. |

## Audit and Logging Requirements

| Requirement ID | Requirement description | Requirement source | Current repository evidence | Current status | Expected implementation phase | Expected validation or evidence artifact | Related decision ID | Open issue or Owner decision |
|---|---|---|---|---|---|---|---|---|
| AUD-001 | Authentication-event logging | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Frontend local audit service logs some auth-like events | Prototype Only | Phase 2 | Auth audit tests | DEC-007 | Define server audit schema and event fields. |
| AUD-002 | MFA-event logging | SRC-IAS-A | Not found in repository evidence | Missing | Phase 2 | MFA audit tests | DEC-004, DEC-007 | Define MFA event taxonomy. |
| AUD-003 | Authorization-denial logging | SRC-IAS-A, SRC-IAS-C | Frontend redirects unauthorized routes; server denial logging absent | Prototype Only | Phase 2 | Authorization denial tests | DEC-006, DEC-007 | Define denial log fields and redaction. |
| AUD-004 | User approval auditing | SRC-CAP-SAD, SRC-FE-PROTO | Faculty approval prototype records local audit events | Prototype Only | Phase 2 | User approval audit tests | DEC-007 | Persist approval history server-side. |
| AUD-005 | Role-change auditing | SRC-CAP-SAD, SRC-IAS-A | Not found as distinct persisted behavior | Missing | Phase 2 | Role-change audit tests | DEC-006, DEC-007 | Decide role-change authority. |
| AUD-006 | Student-record change history | SRC-CAP-SAD | Student CRUD prototype exists; persisted change history absent | Prototype Only | Phase 3 | Student history tests | DEC-009, DEC-007 | Define tracked fields and retention. |
| AUD-007 | Grade-entry auditing | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Grade workflow and general audit prototype exist | Prototype Only | Phase 3 | Grade-entry audit tests | DEC-012, DEC-007 | Define grade-entry event granularity. |
| AUD-008 | Grade-revision auditing | SRC-CAP-SAD | No explicit persisted grade revision model | Missing | Phase 3 | Grade revision tests | DEC-012, DEC-007 | Define revision workflow and approval rules. |
| AUD-009 | Attendance-override history | SRC-CAP-SAD, SRC-REPO-DOCS, SRC-FE-PROTO | Frontend `AttendanceOverrideAudit` and manual override page exist | Prototype Only | Phase 5 | Attendance override audit tests | DEC-015, DEC-007 | Persist override history append-only. |
| AUD-010 | Retention changes | SRC-CAP-SAD, SRC-FE-PROTO | `RetentionLog` type and prototype retention overrides exist | Prototype Only | Phase 4 | Retention audit tests | DEC-013, DEC-007 | Define policy version and reason fields. |
| AUD-011 | Remedial changes | SRC-CAP-SAD, SRC-FE-PROTO | General remedial prototype exists; persisted audit absent | Prototype Only | Phase 4 | Remedial audit tests | DEC-014, DEC-007 | Define remedial event taxonomy. |
| AUD-012 | Facial-data enrollment auditing | SRC-CAP-SAD, SRC-FE-PROTO | Face enrollment prototype exists; persisted biometric audit absent | Prototype Only | Phase 5 | Biometric audit tests | DEC-016, DEC-017, DEC-007 | Define consent-linked enrollment events. |
| AUD-013 | Facial-data access auditing | SRC-CAP-SAD | Not found in repository evidence | Missing | Phase 5 | Access audit tests | DEC-017, DEC-007 | Define who may access biometric data. |
| AUD-014 | Facial-data replacement auditing | SRC-CAP-SAD | Not found in repository evidence | Missing | Phase 5 | Replacement audit tests | DEC-017, DEC-007 | Define replacement approval and history. |
| AUD-015 | Facial-data revocation auditing | SRC-CAP-SAD | Consent decline exists in prototype; revocation audit absent | Owner Decision Required | Phase 5 | Revocation audit tests | DEC-016, DEC-017, DEC-007 | Define revocation effects on templates and attendance. |
| AUD-016 | API abuse logging | SRC-IAS-C | Not found in repository evidence | Missing | Phase 2 | Abuse-event tests and log samples | DEC-024, DEC-007 | Define abuse thresholds and log fields. |
| AUD-017 | Rate-limit event logging | SRC-IAS-C | Rate limiting is future requirement only | Missing | Phase 2 | Rate-limit log tests | DEC-024, DEC-007 | Define rate-limit event retention. |
| AUD-018 | Administrative-setting change history | SRC-CAP-SAD, SRC-FE-PROTO | Settings prototype exists; persisted history absent | Prototype Only | Phase 3 onward | Settings audit tests | DEC-011, DEC-013, DEC-007 | Define settings covered by audit. |
| AUD-019 | Sensitive-value redaction in logs | SRC-IAS-C | Not found in repository evidence | Missing | Phase 2 | Redaction tests and review checklist | DEC-007, DEC-026 | Define sensitive fields and masking. |
| AUD-020 | Append-oriented or tamper-resistant audit design | SRC-CAP-SAD, SRC-IAS-C, SRC-REPO-DOCS | Mentioned in future audit notes; not implemented | Documented Future Requirement | Phase 2 onward | Audit integrity design and tests | DEC-007 | Decide tamper-resistant mechanism. |

## ERD and Data-Model Traceability

The ERD rows below are linked to the authoritative plaintext transcription (`SRC-PLAINTEXT`) as primary structural authority, the archived ERD images (`SRC-ERD-1A`, `SRC-ERD-1B`) as provenance evidence, and the reconciliation record (`SRC-PHASE-1-RECON`). Their implementation statuses remain unchanged: archival and reconciliation do not create or approve database schema.

| Requirement ID | Requirement description | Requirement source | Current repository evidence | Current status | Expected implementation phase | Expected validation or evidence artifact | Related decision ID | Open issue or Owner decision |
|---|---|---|---|---|---|---|---|---|---|
| ERD-001 | Users | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `user_account` table implemented (5 columns, migration 001). Phase 1A: authoritative plaintext shows `User_Account`; frontend auth service has mock users. | Confirmed | Phase 1B (complete) | Phase 1B migration 001, stage manifest, validation evidence | DEC-008, DEC-003 | User identity model deferred to Phase 2. |
| ERD-002 | Faculty | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `faculty` table implemented (8 columns, migration 032). PK renamed to fac_id. fac_bu_email omitted per B1-D01. | Confirmed | Phase 1B (complete) | Phase 1B migration 032, stage manifest, validation evidence | DEC-008, DEC-006 | Faculty role/assignment model deferred to Phase 2. |
| ERD-003 | Students | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `student` table implemented (13 columns, migration 033). PK renamed to stud_id. No user_id column. | Confirmed | Phase 1B (complete) | Phase 1B migration 033, stage manifest, validation evidence | DEC-008, DEC-009 | Student identity model deferred to Phase 1C. |
| ERD-004 | Courses or subjects | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `course` (7 columns), `course_component` (6 columns), `component` (4 columns) tables implemented. Weights moved to course_component/component per ERD 2. | Confirmed | Phase 1B (complete) | Phase 1B migrations 034-036, stage manifest, validation evidence | DEC-008, DEC-009 | Component taxonomy and sharing semantics deferred to Phase 1C. |
| ERD-005 | Sections | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `class_section` table implemented (10 columns, migration 037). cc_id replaces course_id/instructor_id. cs_year_level omitted per B1-D03. | Confirmed | Phase 1B (complete) | Phase 1B migration 037, stage manifest, validation evidence | DEC-009 | Section vs offering boundaries deferred to Phase 1C. |
| ERD-006 | Enrollment | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `enrollment` table implemented (5 columns, migration 038). date_enrolled added. | Confirmed | Phase 1B (complete) | Phase 1B migration 038, stage manifest, validation evidence | DEC-010 | Enrollment model deferred to Phase 1C. |
| ERD-007 | Assessments | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `assessment` table implemented (7 columns, migration 040). comp_id/cs_id replace course_id. a_type omitted per B1-D04. Status added. | Confirmed | Phase 1B (complete) | Phase 1B migration 040, stage manifest, validation evidence | DEC-011 | Assessment duplication and scope rules deferred to Phase 1C. |
| ERD-008 | Grades | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `student_assessment_grade` (5 columns, migration 044) and `student_term_grade` (5 columns, migration 045) tables implemented. | Confirmed | Phase 1B (complete) | Phase 1B migrations 044-045, stage manifest, validation evidence | DEC-011, DEC-012 | Grade computation formulas deferred to Phase 1C. |
| ERD-009 | Retention | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `retention_record` (5 columns, migration 046) and `retention_risk` (4 columns, migration 048) tables implemented. retention_risk references sg_id per ERD 2. risk_confidence/rr_timestamp omitted per B1-D05/B1-D06. | Confirmed | Phase 1B (complete) | Phase 1B migrations 046, 048, stage manifest, validation evidence | DEC-013 | Policy versioning and thresholds deferred to Phase 1C. |
| ERD-010 | Remedial records | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `remedial_log` table implemented (5 columns, migration 047). | Confirmed | Phase 1B (complete) | Phase 1B migration 047, stage manifest, validation evidence | DEC-014 | Remedial stages deferred to Phase 1C. |
| ERD-011 | Attendance | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `attendance_session` (9 columns, migration 039) and `attendance_record` (6 columns, migration 043) tables implemented. device_id FK backed by Device entity. se_created_by NULL with supporting index per B1-D07. | Confirmed | Phase 1B (complete) | Phase 1B migrations 039, 043, stage manifest, validation evidence | DEC-015 | Attendance verification/override history deferred to Phase 1C. |
| ERD-012 | Devices | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-FE-PROTO | Phase 1B: `device` table implemented (5 columns, migration 030). Referenced by attendance_session.device_id FK. | Confirmed | Phase 1B (complete) | Phase 1B migration 030, stage manifest, validation evidence | DEC-015, DEC-019 | Device registration/metadata management deferred to Phase 5. |
| ERD-013 | Facial templates | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1A, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-REPO-DOCS, SRC-FE-PROTO | Phase 1B: `student_image` (5 columns, migration 041) and `facial_template` (4 columns, migration 042) tables implemented. retrieved_on and captured_on added. | Confirmed | Phase 1B (complete) | Phase 1B migrations 041-042, stage manifest, validation evidence | DEC-016, DEC-017, DEC-018 | Biometric lifecycle, consent, and encryption deferred to Phase 1C/5. |
| ERD-014 | Audit logs | SRC-PLAINTEXT, SRC-CAP-SAD, SRC-ERD-1B, SRC-PHASE-1-RECON, SRC-REPO-DOCS, SRC-FE-PROTO | Phase 1B: `audit_log` table implemented (6 columns, migration 031). Phase 1C: `audit_chain` + `audit_event` tables with immutability triggers and insert-time MAC chaining (migrations 078-079). | Confirmed | Phase 1C (complete) | Phase 1C migrations 078-079, stage manifest, validation evidence | DEC-007 | |
| ERD-015 | Academic terms | SRC-PLAINTEXT, P1C-001 | Phase 1C: `academic_term` table (migration 051). `class_section.term_id` FK (migration 052). | Confirmed | Phase 1C (complete) | Phase 1C migrations 051-052 | P1-D22 | |
| ERD-016 | Component types | SRC-PLAINTEXT, P1C-003 | Phase 1C: `component_type` table with 8 paper-defined categories (migration 049). `component.ct_id` FK (migration 050). | Confirmed | Phase 1C (complete) | Phase 1C migrations 049-050 | P1-D07 | |
| ERD-017 | Retention cases | P1C-006, P1C-010 | Phase 1C: `retention_case` table with stg_id FK (migration 055). `retention_policy` + `retention_policy_version` (migrations 053-054). | Confirmed | Phase 1C (complete) | Phase 1C migrations 053-055 | P1-D12 | |
| ERD-018 | Remedial attempts | P1C-007/008/009 | Phase 1C: `remedial_attempt` table with type/status/immutable triggers (migration 056). | Confirmed | Phase 1C (complete) | Phase 1C migration 056 | P1-D13 | |
| ERD-019 | Student-account mapping | P1C-011 | Phase 1C: `student_user_account` 1:1 mapping entity (migration 057). | Confirmed | Phase 1C (complete) | Phase 1C migration 057 | P1-D05 | |
| ERD-020 | Attendance overrides | P1C-012 | Phase 1C: `attendance_override` with immutable triggers and operation_uuid (migration 058). | Confirmed | Phase 1C (complete) | Phase 1C migration 058 | P1-D32, AUD-009 | |
| ERD-021 | Biometric consent | P1C-013 | Phase 1C: `biometric_consent` with historical rows and current generated key (migration 059). | Confirmed | Phase 1C (complete) | Phase 1C migration 059 | P1-D15 | |
| ERD-022 | User preferences | P1C-018 | Phase 1C: `user_preference` per-user theme (migration 060). | Confirmed | Phase 1C (complete) | Phase 1C migration 060 | | |
| ERD-023 | RBAC | P1C-014 | Phase 1C: `access_role`, `permission`, `role_permission` with scope_type (migrations 061-064). | Confirmed | Phase 1C (complete) | Phase 1C migrations 061-064 | IAS-A-005, IAS-A-006 | |
| ERD-024 | Faculty approval | CAP-SAD-025 | Phase 1C: `faculty_approval` with immutable triggers and operation_uuid (migration 068). | Confirmed | Phase 1C (complete) | Phase 1C migration 068 | AUD-004 | |
| ERD-025 | Secretary invitation | CAP-SAD-027 | Phase 1C: `secretary_invitation` with token_digest, active key, identity validation trigger (migration 069). | Confirmed | Phase 1C (complete) | Phase 1C migration 069 | | |
| ERD-026 | Secretary assignment | CAP-SAD-027 | Phase 1C: `secretary_assignment` with sua_id chain and active key (migration 070). | Confirmed | Phase 1C (complete) | Phase 1C migration 070 | P1-D30 | |
| ERD-027 | MFA credentials | P1C-015 | Phase 1C: `mfa_credential` with AES-256-GCM ciphertext and `mfa_recovery_code` with bcrypt hashes (migrations 071-072). | Confirmed | Phase 1C (complete) | Phase 1C migrations 071-072 | IAS-A-001 through IAS-A-004 | |
| ERD-028 | Sessions and tokens | IAS-C-002/003 | Phase 1C: `auth_session`, `refresh_token`, `access_token_revocation`, `password_reset_token` (migrations 073-076). | Confirmed | Phase 1C (complete) | Phase 1C migrations 073-076 | | |
| ERD-029 | Auth throttling | IAS-C-001 | Phase 1C: `auth_throttle` with scoped-hash design (migration 077). | Confirmed | Phase 1C (complete) | Phase 1C migration 077 | | |
| ERD-030 | Email delivery | CAP-SAD-025/026 | Phase 1C: `email_delivery` with immutable terminal-state triggers (migration 080). | Confirmed | Phase 1C (complete) | Phase 1C migration 080 | | |

## Open Decision Summary

The following requirements are intentionally left open because Phase 0 must not make final Owner decisions: `CAP-SAD-018`, `CAP-SAD-028`, `IAS-A-008`, `AUD-015`, `ERD-012`, and `ERD-013`.
