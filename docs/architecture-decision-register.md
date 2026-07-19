# Architecture Decision Register

## Decision Record Format

Each decision record uses this structure:

- Decision ID
- Topic
- Context
- Options considered
- Current recommendation
- Status
- Owner decision required
- Related requirement IDs
- Expected future phase
- Repository or source evidence

Statuses used in this register:

- `Accepted Baseline`: confirmed as current repository fact for planning.
- `Proposed`: recommended direction awaiting approval.
- `Open`: unresolved and requires Owner decision.
- `Conflict`: existing sources disagree and must be reconciled.

For Owner-mandated IAS controls, an Open or Proposed status means that implementation details remain unresolved. It does not mean that the required control itself is optional.

The ERD is provisional. No schema, migration, DDL, table design, or final data model is approved by this document.

## Decision Records

### DEC-001

- Topic: React frontend and plain-PHP/MariaDB baseline
- Context: The repository currently contains a React/Vite frontend, a plain-PHP API foundation, and a MariaDB migration foundation.
- Options considered: preserve current baseline; migrate backend stack; replace frontend architecture.
- Current recommendation: preserve the current React frontend and plain-PHP/MariaDB baseline until the Owner explicitly approves any migration.
- Status: Accepted Baseline
- Owner decision required: No for Phase 0; yes for any later stack migration.
- Related requirement IDs: CAP-SAD-001, CAP-SAD-008, IAS-C-011, ERD-001 through ERD-014
- Expected future phase: Phase 1 onward
- Repository or source evidence: `README.md`, `docs/architecture.md`, `docs/local-development.md`, `backend/`, `database/init.sql`, `frontend/package.json`

### DEC-002

- Topic: Conflict with Node/Python/PostgreSQL guidance in older frontend documentation
- Context: `docs/frontend.md` contains older planned backend options such as Node/Python/PostgreSQL, while the actual repository baseline is plain PHP/MariaDB.
- Options considered: treat older guidance as authoritative; treat current repository architecture as authoritative; defer the decision.
- Current recommendation: treat the current repository architecture as the Phase 0 baseline and record older guidance as historical/conflicting until Owner review.
- Status: Conflict
- Owner decision required: Yes before backend implementation.
- Related requirement IDs: IAS-C-006, IAS-C-011, ERD-001 through ERD-014
- Expected future phase: Phase 1
- Repository or source evidence: `docs/frontend.md`, `docs/architecture.md`, `README.md`

### DEC-003

- Topic: Final authentication strategy
- Context: The frontend has mock login and localStorage session behavior; the backend has no authentication implementation.
- Options considered: JWT access/refresh tokens; server-side sessions; hybrid token/session approach.
- Current recommendation: defer final selection until Phase 2 security design, while preserving current mock frontend behavior until approved replacement.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: IAS-A-007, IAS-A-008, AUD-001, ERD-001
- Expected future phase: Phase 2
- Repository or source evidence: `docs/features.md`, `docs/frontend.md`, `frontend/src/services/authService.ts`, `docs/architecture.md`

### DEC-004

- Topic: TOTP MFA
- Context: IAS Module A requires TOTP MFA, secret provisioning, enrollment, and validation. No TOTP implementation or documentation artifact exists in the repository.
- Options considered: require TOTP for all roles; require TOTP for Dean/Admin and Faculty only; phased role enforcement.
- Current recommendation: define TOTP enrollment, provisioning, validation, recovery, and audit requirements in Phase 2 before implementation.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: IAS-A-001, IAS-A-002, IAS-A-003, IAS-A-004, IAS-A-007, AUD-002
- Expected future phase: Phase 2
- Repository or source evidence: Owner-provided IAS Module A requirements; no repository TOTP evidence found.

### DEC-005

- Topic: JWT rotation and revocation
- Context: Existing docs mention JWT and token rotation as future requirements; no backend auth or token storage exists.
- Options considered: rotating refresh tokens with server revocation; stateless JWT only; opaque session tokens.
- Current recommendation: require a Phase 2 design that includes rotation, replay prevention, logout, revocation or blacklist behavior, and audit events.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: IAS-C-002, IAS-C-003, AUD-001
- Expected future phase: Phase 2
- Repository or source evidence: `docs/frontend.md`, `docs/architecture.md`

### DEC-006

- Topic: RBAC ownership and enforcement boundaries
- Context: Frontend route guards exist, but backend authorization is explicitly absent.
- Options considered: frontend-only guards; backend route middleware; backend resource-level authorization plus frontend navigation filtering.
- Current recommendation: backend must be authoritative for role and resource enforcement; frontend guards remain a usability layer only.
- Status: Proposed
- Owner decision required: Yes for final roles, resources, and actions.
- Related requirement IDs: CAP-SAD-025, CAP-SAD-026, CAP-SAD-027, CAP-SAD-028, IAS-A-005, IAS-A-006, IAS-A-009, AUD-003, AUD-005
- Expected future phase: Phase 2
- Repository or source evidence: `frontend/src/App.tsx`, `docs/features.md`, `docs/frontend.md`, `docs/architecture.md`

### DEC-007

- Topic: Audit-log integrity and retention
- Context: Frontend audit logs are stored in localStorage; future docs mention tamper-evident server-side audit tables.
- Options considered: regular mutable audit table; append-oriented audit table; tamper-resistant hash chain or external log store.
- Current recommendation: design an append-oriented server-side audit model with redaction, event taxonomy, retention rules, and review/export support before implementation.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: AUD-001 through AUD-020, ERD-014
- Expected future phase: Phase 1 and Phase 2
- Repository or source evidence: `frontend/src/services/auditService.ts`, `docs/frontend-documentation.md`, `docs/frontend.md`

### DEC-008

- Topic: Final ERD normalization
- Context: The Owner-provided ERD is provisional and business tables are intentionally absent.
- Options considered: copy the provisional ERD directly; normalize around academic terms and history; defer schema until requirements are reconciled.
- Current recommendation: Phase 1 should approve a normalized ERD that supports history, privacy, authorization, and auditability.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: ERD-001 through ERD-014
- Expected future phase: Phase 1
- Repository or source evidence: `database/init.sql`, `database/migrations/README.md`, Owner-provided provisional ERD context

### DEC-009

- Topic: Academic term and class-offering structure
- Context: Frontend types use class IDs, class names, subjects, and year levels, but no final term/offering model exists.
- Options considered: store subjects directly on students; normalize terms, sections, and class offerings; defer academic calendar support.
- Current recommendation: decide academic term, section, subject, and class-offering boundaries in Phase 1.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-008, ERD-003, ERD-004, ERD-005
- Expected future phase: Phase 1
- Repository or source evidence: `frontend/src/types/index.ts`, `docs/frontend.md`

### DEC-010

- Topic: Enrollment structure
- Context: Frontend stores enrolled subjects inside student objects; a relational backend needs an approved enrollment model.
- Options considered: embedded enrolled subjects; normalized enrollment rows; enrollment history by term and section.
- Current recommendation: use Phase 1 to define enrollment records and history without creating schema in Phase 0.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-008, ERD-006
- Expected future phase: Phase 1
- Repository or source evidence: `frontend/src/types/index.ts`, `database/migrations/README.md`

### DEC-011

- Topic: Grading scheme versioning
- Context: Frontend supports configurable weights and grade computation; final lecture/lab policy and versioning are not approved.
- Options considered: global current settings only; per-subject settings; versioned grading schemes by term and offering.
- Current recommendation: define versioned grading schemes in Phase 1/3 so grade records remain historically explainable.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-001 through CAP-SAD-007, ERD-007, ERD-008, AUD-018
- Expected future phase: Phase 1 and Phase 3
- Repository or source evidence: `frontend/src/utils/gradeHelper.ts`, `frontend/src/types/index.ts`, `docs/features.md`

### DEC-012

- Topic: Grade revision history
- Context: Grade entry exists in the prototype, but persistent grade revisions and approvals are not defined.
- Options considered: overwrite grades; keep revision rows; require approval workflow for revisions.
- Current recommendation: Phase 1 should model revision history; Phase 3 should implement approved behavior.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: AUD-007, AUD-008, ERD-008
- Expected future phase: Phase 1 and Phase 3
- Repository or source evidence: `frontend/src/pages/faculty/GradeComputation.tsx`, `frontend/src/types/index.ts`

### DEC-013

- Topic: Retention-policy versioning
- Context: Frontend has retention thresholds and retention logs; final policy/version model is not approved.
- Options considered: single mutable threshold; versioned policy records; per-program/per-term policies.
- Current recommendation: Phase 1 should record retention policy versions and status history needs before Phase 4 implementation.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-009, CAP-SAD-013, AUD-010, ERD-009
- Expected future phase: Phase 1 and Phase 4
- Repository or source evidence: `frontend/src/types/index.ts`, `docs/features.md`, `docs/frontend.md`

### DEC-014

- Topic: Remedial and cost-recovery representation
- Context: General remedial exams exist in the prototype, but first remedial, second remedial, and cost-recovery stages are not distinctly modeled.
- Options considered: single remedial record type; staged remedial attempts; separate cost-recovery workflow.
- Current recommendation: Phase 1 should define staged remedial and cost-recovery entities/statuses before implementation.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-010, CAP-SAD-011, CAP-SAD-012, AUD-011, ERD-010
- Expected future phase: Phase 1 and Phase 4
- Repository or source evidence: `frontend/src/types/index.ts`, `docs/features.md`

### DEC-015

- Topic: Attendance-session model and manual override history
- Context: Frontend attendance records are per date/subject and support local override audit trails; no backend session model exists.
- Options considered: per-date records only; explicit attendance sessions; session plus verification events and override history.
- Current recommendation: Phase 1 should define attendance sessions, verification events, manual overrides, and history records before Phase 5 implementation.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-020, CAP-SAD-021, CAP-SAD-022, AUD-009, ERD-011, ERD-012
- Expected future phase: Phase 1 and Phase 5
- Repository or source evidence: `frontend/src/types/index.ts`, `frontend/src/pages/secretary/ManualAttendanceOverride.tsx`, `docs/frontend-documentation.md`

### DEC-016

- Topic: Biometric consent
- Context: Frontend tracks consent status and consent requests, but consent lifecycle and revocation behavior are not finalized.
- Options considered: simple consent flag; versioned consent records; consent records linked to biometric templates and attendance use.
- Current recommendation: Phase 1 should define consent lifecycle, evidence, revocation, and audit requirements before biometric implementation.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-019, AUD-012, AUD-015, ERD-013
- Expected future phase: Phase 1 and Phase 5
- Repository or source evidence: `frontend/src/types/index.ts`, `docs/frontend-documentation.md`

### DEC-017

- Topic: Facial image and template storage
- Context: Existing docs mention encrypted vectors, while frontend prototype stores simulated captured images/details.
- Options considered: store raw images; store extracted templates only; store both with strict retention; use external storage.
- Current recommendation: do not decide in Phase 0; Phase 1 must approve storage, retention, access, replacement, and revocation rules.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-018, AUD-012, AUD-013, AUD-014, AUD-015, ERD-013
- Expected future phase: Phase 1 and Phase 5
- Repository or source evidence: `docs/features.md`, `docs/frontend-documentation.md`, `frontend/src/types/index.ts`

### DEC-018

- Topic: Encryption boundaries
- Context: Biometric and sensitive academic records require protection, but encryption boundaries are not implemented or approved.
- Options considered: database-level encryption; application-level encryption; external encrypted object storage; no special encryption beyond database controls.
- Current recommendation: Phase 2/5 security design should define encryption boundaries for secrets, tokens, facial data, and sensitive records.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-018, IAS-A-002, AUD-019, ERD-013
- Expected future phase: Phase 2 and Phase 5
- Repository or source evidence: `docs/frontend.md`; no repository encryption implementation found.

### DEC-019

- Topic: Haar Cascade and LBPH integration boundaries
- Context: Haar Cascade and LBPH are Owner-provided requirements, but repository evidence only shows a frontend CCTV/face enrollment simulator.
- Options considered: implement inside PHP; use a Python computer-vision service; use browser-side processing; defer.
- Current recommendation: Phase 5 should define a Python/service boundary if Haar Cascade and LBPH remain required.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-016, CAP-SAD-017, CAP-SAD-021, ERD-012, ERD-013
- Expected future phase: Phase 5
- Repository or source evidence: `frontend/src/pages/secretary/CCTVFeed.tsx`, `docs/frontend-documentation.md`; no Haar/LBPH implementation found.

### DEC-020

- Topic: Python service boundary
- Context: The repo backend baseline is plain PHP, while computer vision and Random Forest may require Python boundaries later.
- Options considered: keep all backend work in PHP; add a separate Python service; run offline scripts only.
- Current recommendation: defer service-boundary approval until Phase 5/6 and avoid adding Python code or dependencies in Phase 0.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-014, CAP-SAD-016, CAP-SAD-017
- Expected future phase: Phase 5 and Phase 6
- Repository or source evidence: `AGENTS.md`, `docs/architecture.md`, `docs/frontend.md`

### DEC-021

- Topic: Random Forest model and prediction-history storage
- Context: Random Forest is documented and prototyped as a simulator; no model, training data, or prediction persistence exists.
- Options considered: real-time prediction service; batch prediction; stored prediction snapshots; frontend-only estimates.
- Current recommendation: Phase 6 should define model ownership, feature inputs, validation metrics, prediction history, and reporting evidence after data history exists.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-014
- Expected future phase: Phase 6
- Repository or source evidence: `docs/features.md`, `frontend/src/pages/faculty/RetentionMonitoring.tsx`

### DEC-022

- Topic: Report generation boundaries
- Context: Reports are printable frontend summaries; future docs mention PDF/CSV/Excel export and email.
- Options considered: browser print only; backend PDF generation; CSV/Excel export; email delivery.
- Current recommendation: Phase 4 should define official report boundaries and evidence artifacts before implementation.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-007, CAP-SAD-023, CAP-SAD-024
- Expected future phase: Phase 4
- Repository or source evidence: `docs/features.md`, `docs/frontend.md`, frontend report pages

### DEC-023

- Topic: Network ACL deployment assumptions
- Context: IAS Module C requires ACL rules, wildcard-mask calculations, and backend network restrictions; current repo is local Docker/XAMPP focused.
- Options considered: document local-only development assumptions; define production ACLs now; wait for deployment topology.
- Current recommendation: defer ACL details until a deployment topology is approved; Phase 0 records the requirement only.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: IAS-C-007, IAS-C-008, IAS-C-009, IAS-C-011, AUD-016, AUD-017
- Expected future phase: Phase 7
- Repository or source evidence: `docs/local-development.md`, `docs/architecture.md`

### DEC-024

- Topic: API rate limiting and endpoint security-control table
- Context: Rate limiting is documented as a future requirement, but only a health endpoint exists.
- Options considered: define controls before API surface; define controls per endpoint as APIs are approved; defer all controls.
- Current recommendation: Phase 2 should create endpoint security controls for auth endpoints first, then update the table as later APIs are approved.
- Status: Open
- Owner decision required: Yes.
- Related requirement IDs: IAS-C-001, IAS-C-009, AUD-016, AUD-017
- Expected future phase: Phase 2 onward
- Repository or source evidence: `backend/routes/api.php`, `docs/frontend.md`

### DEC-025

- Topic: Parameterized-query policy
- Context: The PHP backend uses PDO for database connectivity, but no business queries exist.
- Options considered: require prepared statements for all dynamic SQL; allow raw SQL for static health checks; use a query helper.
- Current recommendation: require parameterized/prepared statements for all future dynamic database access and document exceptions before implementation.
- Status: Proposed
- Owner decision required: No approval is needed to decide whether parameterized queries are required; that requirement is mandatory. Owner approval is needed only for the implementation pattern, helper conventions, review process, and narrowly documented exceptions for genuinely static SQL.
- Related requirement IDs: IAS-C-006
- Expected future phase: Phase 2 onward
- Repository or source evidence: `backend/app/database.php`, `backend/controllers/HealthController.php`

### DEC-026

- Topic: Input-validation and sanitization policy
- Context: Some frontend validation exists, while server-side validation and sanitization are explicitly future work.
- Options considered: validate only at UI; validate in backend controllers; centralize request validation and output encoding rules.
- Current recommendation: backend must own validation and sanitization policy; frontend validation remains a usability layer.
- Status: Proposed
- Owner decision required: Yes.
- Related requirement IDs: CAP-SAD-004, IAS-C-004, IAS-C-005, IAS-C-010, AUD-019
- Expected future phase: Phase 2 onward
- Repository or source evidence: `docs/frontend.md`, `frontend/src/pages/secretary/ManualAttendanceOverride.tsx`, `docs/architecture.md`
