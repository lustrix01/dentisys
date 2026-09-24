# DentiSys Repository Rules

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
- Before planning or implementing work that affects specified behavior, read the relevant sections of `spec.md` and preserve unaffected rules.
- Do not modify, remove, reinterpret, supersede, or add authoritative specification decisions without explicit Owner approval. A conflicting request does not itself authorize changing `spec.md`.
- Stop and surface conflicts to the Owner. Agents may propose an exact specification amendment but must not apply it before approval.
- Read only the sections relevant to the current task rather than mechanically loading the entire specification for unrelated or trivial work.
- If uncertainty could affect product behavior, requirements, scope, or `spec.md`, do not guess. Ask the Owner.
- After the Owner resolves the uncertainty, record any durable product decision or guardrail in `spec.md`, with explicit Owner approval before modifying the specification.

## Implementation simplicity

- Prefer the simplest targeted implementation that satisfies the current approved requirement and reuse existing project patterns.
- Do not add abstractions, generic frameworks, helper systems, services, architectural layers, speculative extensibility, or solutions for hypothetical future requirements unless the current task requires them.
- Do not refactor, split, reorganize, or rewrite working code merely because it is large or theoretically cleaner. Add dependencies only for a concrete current need; “future-proofing” alone is not scope justification.
- Keep validation proportional to the files, subsystem, and behavior changed. Treat active runtime files and current documentation as authoritative; inspect archived or historical material only when the task requires it.

## Collaboration workflow

- Start each feature with a stable contract: agree on fields, errors, and examples before implementation. Luna XHigh owns backend and frontend functional implementation, focused tests, integration, and tools. Gemini is limited to a presentation pass: visual JSX/CSS, layout, styles, presentational labels, contrast, and other non-authoritative visual accessibility polish. Gemini must not change event handlers, API clients/routes/types, state, validation, calculations, authentication, persistence, roles/permissions, business logic, or authoritative business wording. Luna owns functional accessibility and interaction behavior as needed. Visual JSX/CSS may overlap functional files, so the parent assigns exclusive ownership and coordinates conflicts; Gemini reports a conflict instead of resolving functional code. The user manually relays Gemini's UI prompt, while the parent owns detailed dispatch and waits without routine supervision.
- Keep one Owner responsible for the shared disposable test environment. Reuse a running stack when safe and avoid unnecessary rebuilds; never delete the development database or volume. Use the separate disposable integration project for destructive validation.
- Prefer Luna XHigh for delegated tools and implementation. The parent agent coordinates waits and uses compact progress only when needed; do not create routine monitoring work.

## Validation

- Owner priority amendment (2026-09-24): follow spec.md section 9B and `docs/ui-migration-plan.md`: entire `owhie_backend` UI into `lighthal5`, then 3NF/schema fit, then frontend/backend wiring. Intermediate UI batches may retain failing tests; record exact failures and defer repair to the wiring phase. This overrides functional-first sequencing and intermediate aggregate-pass requirements only. Do not delete meaningful tests, conceal failures, claim functional completion, or waive final integration gates. Database safety and functional/presentation ownership rules remain unchanged.

- While iterating, run syntax/type checks and focused tests for changed behavior. Verify fixture correctness with a cheap check before expensive suites. If a check fails, isolate a minimal reproducer and classify the failure as infrastructure, fixture, or product before rerunning a broad gate.
- Batch coherent work before the aggregate gates. Review one frozen batch once, then after fixes rerun focused checks and review only evidence materially invalidated by those fixes; do not repeat unchanged passing checks.
- Documentation or instruction changes: run `git diff --check` and targeted reference checks; run the documentation contract when its covered files or migration naming change.
- Ordinary frontend or backend runtime changes: use targeted checks while iterating, then run `./scripts/check.ps1` before handoff. Do not repeat checks already included in that script.
- Dockerfiles, dependency locks, or Compose build changes: run `docker compose config --quiet` and build the affected service. Database, authentication, runtime-integration-sensitive, milestone, or final changes also require `./scripts/check-postgres.ps1`.
- Run `./scripts/migrate.ps1` only when applying or verifying migrations against an existing development database, and `./scripts/smoke.ps1` only when checking a running stack.
- For integration closeout, fast-forward the exact tested tree and carry its validation evidence forward. Do not drop meaningful assertions, conceal failures, or skip a required final gate. Actual defects block closeout; hypothetical improvements go to the backlog.
