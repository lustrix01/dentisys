# Proposed spec.md amendments — 2026-09-29

Everything below comes from your answers in this session. Per spec §10, nothing in spec.md is changed until you approve. Each item shows the rule it touches and the exact text to add or replace.

---

## A1. GRD-001 — Assessment transmutation (attendance link)

**Replace** the second paragraph ("Raw assessment points remain authoritative … nonblank session code.") with:

> Raw assessment points remain authoritative historical scores and are never replaced by a transmuted result. Linking an enabled assessment to an attendance session is optional. A link identifies one attendance session of the assessment's class by session date and a nonblank session code.
>
> Without a link, the bounded transformation applies to the raw percentage and attendance is not considered. With a link, attendance is considered as described below. If the linked session is revoked, the assessment is treated as unlinked.

**Replace** the sentence "Missing attendance is incomplete/unresolved and must not be treated as absent or use a raw-percentage fallback." with:

> While the linked session has not yet ended, a student with no attendance record is incomplete. After the session ends, unresolved students are resolved to Absent (see ATT-003), so the result is 0%.

## A2. UI-003 — Course-grade retention trigger is fixed

**Replace** "Owner clarification (2026-09-26, provisional)" through "The provisional threshold may change." with:

> Owner decision (2026-09-28): For the professional-course final-grade trigger, 1.0 is best. The authoritative final grade is compared at its established precision, without rounding to one decimal first.
>
> - A final grade below 2.50 passes, including 2.40–2.49.
> - A final grade of 2.50 or worse requires remediation.
>
> This trigger is fixed college policy. It is not an Admin setting and changes only by amending this specification.

**Add** at the end of the remedial amendment paragraph:

> The 50% remedial pass mark is the current policy and may change later by amendment.

## A3. UI-003 — Risk levels (Faculty Retention Monitoring and Midterm Watchlist)

**Add:**

> Risk shows how close a student is to needing remediation. It is recalculated for the current grading period (Midterm, or the running overall grade after Midterm):
>
> 1. Take the student's completed assessments in the period.
> 2. Add assumed future assessments one at a time. Each is the size of the student's average completed assessment in that period and is scored 75%, a below-passing score (below 82%).
> 3. Count how many are needed before the period grade reaches 2.50 or worse.
>
> The count gives the level:
>
> - **High** — 1–2 assumed assessments, or the grade is already 2.50 or worse.
> - **At Risk** — 3–4.
> - **Low** — 5 or more.
>
> Risk is informational. It never creates remediation. Warning and Critical remain separate, manually set retention states. The assumed score and the bands are current policy and may change by amendment.

## A4. GRD-002 — Grade weights are required

**Add:**

> Every class offering must have a saved grade-weight configuration before assessments are created or grades are computed. There is no fallback formula. A class without saved weights is reported as "grade weights required", and its existing results are preserved.
>
> Category weights must be greater than 0. The Grade Weights editor is shared by all sections of an offering.
>
> On first save, existing unlinked assessments are linked to categories by name. Case and simple plurals are ignored, so "Quiz" matches "Quizzes". Assessments that cannot be matched are assigned to a category by the Faculty member before the save completes.

## A5. REG — One identity kind per person

**Add as REG-008:**

> A person holds one kind of DentiSys identity: either a Student (who may also be appointed Class Secretary) or a staff member (Faculty, or the Dean/Admin).
>
> - An email that belongs to a Faculty or Dean account cannot be used for a Student record, a Student invitation, or a Secretary appointment.
> - An email that belongs to a Student record or a Student or Secretary account, or that belongs to the Dean, cannot be invited as Faculty.

## A6. REG-003 — Google linking only after the account exists

**Replace** REG-003 with:

> Invitation acceptance is password-only. Faculty and Students create their DentiSys password to activate the account.
>
> Google Sign-In may be linked only after activation, from the user's profile. Linking follows the AUTH-010 ownership confirmation (password, plus MFA when enabled) and requires the verified Google email to match the account's institutional email.

Also **remove** the last paragraph of AUTH-010, which covers binding Google during invitation acceptance.

## A7. Account email is permanent after activation

**Add to §3:**

> A user cannot change their own login email. Before activation, a pending invitation's email may be corrected: by the Dean for Faculty invitations, and by Faculty for Student records that have no account. After activation, an account's email cannot be changed.

## A8. First Dean account

**Add to §3:**

> On a database with no Dean/Admin account, the first Dean invitation is created from deployment configuration (the first-admin email and name). The invitee sets their password through the normal invitation flow. This mechanism does nothing once any Dean/Admin account exists.

## A9. REG-006 / BIO-010 — Class Secretary model

**Replace** REG-006 with:

> A Class Secretary is a Student who has been appointed to one class section. Faculty appoint a Student of their own current-year section. Each section has at most one Secretary, counting active and pending appointments together.
>
> The appointment uses the Student's existing DentiSys account. If the Student has no account yet, one invitation both activates the Student account (the Student sets a password) and records the appointment.
>
> Faculty may remove the appointment. The account then returns to plain Student access. An appointment ends automatically when its section is archived or its school year ends. Google authentication cannot bypass invitation or activation.

**Replace** the second sentence of BIO-010 with:

> That same account keeps all of the person's own Student self-service, including dashboard, classes, grades and retention, attendance, biometric enrollment, and profile. The Secretary/Student switch is a sidebar toggle.

## A10. ATT-002 — Session location map

**Replace** "select the session location through a map interface" with:

> select the session location on an embedded OpenStreetMap map, which can also center on the creator's current location

**Add:**

> Only map tiles are requested from the tile provider. No Student data is sent to it.

## A11. ATT-001 / ATT-003 — Session end time and automatic Absent

**Add to ATT-001:**

> Every session has a required class end time. It must be on the session day and at or after the Late cutoff.

**Replace** the resolution sentences in ATT-003 with:

> When the class end time passes, the session ends automatically. Every eligible student with no attendance record is then resolved to Absent. An authorized Faculty member or Secretary may also end the session earlier.

## A12. ATT-001 — Revoked sessions

**Add:**

> A revoked session is treated as if it never happened. Its attendance records do not count toward attendance rates, attendance categories, transmutation, or reports. No student is resolved to Absent for it. The records and the revocation stay in history and audit.

## A13. ATT-006 — Excused requests

(The rule is unchanged: Secretary requests, Faculty approves or rejects.)

**Add:**

> For attendance rates, Excused counts as attended.

## A14. DEL-001 — Local phone-testing HTTPS

**Add:**

> A development-only, self-signed HTTPS mode for testing on phones over the local network is permitted. It is not deployment TLS and does not authorize deployment infrastructure.

## A15. Faculty notices to students

**Add to §5 (email):**

> Faculty may send At-Risk and Privacy Consent notices to their students using the institutional email template.
>
> Outside production, email is sent only to addresses on a configured test allowlist. Other messages are recorded in history as "Suppressed (test mode)" and are not delivered.

## A16. §8 status lines

**Replace** each "Implementation: DEFERRED" under BIO-001 to BIO-010 and ATT-001 to ATT-006 with:

> Implementation: research prototype implemented

Also **reword** the §8 introduction and the §11 supersession note so they no longer say biometrics is unimplemented.

**Keep as deferred:** the BIO-007 numeric thresholds, and the BIO-002 institutional privacy/consent review. That review remains the gate before real Student deployment.

**Change** the GRD-002 status to CURRENT.
