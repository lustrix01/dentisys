# Phase 1C Owner Approval Record

## Authority

Record of binding Phase 1C decisions approved by the Owner, effective 2026-07-20.

## Binding Decisions

| ID | Topic | Decision |
|----|-------|----------|
| P1C-001 | Academic term entity | Dedicated `academic_term` table |
| P1C-002 | Component type entity | Dedicated `component_type` table |
| P1C-003 | Grading categories | Exact 8 paper-defined categories from ERD 1 Course attributes |
| P1C-004 | Grading domains | `lecture` and `laboratory` |
| P1C-005 | Grade ordering | Higher numerical grade = worse (1.0 excellent, 5.0 fail) |
| P1C-006 | Initial remedial trigger | `final_grade >= 2.50` |
| P1C-007 | First remedial pass | `remedial_score >= 50%` |
| P1C-008 | Second remedial pass | `remedial_score >= 50%` |
| P1C-009 | Cost-recovery pass | `cost_recovery_grade <= 2.40` |
| P1C-010 | Retention policy | Versioned `retention_policy` + `retention_policy_version` |
| P1C-011 | Student-account link | `student_user_account` mapping entity |
| P1C-012 | Attendance overrides | Immutable `attendance_override` with triggers |
| P1C-013 | Biometric consent | Historical-row model with generated current key |
| P1C-014 | RBAC model | `access_role` + `permission` + `role_permission` with `scope_type` |
| P1C-015 | TOTP encryption | AES-256-GCM per credential |
| P1C-016 | Audit model | Partitioned `audit_chain` + `audit_event` with insert-time MAC |
| P1C-017 | Token digests | `BINARY(32)` HMAC-SHA-256 |
| P1C-018 | Settings model | `user_preference` (per-user); retention/grade weights via domain entities |
| P1C-019 | Login email | `user_account.login_email` authoritative; `username` deprecated |
| P1C-020 | Migration strategy | Additive 049-080; no edits to 001-048; deterministic backfills |
