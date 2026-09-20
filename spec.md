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

# 8. Deferred Product Areas

Items here are known future areas, not authorization to implement them.

## BIO-001 — Facial biometrics

**Status: DEFERRED**

Facial-biometric work is planned but is not yet a complete production feature.

Future work includes unresolved implementation around consent, enrollment, storage, matching, attendance integration, auditability, and privacy controls.

Do not infer missing requirements.

## DEL-001 — Image publishing and deployment

**Status: DEFERRED**

Image publishing and demonstration deployment remain future work.

Do not add cloud infrastructure, TLS, deployment automation, registry configuration, CI/CD, or related infrastructure unless explicitly scoped and approved.

---

# 9. Open Decisions

An **OPEN** item cannot be resolved by an agent without Owner input.

Only add an item here when an implementation is blocked by a real unresolved product decision.

Do not invent speculative open questions.

Current open decisions:

* None recorded.

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

Affected roadmap/documentation should be aligned before or together with implementation of Google authentication.

---
