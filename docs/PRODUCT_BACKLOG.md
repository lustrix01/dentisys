# DentiSys Product Backlog

> **Status:** Living Owner-approved product backlog  
> **Canonical visual baseline:** `c58d3004db20280c8827dd10893e9c1058be2eaa` — `Restore canonical UI parity`

---

# 1. Development Ownership Rules

## Agent responsibilities

### Gemini — Frontend Owner

Gemini handles frontend work only:

- React
- TypeScript
- client-side UI behavior
- frontend API consumption
- forms
- tables
- modals
- responsive behavior
- canonical DentiSys visual integration

Gemini must not modify:

- PHP backend code
- backend routes/controllers/services
- PostgreSQL
- migrations
- server-side authorization
- server-side business rules

If frontend work requires backend support, Gemini must produce a precise backend requirement for the Gatekeeper rather than implementing it.

### Codex — Backend Owner

Codex handles backend and authoritative data only:

- PHP
- API endpoints
- server-side validation
- authentication/authorization
- RBAC
- audit logging
- PostgreSQL
- migrations
- database constraints
- authoritative data
- bootstrap/development data sets

Codex must not redesign or implement React/UI to complete a backend feature.

It must return the resulting API/data contract to the Gatekeeper so Gemini can integrate it.

### Gatekeeper

The Gatekeeper coordinates frontend/backend work.

Cross-layer features should follow:

1. Product behavior approved by Owner.
2. Backend contract scoped for Codex when needed.
3. Codex implements and validates backend.
4. Gatekeeper reviews the resulting contract.
5. Gemini integrates the frontend against that contract.
6. Automated and live browser validation.
7. Owner/Gatekeeper approval.

Neither implementation agent should independently redefine behavior owned by the other layer.

---

# 2. Change-Control Note

This backlog is **not exhaustive**.

The Owner may:

- add requirements;
- clarify requirements;
- remove requirements;
- change priorities;
- discover missing workflows;
- identify defects during manual testing.

This is expected.

Implementation agents must not treat this backlog as permission to infer unspecified product behavior.

When a meaningful product decision is unclear:

**Return the decision to the Owner through the Gatekeeper.**

Do not guess.

Avoid overengineering.

Prefer the smallest implementation that satisfies the approved requirement and preserves current functionality.

---

# 3. Canonical UI Rule

Commit:

`c58d3004db20280c8827dd10893e9c1058be2eaa`

is the protected DentiSys visual baseline.

Future frontend work must reuse:

- shared authenticated shell;
- existing sidebar/header architecture;
- canonical Card components;
- existing table styles;
- existing modal patterns;
- existing alerts;
- existing form/input styling;
- current typography;
- role colors;
- spacing;
- responsive drawer/navigation behavior.

Do not create:

- alternate role-specific shells;
- a second design system;
- custom page architecture that visibly diverges from DentiSys;
- unrelated visual redesign while implementing functionality.

New features must fit the existing UI.

---

# 4. Authoritative Data Rule

All authoritative application/business data must come from:

**Backend + PostgreSQL**

Browser-local state, hardcoded arrays, and mock fixtures must not act as production/runtime business truth.

This includes:

- users;
- names;
- courses;
- class sections;
- enrollments;
- Faculty assignments;
- Secretary assignments;
- invitations;
- grades;
- assessments;
- grade schemas;
- attendance;
- remedials;
- retention status;
- notifications;
- audit events;
- operational settings.

## Browser-local state that may remain

Pure UI state may remain client-side when it has no operational/business meaning, for example:

- temporary open/closed component state;
- possibly theme preference;
- possibly collapsed sidebar preference.

Do not force harmless UI preferences into PostgreSQL merely to eliminate localStorage.

## Development/test data

Mock/test fixtures remain permitted when explicitly isolated to:

- automated tests;
- disposable integration environments;
- explicit development fixtures.

They must not silently become the normal application's authoritative data.

---

# 5. Database Bootstrap & Manual-Test Dataset

A fresh database must support realistic manual testing without browser seed data.

Two concepts should remain separate.

## 5.1 Initial bootstrap

Provide a controlled method to create the initial Dean/Admin account.

After bootstrap, the intended trust chain is:

Dean → Faculty invitation → Faculty → Student / Secretary workflows.

Do not require manually constructing many dependent SQL rows merely to initialize the application.

## 5.2 Development/manual-test dataset

Maintain an explicit PostgreSQL development/testing dataset containing realistic:

- Faculty;
- Students;
- Courses;
- Class Sections;
- Faculty assignments;
- Student enrollments;
- Assessments;
- Scores;
- Attendance;
- invitation states;
- retention states where useful.

Manual browser testing should operate on this database-backed data.

Actions taken in the application must be verifiable against PostgreSQL.

---

# 6. Identity & Name Model

All person entities use the same structured name model.

Fields:

- Prefix — optional
- First Name — required
- Middle Name — optional
- Last Name — required
- Suffix — optional

This applies to:

- Dean/Admin
- Faculty
- Students
- Secretaries

A Student may legitimately hold a title such as `Dr.` or suffix such as `Jr.`, `Sr.`, etc.

## Validation

Names must reject incompatible characters such as numbers.

Valid name characters should support legitimate names containing:

- Unicode letters;
- spaces;
- apostrophes;
- typographic apostrophes;
- hyphens;
- periods where appropriate.

Examples that should be valid:

- `José Dela Cruz`
- `Anne-Marie Santos`
- `O'Connor`
- `Dr.`
- `Jr.`

Examples that should not be valid:

- `John123`
- `12345`

Do not aggressively block keyboard input.

Preferred UX:

1. allow typing/paste;
2. validate immediately;
3. show valid/invalid state;
4. prevent submission while invalid.

## Canonical name source

Names should have one authoritative normalized source.

Do not duplicate the user's mutable name throughout unrelated database tables merely so screens can display it.

Related records should reference the appropriate user/entity identifier and resolve the current canonical name.

---

# 7. Profile Editing Policy

All entities may change their **name**.

Ordinary self-service profile editing must not allow modification of identity-critical fields such as:

- institutional email;
- account ID;
- role;
- institutional identifiers;
- class assignments;
- Faculty assignments;
- other relationship-critical keys.

Profiles should therefore be primarily read-only, with a specific **Change Name** action rather than a fully editable profile form.

## MFA confirmation

If MFA is enabled, changing the user's name must require additional MFA confirmation before committing the change.

## Name propagation

A successful name change should automatically appear throughout the application wherever that identity is resolved.

Do not perform brittle manual updates to every unrelated business table.

---

# 8. Audit Model

There are multiple audit views with different scopes.

## 8.1 My Activity

Available to logged-in users.

My Activity records **significant actions performed by that account**.

Examples:

- created;
- updated;
- deleted;
- revoked;
- accepted;
- promoted/demoted;
- issued invitation;
- changed grades;
- recomputed grades;
- changed attendance;
- performed manual override;
- scheduled remedial;
- recorded remedial result;
- changed profile name;
- changed security settings;
- enrolled MFA;
- linked Google account;
- enrolled biometric credential.

Do not log ordinary navigation, clicks, filters, or normal page reads.

Sensitive security/privacy payloads must never be stored in audit records.

Example:

Allowed:

`User enrolled biometric credential`

Not allowed:

the biometric template/vector itself.

## 8.2 Dean/Admin — System Audit

Dean/Admin retains a separate system-wide **System Audit** for authorized oversight.

Do not replace System Audit with My Activity.

Dean/Admin therefore has:

- My Activity — own significant actions;
- System Audit — authorized system-wide oversight.

## 8.3 Course/Attendance Activity

Where Faculty needs oversight of attendance activity performed by their Class Secretary, use a separate course-scoped activity view.

Do not call this My Activity.

It may contain significant attendance mutations performed by:

- the logged-in Faculty;
- Secretary assigned to the Faculty's applicable class.

Audit information should identify:

- actor;
- Student;
- Course;
- Class Section;
- Session;
- previous status;
- new status;
- reason;
- timestamp.

## Actor identity integrity

Audit records should retain:

- immutable actor identifier;
- display-name snapshot at the time of the event.

This preserves historical meaning even if the user later changes their name.

---

# 9. Login / Authentication Backlog

## Frontend usability

- Ensure appropriate frontend formatting/validation for data-entry fields.
- Names must reject inappropriate numeric/incompatible characters.
- Add password visibility controls using eye icons where missing.
- Add clear password requirements on password creation/reset surfaces.

Password feedback must mirror the authoritative backend policy rather than inventing a separate frontend policy.

## Google Sign-In

Google Sign-In must ultimately work in a real browser.

For now:

- preserve existing implementation;
- preserve existing account-linking flow;
- improve frontend where necessary;
- do not require live Google verification for unrelated frontend work.

Live Google authentication remains Owner-controlled.

### Existing-account linking rule

Google must not silently replace DentiSys identity proof.

For an existing account:

1. Google identity email must correspond to the account.
2. User confirms ownership with DentiSys password.
3. Existing MFA is completed if enabled.
4. Verified Google `sub` is bound.
5. Future Google sign-ins use the bound identity.

Google Sign-In must not independently manufacture a Dean account.

---

# 10. Dean / Admin Backlog

## 10.1 Dean Dashboard

Preserve meaningful at-a-glance information.

Remove unnecessary redundancy when identified.

Do not duplicate permanent sidebar navigation with unnecessary Quick Action buttons.

---

## 10.2 Faculty Invitations

Route:

`/admin/faculty-invite`

### Structured Faculty identity

Replace the single Faculty-name field with:

- Prefix
- First Name
- Middle Name
- Last Name
- Suffix

Use the common person-name validation rules.

### Institutional email validation

Institutional email must be validated against the allowed institutional domains supplied by runtime/backend configuration.

Do not hardcode the allowed domains separately in frontend code.

As the Admin types:

- show a check mark when valid;
- show a cross/error when invalid;
- explain why the email is invalid.

Validation should update while typing rather than waiting for form submission.

### Invitation lifecycle

#### Pending

Admin may:

- View
- Edit structured name
- Edit institutional email
- Revoke

An accepted invitation must no longer be editable as an invitation.

### Accepted definition

An invitation becomes **Accepted only when the corresponding Faculty account is successfully created/activated and linked to that invitation/email**.

Opening an invitation URL is not enough.

### Editing a pending email

Editing the target institutional email must not leave an old token valid for the previous identity.

Backend implementation should safely invalidate/replace the previous token as necessary.

This implementation detail should remain hidden behind the normal Edit workflow.

### Actions

Primary action presentation should emphasize a clean View/Eye interaction instead of making Reissue the dominant row action.

The final action lifecycle should preserve security and auditability without exposing token hashes or sensitive token material.

---

## 10.3 My Activity

Dean receives My Activity scoped to the Dean's own significant actions.

---

## 10.4 System Audit

Dean/Admin retains system-wide authorized oversight separately from My Activity.

---

## 10.5 Dean Settings

Remove:

- Course Component Ratios
- Retention Standard

Do not invent replacement settings merely to fill the page.

The Settings page may remain sparse temporarily.

Appropriate institutional settings can be added later when actually specified.

---

## 10.6 Dean Profile

Profile is predominantly read-only.

Immutable in normal self-service:

- institutional email;
- role;
- identity/assignment-critical data.

Allow a dedicated structured-name change flow.

If MFA is enabled, name change requires MFA confirmation.

---

# 11. Faculty Backlog

## 11.1 Faculty Dashboard

Simplify the Dashboard.

Remove redundant:

- Quick Actions that merely duplicate sidebar navigation;
- duplicate Assigned Classes / Total Classes style information.

Preserve genuinely useful:

- warnings;
- operational status;
- at-a-glance information.

### Registrar import/export

Official Student/grade import-export behavior remains externally blocked until the University Registrar / Sir Ryan provides the actual required file layout.

Do not invent an official Registrar format.

---

## 11.2 Grade Computation

"Make everything editable" specifically refers to the **Grade Weights Editor / grading schema**.

Faculty should be able to:

- add grading categories;
- remove grading categories;
- rename/configure categories;
- adjust weights;
- save grading schema.

The sum of grading weights must equal exactly:

**100%**

Not more and not less.

Computed outputs remain computed.

Do not turn calculated grades/GWA into arbitrary manual-entry values.

### Confirmations

Use confirmation for consequential mutations such as:

- Save grading schema
- Delete grading category
- Save scores
- Recompute grades
- other meaningful data changes

Do not show confirmation dialogs merely for:

- changing tabs;
- opening a modal;
- selecting a course;
- selecting a filter;
- ordinary navigation.

Use the rule:

**Confirm mutations, not interactions.**

---

## 11.3 Retention Monitoring

This surface must operate using real authoritative database data.

It must load:

- classes actually assigned to the logged-in Faculty;
- students actually enrolled in those classes;
- the Faculty's actual assessments/scores;
- the student's current grade for that Faculty member's course.

No hardcoded class IDs or fake student data.

### Terminology

Replace:

`Midterm GWA`

with:

`Midterm Grade`

A Faculty member is evaluating the grade for their course, not the Student's overall university GWA.

### Risk levels

Use the existing risk-level rules already defined by the application/page as the authoritative basis for:

- Low Risk
- Medium Risk
- High Risk

Do not invent new thresholds.

Remove the obsolete **Midterm Evaluation Rules** presentation if separate from the actual approved risk-rule definitions.

Risk evaluation must be based on the real computed course grade.

### Midterm behavior

During Midterm:

- failing/at-risk students may appear on the Retention Watchlist;
- status should be `At Risk`;
- remedial must not be available;
- no remedial assignment should occur.

### Finals behavior

Remedial applies only after Finals when the Student has failed the course.

The row-level **Remedial** action is the canonical remedial action.

Remove redundant separate "Schedule a Remedial" actions.

### Remedial action

When Faculty clicks Remedial on a Student row:

Automatically derive and lock:

- Student;
- Course;
- Class Section.

These are read-only because the Faculty selected a specific Student from a specific class/course.

The Faculty should not be able to switch to another Student or class inside that remedial form.

### Remedial date

Remedial date may be:

- today;
- future date.

Past dates must not be selectable.

### State transition

Assigning a remedial changes the Student's relevant status to:

`Remedial Assigned`

### Passing rule

Existing approved rule:

**Passing score threshold is 75%. Scores ≥75% automatically clear the Student.**

Preserve this rule.

### Remedial information

Remedial records/results should clearly contain meaningful contextual information such as:

- Student;
- Course;
- Section;
- original course grade;
- remedial date;
- remedial score;
- pass/fail result;
- status;
- Faculty notes where applicable;
- completion/cleared date where applicable.

### Student notification

When a Student is assigned a remedial, they must receive a persistent in-app notification visible from the top-right notification system.

Notification must be database-backed.

Do not fake it using browser-local state.

---

## 11.4 Attendance Monitoring

Attendance Monitoring must be database-backed and based on real Faculty assignments.

Selection hierarchy:

1. **Assigned Course**
2. **Class Section**
3. **Worksheet Date**

### Course restrictions

Faculty may only select courses actually assigned to them.

### Section restrictions

After selecting a course, only Class Sections belonging to that course and Faculty assignment may be selected.

Example:

If `CLINIC102` is selected, do not show a `CLINIC101` section.

### Worksheet date

Future dates must not be selectable.

There cannot yet be attendance records for dates that have not occurred.

### Large-class usability

Design for realistically large Student lists.

Start with simple scalable patterns:

- search;
- filters;
- sticky table header;
- bounded scrollable content;
- clear status controls.

Do not introduce complex virtualization/pagination unless the actual dataset requires it.

### Attendance Activity

Historical attendance auditing visible to Faculty should be a course/attendance-scoped activity view, not My Activity.

Faculty may see significant attendance changes made by:

- themselves;
- applicable Class Secretary.

Include contextual information:

- actor;
- Student;
- Course;
- Class Section;
- Session;
- old value;
- new value;
- reason;
- timestamp.

---

## 11.5 Email Management / Class Secretary Management

Support large Student lists with filtering.

Filtering hierarchy should include:

- Course
- Class Section
- Student/search as appropriate

### Secretary visibility

Clearly distinguish:

- ordinary Student;
- pending Secretary invitation;
- active Class Secretary.

The active Secretary should be visually obvious.

Remove obsolete checkmark-style status if it conflicts with the new state model.

### Current institutional assumption

For now:

- a Student belongs to one Class Section;
- each Class Section has at most one Class Secretary.

Do not overengineer for hypothetical future multi-section membership.

If university policy changes later, the model can be revised.

### Secretary invitation lifecycle

Faculty initiates a Secretary invitation.

The Student must **accept the invitation** before becoming Secretary.

Do not instantly grant Secretary authority merely because Faculty clicked the invitation action.

Only one active/pending Secretary invitation may exist for a Class Section at a time.

#### Candidate state

Action:

`Invite as Secretary`

#### Pending state

Action:

`Revoke Invitation`

#### Accepted/active state

Student becomes the active Secretary for that Class Section.

Faculty may later:

`Remove Secretary Role`

### Role promotion

When the Student accepts the Secretary invitation:

- same underlying account/identity is retained;
- account is promoted to Secretary according to the authoritative role/access model;
- existing Student academic identity/record remains intact;
- corresponding Class Section identifies them as its active Secretary.

When the Secretary assignment is removed:

- account returns to normal Student role/context;
- Student academic record remains intact.

The exact safest implementation against the current authentication/RBAC model requires backend technical investigation before implementation.

### Student/Secretary context switching

An accepted Secretary remains the same person and must still be able to use their Student side.

Do not add Student navigation into the Secretary sidebar.

Use a top-right context switch near the theme/profile controls.

Conceptually:

`Switch to Student`

and, where appropriate:

`Switch to Secretary`

This changes application context, not identity.

---

## 11.6 Email History

Email History should not become a separate duplicate logging system.

Use authoritative sources such as:

- email outbox/delivery records;
- relevant audit events.

It should provide a useful history of actions performed through Email Management.

---

## 11.7 Faculty Profile

Profile should be primarily read-only.

Do not allow self-service modification of:

- institutional email;
- account identity;
- Faculty assignments;
- other relationship-critical fields.

Allow dedicated structured-name changes.

Require MFA confirmation when MFA is enabled.

---

# 12. Student Backlog

## 12.1 Student Dashboard

Canonical UI parity has already been restored.

Do not reintroduce:

- mock classes;
- mock grades;
- fake attendance;
- fake retention information.

Future Student academic information must come from authoritative backend/database APIs.

The current shared DentiSys visual style must be preserved.

---

## 12.2 Student Profile

Student follows the same identity policy as other users.

Allow a dedicated structured-name change flow.

Do not allow self-service modification of:

- institutional email;
- Student number;
- account IDs;
- role/assignment-critical fields.

Require MFA confirmation for name changes when MFA is enabled.

---

# 13. Secretary Backlog

## 13.1 Secretary Dashboard

Remove redundant information and redundant Quick Actions that merely duplicate sidebar navigation.

Preserve meaningful:

- operational status;
- attendance information;
- alerts;
- pending work.

---

## 13.2 Manual Override

Support large record sets.

Filter hierarchy should include:

1. Date
2. Session on the selected date
3. Records

Additional useful filters may include:

- attendance status;
- overridden/original state;
- Student search.

Avoid forcing users to scroll through an unbounded list merely to reach relevant records.

### Audit requirement

Each meaningful override must record:

- actor;
- Student;
- Course;
- Class Section;
- Session;
- previous attendance state;
- new attendance state;
- reason;
- timestamp.

The Secretary sees the event in their My Activity.

Applicable Faculty may see it in their Attendance/Course Activity view.

---

## 13.3 My Activity

Connect Secretary My Activity to PostgreSQL.

It must show significant actions performed by the currently logged-in Secretary.

Do not route Secretary to an Admin-wide audit endpoint.

Do not show unrelated users' activity.

---

## 13.4 Secretary Profile

Remove duplicate information.

Profile is primarily read-only.

Do not allow self-service modification of:

- institutional email;
- assignment-critical fields;
- account role directly.

Allow dedicated structured-name changes.

Require MFA confirmation when MFA is enabled.

---

## 13.5 Secretary → Student Context

Do not duplicate Student navigation inside the Secretary sidebar.

Use a top-right context switch near theme/profile controls.

The Secretary should be able to switch to their Student application context while remaining logged into the same identity.

Backend authentication/RBAC must safely support this.

---

# 14. Persistent Notifications

Persistent application notifications should be database-backed.

They must support at minimum:

- recipient user;
- notification type;
- message/title;
- related entity/reference where applicable;
- created timestamp;
- read/unread state;
- read timestamp where applicable.

Initial required use:

- Student notification when a remedial is assigned.

The existing notification bell should consume authoritative notification data rather than browser-local fake alerts.

Do not store sensitive payloads unnecessarily.

---

# 15. Data Modernization Backlog

The application must be audited feature-by-feature for browser/mock production data.

Priority candidates include:

- Student lists;
- Faculty assigned classes;
- Courses;
- Class Sections;
- attendance;
- grade/assessment data;
- retention;
- remedials;
- Secretary assignments;
- audit/activity;
- notifications;
- operational settings.

For each candidate:

1. identify current frontend/mock storage;
2. identify authoritative database tables;
3. identify existing API support;
4. add the smallest backend contract required;
5. migrate the frontend to the API;
6. remove runtime dependence on browser/mock business data;
7. preserve deterministic testing fixtures.

Do not perform a blind site-wide rewrite.

Convert features incrementally and validate each one.

---

# 16. Database Migration Policy

Database migrations are allowed when they move the system closer to the approved model.

Do not avoid a necessary normalized schema change merely to keep migration count low.

At the same time:

- avoid speculative schema;
- avoid generic abstraction tables with no current requirement;
- reuse existing relationships where suitable;
- prefer simple constraints that encode approved product rules.

Potentially justified migrations include, subject to current schema inspection:

- structured person-name fields;
- persistent notifications;
- Secretary invitation/assignment constraints;
- audit actor display-name snapshot where not already available;
- cleanup of obsolete operational settings.

Every migration must have a concrete approved requirement.

---

# 17. Secretary/Student Role Model — Technical Investigation Required

Product behavior is approved:

1. Student belongs to one Class Section under current university reality.
2. Faculty sends Secretary invitation.
3. Student accepts.
4. Same account becomes Secretary for that section.
5. Existing Student academic identity remains intact.
6. User can switch between Student and Secretary application context.
7. Faculty may later remove Secretary assignment.
8. On removal, the account returns to normal Student role/context.
9. At most one active/pending Secretary exists per Class Section.

Before implementation, Codex must inspect the current authentication/RBAC model and determine the smallest safe implementation.

Specifically determine:

- whether `user_accounts.role` is currently the sole authorization source;
- whether Secretary route guards require global `role = 'secretary'`;
- how the same account can retain Student context while promoted;
- what role/context claim should be issued during authentication;
- how demotion returns authority safely;
- how the existing `class_sections.secretary_user_id` relationship participates.

Do not change the approved product behavior merely because the current implementation is inconvenient.

Return technical options to the Gatekeeper if more than one reasonable implementation exists.

---

# 18. Externally Blocked

## Registrar / Sir Ryan import-export format

Official Registrar import/export remains blocked until the actual file layout is supplied.

Required information includes:

- file type;
- headers;
- Student identifier;
- course/section columns;
- grading encoding;
- required output structure.

Do not invent the University's official format.

## Live Google verification

Existing Google implementation can continue to be tested automatically.

Actual live Google authentication remains Owner-controlled.

Do not request or store Owner credentials.

If live testing identifies a real implementation defect, capture it and scope the appropriate frontend/backend fix.

---

# 19. Known Baseline Issues

Known issues that should not be silently conflated with unrelated backlog implementation:

- Faculty Classes & Rosters current-school-year count/filter mismatch.
- Faculty Dashboard versus Classes & Rosters class-count mismatch.
- Faculty Grade Computation mobile tab strip requires horizontal scrolling.
- Existing non-blocking Vite/Tailwind warnings.
- Real Student academic routes remain gated until authoritative APIs/data are available.
- Secretary attendance browser simulation remains intentionally disabled where authoritative session behavior is unavailable.
- Live Google authentication still requires Owner-controlled manual verification.

A future task may explicitly own one of these issues.

---

# 20. Completed

## Canonical UI parity

Completed and checkpointed at:

`c58d3004db20280c8827dd10893e9c1058be2eaa`

Completed work includes:

- restored canonical shared Student shell;
- canonical Student Dashboard/Profile styling;
- canonical Admin Faculty Invitations presentation;
- fixed invalid Student `My Settings` route;
- desktop/mobile parity validation;
- automated validation;
- live integration validation.

The parity audit confirmed that no legitimate pre-parity frontend functionality needed to be reintroduced.

---

# 21. Recommended Implementation Order

This is a working order, not an irreversible commitment.

## Foundation — Authoritative Data

First establish enough database-backed development data and API correctness that manual browser testing can exercise real workflows.

Prioritize replacing runtime mock/browser business data with authoritative PostgreSQL data feature-by-feature.

This foundation should not become a giant rewrite.

## Small frontend usability improvements

Examples:

- password eye controls;
- password requirements;
- live field validation.

Frontend-only work can proceed where no backend contract is required.

## Identity/name normalization

Requires coordinated backend schema/API work followed by frontend integration.

## Role-specific cleanup

Examples:

- dashboard redundancy;
- read-only profiles plus Change Name;
- Dean Settings cleanup;
- Secretary Manual Override filtering.

## Operational workflows

Examples:

- Faculty Invitation lifecycle;
- Grade Weights schema editing;
- Attendance course/section hierarchy;
- Secretary invitation/acceptance/context;
- Retention/remedial workflow.

## Persistent cross-role systems

Examples:

- notifications;
- comprehensive My Activity;
- Admin System Audit;
- course/attendance activity views.

## Student authoritative academic surfaces

Expose Student academic functionality only after the underlying APIs/data are authoritative.

## External work

- Registrar format
- live Google manual verification/fixes

The Gatekeeper may reorder these when dependencies or manual testing reveal a better sequence.

---

# 22. Definition of Done for Future Features

A feature is not complete merely because the UI renders.

Where applicable it must:

- use authoritative database-backed data;
- enforce role/ownership permissions;
- enforce approved validation;
- preserve canonical UI;
- update PostgreSQL correctly;
- create required audit events;
- use persistent notifications where specified;
- pass automated tests;
- pass integration tests;
- pass desktop/mobile browser verification;
- leave unrelated functionality unchanged.

For data-mutating workflows, manual validation should verify that the expected database state actually changed.

---

# 23. Final Reminder

This backlog represents the best-known requirements at the current point in development.

It is intentionally allowed to evolve.

The Owner expects to discover additional changes while manually testing DentiSys.

Do not interpret omissions as permission to invent behavior.

When uncertain:

**Ask the Owner through the Gatekeeper.**