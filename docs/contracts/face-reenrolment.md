# Face enrolment flags (backlog 12.2): v2, agreed in /grill-me 2026-11-15

Status: agreed with the Owner in `/grill-me` (2026-11-15); spec wording approved and applied.

## 1. Problem and Owner rulings

A Student withdraws their face and lets a blockmate enrol the blockmate's face on the Student's account, so the blockmate takes attendance for them.

- **Flag, never block.** DentiSys records facts and shows possible abuse to the Dean. Enrolment, withdrawal and attendance work as today. The Dean decides whether to act. Nothing extra is stored about anyone's face beyond their own.
- Withdrawing consent stays instant. No approval queue.
- No comparison with other Students' faces. No device tracking (a Student may borrow a phone).
- Faces carry over between terms.

## 2. What exists now

| Fact | Where |
|---|---|
| Student enrols, re-enrols (replaces the face) or withdraws consent (deletes it) on Face Registration. The Dean may revoke from People & Accounts. | `StudentBiometricController.php`, `pages/student/FaceRegistration.tsx`, BIO-002 |
| Every enrolment expires at the end of the term; `bin/expire-biometrics.php` deletes expired and inactive Students' references (run by `start-dev.sh` and `deploy-vps.sh`). | BIO-005, `reference_expires_on` |
| The sidecar compares a live face with one stored face (`/v1/verify`, SFace cosine ≥ 0.44). | `biometric-sidecar/app.py` |
| Audit already records consent granted/revoked, enrolment succeeded, re-enrolment and Dean revoke. | BIO-009, `audit_catalogue.php` |

## 3. Flags

| Flag | Fires when | Stored |
|---|---|---|
| **F1 Re-enrolled after withdrawing** | A successful enrolment within 30 days after the same Student withdrew consent (their face was deleted). A Dean revoke followed by enrolment raises no flag (Owner decision 2026-11-15). | Dates only (from existing biometric profile and audit rows) |
| **F2 New face does not match** | A re-enrolment replaces a working face and the new face does not match the old one. Compared once, at replacement, before the old face is deleted: the new template against the old template with the attendance threshold (cosine ≥ 0.44). | Matched yes/no. Never a score or a template |

Sidecar: `/v1/enrollment` takes an optional `previousReference`; when present it returns `matchesPrevious: true|false` after building the new template, and never a score. The backend passes the current reference when one exists.

A flag never blocks anything and the Student is never told. Each new event makes its own flag; an open flag of the same kind for the same Student is updated (latest dates) instead of duplicated.

## 3a. Update my face (Owner decision 2026-11-15)

Today the registered page says "To register again, revoke this registration first." and offers only Revoke. Change:

- Registered page: subtitle "No further action is needed." Buttons: **Update my face** (secondary, before Revoke registration), **Revoke registration**, **Go to Daily Attendance**.
- Update my face runs the existing enrolment capture (two liveness actions, 20–30 samples) without asking for consent again (consent stands). On success the new face replaces the old one at once, as re-enrolment does today, and the Student sees "Your face was updated."
- A matching update raises no flag. A non-matching update is still accepted and raises F2.
- The third tile "Semester Expiration / Expires seasonally" becomes **Validity**: "While you are an active Student" / "Kept until you revoke".
- Revoke stays for withdrawing consent; enrolling again within 30 days raises F1.

| Student does | Allowed | Flag |
|---|---|---|
| Update my face, matches | yes | none |
| Update my face, does not match | yes, new face works | F2 |
| Revoke, enrol again within 30 days | yes | F1 |
| Dean revoke, enrol again | yes | none |

## 4. Face Enrolment Flags page (Superadmin mode)

Sidebar item **Face Enrolment Flags** after People & Accounts, route `/superadmin/face-flags`. Copies the People & Accounts table, filters and phone cards.

- Columns: Student (name, Student number), Flag (F1 "Re-enrolled after withdrawing" / F2 "New face does not match"), Details ("Withdrew Oct 2, enrolled again Oct 5" / "Re-enrolled Oct 5"), Classes (this school year), Status (Open / Dismissed), Flagged (date).
- Filters: Open (default) / Dismissed / All; flag kind; search by name or Student number; course and class like People & Accounts.
- Row actions: **Dismiss** (note required, 8 to 240 characters), **Revoke face enrollment** (the existing dialog; closes the flag as "Revoked"), **Open in People & Accounts**.
- Empty state: "No face enrolment flags."
- Overview tile **Face enrolment flags** with the open count, opening this page.

Routes (Dean role, flat responses like People): `GET /api/admin/face-flags?status=open|dismissed|all&kind=F1|F2&q=&courseId=&classId=&page=` → `{flags[], total, page, pageSize}`; `POST /api/admin/face-flags/dismiss {flagId, note}` → `{flag}`. Revoke uses the existing `POST /api/admin/biometrics/revoke`, which also closes the Student's open flags.

## 5. Faces carry over between terms

Enrolments no longer expire at term end. `expire-biometrics.php` keeps deleting references of inactive Students and stops deleting by term. Face Registration's text "Biometric enrollment expires at the end of each semester…" and the consent disclosure change to "Your reference is kept while you are an active Student, until you withdraw consent or the Dean revokes it."

## 6. Data and audit

Migration `063_face_enrolment_flags.sql`: `face_enrolment_flags (flag_id, student_id, kind 'F1'|'F2', status 'open'|'dismissed'|'revoked', detail jsonb (dates only), created_at, updated_at, closed_by_user_id, closed_note)`.

Audit (area Biometrics, Dean-visible): `face_flag_raised` (actor System), `face_flag_dismissed` (Dean, note). Existing revoke rows unchanged.

## 7. Worked example

1. Oct 2: Student Juan withdraws consent; his face is deleted.
2. Oct 5: a new face is enrolled on Juan's account. Enrolment succeeds as today. F1 is raised: "Withdrew Oct 2, enrolled again Oct 5".
3. The Dean sees the Overview tile "Face enrolment flags 1", opens the page, calls Juan in, and either dismisses ("New phone, saw him in person") or revokes the face.
4. Another Student, Ana, re-enrols over her working face; the new face does not match. F2 is raised. Ana's new face works meanwhile.

## 8. Spec changes (exact text for approval)

- **BIO-005**: replace "An enrollment expires every semester. … A Student MUST re-enroll to continue biometric attendance after expiration." with "An enrollment stays valid while the Student is active, until the Student withdraws consent or the Dean revokes it." and remove "the enrollment expires at semester end" from the deletion list.
- **BIO-002** disclosure: "a protected reference is retained and expires every semester" becomes "a protected reference is retained while the Student is active".
- **BIO-009** add: "DentiSys flags possible face-enrolment abuse for the Dean without blocking: a re-enrollment within 30 days after the Student's own consent withdrawal, and a re-enrollment whose new face does not match the face it replaces (compared once, kept only as matched yes/no). The Dean may dismiss a flag with a note or revoke the enrollment."
- **ADM-001**: add the Face Enrolment Flags page and Overview tile.
