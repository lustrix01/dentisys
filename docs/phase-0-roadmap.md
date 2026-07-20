# Phase 0 Roadmap: Requirements Reconciliation and Architecture Baseline

## Purpose

Phase 0 establishes the approved documentation and architecture baseline for DentiSys before implementation begins. It reconciles the Owner-provided capstone/SAD requirements, IAS Module A requirements, IAS Module C requirements, audit/logging requirements, provisional ERD expectations, and the actual repository architecture.

Phase 0 is documentation-only. It does not implement application behavior, database schema, authentication, authorization, security controls, facial recognition, machine learning, reports, email, or infrastructure.

## Current Repository Baseline

Confirmed repository facts:

- The active development branch for this work is `lighthal`.
- The repository contains a preserved React 19, TypeScript, Vite, React Router, TailwindCSS frontend in `frontend/`.
- The frontend contains substantial mock/prototype workflows for academic grading, student records, retention monitoring, remedial exams, attendance, manual overrides, audit views, facial-enrollment-ready screens, reporting screens, settings, Faculty workflows, Dean/Admin workflows, and Class Secretary workflows.
- The frontend remains mock-data and localStorage driven; it is not wired to backend APIs.
- The backend in `backend/` is a plain-PHP local API foundation with a health endpoint.
- The current backend exposes `GET /api/health` and a direct `healthcheck.php` endpoint.
- The backend deliberately does not implement authentication, authorization, CORS, CSRF enforcement, DentiSys CRUD endpoints, or business validation.
- The database foundation uses MariaDB and currently creates only `_schema_migrations`.
- DentiSys business tables are intentionally absent.
- `database/migrations/README.md` requires approved data-model decisions before business schema is added.
- Existing validation is available through root npm scripts and `scripts/check.ps1`, with known frontend lint baseline debt.

Current repository-local instructions:

- Preserve existing React routes, pages, styling, assets, localStorage keys, mock users, role checks, and mock workflows unless future approval explicitly allows behavior changes.
- Do not add dependencies, Composer, PHP frameworks, frontend API integration, test frameworks, business database tables, production infrastructure, or CI/CD without approval.
- Keep the PHP backend plain, small, and local-development focused.
- Avoid unrelated refactors and formatting churn.
- Plan before broad future changes.

## Phase 0 Scope

Phase 0 creates a documentation baseline that future phases must use as the source of truth for scope, requirements, decisions, and approval gates.

Included work:

- Create a Phase 0 roadmap and approval-gate document.
- Create a requirements traceability matrix covering capstone/SAD, IAS Module A, IAS Module C, audit/logging, and ERD-related requirements.
- Create an architecture decision register for open and proposed decisions.
- Mark frontend-only behavior as `Prototype Only`.
- Mark missing or unresolved requirements without concealing them.
- Keep the ERD explicitly provisional.
- Name the next recommended phase without planning it in implementation-level detail.

## Phase 0 Exclusions

Phase 0 must not:

- Modify frontend code, routes, components, styling, localStorage keys, mock users, role checks, or mock workflows.
- Modify backend PHP code, routes, controllers, helpers, or security headers.
- Modify tests, scripts, package manifests, lockfiles, Docker files, environment files, XAMPP setup, deployment files, or CI/CD files.
- Create database tables, DDL, migrations, seed data, or an approved final ERD.
- Implement authentication, TOTP MFA, JWT rotation, JWT revocation, RBAC, rate limiting, audit logging, input validation, parameterized queries, ACL rules, grading, retention, remedial handling, attendance, facial recognition, machine learning, reports, notifications, or email.
- Add dependencies or migrate frameworks, languages, infrastructure, or database engines.
- Commit, push, merge, or change branches.

## Documentation Deliverables

Approved Phase 0 files:

- `docs/phase-0-roadmap.md`: phase purpose, baseline, scope, exclusions, deliverables, acceptance criteria, approval gates, stop conditions, and later phase names.
- `docs/requirements-traceability.md`: source register and traceability matrix connecting requirements to current evidence, status, future phase, validation artifact, related decision, and open issue.
- `docs/architecture-decision-register.md`: decision format and decision records for architecture, ERD, authentication, security, audit, biometric, machine-learning, reporting, and network assumptions.

No existing documentation file is modified in Phase 0.

## Acceptance Criteria

Phase 0 is complete only when:

- The three approved Markdown files exist under `docs/`.
- The traceability matrix uses stable IDs with `CAP-SAD-*`, `IAS-A-*`, `IAS-C-*`, `AUD-*`, and `ERD-*` prefixes.
- The traceability matrix uses only these status values: `Confirmed`, `Prototype Only`, `Documented Future Requirement`, `Missing`, `Conflict`, and `Owner Decision Required`.
- Every required capstone/SAD, IAS Module A, IAS Module C, audit/logging, and ERD concern from the approved prompt is represented.
- Frontend mock/localStorage behavior is not marked as implemented production behavior.
- TOTP, JWT, rate limiting, ACLs, biometric processing, backend persistence, and security behavior are not claimed unless supported by repository evidence.
- The ERD remains explicitly provisional.
- Later phases are high-level placeholders only.
- Validation confirms only the three approved files changed.

## Approval Gates

Owner and Gatekeeper approvals are required at these points:

- Requirements gate: approve the traceability matrix statuses and open decisions.
- Architecture gate: approve the architecture baseline and resolve any stack conflict before implementation.
- ERD gate: approve the data-model direction before any table or migration work.
- Security gate: approve IAS Module A/C control scope before authentication, MFA, JWT, RBAC, rate limiting, ACL, or audit implementation.
- Phase exit gate: confirm Phase 0 documentation is accepted before beginning Phase 1.

## Stop Conditions

Stop and return to the Owner or Gatekeeper if:

- Any fourth file would need to change.
- Any existing file would need to be modified.
- Repository-local instructions prohibit the documentation work.
- Requirements conflict in a way that requires a product, architecture, ERD, privacy, security, or deployment decision.
- A requirement cannot be represented without inventing unsupported source material or implementation behavior.
- Work would require application code, schema, dependency, authentication, infrastructure, deployment, or network changes.
- The worktree contains unrelated changes overlapping the approved files.

## Later Phase Placeholders

Later phases are intentionally high-level and dependency-based:

- Phase 1: Approved ERD and Data Model Baseline - depends on Phase 0 traceability and decision-register approval.
- Phase 2: Authentication, MFA, RBAC, and Session Security Baseline - depends on approved identity, role, and audit decisions.
- Phase 3: Core Academic Records and Grading Backend - depends on approved ERD and grading policy versioning.
- Phase 4: Retention, Remedial, Cost-Recovery, and Reporting Backend - depends on approved academic records, retention policy, and report boundaries.
- Phase 5: Attendance, Biometric Consent, Facial Recognition Boundaries, and Audit Expansion - depends on approved biometric, privacy, attendance, and service-boundary decisions.
- Phase 6: Machine-Learning Risk Prediction and Evidence Reporting - depends on approved data history, Random Forest model boundary, prediction-history storage, and validation evidence.
- Phase 7: Deployment, Network ACL, and Operational Hardening - depends on approved local architecture and later deployment environment decisions.

## Next Recommended Phase

`Phase 1: Approved ERD and Data Model Baseline`

Reason: all future implementation depends on an approved data model, normalized entity boundaries, historical tracking decisions, authorization boundaries, and auditability requirements.
