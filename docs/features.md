# Implemented Features

What DentiSys does today, checked against the code on `lighthal7` on 2026-10-07. Behaviour is defined by [spec.md](../spec.md); open and partial work is in the [product backlog](PRODUCT_BACKLOG.md).

- **implemented, tests passing**: the code exists and `scripts/check.ps1` and `scripts/check-postgres.ps1` ran tests covering it, and they passed.
- **implemented in code**: the code exists, but the gates do not run a test that proves it.

## Accounts and sign-in

- First Dean/Admin account created by a controlled bootstrap script — REG-010 — implemented, tests passing.
- Password sign-in with optional authenticator-app 2FA and recovery codes — AUTH-005, AUTH-006 — implemented, tests passing.
- Google Sign-In for existing accounts, linked only after password and 2FA confirmation, bound to a stable Google ID — AUTH-003, AUTH-010 — implemented, tests passing.
- Five-part structured names (Prefix, First, Middle, Last, Suffix) for every person and invitation, with Unicode-aware validation — ID-002 — implemented, tests passing.
- One canonical name source; a name change shows everywhere without rewriting business tables — ID-002 — implemented, tests passing.

## Invitations and roles

- Faculty invitations with structured names and institutional email checked against the server's allowed domains while typing — REG-005, UI-004, AUTH-004 — implemented, tests passing.
- Pending Faculty invitations can be edited, revoked and reissued; editing the email revokes the old token; an invitation counts as accepted only after the account is activated — REG-005 — implemented, tests passing.
- Class Secretary on the Student's own account: Faculty invites, the Student accepts, at most one pending or active Secretary per section, removal restores normal Student access — REG-006, BIO-010 — implemented, tests passing.
- Email Management shows whether each Student is an ordinary Student, has a pending Secretary invitation or is the active Secretary — REG-006 — implemented, tests passing.
- A Secretary keeps their own Student context and switches between Secretary and Student views with the sidebar toggle only — BIO-010, UI-005 — implemented, tests passing.

## Grading and retention

- Faculty edit grading categories and weights; weights must total exactly 100% and grades stay computed — GRD-002, GRD-003 — implemented, tests passing.
- Retention Monitoring uses the Faculty's real classes, enrollments and scores, the "Midterm Grade" wording and the approved High / At Risk / Low risk levels — UI-003, ACA-001 — implemented, tests passing.
- Remedial is a row action after Finals with Student, Course and Section locked; no separate "Schedule a Remedial" action — UI-003 — implemented, tests passing.
- Two remedial attempts, each passing at 50% or more; the second only after a failed first; the original course grade never changes — UI-003 — implemented, tests passing.
- Students get a stored in-app notification when a remedial is assigned — UI-003, NTF-001 — implemented, tests passing.
- Provisional Student roster import into existing classes, labelled "Official format not confirmed" — IMP-001 — implemented, tests passing.

## Attendance

- Attendance Monitoring offers only the Faculty's assigned courses, and only sections of the chosen course — ATT-001 — implemented, tests passing.
- Every Secretary or Faculty override records actor, Student, class, session, old and new status, reason and time — ATT-006 — implemented, tests passing.
- Faculty Class Attendance Activity shows their own and their Secretary's attendance changes with that full context — ATT-006 — implemented, tests passing.

## Audit and notifications

- Dean/Admin System Audit, separate from personal activity views — SEC-004 — implemented, tests passing.
- Faculty and Secretary My Activity, read from the database and limited to the signed-in account — SEC-004 — implemented, tests passing.
- Audit records keep the actor ID and the name at the time of the event, and strip passwords, tokens, secrets and recovery codes — SEC-004 — implemented, tests passing.
- Stored notifications (recipient, type, message, reference, time, read state) drive the notification bell — NTF-001 — implemented, tests passing.

## Student surfaces and data

- Student dashboard, classes and retention pages read server data; prototype paths that have no server data yet stay switched off — ACA-001 — implemented, tests passing.
- Schema changes are ordered, additive migrations — DATA-001 — implemented, tests passing.

## Deliberate boundaries

- Email-code sign-in verification is retired; system email remains for non-authentication features.
- Facial biometrics are not a complete production flow (BIO-001 to BIO-010).
- Image publishing, deployment automation, cloud infrastructure, TLS and CI/CD are not part of this repository (RUN-002, DEL-001).
