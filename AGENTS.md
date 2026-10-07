# DentiSys Repository Rules

These rules apply to everyone who changes this repository — people working by hand and AI coding assistants alike. No particular editor, assistant, or tool is required; the only tooling needed is Docker Desktop, PowerShell, Node.js, and Git.

## Stack and safety

- DentiSys runs locally through Docker Compose only. Do not add XAMPP, native PHP, native MySQL/MariaDB, or `local.php` runtime paths.
- Keep the stack small: React/Vite, plain PHP with Composer dependencies, PostgreSQL, Mailpit, and optional development-only pgAdmin.
- Do not delete or reuse a persisted database volume without explicit approval. Schema changes are additive, ordered migrations.
- Current sign-in is password plus optional authenticator-app 2FA with recovery codes. Do not reintroduce email-code 2FA.
- Google Sign-In alongside password authentication, Google-assisted registration, configurable multi-domain allowlists, facial biometrics, image publishing, and demonstration deployment are approved or planned future work; they are not all implemented.
- Preserve existing routes, styles, assets, localStorage keys, roles, and workflows unless the task requires a behavior change.
- Keep secrets out of version control. Docker Compose reads local values from root `.env`; backend runtime configuration comes from container environment variables.
- Avoid unrelated refactors and formatting churn. Keep future image publishing seams lightweight; do not add registry, VPS, TLS, CI/CD, Traefik, Watchtower, or cloud deployment files without approval.

## Product specification

- `spec.md` is the authoritative source for approved DentiSys product behavior and durable product decisions.
- Before planning or implementing work that affects specified behavior, read the relevant sections of `spec.md` and preserve unaffected rules. Read only the sections relevant to the task.
- Do not modify, remove, reinterpret, supersede, or add authoritative specification decisions without explicit Owner approval. A conflicting request does not itself authorize changing `spec.md`.
- Stop and surface conflicts to the Owner. You may propose an exact specification amendment but must not apply it before approval.
- If uncertainty could affect product behavior, requirements, scope, or `spec.md`, do not guess. Ask the Owner.
- After the Owner resolves the uncertainty, record any durable product decision or guardrail in `spec.md`, with explicit Owner approval before modifying the specification.

## Implementation simplicity

- Prefer the simplest targeted implementation that satisfies the current approved requirement and reuse existing project patterns.
- Do not add abstractions, generic frameworks, helper systems, services, architectural layers, speculative extensibility, or solutions for hypothetical future requirements unless the current task requires them.
- Do not refactor, split, reorganize, or rewrite working code merely because it is large or theoretically cleaner. Add dependencies only for a concrete current need; “future-proofing” alone is not scope justification.
- Keep validation proportional to the files, subsystem, and behavior changed. Treat active runtime files and current documentation as authoritative; inspect archived or historical material (`docs/archive/`, old handoffs) only when the task requires it.

## Regression prevention

- Do not introduce regressions in existing functionality, data integrity, security, permissions, API contracts, calculations, routes, workflows, or desktop/mobile behavior unless the Owner explicitly approves the specific regression in advance. Approval to add, refactor, or transfer a feature does not itself permit regressions.
- Compare changes against the working baseline and preserve existing capabilities and safeguards. If a proposed change requires degraded or removed behavior, explain the exact impact and obtain explicit Owner approval before implementing it; existing specification change-control rules still apply.
- Any unapproved regression introduced by the change blocks completion, commit, merge, and push. Fix it or obtain explicit Owner approval for that specific exception. Never conceal regressions or weaken meaningful tests to make checks pass.

## Working together

- Start each feature with a stable contract: agree on fields, errors, and examples before implementation.
- When work is split between contributors, assign each file to exactly one owner for that piece of work, and settle overlaps before editing.
- **Functional work** — backend and frontend behavior, event handlers, API clients/routes/types, state, validation, calculations, authentication, persistence, roles/permissions, business logic, authoritative business wording, functional accessibility, and the tests for them — stays with the functional owner.
- **Presentation-only work** — visual JSX/CSS, layout, styles, presentational labels, contrast, and other non-authoritative visual polish — must not change anything in the functional list above. A presentation contributor who finds a needed functional change reports it instead of making it.
- Keep one person responsible for the shared disposable test environment at a time. Reuse a running stack when safe and avoid unnecessary rebuilds; never delete the development database or volume. Use the separate disposable integration project for destructive validation.

## Validation

- While iterating, run syntax/type checks and focused tests for changed behavior. Verify fixture correctness with a cheap check before expensive suites. If a check fails, isolate a minimal reproducer and classify the failure as infrastructure, fixture, or product before rerunning a broad gate.
- Batch coherent work before the aggregate gates. Review one frozen batch once; after fixes, rerun the focused checks and only the evidence the fixes invalidated; do not repeat unchanged passing checks.
- Documentation or instruction changes: run `git diff --check` and targeted reference checks; run the documentation contract when its covered files or migration naming change.
- Ordinary frontend or backend runtime changes: use targeted checks while iterating, then run `./scripts/check.ps1` before handoff. Do not repeat checks already included in that script.
- Dockerfiles, dependency locks, or Compose build changes: run `docker compose config --quiet` and build the affected service. Database, authentication, runtime-integration-sensitive, milestone, or final changes also require `./scripts/check-postgres.ps1`.
- Run `./scripts/migrate.ps1` only when applying or verifying migrations against an existing development database, and `./scripts/smoke.ps1` only when checking a running stack.
- For integration closeout, fast-forward the exact tested tree and carry its validation evidence forward. Do not drop meaningful assertions, conceal failures, or skip a required final gate. Actual defects block closeout; hypothetical improvements go to the backlog.
