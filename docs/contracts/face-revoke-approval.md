# Face revocation approval, blocked mismatch updates, and repeat-revoke flagging (backlog 12.9): v2, agreed in /grill-me 2026-11-22

Status: **AGREED** in `/grill-me` (2026-11-22); `spec.md` amendments approved by Owner and applied.

## 1. Owner rulings (2026-11-22)

1. **Superadmin approves Student revocations before deletion:** A Student cannot delete/revoke their enrolled face immediately. Submitting a revoke request requires an 8–240 character reason (reusing the standard reason validation). While pending, the Student's existing face remains active and usable for attendance check-in, and the Student may cancel the pending request. Once the Superadmin approves, DentiSys physically deletes the encrypted `.sface` reference (embodying the right to delete, as today) and marks the profile revoked (`consent_status = 'declined'`, `enrollment_status = 'revoked'`).
2. **Consent-withdrawal API aligned (backlog 12.10, approved 2026-11-23):** `PUT /api/student/biometric/consent` (`granted: false`) never calls the sidecar to delete `.sface`. After running `student_biometric_expire_if_needed()`, it refuses active enrollments (or any non-null `protected_object_reference`) with `409 revocation_approval_required` and in-flight enrollments (`enrolling`, non-stale) with `409 biometric_enrollment_in_progress`. Pre-enrollment refusal (`no row`, `not_enrolled`, `expired`, `revoked`) remains allowed (`200 OK`), sets `consent_status = 'declined'`, preserves `enrollment_status` (`not_enrolled`/`expired`/`revoked`), and audits `biometric_consent_revoked` only if changed. Optional future Student UI for pausing consent while keeping `.sface` locked is tracked in backlog `12.11`.
3. **Legacy `DELETE /api/student/biometrics` blocked:** Returns `409 revocation_approval_required` so direct calls cannot bypass the approval queue.
4. **Update my face:**
   - If a revoke request is pending, clicking **Update my face** prompts the Student that updating their face will cancel the pending revocation request. Confirming immediately cancels the pending request before capture starts.
   - Matching updates (`matchesPrevious === true`) succeed and replace the old `.sface` as today.
   - Non-matching updates (`matchesPrevious === false`) are **blocked**: the newly created `.sface` is immediately deleted in the sidecar, the existing active face stays untouched, a blocked-mismatch flag (**F2**) is raised/refreshed for the Superadmin, the challenge is marked failed, and the Student sees `"Your face could not be matched to your current registration. If this is you, please request a revocation instead."` (no similarity score).
5. **Flags (`F1`, `F2`, `F3`):**
   - **F1** (re-enrolled within 30 days after self-withdrawal) is retired for new events; historical `F1` rows stay readable.
   - **F2** (blocked mismatch update): auto-closed as `revoked` when Superadmin approves a Student's revocation request (or directly revokes).
   - **F3** (repeated revocations): fires on the **3rd approved Student-initiated revocation request in the same term** (`>= 3`), ignoring Superadmin direct revokes, rejections, and cancellations. If an earlier `F3` was dismissed, a 4th+ approved revocation in the same term raises a new open `F3` flag (if one is already open, it refreshes with the updated count and date).
6. **Superadmin Reject / Approve & notifications:**
   - **Reject** requires an 8–240 character Superadmin reason; sends an in-app notification only (no email); Face Registration displays the rejection reason banner; Student may submit a new revoke request immediately.
   - **Approve** has an optional note (if non-empty, 8–240 characters); sends an in-app notification only (no email) confirming deletion.
7. **External lifecycle cleanup:** When a Student's face expires at term end, the Student becomes inactive, or Superadmin directly revokes from People & Accounts, any `pending` revoke request is auto-closed as `cancelled` (not counted toward `F3`).
8. **Unified Superadmin Face Enrolments page & Overview:**
   - Sidebar item renamed to **Face Enrolments** (`short: 'Faces'`) at `/superadmin/face-enrolments` (with `/superadmin/face-flags` redirecting to `/superadmin/face-enrolments`).
   - Top `<Tabs variant="section">`: **Revoke Requests** (default tab, pending badge) and **Flags** (open badge).
   - Overview keeps the 4-tile grid with **Face Enrolments** (`value: pending + openFlags`, `sub: "X pending · Y flags"`), plus a **Needs Attention** row whenever `pending > 0` linking to `/superadmin/face-enrolments`.

## 2. Database schema (`database/migrations/072_face_revoke_requests.sql`)

Additive migration:

1. Expand `face_enrolment_flags.kind` check constraint from `('F1', 'F2')` to `('F1', 'F2', 'F3')`.
2. Create `face_revoke_requests`:
   - `request_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
   - `student_id INTEGER NOT NULL REFERENCES students (student_id)`
   - `term_id INTEGER REFERENCES academic_terms (term_id)`
   - `school_year TEXT NOT NULL`
   - `semester TEXT NOT NULL`
   - `reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 8 AND 240)`
   - `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))`
   - `requested_by_user_id INTEGER NOT NULL REFERENCES user_accounts (user_id)`
   - `reviewed_by_user_id INTEGER REFERENCES user_accounts (user_id)`
   - `review_note TEXT`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `reviewed_at TIMESTAMPTZ`
   - `cancelled_at TIMESTAMPTZ`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - Partial unique index: `CREATE UNIQUE INDEX face_revoke_requests_one_pending_idx ON face_revoke_requests (student_id) WHERE status = 'pending';`
   - Term count index: `CREATE INDEX face_revoke_requests_term_approved_idx ON face_revoke_requests (student_id, school_year, semester) WHERE status = 'approved';`

## 3. API contract

### Student / Secretary self-service (`student_biometric_authenticate` + `student_biometric_identity`)

| Method & Path | Request | Response / Behaviour |
|---|---|---|
| `GET /api/student/biometrics` | — | Existing profile payload plus `pendingRevokeRequest`: `null` or `{ requestId, reason, status: 'pending', createdAt }`, and `latestRejectedRevokeRequest`: `null` or `{ requestId, reason, reviewNote, reviewedAt }` (only when the Student's most recent revoke request since enrollment is `rejected` and there is no `pending` request). |
| `POST /api/student/biometrics/revoke-request` | `{ reason }` (8–240 chars trimmed) | Requires `enrollment_status === 'active'` (`409 no_active_enrollment`) and no existing pending request (`409 revoke_request_pending`). Resolves term from active profile/term dates (fallback to current school year + active class semester if needed), inserts `pending` row, writes audit `biometric_revoke_requested`, returns `201 { status: 'ok', request, biometric }`. Existing `.sface` stays active. |
| `DELETE /api/student/biometrics/revoke-request` | — | Cancels the Student's `pending` request (`404 no_pending_revoke_request` if none). Sets `status = 'cancelled'`, `cancelled_at = now()`, writes audit `biometric_revoke_request_cancelled`, returns `200 { status: 'ok', biometric }`. |
| `DELETE /api/student/biometrics` | — | Returns `409 revocation_approval_required`: `"Face revocation requires Superadmin approval. Submit a revocation request with a reason."` |
| `PUT /api/student/biometric/consent` | `{ granted, disclosureVersion }` | `granted: true` unchanged. `granted: false` never deletes `.sface`: runs `student_biometric_expire_if_needed()` first, returns `409 biometric_enrollment_in_progress` if fresh `enrolling` (recovers stale `enrolling`), returns `409 revocation_approval_required` if `active` or `protected_object_reference !== null`, and otherwise sets `consent_status = 'declined'` (`200 OK`, preserving `not_enrolled`/`expired`/`revoked`, auditing `biometric_consent_revoked` only on change). |
| `POST /api/student/biometrics/enrollment` | Existing multipart form | When replacing an active face (`previous.protected_object_reference !== null`) and sidecar returns `matchesPrevious === false`: **do not** update `biometric_profiles`; delete the newly created `.sface` via sidecar `/v1/reference/revoke`; restore `enrollment_status = 'active'` with previous reference untouched; raise/refresh `F2` (`{ attemptedAt }`); fail challenge; write `biometric_enrollment_failed` (`face_update_mismatch`); return `409 face_update_mismatch` with `"Your face could not be matched to your current registration. If this is you, please request a revocation instead."` |

### Superadmin (`superadmin_verify_auth`)

| Method & Path | Request | Response / Behaviour |
|---|---|---|
| `GET /api/admin/face-revoke-requests` | `?status=pending\|approved\|rejected\|cancelled\|all&q=&courseId=&classId=&page=` | Returns `{ requests[], total, page, pageSize, pendingCount }`. Item: `{ requestId, status, reason, reviewNote, schoolYear, semester, createdAt, reviewedAt, cancelledAt, reviewedBy: { name } \| null, student: { studentId, userId, name, studentNo }, classes[], approvedThisTermCount }`. |
| `POST /api/admin/face-revoke-requests/approve` | `{ requestId, note? }` (`note` optional; if non-empty, 8–240 chars trimmed) | Locks request (`FOR UPDATE`) and profile. Must be `pending` (`409 request_not_pending`). Physically deletes `.sface` via sidecar `/v1/reference/revoke`, sets `enrollment_status = 'revoked'`, `consent_status = 'declined'`, nulls DB references, marks request `approved` with `reviewed_by_user_id`, `review_note`, `reviewed_at`. Writes audit `biometric_revoke_request_approved`. Auto-closes existing open flags as `revoked`. Counts approved Student revoke requests for `(student_id, school_year, semester)`; if `>= 3`, raises/refreshes **`F3`** (`{ approvedCount, schoolYear, semester, latestApprovedAt }`). Sends in-app notification (`biometric_enrollment`) to Student. Returns `200 { status: 'ok', request, flagged }`. |
| `POST /api/admin/face-revoke-requests/reject` | `{ requestId, note }` (required 8–240 chars trimmed) | Locks request (`FOR UPDATE`). Must be `pending` (`409 request_not_pending`). Marks `rejected`, stores `review_note`, `reviewed_by_user_id`, `reviewed_at`. Existing `.sface` stays active. Writes audit `biometric_revoke_request_rejected`. Sends in-app notification (`biometric_enrollment`) to Student including the Superadmin's reason. Returns `200 { status: 'ok', request }`. |
| `GET /api/admin/face-flags` | `?status=open\|dismissed\|revoked\|all&kind=F1\|F2\|F3&q=&courseId=&classId=&page=` | Extended to accept `F3` and return `openCount` alongside `flags`, `total`, `page`, `pageSize`. |
| `GET /api/admin/overview` | — | Adds `faceRevokeRequestsPending` (and `attention.faceRevokeRequestsPending`) alongside existing `faceFlagsOpen`. |

## 4. Audit events (`backend/app/audit_catalogue.php`, area `Biometrics`, Superadmin-visible)

- `biometric_revoke_requested` — Student requested face revocation (reason recorded).
- `biometric_revoke_request_cancelled` — Student or system cancelled pending face revocation request.
- `biometric_revoke_request_approved` — Superadmin approved face revocation request and deleted biometric template.
- `biometric_revoke_request_rejected` — Superadmin rejected face revocation request (review note recorded).
- `face_flag_raised` — `F2` (blocked mismatch attempt) and `F3` (3+ approved Student revokes in a term).

No images, embeddings, or similarity scores ever enter audit rows or `detail` JSON (`BIO-009`).

## 5. UI parts (`docs/frontend.md` "Page patterns")

- **Student `FaceRegistration.tsx`:**
  - Registered view replaces direct "Revoke registration" with **Request revocation** (`components/Modal.tsx` with `Reason (at least 8 characters)`, 8–240 char validation before submit, matching `9.25`).
  - Pending banner (when `pendingRevokeRequest` exists): shows submitted reason, submission date, `"Your face registration stays active for attendance check-in until the Superadmin approves this request."`, and **Cancel request** button (with confirmation). "Request revocation" is hidden while pending.
  - Clicking **Update my face** while pending opens a confirmation `Modal` stating that updating will cancel the pending revocation request; confirming calls `DELETE /api/student/biometrics/revoke-request` and proceeds to Step 2 capture.
  - Rejection banner (when `latestRejectedRevokeRequest` exists): shows the Superadmin's rejection reason and lets the Student submit a new request right away.
  - `409 face_update_mismatch`: shows the server message (`"Your face could not be matched to your current registration. If this is you, please request a revocation instead."`) without clearing active registration state.
  - Consent disclosure (Step 1) updated to state that revocation requests are reviewed by the Superadmin before deletion.
- **Superadmin `FaceEnrolments` (`pages/admin/FaceEnrolmentFlags.tsx` extended):**
  - Page wrapper: `space-y-6 animate-fade-in max-w-7xl mx-auto`
  - Top `<Tabs variant="section">`: **Revoke Requests** (default, pending count badge) and **Flags** (open count badge).
  - **Revoke Requests** tab: `ListToolbar` with search, Status select (`Pending` default / `Approved` / `Rejected` / `Cancelled` / `All`), Course, Class section, Clear filters; pinned desktop table + `< 768 px` phone cards; Row actions: **Approve & delete face** (modal with Student's reason + optional note 8–240 chars if filled), **Reject** (modal with required 8–240 char reason), **Open in People & Accounts**.
  - **Flags** tab: existing table/phone cards/filters extended with `F2` ("Blocked mismatched face update") and `F3` ("Repeated approved revocations").
  - `SuperadminOverview.tsx`: 4th tile becomes **Face Enrolments** (`value: pending + openFlags`, `sub: "${pending} pending · ${openFlags} flags"`, `to: '/superadmin/face-enrolments'`) plus a **Needs Attention** row when `pending > 0`.
  - `Layout.tsx` + `App.tsx`: sidebar label **Face Enrolments** (`short: 'Faces'`), route `/superadmin/face-enrolments`, redirect `/superadmin/face-flags` → `/superadmin/face-enrolments`, breadcrumbs updated.

## 6. Applied `spec.md` changes (Owner-approved 2026-11-22 & 2026-11-23)

- **BIO-002**, **BIO-005**, **BIO-009**, and **ADM-001** updated for `12.9` (2026-11-22) and **BIO-002** updated for `12.10` (2026-11-23) to prohibit direct consent-API deletion for enrolled Students while keeping pre-enrollment refusal intact.
