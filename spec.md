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

During authorized invitation acceptance, the verified Google `sub` may be bound to the invited account only after the verified institutional email matches the invitation. Invitation authority is required before Google verification can be used, and password creation remains required.

---

# 3. Registration and Account Lifecycle

## REG-001 — Invitation-only Faculty and Student onboarding

**Status: APPROVED**

There is no public Faculty or Student signup. A Faculty account may be established only through an Admin-authorized invitation. A Student account may be established only through a Faculty-authorized invitation tied to the canonical Student record and applicable eligibility checks.

The invitation authorizes account establishment. Google verification may optionally verify the invited identity but MUST NOT create an invitation or independently begin account creation. Secretary invitation and activation remain governed by REG-006.

## REG-002 — Password-backed invitation acceptance

**Status: CURRENT**

Faculty and Student invitation acceptance MUST require creation of a DentiSys password. Existing institutional email validation and role-specific identity and eligibility requirements remain authoritative.

## REG-003 — Optional Google verification during invitation acceptance

**Status: APPROVED**

Google-assisted invitation acceptance is **not passwordless**. Google is optional and MUST only verify the identity named by an already valid invitation. The verified email MUST match the invited institutional email; a conflicting Google subject MUST be rejected without linking or changing another account.

Before acceptance is completed, the user MUST create a DentiSys password. A completed Google-linked account MUST subsequently support both:

* Google Sign-In;
* institutional email + DentiSys password.

Conceptually:

```text
authorized invitation
      ->
optional matching Google verification
      ->
create DentiSys password
      ->
active invited account
```

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

Secretary invitation and activation remain controlled by the existing DentiSys workflow.

Google authentication MUST NOT bypass the invitation/activation requirement.

## REG-007 — Student identity

**Status: CURRENT**

Only an authorized Faculty member may invite a Student from an assigned class. The invitation MUST be tied to the canonical Student record. Student account access remains tied to that identity and existing active-status/enrollment eligibility checks at invitation and acceptance. A Student email alone MUST NOT authorize onboarding. After valid invitation acceptance, eligibility checks, and password creation, the Student account becomes Active.

Optional Google verification during acceptance MUST match the invited Student institutional email and MUST NOT substitute for the Faculty invitation or Student eligibility.

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

Existing authentication rate limiting and audit behavior MUST be preserved when additional authentication paths are added.

New authentication paths SHOULD use the same security boundaries where applicable rather than creating parallel security systems.

---

# 5. Current Product Features

## GRD-001 - Assessment transmutation

**Status: CURRENT**

Assessments may optionally enable grade transmutation. Admin may edit the institution-wide transmutation minimum and maximum percentages, initially 50% and 100%. New assessments snapshot the current institution-wide defaults; later default changes affect future assessments by default and do not silently modify existing assessments. Faculty may explicitly customize an assessment's stored minimum and maximum percentages.

Raw assessment points remain authoritative historical scores and are never replaced by a transmuted result. An enabled assessment must be deterministically linked to an attendance event in its class using the attendance session date and a nonblank session code.

For an enabled assessment, present, late, and excused attendance apply the bounded transformation:

```text
effectivePercentage = minimum
    + rawPercentage / 100 * (maximum - minimum)
```

Absent attendance produces an effective percentage of 0%. Missing attendance is incomplete/unresolved and must not be treated as absent or use a raw-percentage fallback. Disabled assessments continue using the normal raw percentage. Attendance corrections affect subsequent effective-grade computation without modifying the stored raw score. Assessment-linked transmutation remains separate from the existing independent attendance grading component.

---

## GRD-002 - Period grading and editable presets

**Status: APPROVED - Implementation in progress**

Faculty grading configurations remain scoped to the Faculty member, course, semester, and school year.

New, unconfigured offerings present an editable, unsaved starting preset. The initial contribution ratio is 40% Midterm and 60% Finals, editable by Faculty.

The Midterm preset contains Quiz 25%, Activity 25%, Midterm Exam 40%, and Attendance 10%. The Finals preset contains Quiz 20%, Activity 20%, Laboratory 20%, Final Exam 30%, and Attendance 10%.

Faculty may customize each period's categories and weights. Each period must total exactly 100%, using the existing supported decimal precision. The two period contributions must also total exactly 100%.

Preset values become authoritative only after a successful server save. Existing saved configurations must never be replaced automatically by preset values.

Assessments must reference valid categories for their offering and grading period. Existing assessment identifiers, category references, raw scores, and assessment maximum scores must be preserved.

Existing single-list configurations continue using their current calculation until explicitly converted through a validated operation. Migration must not silently change recorded grades.

For period configurations, the overall percentage is the Midterm percentage multiplied by its contribution plus the Finals percentage multiplied by its contribution. A positively weighted period without sufficient results remains incomplete; it must not silently become zero or be omitted.

Saving configuration does not automatically rewrite persisted grade results. An authorized recomputation applies the saved configuration while preserving raw scores and GRD-001 transmutation behavior.

In period configurations, the preset Attendance category uses authoritative attendance data and replaces the additional independent attendance contribution, preventing double-counting. Assessment-linked transmutation remains governed separately by GRD-001. The assignment of attendance records to Midterm and Finals requires a separate Owner decision before period attendance computation is implemented.

Grade displays and exports must distinguish authoritative Midterm, Finals, and overall results. Unavailable period results must not be replaced with the overall grade.

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
| Google verification during invitation acceptance | APPROVED |
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

The biometric, attendance, and Secretary requirements in this section are approved product decisions. Their implementation remains deferred; these rules do not claim that the functionality is implemented or authorize implementation by themselves. Technical selections explicitly marked deferred remain unresolved until team research and later Owner approval. Existing CURRENT rules and unrelated approved behavior remain in force.

## BIO-001 — Attendance-only purpose and identity boundary

**Status: APPROVED**

**Implementation: DEFERRED**

Facial biometrics is used only for attendance verification. It MUST NOT be used for DentiSys login, password replacement, account authentication replacement, Student identity discovery, civil or institutional identity proofing, classroom-wide recognition, or general-purpose face recognition.

The Student MUST already be authenticated to their own DentiSys account. Biometric verification answers only whether the live face matches the protected reference enrolled for that authenticated Student. It MUST use strict 1:1 verification.

DentiSys MUST NOT perform 1:N identification, search all Students, identify an unknown face, return another Student as a possible match, perform classroom-wide identification, or search the Student population for duplicate faces. If another person accesses a Student account and enrolls their own face, biometrics does not discover or establish that person's actual identity. This is an intentional privacy boundary.

Facial detection MUST use Haar Cascade Classification through OpenCV. Facial verification MUST use Local Binary Patterns Histograms (LBPH) through OpenCV. LBPH MUST remain restricted to strict authenticated-Student 1:1 verification and MUST NOT be used for 1:N identification or Student discovery.

## BIO-002 — Student enrollment, consent, and manual alternative

**Status: APPROVED**

**Implementation: DEFERRED**

Only the Student may enroll, revoke, or re-enroll their own facial biometric through their authenticated account. Faculty and Secretary MUST NOT enroll another Student. Admin may revoke a Student's enrollment and request or require re-enrollment, but MUST NOT perform replacement enrollment for the Student.

Explicit, voluntary Student consent MUST precede any biometric capture or processing. A valid enrollment becomes active automatically after consent, eligibility, capture-quality, liveness/PAD, and applicable provider checks pass. Faculty, Secretary, or Admin approval is not required for routine successful enrollment; a routine approval queue is excluded.

Students may refuse biometric processing or later revoke consent. Refusal or inability to use biometrics MUST NOT block DentiSys access, normal Student functionality, or legitimate attendance credit. Authorized manual attendance, with Secretary-assisted manual attendance as the primary fallback, MUST remain available for refusal, revocation, inability to enroll, repeated failure, camera or accessibility limitations, geofence limitations, and unavailable biometric infrastructure.

The consent disclosure MUST state the attendance-only purpose; the biometric material processed; that raw facial images are not retained; that a protected reference is retained and expires every semester; revocation and deletion behavior; who may access enrollment status; the manual attendance alternative; and that revocation does not erase historical attendance. This scope applies to adult university Students.

Before real Student deployment, final privacy and consent wording MUST be reviewed and approved by the research team, adviser, relevant University authority, and University Data Protection Officer. This named review is the required institutional gate for real Student deployment; implementation remains deferred until that gate and the remaining technical approvals in BIO-007 are complete.

## BIO-003 — Temporary captures, protected reference, and infrastructure boundary

**Status: APPROVED**

**Implementation: DEFERRED**

Raw photographs, enrollment images, camera frames, verification images, and failed captures MUST NOT be retained after processing, including in development or debugging artifacts. Temporary facial images MAY exist only as necessary for capture-quality evaluation, liveness/PAD, template generation, and 1:1 verification, and MUST be discarded after processing. Normal enrollment MUST require 20 usable facial samples and MAY accept at most 30 usable samples during one enrollment operation. Failed quality or liveness samples MUST NOT count. Raw enrollment samples MUST be discarded after protected-reference generation or an aborted enrollment.

Of the biometric material, only the protected reference required for future 1:1 verification may be retained. Retained LBPH references/models are distinct from raw imagery and MUST be stored in dedicated biometric storage excluded from ordinary application/database backups. Normal UI and API access MUST NOT retrieve raw references, templates, embeddings, or equivalent biometric material.

After collection by the authorized Student-owned browser/device, biometric data MUST remain within infrastructure controlled by the DentiSys deployment. The browser/device is an authorized capture endpoint and MAY hold a capture temporarily for transmission, but it MUST NOT persist biometric material beyond the active operation. Biometric processing MUST NOT be delegated to an unapproved third-party or cloud provider. The intended research deployment may use one server and a logically separate biometric component whose boundary permits later relocation to separate infrastructure without changing product behavior. This rule does not select a container, service protocol, database, filesystem, object store, or other storage engine.

All biometric captures, temporary facial images, protected references, and temporary location data transmitted between a Student device, DentiSys, and the biometric component MUST use protected transport before real Student deployment.

## BIO-004 — Biometric information protection rationale

**Status: APPROVED**

**Implementation: DEFERRED**

Protected biometric references MUST be protected at rest and in transit, against unauthorized retrieval and modification, and through appropriately restricted access. The design MUST consider confidentiality, integrity, privacy, renewability, and revocability because a compromised biometric characteristic cannot simply be changed like a password.

The design rationale MUST explicitly reference ISO/IEC 24745:2022, Information security, cybersecurity and privacy protection — Biometric information protection. The reference does not claim ISO certification, formal compliance, or audited conformance. Protected LBPH reference data MUST be encrypted at rest using AES-256-GCM. The encryption key MUST be server-controlled and MUST NOT be committed to Git, stored in the ordinary database, exposed through APIs, or sent to browser clients. PostgreSQL MAY contain biometric-profile metadata and an opaque protected-object reference, but MUST NOT contain raw photos or an unprotected LBPH model/reference. Key-management implementation, KMS/provider, protected-template mechanism, and key-rotation implementation remain deferred under BIO-007.

## BIO-005 — Expiration, revocation, replacement, and loss

**Status: APPROVED**

**Implementation: DEFERRED**

An enrollment expires every semester. A Student MUST re-enroll to continue biometric attendance after expiration.

Usable biometric material MUST be invalidated and deleted when the enrollment expires at semester end, the Student revokes consent, Admin revokes enrollment, the linked Student account is deleted, the Student becomes inactive, or re-enrollment replaces the old enrollment. Re-enrollment MUST replace the previous usable reference; old usable templates MUST NOT be retained for historical audit. An audit record may retain that expiration, revocation, deletion, or replacement occurred without retaining the biometric material.

Biometric templates MUST NOT be included in normal DentiSys application backups. If biometric storage is lost, Students MUST re-enroll. System-wide disabling of biometrics and deletion of biometric data are separate operations. Incompatible templates from a future biometric engine require Student re-enrollment; template migration is not authorized unless separately approved. Legitimate historical attendance MUST remain preserved.

## BIO-006 — Liveness, capture quality, outcomes, and retries

**Status: APPROVED**

**Implementation: DEFERRED**

Production biometric attendance MUST use randomized active challenge-response liveness or presentation-attack detection. Challenges MUST be server-generated, short-lived, and single-use. Each ordinary attempt MUST request two distinct randomized actions in randomized order from blink, turn head left, and turn head right. The browser MAY display the challenge but MUST NOT be authoritative for pass/fail. The DentiSys biometric component MUST verify the action sequence using temporary frames. MediaPipe Face Landmarker is approved only for landmark, transformation, and blendshape analysis used for liveness; it MUST NOT replace Haar detection or LBPH verification. Raw liveness frames MUST NOT be retained. Numeric liveness, blink, head-pose, and timing thresholds remain deferred.

The system MUST reasonably resist printed facial photographs, a face image displayed on another screen, prerecorded or displayed facial video, and straightforward replay attacks. It MUST continue to support ordinary browser-accessible phone, tablet, and desktop cameras and MUST NOT require depth, infrared, or Face ID-equivalent hardware or claim equivalent assurance.

Capture MUST be rejected when there is no face, more than one face, inadequate visibility, severe blur, unacceptable pose, severe occlusion, or another deferred quality failure. The system MUST provide understandable corrective guidance and MUST NOT automatically choose one face from a multiple-face capture.

Production UI MUST provide readable generic outcomes such as “Face verified” and “Face could not be verified.” Normal users MUST NOT receive raw similarity scores, confidence scores, or biometric vectors. Development diagnostics MAY display transient scores only behind an explicit development configuration flag; scores MUST NOT be persisted as normal client or audit data.

Students may make legitimate retries while biometric attendance remains open. There is no product-level hard retry count. Repeated failure MUST NOT lock the Student account or itself mark the Student Absent. The outcome MUST direct the Student to Secretary or Faculty for manual attendance.

## BIO-007 — Approved and deferred biometric technology selections

**Status: APPROVED**

**Technical selections: APPROVED as stated below; remaining parameters: DEFERRED**

Facial detection MUST use Haar Cascade Classification through OpenCV. Facial verification MUST use LBPH through OpenCV. LBPH MUST be restricted to strict authenticated-Student 1:1 verification; DentiSys MUST NOT perform 1:N identification, unknown-person identification, nearest-Student discovery, classroom-wide recognition, or searches across Student references.

Biometric processing MUST remain inside the same single-server DentiSys Docker deployment. The biometric component MAY be logically separable enough for future relocation, but this amendment does not authorize distributed architecture, Kubernetes, a cloud biometric provider, or multi-server deployment.

Normal enrollment MUST require 20 usable facial samples, and at most 30 usable samples MAY be accepted during one enrollment operation. Failed quality or liveness samples MUST NOT count. Raw enrollment samples MUST be discarded after protected-reference generation or an aborted enrollment.

The LBPH matching threshold MUST be server-controlled. No universal numeric production threshold is approved; calibration MUST use the actual DentiSys camera, preprocessing, and enrollment pipeline and consider false acceptance and false rejection. End users MUST NOT configure the threshold. One matching frame MUST NOT authorize attendance; repeated consistent matching is required.

Liveness/PAD MUST use randomized active challenge-response. Challenges MUST be server-generated, short-lived, and single-use. Each ordinary attempt MUST request two distinct randomized actions in randomized order from blink, turn head left, and turn head right. The browser MAY display the challenge but MUST NOT be authoritative for pass/fail. The DentiSys biometric component MUST verify the action sequence using temporary frames. MediaPipe Face Landmarker is approved only for landmark, transformation, and blendshape analysis used for liveness and MUST NOT replace Haar detection or LBPH verification. Raw liveness frames MUST NOT be retained.

Retained LBPH references/models MUST be distinct from raw imagery and stored in dedicated biometric storage excluded from ordinary application/database backups. Protected LBPH reference data MUST be encrypted at rest using AES-256-GCM. The encryption key MUST be server-controlled and MUST NOT be committed to Git, stored in the ordinary database, exposed through APIs, or sent to browser clients. PostgreSQL MAY contain biometric-profile metadata and an opaque protected-object reference, but MUST NOT contain raw photos or an unprotected LBPH model/reference. For the current research deployment, loss or intentional replacement of the encryption key MAY invalidate protected references and require Student re-enrollment.

The following remain deferred and MUST NOT be invented or selected by implementation: numeric LBPH production threshold; exact repeated-match frame count; exact matching decision window or numeric rule; numeric image-quality thresholds; numeric blink, head-pose, liveness, or timing thresholds; exact internal biometric service protocol; exact filesystem or volume layout; CPU/GPU sizing; future passive PAD; and advanced key-management, KMS, or key-rotation infrastructure.

The remaining deferred parameters require team research, technical validation, and later explicit Owner approval. Any future threshold MUST be selected through validation of the chosen technology and MUST NOT be configurable by Students, Faculty, Secretary, or Admin.

## BIO-008 — Devices, connectivity, mock isolation, and rollout

**Status: APPROVED**

**Implementation: DEFERRED**

The target is desktop/laptop browsers, Android browsers/devices, and iOS browsers/devices. Students use their own devices. Where supported, they may select an available camera, including front or rear cameras. Verification requires connectivity to the deployed DentiSys service. There is no offline biometric queue or later local synchronization; if the service cannot be reached, manual attendance applies.

Docker remains the intended deployment model. No specific CPU/GPU is a product requirement, and the current research laptop is not a production requirement. The initial study supports classroom-scale use and multiple classrooms; school-wide event recognition is outside current scope. Verification SHOULD feel responsive, but no fixed maximum time is selected. Normal Faculty dashboard refresh is sufficient; live-update behavior is not required by this specification.

After the BIO-002 institutional privacy/consent review and the remaining technical approvals required by BIO-007 are complete, real biometrics is available by default. Student enrollment and use remain voluntary and require consent. A development biometric mock MAY remain only behind explicit development configuration. Mock and real enrollment MUST remain separate; real biometric failure or unavailable infrastructure MUST fall back to manual attendance and MUST NOT silently use the mock.

## BIO-009 — Audit, information minimization, and accepted limits

**Status: APPROVED**

Meaningful audit events MUST cover consent granted and revoked; enrollment started, succeeded, and failed; re-enrollment; verification success and failure; biometric revocation/deletion; attendance-session creation, timing/configuration changes, closure, and revocation; attendance creation; repeated attendance attempts where relevant; Secretary manual attendance; Faculty correction; Secretary Excused requests; Faculty approval or rejection; and relevant provider or configuration changes. An attendance-session revocation audit event MUST identify the actor and timestamp and MAY include the explanatory reason.

Audit data MUST NOT contain face images, camera frames, templates, embeddings, provider secrets, credentials, precise Student GPS coordinates, or persistent similarity/confidence scores. An authenticated 1:1 verification failure MAY be associated with the claimed Student account. Biometric match results MUST NOT be persisted in browser storage or other persistent client-side storage.

The study aims to reasonably resist obvious photo, display, video, and replay attacks but does not promise to defeat credential sharing, sophisticated GPS spoofing, sophisticated deepfakes, or compromised Student devices. The design MUST preserve accessibility and MUST NOT make biometric attendance less practical than the manual alternative without later approval. Faculty retains final academic authority over attendance outcomes; a normal successful biometric attendance does not require Faculty approval inside DentiSys.

1:N identification, classroom-wide recognition, unknown-person identification, shared kiosk/classroom architecture, biometric login, biometric identity proofing, school-wide event face recognition, advanced GPS anti-spoofing guarantees, guarantees against all sophisticated deepfakes, and guarantees against compromised devices are outside the approved current implementation. Kiosk or classroom architecture may be future research only.

## BIO-010 — Secretary access to own Student self-service

**Status: APPROVED**

**Implementation: DEFERRED**

A Secretary remains authorized under the Secretary role and enters the Secretary interface by default. That same account retains access to applicable Student self-service associated with the person’s own canonical Student identity, including their own biometric enrollment, revocation, re-enrollment, attendance capture, and other approved Student functions. No second account, second login, simultaneous-role redesign, role inheritance, or new account-linking mechanism is introduced. Secretary privileges MUST NOT permit enrollment for another Student. REG-006’s invitation and activation workflow remains unchanged.

## ATT-001 — Attendance-session authority

**Status: APPROVED**

**Implementation: DEFERRED**

Faculty may start and manage attendance sessions only for classes they are authorized to manage. Secretary may start and manage sessions only for classes available through the authorized Secretary attendance role. Secretary authority does not grant unrestricted access to every class. Authorization MUST be enforced server-side.

Faculty-created and Secretary-created sessions use the same attendance-session functionality. Both authorized roles may configure the applicable opening time, Present cutoff, Late cutoff, geofence setting, session location, and radius. Session timing is interpreted in the application's `Asia/Manila` timezone; server time is authoritative, and browser/device clocks are never authoritative. The session creation timestamp does not determine when attendance opens.

An authorized Faculty or Secretary may revoke an attendance session that they are authorized to manage. Revocation immediately closes biometric capture and prevents further attendance submissions. Already-recorded attendance is preserved, and unresolved attendance remains subject to the normal final attendance-resolution lifecycle rather than being automatically marked Absent by revocation. Revocation MUST be recorded in the audit trail with the actor and timestamp; an explanatory reason MAY be recorded. Revocation MUST NOT delete or rewrite existing attendance records.

When a session is created, eligible Students have an attendance state that remains unresolved until attendance is recorded or the attendance-resolution lifecycle resolves it; this requirement does not select a database representation.

## ATT-002 — Geofencing and location privacy

**Status: APPROVED**

**Implementation: DEFERRED**

Geofencing is enabled by default for new biometric attendance sessions. Authorized Faculty or Secretary may disable it per session, select the session location through a map interface, and configure the permitted radius. The default radius is 100 meters and radius values are configured and stored in meters.

Student coordinates MAY be used temporarily to evaluate whether the Student is inside the permitted radius. Exact Student GPS coordinates MUST NOT be permanently stored and no Student location history may be created. Geofence passed/failed, configured session location and radius, and an audit timestamp may be retained. If enabled geofencing is denied or unavailable, automated biometric attendance cannot complete and manual fallback applies.

## ATT-003 — Attendance timing and final absence resolution

**Status: APPROVED**

**Implementation: DEFERRED**

A successful biometric attendance during the configured Present window produces Present. The Present window begins at the configured opening time and ends immediately before the configured Present cutoff.

A successful biometric attendance during the configured Late window produces Late. The Late window begins at the Present cutoff and ends immediately before the configured Late cutoff. The configured times are interpreted in `Asia/Manila` using authoritative server time. For example, a session created at 06:00 may open at 08:00, accept Present attendance until 09:00, and accept Late attendance from 09:00 until 12:00. The creation timestamp does not determine the attendance windows.

At the configured Late cutoff, biometric capture closes. Students cannot submit biometric attendance before the opening time or after capture closes, and the UI directs them to Secretary or Faculty. A Student with no resolved attendance remains unresolved; capture closure or session revocation MUST NOT itself automatically create Absent. Only after the entire applicable class/session for that day concludes does the attendance workflow explicitly resolve remaining eligible unresolved attendance to Absent. If the applicable class/session concludes at the Late cutoff, as in the 08:00–12:00 example, the unresolved eligible attendance is resolved to Absent at that point.

A later authorized correction may change Absent to Excused or another authorized status. A Student may pursue that correction through the existing authorized Faculty/Secretary correction and Excused workflows; this amendment does not create a new Student-facing in-system dispute workflow. Biometric closure, session revocation, and final attendance resolution are separate events.

## ATT-004 — Unresolved attendance and grading

**Status: APPROVED**

**Implementation: DEFERRED**

While attendance is unresolved, attendance-dependent grading and transmutation remain pending. GRD-001 MUST consume a resolved attendance status and MUST NOT infer Absent or zero merely because an attendance record is missing or unresolved.

Once attendance resolves, the existing approved GRD-001 behavior applies. Later authorized corrections MUST affect subsequent effective-grade computation without changing the stored raw score. One attendance session may link to multiple assessments where existing class, date, and session-code rules allow it. GRD-001’s formula and unrelated grading rules remain unchanged.

## ATT-005 — Duplicate prevention and attendance provenance

**Status: APPROVED**

**Implementation: DEFERRED**

Each Student has one authoritative attendance result per attendance session. A successful biometric verification is valid only for one active attendance session/request and MUST NOT be reused for another request or session. A later successful attempt in the same session returns an understandable already-recorded outcome and creates no duplicate authoritative attendance row. Repeated attempts may be audited.

Biometric verification and attendance are separate concepts. Attendance preserves how it was established, such as biometric, Faculty manual, or Secretary manual. Correcting attendance MUST preserve the original biometric outcome and the correction history. Revoking or deleting biometric material MUST NOT delete legitimate historical attendance; historical attendance may retain its verification method without retaining biometric material.

## ATT-006 — Manual correction and Excused workflow

**Status: APPROVED**

**Implementation: DEFERRED**

Successful automated biometric attendance requires no Faculty approval. Faculty may directly correct attendance through authorized attendance-management functionality.

Secretary retains authorized ordinary manual attendance functionality. When a Student contacts the Secretary about an excuse, the Secretary may submit an Excused request in DentiSys; only Faculty may approve or reject that request. Secretary MUST NOT finalize Excused through a generic manual override. A rejection leaves the current attendance status unchanged. When a Student contacts Faculty directly, Faculty may apply an authorized correction directly.

Students contact Secretary or Faculty outside DentiSys. Current scope has no Student-facing in-system excuse or dispute submission, no supporting-document upload requirement, and no specified dispute deadline. Manual correction audit MUST preserve the old status, new status, actor, timestamp, reason where applicable, and the original biometric outcome.

## DEL-001 — Image publishing and deployment

**Status: DEFERRED**

Image publishing and demonstration deployment remain future work.

Do not add cloud infrastructure, TLS, deployment automation, registry configuration, CI/CD, or related infrastructure unless explicitly scoped and approved.

---

# 9. Open Decisions

An **OPEN** item cannot be resolved by an agent without Owner input.

Only add an item here when an implementation is blocked by a real unresolved product decision or an explicitly deferred technical selection requiring Owner approval.

Do not invent speculative open questions.

Current open decisions and deferred technical selections:

* BIO-007: numeric LBPH production threshold; exact repeated-match frame count; exact matching decision window or numeric rule; numeric image-quality thresholds; numeric blink, head-pose, liveness, and timing thresholds; exact internal biometric service protocol; exact filesystem or volume layout; CPU/GPU sizing; future passive PAD; and advanced key-management, KMS, or key-rotation infrastructure.

These technical items remain unresolved. Listing them does not select or approve any technology. The biometric product requirements in §8 are approved.

---

# 9A. Contract Boundaries

## CLS-001 - Faculty class-section editing
**Status: CURRENT**

Faculty may edit authorized class-section fields through audited server-side APIs. Course catalog identity and protected term identity remain controlled; Faculty class-section editing MUST NOT change the course identity, semester, or school year. Lecture-room, laboratory-room, and schedule concepts remain distinct.

## ID-001 - Split Student identity
**Status: CURRENT**

Canonical Student identity stores first name, optional middle name, and last name as separate persisted fields. APIs may expose a compatibility display name, but MUST NOT persist or overwrite the entire name as one Student field.

## ACA-001 - Server-authoritative academic decisions
**Status: CURRENT**

Retention and grading decisions remain server-authoritative through the existing backend APIs. Client-local state, fabricated grades, and fallback subjects MUST NOT become authoritative academic decisions.

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
* Google may verify an invited identity during acceptance, but MUST NOT provide invitation authority or enable public signup.
* Google-linked users MUST retain email + password login capability.
* The previous BIO-001 placeholder wording, insofar as it left biometric product requirements unresolved, is superseded by BIO-001–BIO-010 and ATT-001–ATT-006. Those product requirements and boundaries are approved, while biometric implementation and the remaining deferred technical selections listed in BIO-007 and §9 remain deferred. This supersession does not claim biometric functionality is implemented or authorize implementation.

Affected roadmap/documentation should be aligned before or together with implementation of Google authentication.

---
