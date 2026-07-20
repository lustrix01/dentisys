# Security Data Dictionary — Phase 1C Additions

## access_role
| Column | Type | Constraints |
|--------|------|-------------|
| role_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| role_name | VARCHAR(50) | UNIQUE, NOT NULL |
| description | VARCHAR(255) | NULL |

## permission
| Column | Type | Constraints |
|--------|------|-------------|
| perm_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| perm_code | VARCHAR(100) | UNIQUE, NOT NULL |
| resource | VARCHAR(100) | NOT NULL, descriptive |
| action | VARCHAR(50) | NOT NULL, descriptive |
| description | VARCHAR(255) | NULL |

## role_permission
| Column | Type | Constraints |
|--------|------|-------------|
| rp_id | INT UNSIGNED | PK, AUTO_INCREMENT |
| role_id | INT UNSIGNED | FK→access_role RESTRICT |
| perm_id | INT UNSIGNED | FK→permission RESTRICT |
| scope_type | VARCHAR(30) | NOT NULL, CHECK IN ('own','assigned_class','assigned_course','aggregate','system_wide') |
| | | UNIQUE (role_id, perm_id, scope_type) |

## faculty_approval
Immutability: UPDATE rejected when status IN ('Approved','Rejected'). DELETE rejected always.
Active-pending key: generated column permits one Pending row per applicant.

## secretary_invitation
Token digest: BINARY(32) HMAC-SHA-256 UNIQUE.
Active-pending key: generated column (student_id:cs_id) when status='Pending'.
Validation trigger: accepted_sua_id student must match invitation.student_id.

## secretary_assignment
Active key: generated column (sua_id:cs_id) when status='Active'.
sua_id FK enforces identity chain through student_user_account.

## mfa_credential
ciphertext: VARBINARY(255) AES-256-GCM encrypted TOTP secret.
nonce: VARBINARY(16) AES-GCM initialization vector.
auth_tag: VARBINARY(16) AES-GCM authentication tag.
Active key: generated column (user_id) when status IN ('pending','enabled').
Encryption key from env MFA_ENCRYPTION_KEY.

## mfa_recovery_code
code_hash: VARCHAR(255) bcrypt output. No uniqueness (salted hashes).
consumed: TINYINT(1) CHECK IN (0,1).

## auth_session
device_id: FK→device RESTRICT.
last_seen_at: DATETIME(6) NULL, updated on activity.

## refresh_token
token_digest: BINARY(32) HMAC-SHA-256 UNIQUE.
parent_rt_id: self-FK UNIQUE (prevents branching).
reuse_detected_at: DATETIME(6) NULL (timestamped, not Boolean).

## access_token_revocation
jti_digest: BINARY(32) HMAC-SHA-256 UNIQUE.
session_id: FK→auth_session RESTRICT.

## password_reset_token
token_digest: BINARY(32) HMAC-SHA-256 UNIQUE.

## auth_throttle
scope_hash: BINARY(32) HMAC-SHA-256 keyed digest. Never stores raw identifier.
UNIQUE (scope_hash, endpoint_code).

## audit_chain
chain_code: VARCHAR(100) UNIQUE.
current_event_mac: BINARY(32) MAC of most recent event.

## audit_event
Immutability: UPDATE and DELETE rejected by triggers.
All FKs RESTRICT. Actor/session/device snapshots preserved.
previous_event_mac: BINARY(32) NOT NULL.
event_mac: BINARY(32) NOT NULL.
operation_uuid: CHAR(36) NULL, INDEXED, NOT UNIQUE.
Genesis MAC: 32 zero bytes.
Canonical: JSON, fixed key order, UTF-8, explicit null.

## email_delivery
Immutability: UPDATE rejected when status IN ('Sent','Failed'). DELETE rejected always.

## All token digests
Format: BINARY(32) raw HMAC-SHA-256 output.
Consistent across: secretary_invitation.token_digest, refresh_token.token_digest, password_reset_token.token_digest, access_token_revocation.jti_digest, auth_throttle.scope_hash.
