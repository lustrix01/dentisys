# IAS Module C: API and Perimeter Defense

## Endpoint-by-Endpoint Security Control Table

All endpoints are **proposed and currently unimplemented** — documented as the intended security contract.

| Endpoint | Method | Auth | Permission | Scope | Input Allowlist | Param Query | Audit Event | Rate Limit | OWASP 2025 |
|---|---|---|---|---|---|---|---|---|---|
| /api/auth/register | POST | None | N/A | N/A | Email BU domain; name alpha+spaces; password 8+ chars | Yes | registration_submitted | 3/min/IP | A07:2025 |
| /api/auth/login | POST | None | N/A | N/A | Email BU domain; password printable ASCII | Yes | login_success, login_failure | 5/min/IP | A07:2025 |
| /api/auth/mfa/enroll | POST | Session | mfa.write | own | TOTP code digits | Yes | mfa_enrollment | 10/min/user | A07:2025 |
| /api/auth/mfa/verify | POST | Session | mfa.write | own | TOTP code digits | Yes | mfa_verification | 10/min/user | A07:2025 |
| /api/auth/mfa/recovery | POST | None | N/A | N/A | Recovery code alphanumeric | Yes | mfa_recovery | 5/min/scope | A07:2025 |
| /api/auth/refresh | POST | Refresh token | N/A | self | Refresh token | Yes | token_refreshed, token_reuse_detected | 20/min/user | A07:2025, API2:2023 |
| /api/auth/logout | POST | Session | N/A | self | N/A | Yes | session_logged_out | 20/min/user | A07:2025 |
| /api/auth/forgot-password | POST | None | N/A | N/A | Email BU domain | Yes | password_reset_requested | 3/min/IP | A07:2025 |
| /api/auth/reset-password | POST | Reset token | N/A | N/A | Token + password | Yes | password_reset_completed | 5/min/IP | A07:2025 |
| /api/admin/faculty/approve | POST | Session | account.approve | system_wide | user_id numeric | Yes | faculty_approved | 20/min/user | A01:2025, API5:2023 |
| /api/admin/faculty/reject | POST | Session | account.reject | system_wide | user_id numeric; reason text | Yes | faculty_rejected | 20/min/user | A01:2025, API5:2023 |
| /api/faculty/secretary/invite | POST | Session | invitation.create | assigned_class | student_id numeric; email BU domain | Yes | invitation_created | 20/min/user | A01:2025, API1:2023 |
| /api/faculty/secretary/invite/:id/revoke | POST | Session | invitation.revoke | assigned_class | invitation_id numeric | Yes | invitation_revoked | 20/min/user | A01:2025 |
| /api/secretary/activate | POST | None | N/A | N/A | Token + password | Yes | secretary_activated | 5/min/scope | A07:2025 |
| /api/students | GET/POST | Session | student.read/create | assigned_class | Query pagination; body schema | Yes | student_read/created | 100(GET)/50(POST)/min | A01:2025, API1:2023 |
| /api/students/:id | GET/PUT/DELETE | Session | student.* | assigned_class | ID numeric; body schema | Yes | student_read/updated/deleted | 50/min | A01:2025, API1:2023 |
| /api/courses | GET | Session | course.read | aggregate | Query pagination | Yes | course_read | 100/min | A01:2025 |
| /api/academic-terms | GET | Session | academic_term.read | aggregate | Query pagination | Yes | term_read | 100/min | A01:2025 |
| /api/class-sections | GET | Session | class_section.read | assigned_class | Query pagination | Yes | class_section_read | 100/min | A01:2025, API1:2023 |
| /api/enrollments | GET/POST | Session | enrollment.read/write | assigned_class | Body schema | Yes | enrollment_read/created | 50/min | A01:2025, API1:2023 |
| /api/assessments | GET/POST | Session | assessment.read/create | assigned_course | Body schema | Yes | assessment_read/created | 100/50/min | A01:2025, API1:2023 |
| /api/assessments/:id | PUT/DELETE | Session | assessment.update/delete | assigned_course | Body schema; ID numeric | Yes | assessment_updated/deleted | 50/min | A01:2025, API1:2023 |
| /api/assessments/:id/scores | POST | Session | assessment_score.write | assigned_course | [{student_id,score}]; score numeric | Yes | scores_entered | 200/min | A01:2025, A08:2025 |
| /api/grades/term | GET/PUT | Session | term_grade.read/write | assigned_course | Body grade, remarks | Yes | grades_read/finalized | 100/50/min | A01:2025 |
| /api/attendance/sessions | GET/POST | Session | attendance_session.read/create | assigned_class | Body schema | Yes | session_read/created | 100/min | A01:2025, API1:2023 |
| /api/attendance/records | GET | Session | attendance_record.read | assigned_class | Query date, class | Yes | records_read | 100/min | A01:2025 |
| /api/attendance/records/:id/override | POST | Session | attendance_override.create | assigned_class | Status enum; reason 8-240 chars | Yes | attendance_overridden | 30/min | A01:2025 |
| /api/retention/policies | GET/PUT | Session | retention_policy.read/write | aggregate/system_wide | Body policy schema | Yes | policy_read/updated | 20/min | A01:2025 |
| /api/retention/cases | GET | Session | retention_case.read | assigned_class | Query | Yes | cases_read | 100/min | A01:2025 |
| /api/remedial/attempts | GET/POST | Session | remedial_attempt.read/create | assigned_class | Body attempt schema | Yes | remedial_read/created | 50/min | A01:2025 |
| /api/remedial/attempts/:id | PUT | Session | remedial_attempt.update | assigned_class | Body score/grade, result | Yes | remedial_scored | 50/min | A01:2025 |
| /api/biometric/consent | GET/POST | Session | biometric_consent.read/write | assigned_class | Body status | Yes | consent_read/updated | 50/min | A01:2025 |
| /api/biometric/images | GET/POST | Session | student_image.read/write | assigned_class | File type/size | Yes | image_read/uploaded | 20/min | A04:2025, A01:2025 |
| /api/biometric/templates | GET | Session | facial_template.metadata | assigned_class | ID numeric | Yes | template_metadata_read | 20/min | A04:2025 |
| /api/cctv/events | GET | Session | cctv.read | assigned_class | Query date | Yes | cctv_events_read | 50/min | A01:2025 |
| /api/email/send | POST | Session | email.send | assigned_class | Recipients, type, message | Yes | email_sent | 20/min | A01:2025 |
| /api/reports/:type | GET | Session | report.read | assigned_scope | Query filters | Yes | report_generated | 30/min | A01:2025 |
| /api/audit | GET | Session | audit.read | own/system_wide | Query filters | Yes | N/A (self-ref) | 50/min | A01:2025 |
| /api/audit/export | GET | Session | audit.export | system_wide | Query filters | Yes | audit_exported | 10/min | A01:2025 |
| /api/devices | GET | Session | device.read | aggregate | Query | Yes | devices_read | 50/min | A01:2025 |
| /api/sessions | GET | Session | session.read | own/system_wide | Query | Yes | sessions_read | 50/min | A01:2025 |
| /api/sessions/:id/logout | POST | Session | session.force_logout | own/system_wide | ID uuid | Yes | session_forced_logout | 20/min | A01:2025 |
| /api/profile | GET/PUT | Session | profile.read/update | own | Body schema | Yes | profile_read/updated | 50/min | A01:2025 |

## Extended ACL Rule Table (Host-Specific, Documentation-Only)

| Rule | Source | Src Mask | Wildcard (255.255.255.255 - mask) | Dest Host | Proto | Port | Action | Reason |
|------|--------|----------|-----------------------------------|-----------|-------|------|--------|--------|
| ACL-01 | 0.0.0.0/0 | 0.0.0.0 | 255.255.255.255 | proxy-01 172.16.0.10 | TCP | 443 | ALLOW | Clients → HTTPS only |
| ACL-02 | proxy-01 172.16.0.10/32 | 255.255.255.255 | 0.0.0.0 | api-01 10.100.0.10 | TCP | 80 | ALLOW | Proxy → Backend |
| ACL-03 | api-01 10.100.0.10/32 | 255.255.255.255 | 0.0.0.0 | db-01 10.200.0.10 | TCP | 3306 | ALLOW | Backend → DB |
| ACL-04 | cctv-01 10.10.0.10/32 | 255.255.255.255 | 0.0.0.0 | proxy-01 172.16.0.10 | TCP | 443 | ALLOW | CCTV → API |
| ACL-05 | mgmt 10.255.0.0/24 | 255.255.255.0 | 0.0.0.255 | all | TCP | 22 | ALLOW | Management SSH |
| ACL-06 | 0.0.0.0/0 | 0.0.0.0 | 255.255.255.255 | api-01 10.100.0.10 | any | any | DENY | Block direct client→backend |
| ACL-07 | 0.0.0.0/0 | 0.0.0.0 | 255.255.255.255 | db-01 10.200.0.10 | any | any | DENY | Block client→DB |
| ACL-08 | 0.0.0.0/0 | 0.0.0.0 | 255.255.255.255 | any | any | any | DENY+LOG | Default deny |

Wildcard arithmetic example (ACL-05): `255.255.255.255 − 255.255.255.0 = 0.0.0.255`.
All IP addresses are documentation-only examples. ACL implementation is future network-configuration work.

## OWASP Design Rationale

The database schema and endpoint security design address multiple OWASP Top 10:2025 categories simultaneously. Parameterized queries via PDO prepared statements eliminate injection vectors (A05:2025 Injection). Object-level authorization on every endpoint — where Faculty and Secretary users may only access records within their assigned class or course scope, enforced through `scope_type` on `role_permission` joined with `secretary_assignment` or `course_component` — provides defense against Broken Access Control (A01:2025) and Broken Object Level Authorization (API1:2023) that cannot be bypassed by frontend route guards alone. Input validation through strict allowlisting guards against Insecure Design vulnerabilities (A06:2025). Rate limiting on authentication endpoints mitigates brute-force credential attacks (A07:2025 Authentication Failures, API4:2023 Unrestricted Resource Consumption). The tamper-evident audit chain using HMAC-SHA256 with a per-module partitioned event MAC ensures that audit log manipulation is detectable — addressing Security Logging and Alerting Failures (A09:2025). Encrypted TOTP secret storage (AES-256-GCM) and bcrypt recovery-code/password storage address Cryptographic Failures (A04:2025) by ensuring a database breach reveals no plaintext authenticators. Together, these controls form a defense-in-depth architecture protecting against the most prevalent application security risks while remaining implementable in the current plain-PHP/MariaDB architecture. The endpoint control table and ACL rules are documentation-phase artifacts; their implementation as backend middleware and network firewall rules is future work.
