# DentiSys Product Specification

> Authoritative product decisions and behavioral guardrails for DentiSys.

## 0. Authority

`spec.md` defines approved DentiSys product behavior.

Agents MUST read the relevant sections before planning or implementing work that affects them.

### Status

* **CURRENT** — implemented behavior that must be preserved unless explicitly changed.
* **APPROVED** — Owner-approved behavior; may not yet be implemented.
* **DEFERRED** — known future work; implementation is not authorized by this status alone.
* **OPEN** — unresolved; agents MUST NOT decide it independently.

### Change control

* The Owner is the final authority for this specification.
* Agents MUST NOT modify, remove, reinterpret, or supersede any rule in `spec.md` without explicit Owner approval.
* A task that conflicts with `spec.md` does **not** automatically authorize changing the specification.
* If implementation requires a spec change, STOP and consult the Owner first.
* Agents may propose an exact spec amendment, but MUST NOT apply it before approval.
* If code/documentation and `spec.md` disagree, report the conflict rather than silently choosing one.

## SPEC-001 — Uncertainty and decision capture
**Status: CURRENT**

If an agent is unsure about product behavior, requirements, scope, or an existing specification decision, it MUST ask the Owner rather than guess.

After the Owner resolves the uncertainty, any durable product decision or guardrail MUST be recorded in `spec.md`.

Do not record temporary implementation details that do not establish durable product behavior.

All `spec.md` changes still require explicit Owner approval before being applied.

Required conflict format:

```text
SPEC CHANGE REQUIRED
Affected rule: [ID]
Current rule: [current behavior]
Requested behavior: [new behavior]
Conflict: [why both cannot remain true]
Proposed spec change: [exact change]
Implementation impact: [affected behavior]
Owner approval required before proceeding.
```

### Document boundaries

`spec.md` records durable product behavior and decisions.

Do not fill it with:

* source-file descriptions;
* implementation steps;
* temporary bugs;
* low-level architecture;
* speculative future requirements;
* development history.

Use:

* `spec.md` — product contract and decisions;
* `docs/features.md` — implementation status;
* `docs/roadmap.md` — planned work and sequencing;
* code/tests — implementation details;
* `AGENTS.md` — repository working rules.

---

# 1. Product Boundary

## SYS-001 — Roles

**Status: CURRENT**

DentiSys has four application roles:

* Admin
* Faculty
* Secretary
* Student

Roles, permissions, approval, eligibility, and authorization are controlled by DentiSys.

External identity providers MUST NOT assign or elevate DentiSys roles.

## SYS-002 — Preserve unrelated behavior

**Status: CURRENT**

A feature change MUST preserve unrelated existing functionality unless the Owner explicitly approves the behavioral change.

A task does not implicitly authorize:

* feature removal;
* unrelated refactoring;
* UI redesign;
* route/API changes;
* role changes;
* workflow changes.

## SYS-003 — Simplicity

**Status: CURRENT**

Implement the simplest solution that satisfies the approved specification.

Do not introduce architecture, abstractions, or extensibility solely for hypothetical future requirements.

---

# 2. Authentication and Identity

## AUTH-001 — Supported primary authentication

**Status: APPROVED**

DentiSys supports two normal primary authentication methods:

1. institutional email + DentiSys password;
2. Google Sign-In.

Google Sign-In supplements password authentication; it does not replace it.

An eligible Google-linked account MUST remain usable through email + password.

Conceptually:

```text
Password ─┐
          ├─> DentiSys account -> MFA decision -> DentiSys session
Google ───┘
```

## AUTH-002 — One DentiSys account

**Status: APPROVED**

Password and Google authentication MUST resolve to the same logical DentiSys account.

Google integration MUST NOT create a second parallel account when the institutional identity already belongs to an existing DentiSys account.

Google identity linking MUST prevent silent reassignment of an existing Google identity to another DentiSys account.

## AUTH-003 — Google identity verification

**Status: APPROVED**

Google identity MUST be verified by the backend before DentiSys authentication succeeds.

A browser-supplied email alone is not sufficient authentication.

Google authentication MUST use a stable provider identity when persistently linking a Google account to DentiSys.

Google verification proves identity only; DentiSys remains responsible for authorization and account eligibility.

## AUTH-004 — Institutional domains

**Status: APPROVED**

DentiSys MUST support a configurable allowlist containing multiple approved institutional domains.

The product MUST NOT assume one permanent institutional domain.

Both password-based and Google-assisted workflows MUST obey the applicable institutional-email policy.

## AUTH-005 — Password authentication

**Status: CURRENT**

Email + password authentication remains a supported first-party DentiSys authentication method.

Google support MUST NOT:

* remove password login;
* make existing passwords unusable;
* remove password hashes;
* remove password recovery/reset;
* make Google-linked accounts passwordless.

## AUTH-006 — MFA

**Status: CURRENT**

DentiSys uses optional authenticator-app/TOTP MFA with recovery codes.

Password and Google authentication MUST converge on the same existing MFA boundary.

```text
Password ─┐
          ├─> optional TOTP/recovery -> session
Google ───┘
```

Google Sign-In MUST NOT bypass required DentiSys MFA.

Email-code authentication/MFA is retired and MUST NOT be reintroduced unless explicitly approved.

## AUTH-007 — Sessions

**Status: CURRENT**

DentiSys remains responsible for application sessions after primary authentication.

Existing session behavior includes:

* server-issued access credentials;
* refresh credentials;
* refresh rotation/revocation;
* persisted authentication sessions;
* logout/revocation;
* account/token invalidation behavior.

The browser's session-refresh request MUST be allowed to complete when the page reloads, navigates or closes (e.g. `fetch` `keepalive`), so a rotation the server committed is not lost by the client. Presenting an already-used refresh token is treated as reuse and revokes the session, except within the existing short concurrent-refresh window (409 `REFRESH_IN_PROGRESS`).

Google credentials MUST NOT replace the DentiSys application-session model.

## AUTH-008 — Authentication provenance

**Status: APPROVED**

DentiSys may record how the primary authentication occurred.

Recognized authentication sources include:

* `password`
* `google`
* `development_mock`

Authentication source is provenance, not authorization.

`password` and `google` are both real authentication sources.

`development_mock` remains development-only.

## AUTH-009 — Development mock identity

**Status: CURRENT**

Development mock Student authentication MUST remain isolated from real authentication.

Production or production-like behavior MUST NOT silently accept development mock identity.

Adding Google authentication MUST NOT weaken existing mock-identity safeguards.

## AUTH-010 — Existing-account Google linking
**Status: APPROVED**

An existing DentiSys account MUST NOT be silently linked to a Google identity based only on a matching email address.

On first Google sign-in for an existing unlinked account:

1. DentiSys verifies the Google identity and approved institutional domain.
2. DentiSys may locate the existing account using the verified institutional email.
3. The user MUST confirm ownership of that DentiSys account using the existing DentiSys password.
4. Existing MFA MUST also be completed when enabled.
5. Only after successful ownership confirmation may the verified Google `sub` be bound to the DentiSys account.

After binding:

- future Google sign-ins use the stored Google `sub`;
- email + password login remains supported;
- a different Google `sub` MUST NOT silently replace the existing binding.

---

# 3. Registration and Account Lifecycle

## REG-001 — Invitation-only Faculty and Student onboarding

**Status: APPROVED**

There is no public Faculty or Student signup. A Faculty account may be established only through an Admin-authorized invitation. A Student account may be established only through a Faculty-authorized invitation tied to the canonical Student record and applicable eligibility checks.

The invitation authorizes account establishment. Google MUST NOT create an invitation or independently begin account creation; Google may be linked only after activation (REG-003). Secretary appointment remains governed by REG-006.

Owner decision (2026-10-28): Faculty and Student invitations expire 7 days after they are sent; reissuing starts a new 7 days.

## REG-002 — Password-backed invitation acceptance

**Status: CURRENT**

Faculty and Student invitation acceptance MUST require creation of a DentiSys password. Existing institutional email validation and role-specific identity and eligibility requirements remain authoritative.

## REG-003 — Google linking after activation

**Status: APPROVED**

Invitation acceptance is password-only. Faculty and Students create their DentiSys password to activate the account.

Google Sign-In may be linked only after activation, from the user's profile. Linking follows the AUTH-010 ownership confirmation (password, plus MFA when enabled) and requires the verified Google email to match the account's institutional email. A completed Google-linked account MUST support both Google Sign-In and institutional email + DentiSys password.

## REG-004 — Google cannot bypass account controls

**Status: APPROVED**

Successful Google verification MUST NOT by itself:

* create an invitation or authorized account by itself;
* grant a role;
* approve an account;
* activate an account;
* bypass an invitation;
* establish Student eligibility;
* bypass required invitation acceptance or password creation.

Existing role-specific lifecycle rules remain authoritative.

## REG-005 — Faculty invitation lifecycle

**Status: CURRENT**

Only an Admin may invite a Faculty member. The Admin invitation itself is the Faculty approval. A valid invitation acceptance with required identity setup and password creation MUST make the Faculty account Active; no separate approval step follows. A person without a valid Faculty invitation MUST NOT create a Faculty account.

## REG-006 — Secretary lifecycle

**Status: CURRENT**

Owner decision (2026-09-29): A Class Secretary is a Student who has been appointed to one class section. Faculty appoint a Student of their own current-year section. Each section has at most one Secretary, counting active and pending appointments together. The appointment uses the Student's existing DentiSys account. If the Student has no account yet, one invitation both activates the Student account (the Student sets a password) and records the appointment. Faculty may remove the appointment; the account then returns to plain Student access. An appointment ends automatically when its section is archived or its school year ends.

Owner decision (2026-10-18): A Student may be appointed Class Secretary of more than one current-year section, including sections of different Faculty. Each section still has at most one Secretary (active and pending together). Removing or ending one appointment leaves the others; the account returns to plain Student access only when no current appointment remains.

Owner-approved amendment (2026-10-22): Unenrolling a Student from a section also removes them as that section's Class Secretary. Their appointments in other sections are unaffected; if none remain, the Secretary appointment ends as when Faculty remove it.

Google authentication MUST NOT bypass the invitation/activation requirement.

## REG-007 — Student identity

**Status: CURRENT**

Only an authorized Faculty member may invite a Student from an assigned class. The invitation MUST be tied to the canonical Student record. Student account access remains tied to that identity and existing active-status/enrollment eligibility checks at invitation and acceptance. A Student email alone MUST NOT authorize onboarding. After valid invitation acceptance, eligibility checks, and password creation, the Student account becomes Active.

Google cannot substitute for the Faculty invitation or Student eligibility; it may be linked only after activation (REG-003).

## REG-008 — One identity kind per person

**Status: APPROVED**

A person holds one kind of DentiSys identity: either a Student (who may also be appointed Class Secretary) or a staff member (Faculty, or the Dean/Admin). An email that belongs to a Faculty or Dean account cannot be used for a Student record, a Student invitation, or a Secretary appointment. An email that belongs to a Student record or a Student or Secretary account, or that belongs to the Dean, cannot be invited as Faculty.

## REG-009 — Account email is permanent after activation

**Status: APPROVED**

A user cannot change their own login email. Before activation, a pending invitation's email may be corrected: by the Dean for Faculty invitations, and by Faculty for Student records that have no account. After activation, an account's email cannot be changed.

## REG-010 — First Dean account

**Status: APPROVED**

On a database with no Dean/Admin account, the first Dean invitation is created from deployment configuration (the first-admin email and name). The invitee sets their password through the normal invitation flow. This mechanism does nothing once any Dean/Admin account exists.

---

# 4. Authorization and Security

## SEC-001 — DentiSys authorization

**Status: CURRENT**

Authentication establishes identity.

DentiSys remains authoritative for:

* RBAC;
* account status;
* role;
* approval;
* activation;
* Student eligibility;
* application permissions.

An authenticated external identity is not automatically an authorized DentiSys user.

## SEC-002 — RBAC

**Status: CURRENT**

Existing role-based access control MUST remain enforced independently of authentication source.

Google-authenticated users receive no additional privilege solely because Google authenticated them.

## SEC-003 — Password reset

**Status: CURRENT**

Password reset remains supported because password authentication remains supported for all normal DentiSys accounts, including Google-linked accounts.

## SEC-004 — Rate limiting and audit

**Status: CURRENT**

Existing authentication rate limiting MUST be preserved when additional authentication paths are added. Every authentication path MUST write the sign-in and security audit events defined in SEC-005.

New authentication paths SHOULD use the same security boundaries where applicable rather than creating parallel security systems.

## SEC-005 — Audit logging

**Status: CURRENT**

Owner decision (2026-10-17): The audit trail answers, for any recorded action, who did what to which record, when, from where, and what it was before. It serves disputes about grades and attendance, security incidents, accountability for authority, and proof of integrity. It is not usage analytics, debugging output or a click history; an event that serves none of these uses is not written. The approved event list, labels and visibility per event are in `docs/contracts/audit-logging.md` section 5; changing that list requires Owner approval like this section.

Writing. Audit rows already stored are never changed or deleted. Each row is written in the same transaction as its change; if it cannot be written, the change is cancelled. An update that changes nothing writes no row. A change records before and after values of the fields that changed, and a deletion keeps the deleted values. Rows keep the HMAC chain seal, the append-only guard and redaction: passwords, tokens, 2FA secrets, recovery codes, biometric material, precise Student GPS coordinates and similarity scores are never stored. Each row stores the actor's name, email and role at the time, the IP address and the browser. Descriptions use readable names; internal IDs stay in the target fields. Refused access is not logged. Rows are kept indefinitely until a retention period is approved.

Not written: refresh-token rotation, the Google "link required" step, and the start of authenticator setup. Refresh-token reuse, every sign-in, link and 2FA outcome remain audited. Written in addition: wrong authenticator or recovery codes at sign-in, and recovery-code regeneration, never storing the codes.

Grading. A score save writes one row listing each changed score and remark with old and new values, cleared scores with their old value, and each period or final grade that moved as a result; the automatic recompute after a save writes no row of its own, and if it fails the scores and their row still save. The Recompute button writes one row listing changed grades, and none when no grade changed. Deleting an assessment keeps every deleted score in its row.

Batches. When one click or one system job changes many records (roster import, invite all, Secretary invitations, mark all Present, end-of-term biometric deletion), each record gets its own sealed row and all of them share one batch ID; every screen shows the batch as one expandable row.

Visibility. Faculty and Secretaries see only rows their own account did (My Activity). Students have no audit screen. The Dean sees an overview: people and accounts, roles, settings and terms, security events (failed sign-ins, 2FA and password changes, token reuse), biometric consent and deletions, and everything the Dean's own account did. The Dean does not see class work (scores, assessments, grade weights, recomputes, attendance records and sessions, Excused requests, retention entries) or other people's successful sign-ins; those rows stay recorded, and an investigation reads them from the database through the system administrator at the Dean's request. Sign-in, sign-out and 2FA rows of the viewer's own account are behind a Sign-ins filter, off by default. These rules apply to rows already stored as well; old rows get readable labels and are not grouped. Class Attendance Activity is a class-records screen and is unchanged.

Display. Every audit screen shows When (Asia/Manila), Who, What, Record, Change and a status badge, grouped under day headers. The details panel, the same for every role on rows they may see, shows when, who, what, record, from where, status, reason and a Field / Before / After table. Filtering, sorting and paging run on the server over all rows the viewer may see, 50 per page, with search (including inside batches), area, date presets and range, status, role (Dean), class (Faculty), the Sign-ins filter and Clear filters. The Dean view shows attention cards for failed sign-ins, security alerts and 2FA turned off. Export and print follow the same columns, filters and visibility. Below 1280 px the UI-001 responsive rule applies: same columns, the table scrolls inside its own box with When pinned.

Integrity. A read-only chain check runs in the PostgreSQL gate and after each demo deploy and reports the first broken row; a break found on the first run against an existing database is recorded as the starting point.

---

# 5. Current Product Features

## GRD-001 - Assessment transmutation

**Status: CURRENT**

Assessments may optionally enable grade transmutation. Admin may edit the institution-wide transmutation minimum and maximum percentages, initially 50% and 100%. New assessments snapshot the current institution-wide defaults; later default changes affect future assessments by default and do not silently modify existing assessments. Faculty may explicitly customize an assessment's stored minimum and maximum percentages.

Raw assessment points remain authoritative historical scores and are never replaced by a transmuted result. Linking an enabled assessment to an attendance session is optional. A link identifies one attendance session of the assessment's class by session date and a nonblank session code. Without a link, the bounded transformation applies to the raw percentage and attendance is not considered. With a link, attendance is considered as described below. If the linked session is revoked, the assessment is treated as unlinked.

For an enabled assessment, present, late, and excused attendance apply the bounded transformation:

```text
effectivePercentage = minimum
    + rawPercentage / 100 * (maximum - minimum)
```

Absent attendance produces an effective percentage of 0%. While the linked session has not yet ended, a student with no attendance record is incomplete. After the session ends, unresolved students are resolved to Absent (see ATT-003), so the result is 0%. Disabled assessments continue using the normal raw percentage. Attendance corrections affect subsequent effective-grade computation without modifying the stored raw score. Assessment-linked transmutation remains separate from the existing independent attendance grading component.

---

## GRD-002 - Period grading and editable presets

**Status: CURRENT**

Faculty grading configurations remain scoped to the Faculty member, course, semester, and school year.

New, unconfigured offerings present an editable, unsaved Lecture/Laboratory
period grading preset defined in GRD-003. Preset values become authoritative
only after a successful server save; Faculty may customize all weights and
categories within the structure required for the course (GRD-003).

Faculty may customize each component's categories and weights for each period.
All new or updated period grading configurations must use the structure
required for the course in GRD-003. Each component-period category list, the
Lecture/Laboratory contributions where both exist, and the Midterm/Finals contributions
must each total exactly 100%, using the existing supported decimal precision.

Preset values become authoritative only after a successful server save. Existing saved configurations must never be replaced automatically by preset values.

Assessments must reference valid categories for their offering and grading period. Existing assessment identifiers, category references, raw scores, and assessment maximum scores must be preserved.

Existing single-list configurations continue using their current calculation until explicitly converted through a validated operation. Migration must not silently change recorded grades.

For period configurations, the overall percentage is the Midterm percentage multiplied by its contribution plus the Finals percentage multiplied by its contribution. A positively weighted period without sufficient results remains incomplete; it must not silently become zero or be omitted.

Owner decision (2026-09-28): Every class offering must have a saved grade-weight configuration before assessments are created or grades are computed. There is no fallback formula. A class without saved weights is reported as "grade weights required", and its existing results are preserved. Category weights must be greater than 0. The Grade Weights editor is shared by all sections of an offering. On first save, existing unlinked assessments are linked to categories by name, ignoring case and simple plurals ("Quiz" matches "Quizzes"); assessments that cannot be matched are assigned to a category by the Faculty member before the save completes.

Owner decision (2026-10-12): Until a course's grade weights are saved once, the Grade Weights banner reads "BU Dental Medicine Default Grade Weights"; after the first save it reads "BU Dental Medicine Schema Active".

Saving configuration does not automatically rewrite persisted grade results. An authorized recomputation applies the saved configuration while preserving raw scores and GRD-001 transmutation behavior.

In period configurations, any authoritative Attendance-source category uses
authoritative attendance data and replaces the additional independent attendance
contribution, preventing double-counting. Assessment-linked transmutation remains
governed separately by GRD-001. The default categories in GRD-003 use assessment
scores; they do not add an authoritative Attendance-source category automatically.

Faculty defines one inclusive attendance date range for Midterm and one for Finals for each offering. Each start date must be on or before its end date; Midterm must end before Finals starts. Gaps are allowed. Attendance is assigned using its recorded session date, and records outside both ranges do not contribute to period attendance. Missing ranges or unresolved attendance keep the affected result incomplete. Saving changed dates does not rewrite recorded results; changes apply through explicit recomputation.

Grade displays and exports must distinguish authoritative Midterm, Finals, and overall results. Unavailable period results must not be replaced with the overall grade.

Owner decision (2026-10-28): Students see their own period and final grades, not individual assessment scores.

Owner decision (2026-10-27): Grade sheets, class lists and report exports are Excel (.xlsx) files in the Dean's official layouts; see docs/contracts/official-exports.md.

---

## GRD-003 - Separate Lecture and Laboratory grading

**Status: APPROVED**

Separate Lecture/Laboratory grading is mandatory for all new or updated period
grading configurations on authorized current-year offerings, except lecture-only
courses. Grade Weights must
not offer a combined/split structure selector or conversion back to combined
period lists. The configuration remains shared by its sections and scoped to the
Faculty member, course, semester and school year.

Grouped grading has Lecture and Laboratory components. Faculty sets positive
contribution percentages totaling exactly 100%. One offering-level component
ratio applies to both Midterm and Finals. Course units do not determine this
ratio. Existing Midterm/Final contributions remain separately editable.

Each component has its own Faculty-editable category list for each period.
Each component-period list must total exactly 100%, and each category weight
must be positive. Category names may repeat across components; names must be
unique within a component and period. Assessments reference a valid category
and resolve unambiguously to its component and period.

A component percentage uses the existing category assessment and transmutation
calculations within that component. Each period percentage is its Lecture
percentage multiplied by the Lecture contribution plus its Laboratory
percentage multiplied by the Laboratory contribution. Overall percentage is
the resulting Midterm and Finals percentages combined using the saved term
contributions. Grouped calculations use unrounded intermediate values for
weighted combinations and the existing precision for displayed/persisted
results. Ungrouped calculation behavior remains unchanged.

Missing results in a positively weighted category, component or period keep
the dependent grade incomplete. Missing grades must never become zero or cause
renormalization. Existing GRD-001 transmutation, attendance completeness,
retention thresholds and manual override rules remain unchanged. Informational
risk uses the saved grouped weights and existing risk rules; it must not
redefine retention policy.

Authoritative Attendance retains its existing course-wide records and inclusive
period date ranges. At most one authoritative Attendance-source category is
permitted across both components in a period, preventing double-counting.
Participation and Recitation are assessment-source categories unless Faculty
explicitly selects the supported Attendance source. Separate Lecture/Laboratory
attendance calculations are outside this amendment.

Owner-approved amendment (2026-10-12): The Grade Weights screen no longer offers an Attendance source selector. Participation and Recitation are always assessment-source categories.

Existing overall and ungrouped period configurations, assessment and category
identifiers, raw scores, history and saved grades remain preserved. Existing
configurations continue their saved calculation until explicitly converted;
historical offerings remain view-only. Updating an existing ungrouped period
configuration requires explicit validated conversion to Lecture/Laboratory
grading. Faculty must assign existing categories and resolve ambiguous assessment
mappings before conversion can be saved; the system must not guess mappings,
replace existing categories with defaults, or rescale saved weights automatically.
Saving or converting a configuration must not rewrite recorded grades; explicit
authorized recomputation applies the saved configuration. Conversion from grouped
grading back to combined period lists is no longer supported.

Grade Weights, assessment selection, server computations, Faculty/Student
ledgers and applicable grade exports must identify Lecture and Laboratory
component results separately from Midterm, Finals and overall results. GWA
conversion remains at the existing course-result level; no new independent
Lecture/Laboratory transcript GWA is introduced.

The supplied syllabus defines the editable, unsaved default for new,
unconfigured offerings: Lecture 60%, Laboratory 40%; Lecture categories Term Exam
50%, Quiz 20%, Outputs 20%, Participation 10%; Laboratory categories Practical Exam
50%, Laboratory Exercises 30%, Quiz 10%, Recitation 10%; Midterm 50%, Finals 50%.
The same starting component category lists apply to both Midterm and Finals.
Faculty may edit these values while preserving the separate component structure
and all three 100% totals. Defaults are shown automatically without an Apply
syllabus example action. Existing saved configurations and recorded grades must
never be replaced automatically by default values.

Owner-approved amendment (2026-10-26): Lecture-only courses. A course with
Lecture units above 0 and Laboratory units of 0 is lecture-only; course units
are the only source. Courses without recorded units keep Lecture/Laboratory
grading, and Grade Weights points the Faculty to Classes & Rosters to set them.
Laboratory-only courses keep Lecture/Laboratory grading. A lecture-only
configuration has one Lecture category list per period and no component
contributions; its default is the Lecture category list above with Midterm 50%
and Finals 50%. Its period grade is the Lecture period grade, and its course
grade is round(Midterm × Midterm share + Final × Final share), rounded once.
This course-grade rule is provisional until confirmed against the official
lecture-only grade sheet. Removing Laboratory units is blocked while any
current-term offering of the course has Laboratory assessments; otherwise, and
when Laboratory units are added, the saved configuration keeps its calculation
until the Faculty's next Grade Weights save, which must use the new structure.
Past school years are not affected. Saved scores are never deleted or
rescaled, and grades change only through authorized recomputation. Detailed
rules: docs/contracts/lecture-only-grading.md.

Owner-approved amendment (2026-10-27): The Dean confirmed the default
Midterm/Finals split is 50% / 50% (previously 30% / 70%) for both
Lecture/Laboratory and lecture-only courses. It is only the unsaved default;
saved configurations keep their own split.


---

## EML-001 - Faculty notices to students

**Status: APPROVED**

Faculty may send At-Risk and Privacy Consent notices to their students using the institutional email template. When the email mode is `custom`, every outgoing email is delivered to Mailpit, and only recipients on the configured allowlist also receive it by real email; Faculty notices to other recipients are recorded in history as "Suppressed (test mode)". In `mailpit` mode all email goes to Mailpit only; in `smtp` mode all email is delivered normally.

Owner-approved amendment (2026-10-12): Email Management has three tabs: Student invitations, Secretary, and History. Faculty At-Risk and Privacy Consent notices are not offered. The delivery modes (`custom`, `mailpit`, `smtp`) are unchanged for all other email.

---

## NTF-001 - Class enrollment notifications

**Status: APPROVED**

When authorized Faculty creates or reactivates a class enrollment, DentiSys creates a persisted in-app notice for each active Student/Secretary account canonically linked to that Student. An email match does not establish a recipient. Enrollment, audit and notification commit or roll back together. An already-active enrollment creates no new notice. Each class/account pair receives at most one enrollment notice, including subsequent reactivations. A Student without an active linked account receives no notice, and account activation does not replay missed notices.

---

The following capabilities are currently part of DentiSys and MUST NOT be removed as incidental scope.

| Capability                              | Status   |
| --------------------------------------- | -------- |
| Password authentication                 | CURRENT  |
| Authenticator-app MFA + recovery codes  | CURRENT  |
| Password reset                          | CURRENT  |
| RBAC                                    | CURRENT  |
| Access/refresh sessions and rotation    | CURRENT  |
| Authentication/session audit behavior   | CURRENT  |
| Authentication rate limiting            | CURRENT  |
| Faculty invitation and activation       | CURRENT  |
| Secretary invitation and activation     | CURRENT  |
| Student identity/invitation/activation  | CURRENT  |
| Academic workflows                      | CURRENT  |
| Attendance workflows                    | CURRENT  |
| Reporting                               | CURRENT  |
| Email history and notification delivery | CURRENT  |
| Google Sign-In                          | APPROVED |
| Google linking after activation (REG-003) | APPROVED |
| Multi-domain institutional allowlist    | APPROVED |

Detailed implementation status belongs in `docs/features.md`, not here.

---

# 6. Data and Runtime Invariants

## DATA-001 — Database

**Status: CURRENT**

PostgreSQL is the active DentiSys database.

MariaDB material under the repository archive is historical and not active runtime state.

Schema/reference-data changes use additive ordered migrations.

Applied shared migrations MUST NOT be rewritten.

Persisted database volumes MUST NOT be deleted or reset without explicit Owner approval.

## RUN-001 — Supported development runtime

**Status: CURRENT**

The supported local development runtime is Docker Compose.

Current stack:

* React/Vite frontend;
* plain PHP API with Composer dependencies;
* PostgreSQL;
* Mailpit;
* optional development-only pgAdmin.

Do not introduce an alternative local runtime without explicit approval.

## RUN-002 — Deployment status

**Status: CURRENT**

Local development is supported.

The same-host single-server configuration is an unfinished private-LAN prototype, not a supported production deployment process.

Separate application/database-server deployment is not implemented.

Do not treat existing prototype deployment files as production readiness.

The approved VPS demonstration deployment (DEL-001) is the only supported non-local deployment. The private-LAN single-server prototype remains available and unchanged.

## RUN-003 — Secrets

**Status: CURRENT**

Secrets MUST remain outside version control.

Runtime secrets/configuration are supplied through the approved environment/configuration paths.

---

# 7. Repository Preservation

## REP-001 — Legacy material

**Status: APPROVED**

Meaningful legacy or historical project material SHOULD be preserved through archiving rather than permanent deletion when practical.

Already well-contained archives SHOULD remain untouched unless there is a concrete reason to change them.

## REP-002 — Cleanup threshold

**Status: APPROVED**

Repository cleanup SHOULD only be performed when it provides meaningful maintenance, clarity, or context benefits.

Do not delete files merely to reduce file count or repository size.

Disposable generated artifacts, meaningless scaffolding, or exact redundant copies may be removed when the benefit justifies the change.

---

# 8. Approved Requirements and Deferred Implementation

The biometric, attendance, and Secretary requirements in this section are approved product decisions and are implemented as a research prototype (Owner decision 2026-09-29). Real Student deployment still requires the BIO-002 institutional privacy/consent review. Technical selections explicitly marked deferred remain unresolved until team research and later Owner approval. Existing CURRENT rules and unrelated approved behavior remain in force.

## BIO-001 — Attendance-only purpose and identity boundary

**Status: APPROVED**

**Implementation: research prototype implemented**

Facial biometrics is used only for attendance verification. It MUST NOT be used for DentiSys login, password replacement, account authentication replacement, Student identity discovery, civil or institutional identity proofing, classroom-wide recognition, or general-purpose face recognition.

The Student MUST already be authenticated to their own DentiSys account. Biometric verification answers only whether the live face matches the protected reference enrolled for that authenticated Student. It MUST use strict 1:1 verification.

DentiSys MUST NOT perform 1:N identification, search all Students, identify an unknown face, return another Student as a possible match, perform classroom-wide identification, or search the Student population for duplicate faces. If another person accesses a Student account and enrolls their own face, biometrics does not discover or establish that person's actual identity. This is an intentional privacy boundary.

Facial detection MUST use the YuNet face detector through OpenCV. Facial verification MUST use the SFace face-recognition model through OpenCV, comparing face embeddings. SFace MUST remain restricted to strict authenticated-Student 1:1 verification and MUST NOT be used for 1:N identification or Student discovery.

## BIO-002 — Student enrollment, consent, and manual alternative

**Status: APPROVED**

**Implementation: research prototype implemented**

Only the Student may enroll, revoke, or re-enroll their own facial biometric through their authenticated account. Faculty and Secretary MUST NOT enroll another Student. Admin may revoke a Student's enrollment and request or require re-enrollment, but MUST NOT perform replacement enrollment for the Student.

Explicit, voluntary Student consent MUST precede any biometric capture or processing. A valid enrollment becomes active automatically after consent, eligibility, capture-quality, liveness/PAD, and applicable provider checks pass. Faculty, Secretary, or Admin approval is not required for routine successful enrollment; a routine approval queue is excluded.

Students may refuse biometric processing or later revoke consent. Refusal or inability to use biometrics MUST NOT block DentiSys access, normal Student functionality, or legitimate attendance credit. Authorized manual attendance, with Secretary-assisted manual attendance as the primary fallback, MUST remain available for refusal, revocation, inability to enroll, repeated failure, camera or accessibility limitations, geofence limitations, and unavailable biometric infrastructure.

The consent disclosure MUST state the attendance-only purpose; the biometric material processed; that raw facial images are not retained; that a protected reference is retained and expires every semester; revocation and deletion behavior; who may access enrollment status; the manual attendance alternative; and that revocation does not erase historical attendance. This scope applies to adult university Students.

Before real Student deployment, final privacy and consent wording MUST be reviewed and approved by the research team, adviser, relevant University authority, and University Data Protection Officer. This named review is the required institutional gate for real Student deployment; real deployment remains deferred until that gate and the remaining technical approvals in BIO-007 are complete.

For the DEL-001 demonstration deployment, only DentiSys team members enroll facial biometrics. Enrolling volunteer Students requires the BIO-002 institutional review, or a later Owner-approved amendment.

## BIO-003 — Temporary captures, protected reference, and infrastructure boundary

**Status: APPROVED**

**Implementation: research prototype implemented**

Raw photographs, enrollment images, camera frames, verification images, and failed captures MUST NOT be retained after processing, including in development or debugging artifacts. Temporary facial images MAY exist only as necessary for capture-quality evaluation, liveness/PAD, template generation, and 1:1 verification, and MUST be discarded after processing. Normal enrollment MUST require 20 usable facial samples and MAY accept at most 30 usable samples during one enrollment operation. Failed quality or liveness samples MUST NOT count. Raw enrollment samples MUST be discarded after protected-reference generation or an aborted enrollment.

Of the biometric material, only the protected reference required for future 1:1 verification may be retained. Retained facial references (SFace embeddings) are distinct from raw imagery and MUST be stored in dedicated biometric storage excluded from ordinary application/database backups. Normal UI and API access MUST NOT retrieve raw references, templates, embeddings, or equivalent biometric material.

After collection by the authorized Student-owned browser/device, biometric data MUST remain within infrastructure controlled by the DentiSys deployment. The browser/device is an authorized capture endpoint and MAY hold a capture temporarily for transmission, but it MUST NOT persist biometric material beyond the active operation. Biometric processing MUST NOT be delegated to an unapproved third-party or cloud provider. The intended research deployment may use one server and a logically separate biometric component whose boundary permits later relocation to separate infrastructure without changing product behavior. This rule does not select a container, service protocol, database, filesystem, object store, or other storage engine.

All biometric captures, temporary facial images, protected references, and temporary location data transmitted between a Student device, DentiSys, and the biometric component MUST use protected transport before real Student deployment.

## BIO-004 — Biometric information protection rationale

**Status: APPROVED**

**Implementation: research prototype implemented**

Protected biometric references MUST be protected at rest and in transit, against unauthorized retrieval and modification, and through appropriately restricted access. The design MUST consider confidentiality, integrity, privacy, renewability, and revocability because a compromised biometric characteristic cannot simply be changed like a password.

The design rationale MUST explicitly reference ISO/IEC 24745:2022, Information security, cybersecurity and privacy protection — Biometric information protection. The reference does not claim ISO certification, formal compliance, or audited conformance. Protected facial reference data MUST be encrypted at rest using AES-256-GCM. The encryption key MUST be server-controlled and MUST NOT be committed to Git, stored in the ordinary database, exposed through APIs, or sent to browser clients. PostgreSQL MAY contain biometric-profile metadata and an opaque protected-object reference, but MUST NOT contain raw photos or an unprotected facial reference. Key-management implementation, KMS/provider, protected-template mechanism, and key-rotation implementation remain deferred under BIO-007.

## BIO-005 — Expiration, revocation, replacement, and loss

**Status: APPROVED**

**Implementation: research prototype implemented**

An enrollment expires every semester. "Semester end" is the end date of the Dean-defined term (ACA-002). A Student MUST re-enroll to continue biometric attendance after expiration.

Usable biometric material MUST be invalidated and deleted when the enrollment expires at semester end, the Student revokes consent, Admin revokes enrollment, the linked Student account is deleted, the Student becomes inactive, or re-enrollment replaces the old enrollment. Re-enrollment MUST replace the previous usable reference; old usable templates MUST NOT be retained for historical audit. An audit record may retain that expiration, revocation, deletion, or replacement occurred without retaining the biometric material.

Biometric templates MUST NOT be included in normal DentiSys application backups. If biometric storage is lost, Students MUST re-enroll. System-wide disabling of biometrics and deletion of biometric data are separate operations. Incompatible templates from a future biometric engine require Student re-enrollment; template migration is not authorized unless separately approved. Legitimate historical attendance MUST remain preserved.

## BIO-006 — Liveness, capture quality, outcomes, and retries

**Status: APPROVED**

**Implementation: research prototype implemented**

Production biometric attendance MUST use randomized active challenge-response liveness or presentation-attack detection. Challenges MUST be server-generated, short-lived, and single-use. Each enrollment attempt MUST request two distinct randomized actions in randomized order from blink, turn head left, and turn head right. Each attendance attempt MUST request one randomized action from the same set. The browser MAY display the challenge but MUST NOT be authoritative for pass/fail. The DentiSys biometric component MUST verify the action sequence using temporary frames. MediaPipe Face Landmarker is approved only for landmark, transformation, and blendshape analysis used for liveness; it MUST NOT replace YuNet detection or SFace verification. Raw liveness frames MUST NOT be retained. Numeric liveness, blink, head-pose, and timing thresholds remain deferred.

The system MUST reasonably resist printed facial photographs, a face image displayed on another screen, prerecorded or displayed facial video, and straightforward replay attacks. It MUST continue to support ordinary browser-accessible phone, tablet, and desktop cameras and MUST NOT require depth, infrared, or Face ID-equivalent hardware or claim equivalent assurance.

Capture MUST be rejected when there is no face, more than one face, inadequate visibility, severe blur, unacceptable pose, severe occlusion, or another deferred quality failure. The system MUST provide understandable corrective guidance and MUST NOT automatically choose one face from a multiple-face capture.

Production UI MUST provide readable generic outcomes such as “Face verified” and “Face could not be verified.” Normal users MUST NOT receive raw similarity scores, confidence scores, or biometric vectors. Development diagnostics MAY display transient scores only behind an explicit development configuration flag; scores MUST NOT be persisted as normal client or audit data.

Students may make legitimate retries while biometric attendance remains open. There is no product-level hard retry count. Repeated failure MUST NOT lock the Student account or itself mark the Student Absent. The outcome MUST direct the Student to Secretary or Faculty for manual attendance.

## BIO-007 — Approved and deferred biometric technology selections

**Status: APPROVED**

**Technical selections: APPROVED as stated below; remaining parameters: DEFERRED**

Facial detection MUST use the YuNet face detector through OpenCV. Facial verification MUST use the SFace face-recognition model through OpenCV, comparing face embeddings. SFace MUST be restricted to strict authenticated-Student 1:1 verification; DentiSys MUST NOT perform 1:N identification, unknown-person identification, nearest-Student discovery, classroom-wide recognition, or searches across Student references.

Owner decision (2026-10-11): Haar Cascade detection and LBPH verification were replaced by YuNet and SFace after offline calibration on the LFW dataset, run through the DentiSys pipeline, showed LBPH accepted about 46% of impostor attempts at the provisional rule, and no LBPH threshold rejected impostors while passing genuine users reliably. The enrollment samples are combined into one averaged SFace template, which is the only retained facial reference. Existing LBPH references expire when the switch is deployed, their encrypted files are deleted, and enrolled users re-enroll. The SFace threshold and repeated-match rule MUST be calibrated so that no impostor attempt in the calibration set is accepted while at least 95% of genuine attempts pass on a good camera; the resulting numbers still require Owner approval.

Biometric processing MUST remain inside the same single-server DentiSys Docker deployment. The biometric component MAY be logically separable enough for future relocation, but this amendment does not authorize distributed architecture, Kubernetes, a cloud biometric provider, or multi-server deployment.

Normal enrollment MUST require 20 usable facial samples, and at most 30 usable samples MAY be accepted during one enrollment operation. Failed quality or liveness samples MUST NOT count. Raw enrollment samples MUST be discarded after protected-reference generation or an aborted enrollment.

The SFace matching threshold MUST be server-controlled. Calibration MUST use the actual DentiSys camera, preprocessing, and enrollment pipeline and consider false acceptance and false rejection. End users MUST NOT configure the threshold. One matching frame MUST NOT authorize attendance; repeated consistent matching is required.

Owner decision (2026-10-11): The approved face-matching values are a YuNet detection score of at least 0.9, a minimum face size of 120 pixels, a sharpness (Laplacian variance) of at least 60 on the aligned face, an SFace cosine similarity of at least 0.44, and at least 3 matching frames in one attempt of up to 30 frames. A frame counts only when exactly one face meets the score and size limits. In offline calibration on 200 LFW people (about 185 genuine and 555 impostor attempts per camera profile), these values accepted no impostor attempt and passed about 95% of genuine attempts on both the good-camera and older-phone profiles, counting attempts with too few clear frames as not passing. The LFW set cannot show error rates below about 1 in 1,000, and team re-enrollment and live genuine and impostor tests on the demo server still follow.

Owner decision (2026-10-13): To keep attendance quick, an attendance attempt uses one randomized action and 8 usable forward-facing frames plus the action frame; enrollment is unchanged. Replaying the 2026-10-11 LFW calibration with 8 usable frames accepted no impostor attempt and passed about 94% of genuine attempts (95% with 30 frames). The Owner accepts this for attendance, since a retry covers the difference, pending live testing on real cameras, which must also confirm that one action still resists printed photographs and on-screen replays.

Liveness/PAD MUST use randomized active challenge-response. Challenges MUST be server-generated, short-lived, and single-use. Each enrollment attempt MUST request two distinct randomized actions in randomized order from blink, turn head left, and turn head right. Each attendance attempt MUST request one randomized action from the same set. The browser MAY display the challenge but MUST NOT be authoritative for pass/fail. The DentiSys biometric component MUST verify the action sequence using temporary frames. MediaPipe Face Landmarker is approved only for landmark, transformation, and blendshape analysis used for liveness and MUST NOT replace YuNet detection or SFace verification. Raw liveness frames MUST NOT be retained.

Retained facial references (SFace embeddings) MUST be distinct from raw imagery and stored in dedicated biometric storage excluded from ordinary application/database backups. Protected facial reference data MUST be encrypted at rest using AES-256-GCM. The encryption key MUST be server-controlled and MUST NOT be committed to Git, stored in the ordinary database, exposed through APIs, or sent to browser clients. PostgreSQL MAY contain biometric-profile metadata and an opaque protected-object reference, but MUST NOT contain raw photos or an unprotected facial reference. For the current research deployment, loss or intentional replacement of the encryption key MAY invalidate protected references and require Student re-enrollment.

The following remain deferred and MUST NOT be invented or selected by implementation: numeric blink, head-pose, liveness, or timing thresholds; exact internal biometric service protocol; exact filesystem or volume layout; CPU/GPU sizing; future passive PAD; and advanced key-management, KMS, or key-rotation infrastructure.

The remaining deferred parameters require team research, technical validation, and later explicit Owner approval. Any future threshold MUST be selected through validation of the chosen technology and MUST NOT be configurable by Students, Faculty, Secretary, or Admin.

## BIO-008 — Devices, connectivity, mock isolation, and rollout

**Status: APPROVED**

**Implementation: research prototype implemented**

The target is desktop/laptop browsers, Android browsers/devices, and iOS browsers/devices. Students use their own devices. Where supported, they may select an available camera, including front or rear cameras. Verification requires connectivity to the deployed DentiSys service. There is no offline biometric queue or later local synchronization; if the service cannot be reached, manual attendance applies.

Docker remains the intended deployment model. No specific CPU/GPU is a product requirement, and the current research laptop is not a production requirement. The initial study supports classroom-scale use and multiple classrooms; school-wide event recognition is outside current scope. Verification SHOULD feel responsive, but no fixed maximum time is selected. Normal Faculty dashboard refresh is sufficient; live-update behavior is not required by this specification.

After the BIO-002 institutional privacy/consent review and the remaining technical approvals required by BIO-007 are complete, real biometrics is available by default. Student enrollment and use remain voluntary and require consent. A development biometric mock MAY remain only behind explicit development configuration. Mock and real enrollment MUST remain separate; real biometric failure or unavailable infrastructure MUST fall back to manual attendance and MUST NOT silently use the mock.

Owner decision (2026-10-09): For the DEL-001 VPS demonstration deployment only, real biometrics MAY be enabled before the BIO-002 review by explicit server configuration (`BIOMETRIC_SIDECAR_ENABLED=true`), so the DentiSys team can test it. It then behaves as in local development. Only DentiSys team members enroll (BIO-002 note). Without that setting, production-like environments keep real biometrics disabled.

Owner decision (2026-10-17): The production deployment is used only by the DentiSys team until BIO-002 is complete. Real biometrics stay off by default there and MAY be enabled manually with `BIOMETRIC_SIDECAR_ENABLED=true`; only team members enroll.

## BIO-009 — Audit, information minimization, and accepted limits

**Status: APPROVED**

Meaningful audit events MUST cover consent granted and revoked; enrollment started, succeeded, and failed; re-enrollment; verification failure (a successful verification is evidenced by the attendance-creation event); biometric revocation/deletion; attendance-session creation, timing/configuration changes, closure, and revocation; attendance creation; repeated attendance attempts where relevant; Secretary manual attendance; Faculty correction; Secretary Excused requests; Faculty approval or rejection; and relevant provider or configuration changes. An attendance-session revocation audit event MUST identify the actor and timestamp and MAY include the explanatory reason. Visibility, batching and display of these events follow SEC-005; the Dean sees consent changes and biometric deletions, not enrollment attempts or failed verifications.

Audit data MUST NOT contain face images, camera frames, templates, embeddings, provider secrets, credentials, precise Student GPS coordinates, or persistent similarity/confidence scores. An authenticated 1:1 verification failure MAY be associated with the claimed Student account. Biometric match results MUST NOT be persisted in browser storage or other persistent client-side storage.

The study aims to reasonably resist obvious photo, display, video, and replay attacks but does not promise to defeat credential sharing, sophisticated GPS spoofing, sophisticated deepfakes, or compromised Student devices. The design MUST preserve accessibility and MUST NOT make biometric attendance less practical than the manual alternative without later approval. Faculty retains final academic authority over attendance outcomes; a normal successful biometric attendance does not require Faculty approval inside DentiSys.

1:N identification, classroom-wide recognition, unknown-person identification, shared kiosk/classroom architecture, biometric login, biometric identity proofing, school-wide event face recognition, advanced GPS anti-spoofing guarantees, guarantees against all sophisticated deepfakes, and guarantees against compromised devices are outside the approved current implementation. Kiosk or classroom architecture may be future research only.

## BIO-010 — Secretary access to own Student self-service

**Status: APPROVED**

**Implementation: research prototype implemented**

A Secretary remains authorized under the Secretary role and enters the Secretary interface by default. That same account keeps all of the person's own Student self-service, including dashboard, classes, grades and retention, attendance, biometric enrollment, revocation, re-enrollment, and profile. The Secretary/Student switch is a sidebar toggle. No second account, second login, simultaneous-role redesign, role inheritance, or new account-linking mechanism is introduced. Secretary privileges MUST NOT permit enrollment for another Student. REG-006’s invitation and activation workflow remains unchanged.

## ATT-001 — Attendance-session authority

**Status: APPROVED**

**Implementation: research prototype implemented**

Faculty may start and manage attendance sessions only for classes they are authorized to manage. Secretary may start and manage sessions only for classes available through the authorized Secretary attendance role. Secretary authority does not grant unrestricted access to every class. Authorization MUST be enforced server-side.

Faculty-created and Secretary-created sessions use the same attendance-session functionality. Both authorized roles may configure the applicable opening time, Present cutoff, Late cutoff, geofence setting, session location, and radius. Session timing is interpreted in the application's `Asia/Manila` timezone; server time is authoritative, and browser/device clocks are never authoritative. The session creation timestamp does not determine when attendance opens.

Owner decision (2026-10-01): Faculty and Secretary may queue multiple sessions for today or a future Asia/Manila date, never a past date. Sessions open at the chosen date/time and reject attendance before opening. Overlapping sessions for the same class are rejected across both roles; the message identifies the existing date/time and the Faculty or Secretary who created it. End-time and absence-resolution rules remain unchanged.

Only open and scheduled sessions reserve a time period. Ending or revoking a session releases that period for another booking.

An authorized Faculty or Secretary may revoke an attendance session that they are authorized to manage. Revocation immediately closes biometric capture and prevents further attendance submissions. Already-recorded attendance is preserved, and unresolved attendance remains subject to the normal final attendance-resolution lifecycle rather than being automatically marked Absent by revocation. Revocation MUST be recorded in the audit trail with the actor and timestamp; an explanatory reason MAY be recorded. Revocation MUST NOT delete or rewrite existing attendance records.

When a session is created, eligible Students have an attendance state that remains unresolved until attendance is recorded or the attendance-resolution lifecycle resolves it; this requirement does not select a database representation.

Every session has a required class end time. It must be on the session day and at or after the Late cutoff.

A revoked session is treated as if it never happened. Its attendance records do not count toward attendance rates, attendance categories, transmutation, or reports. No student is resolved to Absent for it. The records and the revocation stay in history and audit.

Owner decision (2026-10-10): A scheduled session may be edited until it opens. Editable fields are the same as at creation except the class section: date, opening time, Present cutoff, Late cutoff, class end time, room, biometric and geofence settings, location, and radius. Faculty may edit scheduled sessions for classes they are authorized to manage, including sessions a Secretary created for that class. A Secretary may edit only scheduled sessions they created. Edits follow the creation rules for timing, past dates, and overlaps; a session does not overlap with itself. Active, ended, and revoked sessions cannot be edited. Each edit is recorded in the audit trail with actor, timestamp, and previous and new values. Editing does not create or change attendance records.

Owner-approved amendment (2026-10-12): In the current interface only Faculty edit scheduled sessions; the Secretary has no Edit action. The server rule above is unchanged.

Owner-approved amendment (2026-10-12): In the current interface the session date cannot be changed when editing; the edit form shows it read-only. The server rule above is unchanged.

Owner decision (2026-10-12): The edit form opens showing the session's saved values, never blanks or default values. An edit updates only what the user changed. Every field the user did not change (date, times, room, biometric, geofence, location, radius) keeps its saved value; for example, changing the room and turning on biometric leaves geofence as it was, and changing geofence and the room leaves biometric as it was. The edit form sends only the changed fields, and the server keeps the saved value of any field an edit does not send. Geofence starting off (ATT-002) applies only to new sessions.

Owner decision (2026-10-12): Every attendance session, created or edited, must have an opening time, Present cutoff and Late cutoff. A session without them is rejected.

## ATT-002 — Geofencing and location privacy

**Status: APPROVED**

**Implementation: research prototype implemented**

Owner decision (2026-10-12): Geofencing is off by default for new attendance sessions. Authorized Faculty or Secretary may disable it per session, select the session location on an embedded OpenStreetMap map, which can also center on the creator's current location, and configure the permitted radius. The default radius is 100 meters and radius values are configured and stored in meters. Only map tiles are requested from the tile provider; no Student data is sent to it.

Owner decision (2026-10-11): The radius MUST be between 50 and 2,000 meters inclusive when a session is created or edited; other values are rejected. The minimum allows for phone GPS error indoors, and the maximum is more than twice the widest span of the BU Legazpi West campus (about 790 m), so a session pinned anywhere on that campus can cover all of it while a mistyped radius cannot cover a whole city.

Student coordinates MAY be used temporarily to evaluate whether the Student is inside the permitted radius. Exact Student GPS coordinates MUST NOT be permanently stored and no Student location history may be created. Geofence passed/failed, configured session location and radius, and an audit timestamp may be retained. If enabled geofencing is denied or unavailable, automated biometric attendance cannot complete and manual fallback applies.

Owner decision (2026-10-12): Before the face capture, the Student's location is checked against the session location and radius, and the Student is told whether they are inside, how far they are from the session location and the allowed radius. A location fix is used only when its reported accuracy is no worse than the radius and at most 100 meters; otherwise the Student is asked to retry, and after two imprecise attempts is directed to the Class Secretary or Course Instructor for manual attendance. The server repeats the check at submission. Coordinates and accuracy are not stored.

## ATT-003 — Attendance timing and final absence resolution

**Status: APPROVED**

**Implementation: research prototype implemented**

A successful biometric attendance during the configured Present window produces Present. The Present window begins at the configured opening time and ends immediately before the configured Present cutoff.

A successful biometric attendance during the configured Late window produces Late. The Late window begins at the Present cutoff and ends immediately before the configured Late cutoff. The configured times are interpreted in `Asia/Manila` using authoritative server time. For example, a session created at 06:00 may open at 08:00, accept Present attendance until 09:00, and accept Late attendance from 09:00 until 12:00. The creation timestamp does not determine the attendance windows.

At the configured Late cutoff, biometric capture closes. Students cannot submit biometric attendance before the opening time or after capture closes, and the UI directs them to Secretary or Faculty. A Student with no resolved attendance remains unresolved; capture closure or session revocation MUST NOT itself automatically create Absent. When the class end time passes, the session ends automatically. Every eligible student with no attendance record is then resolved to Absent. An authorized Faculty member or Secretary may also end the session earlier.

A later authorized correction may change Absent to Excused or another authorized status. A Student may pursue that correction through the existing authorized Faculty/Secretary correction and Excused workflows; this amendment does not create a new Student-facing in-system dispute workflow. Biometric closure, session revocation, and final attendance resolution are separate events.

Owner decision (2026-10-22): A scheduled session that nobody opened still ends at its class end time and resolves every Student without a record to Absent.

## ATT-004 — Unresolved attendance and grading

**Status: APPROVED**

**Implementation: research prototype implemented**

While attendance is unresolved, attendance-dependent grading and transmutation remain pending. GRD-001 MUST consume a resolved attendance status and MUST NOT infer Absent or zero merely because an attendance record is missing or unresolved.

Once attendance resolves, the existing approved GRD-001 behavior applies. Later authorized corrections MUST affect subsequent effective-grade computation without changing the stored raw score. One attendance session may link to multiple assessments where existing class, date, and session-code rules allow it. GRD-001’s formula and unrelated grading rules remain unchanged.

Owner-approved amendment (2026-10-22): In the attendance part of a grade, Late counts the same as Present (100); Excused is also 100 and Absent 0.

## ATT-005 — Duplicate prevention and attendance provenance

**Status: APPROVED**

**Implementation: research prototype implemented**

Each Student has one authoritative attendance result per attendance session. A successful biometric verification is valid only for one active attendance session/request and MUST NOT be reused for another request or session. A later successful attempt in the same session returns an understandable already-recorded outcome and creates no duplicate authoritative attendance row. Repeated attempts may be audited.

Biometric verification and attendance are separate concepts. Attendance preserves how it was established, such as biometric, Faculty manual, or Secretary manual. Correcting attendance MUST preserve the original biometric outcome and the correction history. Revoking or deleting biometric material MUST NOT delete legitimate historical attendance; historical attendance may retain its verification method without retaining biometric material.

## ATT-006 — Manual correction and Excused workflow

**Status: APPROVED**

**Implementation: research prototype implemented**

Successful automated biometric attendance requires no Faculty approval. Faculty may directly correct attendance through authorized attendance-management functionality.

Secretary retains authorized ordinary manual attendance functionality. When a Student contacts the Secretary about an excuse, the Secretary may submit an Excused request in DentiSys; only Faculty may approve or reject that request. Secretary MUST NOT finalize Excused through a generic manual override. A rejection leaves the current attendance status unchanged. When a Student contacts Faculty directly, Faculty may apply an authorized correction directly.

For attendance rates, Excused counts as attended.

Owner-approved amendment (2026-10-22): A Secretary cannot change an attendance record whose Excused status comes from a Faculty-approved Excused request; the Secretary attendance list shows "Approved by Faculty" instead of the override action, and only Faculty can change it. In attendance rates, Late counts as attended, the same as Present.

Owner decision (2026-10-28): Every Secretary manual attendance change — a first mark (Present, Late, Absent, Excused) or a change to an existing record — is a request that only the class's Faculty may approve or reject. Until approved, the record stays as it was. Biometric check-ins still need no approval. When the session ends, a student whose request is still pending is resolved to Absent like any unrecorded student; a later approval changes that record. Faculty review these requests in the existing Excused requests panel, which lists every Secretary request type.

Students contact Secretary or Faculty outside DentiSys. Current scope has no Student-facing in-system excuse or dispute submission, no supporting-document upload requirement, and no specified dispute deadline. Manual correction audit MUST preserve the old status, new status, actor, timestamp, reason where applicable, and the original biometric outcome.

## ATT-007 — Student upcoming sessions

**Status: APPROVED**

Students see scheduled and open attendance sessions for their own active class enrollments on the Daily Attendance page. By default this covers today and the next 7 days, with an option to view all upcoming sessions. Revoked and ended sessions are not listed. Times are shown in Asia/Manila; countdowns use server time, are informational only, and never decide attendance. Listing a session does not change attendance eligibility or timing. On Daily Attendance, "Take attendance" on an open session starts the check-in for that session and scrolls to its location or camera step; if face registration is not active, it asks the student to register their face, with an option to cancel.

## DEL-001 — Image publishing and deployment

**Status: APPROVED (demonstration scope)**

Owner decision (2026-10-09): A demonstration deployment on one cloud VPS is approved for testing by the DentiSys team and invited volunteer Faculty and Students. It is not a production deployment and not the BIO-002 real Student deployment.

Owner decision (2026-10-14): Two VPS environments. **Demo** (this DEL-001 deployment): Claude builds and pushes `:demo` images through a dedicated GitHub bot account that can write only the demo image packages, and may operate the demo VPS, including a loopback-only test entrance reached by SSH tunnel. **Production**: a separate VPS set up with the same scripts and hardening, running separate image packages (`dentisys-*-prod`, tag `:prod`). Production images are never rebuilt: after the Owner and Claude both approve the demo, the Owner promotes the exact demo images of the approved commit with one script. Claude has no access to the production VPS, its credentials or the `-prod` packages. Production keeps real biometrics disabled until the BIO-002 review and pgAdmin off by default.

Approved infrastructure, and nothing beyond it:

* Traefik as the only public entry point (ports 80 and 443), with HTTP redirected to HTTPS and Let's Encrypt certificates for one hostname (initially a DuckDNS name; changing the hostname needs no amendment).
* Application images (web, frontend, biometric) published to GitHub Container Registry under the Owner's account, built and pushed by the Owner from a tested commit. No CI/CD pipeline.
* Watchtower updating only the labeled DentiSys application containers. A release that adds database migrations MUST be deployed with the deploy script or the database sync script, each of which backs up the database before migrating; Watchtower alone MUST NOT be relied on for such a release.
* A deploy script, a nightly PostgreSQL backup that the Owner can copy off the server, host firewall guidance (SSH, 80, 443 only), a runbook, and an optional host hardening script that applies the Owner's hardening guide (steps 1–6) exactly as written, except that the AWS key replaces `ssh-copy-id` and the sudo account (`devops` by default) keeps a forwarding exception limited to the pgAdmin and Mailpit loopback ports.

PostgreSQL, Mailpit and the biometric component stay internal to Docker. pgAdmin runs on the VPS by default for demonstration and verification, and can be switched off in the server environment (`PGADMIN_ENABLED=false`). It is bound to the server's loopback address and reached only through an SSH tunnel. The Mailpit UI, which runs only when `EMAIL_PROVIDER=custom`, is reached the same way. Neither is exposed through Traefik or any public port. Secrets live only in the server's environment file, never in Git or in images. Separate application/database servers, Kubernetes, other cloud services and public database access remain out of scope.

Do not add other cloud infrastructure, TLS, deployment automation, registry configuration, CI/CD, or related infrastructure unless explicitly scoped and approved.

A development-only, self-signed HTTPS mode for testing on phones over the local network is permitted. It is not deployment TLS and does not authorize deployment infrastructure.

---

# 9. Open Decisions

An **OPEN** item cannot be resolved by an agent without Owner input.

Only add an item here when an implementation is blocked by a real unresolved product decision or an explicitly deferred technical selection requiring Owner approval.

Do not invent speculative open questions.

Current open decisions and deferred technical selections:

* BIO-007: numeric blink, head-pose, liveness, and timing thresholds; exact internal biometric service protocol; exact filesystem or volume layout; CPU/GPU sizing; future passive PAD; and advanced key-management, KMS, or key-rotation infrastructure.

These technical items remain unresolved. Listing them does not select or approve any technology. The biometric product requirements in §8 are approved.

---

# 9A. Contract Boundaries

## ACA-002 - Dean-defined academic terms
**Status: APPROVED**

Owner decision (2026-10-10): The Dean (Admin) defines academic terms. A term is a school year plus a semester (`1ST`, `2ND` or `Summer`) with a start date and an end date. The end date MUST be after the start date; each school year and semester has at most one term; terms in the same school year MUST NOT overlap. Dates are calendar dates in the operational timezone (Asia/Manila), and a term ends at the end of its end date. The Dean may copy the previous school year's terms, shifted by one year, and then adjust them. A term used by any class MUST NOT be deleted. Every term change is audited.

Faculty may create a class only in a Dean-defined term of the current school year (CLS-002); the class's semester and school year come from that term. Existing classes link to the term with the same semester and school year. A class's own stored term dates apply only when no matching Dean-defined term exists.

When the term containing today will end within 14 days and the following term has no dates, the Dean dashboard shows an in-app reminder to define it. No email is sent.

Biometric enrollment expiry (BIO-005) is the latest term end date among the Student's active classes. When the Dean changes a term's end date, unexpired enrollments for that term follow the new date. If the new end date has already passed, the Dean sees how many enrollments will expire before saving, and those enrollments expire at the next expiry run. Enrollment is refused when the Student's active classes have no term or every one of those terms has ended.

## CLS-001 - Faculty class-section editing
**Status: CURRENT**

Faculty may edit authorized class-section fields through audited server-side APIs. Course catalog identity and protected term identity remain controlled; Faculty class-section editing MUST NOT change the course identity, semester, or school year. Lecture-room, laboratory-room, and schedule concepts remain distinct.

Owner decision (2026-10-01): Each lecture/laboratory meeting stores its weekday, start time and end time separately; different days may use different times. Existing schedules are preserved.

Owner decision (2026-10-13): Saving a class schedule is blocked when one of its meetings overlaps, on the same weekday, a meeting of another active class section in the same school year that either uses the same room (any Faculty) or has the same instructor (any room). A meeting that starts exactly when another ends does not overlap. Rooms have their own schedules, and an instructor cannot teach two classes at the same time.

## ID-001 - Split Student identity
**Status: CURRENT**

Canonical Student identity stores first name, optional middle name, and last name as separate persisted fields. APIs may expose a compatibility display name, but MUST NOT persist or overwrite the entire name as one Student field.

## ACA-001 - Server-authoritative academic decisions
**Status: CURRENT**

Retention and grading decisions remain server-authoritative through the existing backend APIs. Client-local state, fabricated grades, and fallback subjects MUST NOT become authoritative academic decisions.

---

## IMP-001 - Provisional Student roster imports
**Status: APPROVED**

Faculty may import Student roster records into an existing assigned current-year
class using a provisional supported layout.
Preserve complete Student numbers and supplied identity/contact values. Do not
invent missing emails or year levels, silently resolve ambiguous name splits,
overwrite existing Student identities, or create classes from imported headers.
Require preview and target-class confirmation before saving. Flag possible
crossed-out rows and leave them unselected until reviewed; marking detection is
best effort and the Faculty must review the source. Resolve existing Students
through server identities and preserve permissions, historical-class restrictions,
audit history, account eligibility and separate invitation authority. Process the
original file locally and send only selected Student fields to existing APIs.
Owner decision (2026-10-26): The BU College of Dental Medicine "Official List of Enrolled Students" PDF and the official grade sheet workbook (.xlsx) are the official import layouts. Faculty upload them unchanged; DentiSys adapts to them. Owner decision (2026-10-28): imports are confirmed; no import file shows an "Official format not confirmed" label. Grade sheet import saves raw scores only, never computed grades, through the existing score rules; it never changes Grade Weights, never turns a blank into zero, and never overwrites a saved score without the Faculty's confirmation. File headers are checked against the selected class and differences are warnings. Owner decision (2026-10-27): When no existing class of the Faculty matches the official class list's course code, section, school year and semester, the Faculty may create the class from the file inside the roster import. The header prefills the Create Class fields (course, section, year level, Lecture and Laboratory units, Dean term and meetings); the Faculty confirms or corrects every field before saving, and Create Class validation applies. A matching existing class is offered instead of creating a duplicate. Owner decision (2026-10-28): The Academic term defaults to the Dean-defined term matching the file header when one exists. The Faculty may select a different Dean-defined term to correct a misread year or semester. Creating a class requires selecting a Dean-defined term in the current school year; class creation is blocked while the selected term is in a past school year. The selected term determines the new class school year. Importing into an existing class is unaffected. Detailed rules: docs/contracts/official-imports.md.

Each selected import row MUST supply a complete Student number, first name,
last name and a valid institutional email from the server-configured allowed
domains. Extract supplied emails from supported source files; missing or
invalid emails MUST block that row until corrected in preview. Never fabricate
an email or overwrite an existing Student's email; invitation sending remains
a separate authorized action.

# 9B. UI and normalized-data amendment - 2026-09-24

**Status: APPROVED by the Owner's explicit request to amend the specification using UI Changes.pdf. Implementation pending.**

## UI-001 - Canonical interface and priority

**Status: Implemented.** The `owhie_backend` interface migration and the related normalization are complete (`a7582d8`). Later interface changes are governed by the requirement that covers them.

The complete `owhie_backend` interface is the visual and interaction baseline to migrate into `lighthal5`, supplemented by the nine-page `UI Changes.pdf`. This replaces earlier visual baselines and functional-first priorities. Scope includes every role, route, navigation item, form, table, dialog, style, asset, and responsive state, not only the illustrated screens.

Owner decision (2026-10-13): Below 1280 px wide (phones, tablets and small laptops), every control, card and text MUST stay inside its box, and columns and data formats MUST match desktop: never merged, reordered or dropped. Desktop (1280 px and wider) keeps its layout. When the user has not chosen, the sidebar starts collapsed to icons on screens 768-1023 px wide; a saved open or collapsed choice wins.

Delivery order is (1) copy the entire UI, (2) normalize the database to third normal form and support the UI's data, (3) connect frontend and backend and repair regressions. Tests may fail during intermediate UI migration; retain the failures as tracked work. Visual parity is not functional completion or proof of persistence.

The source branch defines the interface, not automatic approval of its backend semantics. Explicit requirements below govern PDF/source differences. Unaffected authentication, permissions, privacy, history preservation, Docker/PostgreSQL, and authoritative-data rules remain in force. Unresolved behavior remains OPEN.

## UI-002 - Score entry, deadlines, and weights (PDF pages 1-3)

Provide Single Activity View and Full Matrix View, including course/class filters, for entering one activity or multiple student/activity scores. Both ultimately use the same authoritative score records.

Owner decision (2026-10-13): Below 1280 px wide, Full Matrix View shows a Pin switch (Full Name, or ID Number + Full Name; default Full Name) that keeps the chosen student columns at the left edge while the matrix scrolls sideways. ID Number and Full Name stay separate columns. At 1280 px and wider the switch is hidden and the matrix is unchanged.

Allow a blank due date for activities without a deadline. The Owner clarified on 2026-09-24 that activity due dates MAY overlap, including multiple activities in one class and activities across classes, Faculty, and courses. This corrects the PDF's no-overlap instruction; no collision restriction or uniqueness constraint applies to due dates. A blank due date is allowed; GRD-001's optional attendance link is unaffected.

Explain overall Midterm/Final contributions and each period's category weights clearly, identify the target offering, and show totals. Preserve GRD-002's calculation, saved-configuration, and 100% validation rules; screenshot examples do not override saved values.

## UI-003 - Watchlist and retention (PDF pages 4 and 6)

The Midterm Watchlist stays locked while the applicable student's midterm grades are incomplete and becomes accessible when complete. Authorized Faculty may manually unlock it for every student in the selected class, as clarified by the Owner on 2026-09-24. Unlocking changes visibility, not missing grades or academic completeness. Persist the class, actor, and timestamp; do not unlock another class implicitly.

Retention uses final grades, scores, and applicable approved BUCDM policy. Clickable Policy Status displays the student's current stage and progression through the BUCDM retention flow. Distinguish midterm warning from final retention decisions. Do not approve numeric thresholds or policy tracks solely from screenshot examples; unresolved policy-to-stage mapping must be clarified before authoritative wiring.

Owner decision (2026-09-28): For the professional-course final-grade trigger, 1.0 is best. The authoritative final grade is compared at its established precision, without rounding to one decimal first. A final grade below 2.50 passes, including 2.40-2.49. A final grade of 2.50 or worse requires remediation. This course-grade trigger is distinct from the remedial-exam percentage passing threshold. This trigger is fixed college policy. It is not an Admin setting and changes only by amending this specification. Missing or incomplete grades remain unresolved, and this clarification does not create a separate warning band or authorize any other unanswered BUCDM policy decision.

Owner-approved amendment (2026-09-26): Each of the first two remedial exams passes at 50% or higher. Failure of the first permits the second; failure of the second requires cost recovery. Remedial outcomes do not replace the original course grade. DentiSys records the first and second attempts separately, derives Pass/Fail from the stored percentage, and does not offer a third remedial attempt. Cost-recovery scoring, completion, and final-failure rules remain outside this amendment. The 50% remedial pass mark is the current policy and may change later by amendment.

Owner decision (2026-09-29) — Risk levels (Faculty Retention Monitoring and Midterm Watchlist): Risk shows how close a student is to needing remediation. It is recalculated for the current grading period (Midterm, or the running overall grade after Midterm): (1) take the student's completed assessments in the period; (2) add assumed future assessments one at a time, each the size of the student's average completed assessment in that period and scored 75%, a below-passing score (80% or below); (3) count how many are needed before the period grade reaches 2.50 or worse. High = 1-2 assumed assessments, or the grade is already 2.50 or worse; At Risk = 3-4; Low = 5 or more. Risk is informational and never creates remediation. Warning and Critical remain separate, manually set retention states. The assumed score and the bands are current policy and may change by amendment.

Owner-approved amendment (2026-10-03): The Student midterm advisory uses the existing server-calculated Faculty Midterm Watchlist risk projection. High and At Risk results show an informational advisory; Low does not. Missing or insufficient assessment data remains Pending/Unavailable. A manual watchlist unlock changes visibility only. This advisory never assigns remediation or changes the final-grade 2.50 trigger.

Owner-approved amendment (2026-10-12): The Faculty Midterm Watchlist has no lock and no manual unlock. It lists students whose midterm grades are complete, who have no final course grade yet, and whose exact midterm grade is 2.50 or worse. A student leaves the list once a final course grade exists. At-risk students are listed first. The badge shows the server risk level when available; otherwise High if the exact midterm grade is 3.00 or worse, else At Risk. This supersedes the 2026-09-24 lock/unlock rule. The Student advisory (2026-10-03) and the risk levels (2026-09-29) are unchanged.

Owner decision (2026-10-09, provisional pending BUCDM confirmation): A percentage converts to the 1.00–5.00 grade by linear interpolation between 97% = 1.00, 94% = 1.25, 91% = 1.50, 88% = 1.75, 85% = 2.00, 82% = 2.25, 80% = 2.50, 78% = 2.75 and 75% = 3.00. 97% or more is 1.00; below 75% is 5.00. Server and client use the same conversion. Grades are stored and displayed rounded to two decimals, but the 2.50 remediation trigger and risk levels compare the exact unrounded grade, so rounding never creates a remediation flag. Only 80.00% or below reaches 2.50.

Owner-approved amendment (2026-10-12): Calculations keep exact values through every step: category, period, course percentage and grade. Only the final course percentage and grade are rounded to two decimals for storage and display. Wherever a grade is shown, hovering, focusing or tapping it shows the exact grade and percentage.

Owner-approved amendment (2026-10-17): BUCDM grade conversion. This replaces the provisional 2026-10-09 conversion. A percentage is first truncated to a whole percent (84.9% → 84%). Then: 99–100 = 1.0, 98 = 1.1, 97 = 1.2, 96 = 1.3, 95 = 1.4, 94 = 1.5, 93 = 1.6, 92 = 1.7, 91 = 1.8, 90 = 1.9, 89 = 2.0, 88 = 2.1, 87 = 2.2, 86 = 2.3, 85 = 2.4, 84 = 2.5, 82–83 = 2.6, 80–81 = 2.7, 78–79 = 2.8, 76–77 = 2.9, 75 = 3.0 (passing). Below 75%, a Midterm grade is 3.1 at 74%, worsening 0.1 per percent to 4.0 at 65% and below; a Final or overall course grade below 75% is 5.0. Server and client use the same conversion. The 2.50 remediation trigger is unchanged and now means 84% or below. In the 2026-09-29 risk levels, "80% or below" becomes "84% or below". Final grades saved in closed school years stay as recorded; current-term grades use this conversion when next computed or saved.

Owner-approved amendment (2026-10-22): Grade rounding follows University policy. The course percentage is rounded to two decimals first, and that rounded value is truncated to a whole percent for the conversion (74.995% → 75.00% → 75% → 3.0). A stored course grade is recomputed automatically, in the same save, when Faculty delete an assessment, save the grading setup of that class, or re-enroll a previously unenrolled Student; a re-enrolled Student keeps their earlier scores and remedial history and their grade and retention status are recomputed from them. Past school-year classes are not recomputed. The Dean report flags a failing retention by the recorded course grade, not by re-converting the percentage with the current table.

Owner-approved amendment (2026-10-26): Official BUCDM grade sheet calculation. The Dean's official grade sheet is the calculation authority for every Faculty. For current-term grades it replaces the exact-value rule of 2026-10-12, the truncation and Midterm below-75% rule of 2026-10-17, and the rounding rule of 2026-10-22. (1) A category percentage is the plain average of its assessments' effective percentages (GRD-001 transmutation applies per assessment); maximum points do not weight the average. (2) A component's period grade is the weighted sum of its category percentages, rounded to a whole percent (.5 rounds up). (3) With Lecture and Laboratory, a period grade is round(Lecture period grade × Lecture share + Laboratory period grade × Laboratory share), and the course grade is round(round(Midterm × Midterm share) + round(Final × Final share)). (4) A whole percent converts with the 2026-10-17 table (99–100 = 1.0 … 75 = 3.0); below 75% is 5.0 for Midterm, Final and course grades. (5) Hovering, focusing or tapping a grade shows its steps, e.g. "83.77% → 84% → 2.5"; this replaces the 2026-10-12 hover sentence. (6) Unchanged: a missing score keeps the dependent grade incomplete and never becomes zero; the remediation trigger is 2.50 or worse (84% or below); the Midterm Watchlist and Advisory use these grades; grades saved in closed school years stay as recorded. At release, every current-term course grade is recalculated once with these rules as one audited batch. Lecture-only courses are out of scope until added by amendment.

Owner-approved amendment (2026-10-17): Midterm Watchlist and Advisory. Faculty see "Midterm Watchlist" and Students see "Midterm Advisory". Both flag a student only when every Midterm assessment is graded, no final course grade exists, and the Midterm grade, using the professor's Midterm category weights and lecture/laboratory split, is 2.5 or worse. The projected risk level no longer flags a student before the Midterm is complete; it stays as the badge on a flagged student. This supersedes the 2026-10-03 advisory rule.

Owner-approved amendment (2026-10-17): Risk has no levels. A student is either At Risk or not flagged; High, Low and other risk levels are not shown. A flagged student on the Midterm Watchlist or Midterm Advisory shows At Risk. The assumed-assessment projection (2026-09-29) is retired, and the Retention Watchlist has no Risk column. Reports show At Risk or nothing instead of risk levels. This supersedes the 2026-09-29 risk levels, the 2026-10-12 badge rule, and the badge sentence of the 2026-10-17 Midterm Watchlist amendment.

Owner-approved amendment (2026-10-17): Computed retention only. Retention status comes only from system calculations: Active, Remedial (final grade 2.50 or worse), Cleared, and Archived. Faculty cannot set or override it by hand. Warning and Critical are retired. Existing manual overrides revert to the computed status; the audit log keeps their history. The Admin At-Risk Count is students who are Remedial or At Risk on a Midterm Watchlist. This supersedes the manual override rules and "Warning and Critical remain separate, manually set retention states".

Owner-approved amendment (2026-10-17): The midterm tab ends with the term. Per course, once a final course grade or any remedial record exists, the course leaves the Midterm Watchlist and Midterm Advisory; it appears on the Retention Watchlist only if it is Remedial. Other courses still in their Midterm are unaffected. Student and Faculty dashboard midterm counts use the same rule as the midterm tabs.

Owner decision (2026-10-12): In Single Activity View, an Auto-save toggle controls automatic saving. Owner decision (2026-10-17): When it is on, scores save after 10 seconds without typing, and also when Faculty switch assessment or view, leave the page, or press Save; when it is off, only the Save button saves. Full Matrix View always auto-saves the same way. Clearing a saved score is applied only by a manual Save (Save Scores Sheet or Save All Matrix Scores); until then the field is highlighted in amber and the Save button shows "(N to clear)". A save requested while another save is running runs right after it, and a manual Save stays manual. The browser warns before Faculty leave the page with unsaved or failed scores, including during the 10-second wait.

Owner decision (2026-10-12): The Single Activity View Auto-save setting is remembered in this browser across page reloads; it starts on until Faculty change it.

Owner decision (2026-10-12): In Single Activity View, switching assessment, class or course while scores are unsaved (Auto-save off, or a cleared saved score awaiting Save) asks "Discard unsaved scores?"; Cancel keeps the current assessment and its typed scores.

Owner decision (2026-10-12): Changing the period or category filter so the current assessment leaves the list asks "Discard unsaved scores?" while scores are unsaved; Cancel keeps the filter. The search box never switches the assessment while scores are unsaved; the current assessment stays selected and is listed as "Current:".

Owner decision (2026-10-12): The save chip next to Save Scores Sheet and Save All Matrix Scores shows the save state: "Saving...", "Save failed", "Unsaved changes" or "All changes saved".

Owner decision (2026-10-12): In Single Activity View and Full Matrix View, auto-save saves every valid score and holds back only scores that are negative or over the assessment maximum; those stay red and unsaved until fixed. A manual Save still refuses while any score is invalid.

## UI-004 - Email and invitations (PDF pages 5, 7-8)

All email-entry controls default to `@bicol-u.edu.ph`, allowing local-part-only entry. Complete existing addresses and other server-allowed domains remain supported under AUTH-004. Preserve addresses and prevent duplicated suffixes; this default does not impose a single-domain restriction.

Faculty invitations follow the PDF's structured name fields, institutional email, clear send action, searchable status, and supported lifecycle actions. The Owner's five-part name requirement below supplements the screenshot's subset. Invitation authority, activation, password, and MFA rules remain unchanged.

## UI-005 - Attendance and Secretary context (PDF pages 7-9)

Adopt the source Attendance Monitoring interface, consolidating Start Attendance Session and Session History within it, with class and relevant attendance filters. Reproduce the Secretary/Student toggle and reduced sidebar. The toggle retains the same account and canonical Student identity under BIO-010; it grants no new role or access to another Student.

Use the source start-session presentation with PDF-directed improvements. Existing ATT rules still govern timing, geofence, ownership, correction, history, and Excused approval. A source delete/relaunch control does not authorize erasing attendance history or reusing verification.

Owner decision (2026-10-10): Attendance Monitoring separates session management from student records. A Sessions view shows the live session, upcoming sessions with Edit and Revoke, and past sessions, plus a "New attendance session" action placed apart from every session list. A Roll call view shows student attendance for a selected session. The Secretary uses the same structure. Session timing may be entered with quick choices or custom values that keep the window lengths when the opening time changes, and exact times are always available; timing validation is unchanged.

Owner-approved amendment (2026-10-12): Attendance Monitoring shows an Assigned Classes grid and a Worksheet for the selected class. A session modal has two tabs: Current Session, and Upcoming Sessions with countdowns. There is no past-sessions list. Session timing uses exact times only; quick choices are removed. The Secretary sees the same layout in the blue palette. Timing validation and the other ATT rules are unchanged.

## CLS-002 - Current-year creation and historical classes (PDF page 9)

Faculty may create classes only for the current school year. Past-school-year classes are view-only: Faculty cannot edit them, add students, or perform other mutations through those historical class surfaces. This narrows CLS-001's editing permission to eligible current-year classes. Obtain the current year from authoritative configuration, not the browser clock. The Owner selected 2026-2027 as the current school year on 2026-09-24. Any historical correction exception requires a separately approved rule. Class creation additionally requires a Dean-defined term (ACA-002).

## CLS-003 - Class archiving

Owner decision (2026-10-22): Faculty may archive a current-school-year class section they teach. No other role may archive or restore a class section for now.

Archiving requires one reason: Finished, Cancelled, or Created by mistake. Past-school-year class sections are archived automatically as Completed when the school year ends; Faculty cannot archive, restore, or change the reason of a past-school-year class section. A class archived as Finished is also shown as Completed.

Completed class sections remain visible to their Students with grades, attendance, and remedial history, under past or archived classes. Cancelled and Created-by-mistake class sections are hidden from Students and Class Secretaries and are excluded from attendance, retention monitoring, and Dean reports.

Every archived class section is view-only under the same rules as historical classes (CLS-002). Archiving never deletes or changes enrollments, scores, grades, attendance, remedial records, or audit history.

Archiving is refused while an attendance session for the class section is open. A class section with a pending remedial may be archived only as Finished.

Faculty may restore a class section they archived during the current school year. Restoring returns it to an active, editable class section. Archiving and restoring are recorded in the audit log with the actor, the class section, and the reason.

Faculty Classes & Rosters separates Active and Archived class sections. The Archived view shows Completed class sections apart from Cancelled and Created-by-mistake ones.

Owner decisions (2026-10-22, CLS-003 contract): Remedial and cost recovery results remain recordable for a class section archived as Finished. Archiving revokes the class section's scheduled attendance sessions and ends its Class Secretary appointment; restoring brings back neither. Enrolled Students are notified when a class section is archived as Cancelled and when such a class section is restored. Finished may be chosen at any time in the current school year. Cancelled and Created-by-mistake class sections appear to Faculty only in the Archived view and the audit log.

## ID-002 - Structured names and 3NF

Extend ID-001 to applicable person and invitation records: persist Prefix, First Name, Middle Name, Last Name, and Suffix separately. Prefix, Middle Name, and Suffix may be absent. Compose display names from those fields rather than maintaining another independently editable identity. Preserve canonical links across accounts, Students, Secretaries, Faculty, and invitations.

Normalize affected persistent data to 3NF: atomic attributes, declared candidate keys, no partial dependencies on composite keys, and no transitive dependencies of non-key attributes. Name splitting alone does not establish 3NF. Inventory the complete UI's composite inputs and repeated facts; separate entities and relationships according to their functional dependencies. Do not split arbitrary text or add lookup tables without a real domain relationship.

Use additive ordered migrations and explicit backfill/compatibility handling. Never guess an ambiguous legacy name split: preserve the original for reconciliation. Preserve identifiers, enrollment, raw scores, grades, attendance, audit history, and persisted volumes. No database reset or destructive cleanup is approved.

**Self-service name changes.** Each role (Dean, Faculty, Secretary, Student) changes only its own five-part name, from its own profile, through a dedicated Change Name action; the rest of the profile is read-only. When authenticator-app MFA is enabled, a current authenticator code is required before the change is saved; recovery codes are not accepted for this confirmation, and failed attempts are rate limited. Self-service requests that include institutional email, account ID, role, Student number, institutional identifiers, class or Faculty assignments, or other relationship-critical keys are rejected rather than ignored; those remain changeable only through the authorized role's own management tools. After a Student account is activated, Faculty can no longer change that Student's name; before activation, Faculty may still correct it.

---

# 10. Specification Change Protocol

Before changing behavior governed by this file:

1. Identify the affected specification ID(s).
2. Determine whether the request is compatible.
3. If compatible, preserve all unaffected rules.
4. If incompatible, STOP and request an Owner decision.
5. Show the exact proposed `spec.md` amendment.
6. Apply the amendment only after explicit Owner approval.
7. Then implement the approved behavior.

No coding agent may autonomously update `spec.md`.

A new feature is not complete if its approved behavior contradicts this specification.

---

# 11. Current Specification Supersessions

Upon Owner approval of this specification:

* Any roadmap statement describing Google as a **replacement** for password authentication is superseded.
* The approved direction is **password authentication + Google Sign-In**.
* Faculty and Student account establishment MUST require an authorized invitation and DentiSys password.
* Google may be linked only after activation (REG-003); it MUST NOT provide invitation authority or enable public signup.
* Google-linked users MUST retain email + password login capability.
* The previous BIO-001 placeholder wording, insofar as it left biometric product requirements unresolved, is superseded by BIO-001–BIO-010 and ATT-001–ATT-006. Those product requirements and boundaries are approved and implemented as a research prototype; the numeric thresholds and other technical selections listed in BIO-007 and §9, and the BIO-002 institutional review, remain deferred.

Affected roadmap/documentation should be aligned before or together with implementation of Google authentication.

---
