# IAS Module C: API and Perimeter Defense

> Implementation update: this remains a security design reference. Current Docker development uses PostgreSQL 18 and exposes no database port to the host.

## Endpoint-by-Endpoint Security Control Table (Design Reference)

All endpoints are proposed and currently unimplemented — documented as the intended security contract for later stages.

| Endpoint | Method | Auth | Permission | Scope | Rate Limit | Audit Event |
|---|---|---|---|---|---|---|
| /api/health | GET | None | N/A | N/A | None | None |
| /api/auth/login | POST | None | N/A | N/A | 5/15min/IP | login_success, login_failure |
| /api/auth/register | POST | None | N/A | N/A | 3/60min/IP | registration_submitted |
| /api/auth/mfa/enroll/start | POST | enrollment_token | N/A | own | 10/5min/user | mfa_enrollment_start |
| /api/auth/mfa/enroll/confirm | POST | enrollment_token | N/A | own | 10/5min/user | mfa_enrollment_confirm |
| /api/auth/mfa/verify | POST | mfa_session_token | N/A | own | 10/5min/user | mfa_verification |
| /api/auth/mfa/recover | POST | mfa_session_token | N/A | own | 5/15min/user | mfa_recovery |
| /api/auth/refresh | POST | Refresh cookie | N/A | own | 30/1min/session | token_refreshed, token_reuse |
| /api/auth/logout | POST | Access token | N/A | own | 20/1min/user | session_logged_out |
| /api/auth/me | GET | Access token | N/A | own | 30/1min/user | (not audited) |
| /api/auth/password/reset-request | POST | None | N/A | N/A | 3/15min/IP | password_reset_requested |
| /api/auth/password/reset-confirm | POST | Reset token | N/A | N/A | 5/15min/IP | password_reset_completed |
| /api/admin/faculty-approvals | GET | Access token | user_accounts.read | system_wide | 50/1min/user | faculty_approval_read |
| /api/admin/faculty-approvals/{id}/approve | POST | Access token | user_accounts.update_status | system_wide | 20/1min/user | faculty_approved |
| /api/admin/faculty-approvals/{id}/reject | POST | Access token | user_accounts.update_status | system_wide | 20/1min/user | faculty_rejected |
| /api/students | GET/POST | Access token | students.read/create | assigned_class | 100/50/min | student_read/created |
| /api/students/{id} | GET/PATCH | Access token | students.read/update | assigned_class | 50/min | student_read/updated |
| /api/courses | GET | Access token | courses.read | assigned_course | 100/min | course_read |
| /api/class-sections | GET | Access token | class_sections.read | assigned_class | 100/min | section_read |
| /api/enrollments | GET/POST | Access token | enrollments.read/create | assigned_class | 50/min | enrollment_read/created |
| /api/enrollments/{id}/archive | POST | Access token | enrollments.archive | assigned_class | 20/min | enrollment_archived |
| /api/assessments | GET/POST | Access token | assessments.read/create | assigned_course | 100/50/min | assessment_read/created |
| /api/assessments/{id} | PATCH/DELETE | Access token | assessments.update/archive | assigned_course | 50/min | assessment_updated/archived |
| /api/assessments/{id}/scores | GET/POST | Access token | assessment_scores.read/create | assigned_course | 50/min | scores_read/submitted |
| /api/attendance | GET | Access token | attendance.read_records | assigned_class | 100/min | attendance_read |
| /api/attendance/override | POST | Access token | attendance.override | assigned_class | 30/min | attendance_overridden |
| /api/biometrics/consent | GET/PATCH | Access token | biometric_consent.read/manage | assigned_class | 50/min | consent_read/updated |
| /api/biometrics/enroll/{student_id} | POST | Access token | facial_templates.enroll | assigned_class | 20/min | biometric_enrolled |
| /api/email | GET/POST | Access token | email.read/send | assigned_class | 50/20/min | email_read/sent |
| /api/reports/* | GET | Access token | reports.generate | assigned_class | 30/min | report_generated |
| /api/audit | GET | Access token | audit_trail.read_module | assigned_class | 50/min | (self-ref, not audited) |
| /api/settings | GET/PATCH | Access token | system_settings.read/update | system_wide | 20/min | settings_read/updated |
| /api/sessions | GET | Access token | sessions.read_any | system_wide | 50/min | sessions_read |
| /api/sessions/{uuid} | DELETE | Access token | sessions.revoke_any | system_wide | 20/min | session_forced_logout |
| /api/invitations | GET/POST | Access token | invitations.read/create | assigned_class | 30/min | invitation_created |
| /api/invitations/{id}/revoke | POST | Access token | invitations.revoke | assigned_class | 20/min | invitation_revoked |

## Input Validation and Parameterized Query Strategy

- All values bound via `$stmt->bindValue()` with `ATTR_EMULATE_PREPARES = false` (native PostgreSQL prepared statements).
- Dynamic sort columns and identifiers validated against hardcoded allowlists before string concatenation. Never bound as raw SQL syntax.
- Input strings: trim, strip control characters, validate length and format.
- Email: validate format and domain pattern.
- Enumerations: validate membership.
- Numeric IDs: validate type and range.
- Error responses: generic messages only; no stack traces or SQL in output.

## Extended ACL Rule Set

Design/documentation artifact only. No physical router changes are planned.

```
! =============================================================================
! DentiSys Network Segmentation — Cisco Extended ACL
! Design documentation only — intended for later network implementation.
! =============================================================================
!
! Network Zone Addresses:
!   FRONTEND (proxy): host 192.168.10.10
!   BACKEND (API):    host 192.168.20.20
!   DATABASE (PostgreSQL): host 192.168.30.10
!   ADMIN-VPN:        10.0.0.0 0.0.0.31       (/27)
!   CLINIC-DEVICES:   192.168.40.0 0.0.0.31    (/27)
!   SMTP-RELAY:       host 192.168.50.10
!   DNS-RESOLVER:     host 192.168.50.11
!
! ACL-01: Public HTTPS to frontend/reverse-proxy only.
permit tcp any host 192.168.10.10 eq 443
!
! ACL-02: Frontend host to backend API host.
permit tcp host 192.168.10.10 host 192.168.20.20 eq 8080
!
! ACL-03: Backend API host to PostgreSQL host on TCP 5432 only.
permit tcp host 192.168.20.20 host 192.168.30.10 eq 5432
!
! ACL-04: Admin VPN to frontend (SSH + HTTPS).
permit tcp 10.0.0.0 0.0.0.31 host 192.168.10.10 eq 22
permit tcp 10.0.0.0 0.0.0.31 host 192.168.10.10 eq 443
!
! ACL-05: Admin VPN to backend (SSH + API management).
permit tcp 10.0.0.0 0.0.0.31 host 192.168.20.20 eq 22
permit tcp 10.0.0.0 0.0.0.31 host 192.168.20.20 eq 8080
!
! ACL-06: Clinic devices subnet to approved backend API.
permit tcp 192.168.40.0 0.0.0.31 host 192.168.20.20 eq 8080
!
! ACL-07: Backend to SMTP relay.
permit tcp host 192.168.20.20 host 192.168.50.10 eq 587
!
! ACL-08: Backend to DNS resolver.
permit udp host 192.168.20.20 host 192.168.50.11 eq 53
!
! ACL-09: Explicit deny — no public access to backend.
deny ip any host 192.168.20.20 log
!
! ACL-10: Explicit deny — no public access to database.
deny ip any host 192.168.30.10 log
!
! ACL-11: Default deny all with logging.
deny ip any any log
!
! End of ACL
```

### ACL Notes

- Only the backend API host (`192.168.20.20`) may reach the PostgreSQL database host (`192.168.30.10:5432`).
- Admin VPN does NOT have direct PostgreSQL access. Admin VPN may reach approved frontend and backend SSH/management ports only.
- The broader database deny rule (ACL-10) covers any Admin-VPN-to-database access attempt.
- The final line is an explicit deny-all with logging.

## OWASP Design Rationale

Parameterized queries via PDO native prepares eliminate injection vectors (A05:2025). Backend-enforced RBAC with hardcoded allowlists prevents broken access control (A01:2025, API1:2023). Rate limiting on authentication endpoints mitigates credential brute-force attacks (A07:2025, API4:2023). The HMAC-chained audit trail makes tampering detectable (A09:2025). AES-256-GCM encrypted TOTP secrets and bcrypt/PASSWORD_DEFAULT hash storage prevent plaintext credential exposure (A04:2025). Together these controls form a defense-in-depth architecture implementable in the current plain-PHP/PostgreSQL architecture. The endpoint control table, ACL rules, and rate-limiter implementation are documented design artifacts; their concrete backend implementation is future work allocated to later approved stages.

## Rate-Limiting Design (Planned Future Implementation)

- **Two-tier**: Unauthenticated IP-based limiter (before auth), authenticated user/session-based limiter (after auth).
- **Storage**: Filesystem (`backend/storage/ratelimit/`). No Redis or additional dependencies.
- **Default**: Enabled. No permanent account lockout — window-based counters reset automatically.
- **Testability**: Injected clock callable for deterministic window testing. Isolated temporary storage directory for tests. No test-only reset endpoint.
- **Audit Bounds**: At most 1 rate-limit event per minute per scope per endpoint.
- **Challenge-token attempt limits**: Enforced by the filesystem rate limiter using the challenge JTI as part of the key. No database storage for challenge attempts.
