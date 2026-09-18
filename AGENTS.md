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

## Validation

- Documentation or instruction changes: run `git diff --check` and targeted reference checks; run the documentation contract when its covered files or migration naming change.
- Ordinary frontend or backend runtime changes: use targeted checks while iterating, then run `./scripts/check.ps1` before handoff. Do not repeat checks already included in that script.
- Dockerfiles, dependency locks, or Compose build changes: run `docker compose config --quiet` and build the affected service. Database, authentication, runtime-integration-sensitive, milestone, or final changes also require `./scripts/check-postgres.ps1`.
- Run `./scripts/migrate.ps1` only when applying or verifying migrations against an existing development database, and `./scripts/smoke.ps1` only when checking a running stack.
