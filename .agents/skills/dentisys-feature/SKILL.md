---
name: dentisys-feature
description: Contract-first feature and behavior change workflow for DentiSys in Antigravity. Use when implementing a backlog feature or changing app behavior.
---

# DentiSys Feature Workflow (Antigravity)

## 1. Contract first
1. Read the backlog entry in `docs/PRODUCT_BACKLOG.md` and only the relevant sections of `spec.md`.
2. If the task conflicts with `spec.md`, stop and surface a `SPEC CHANGE REQUIRED` block (`SPEC-001`) before coding.
3. **Stage A — Concept alignment first (plain prose):** Before asking multiple-choice API/implementation questions, discuss the core product tension and 2–3 high-level options (trade-offs, privacy/UX impact, no HTTP codes or DB column details yet). Wait for the Owner to pick the conceptual direction.
4. **Stage B — Specifics & contract (`/grill-me`):** Only after the conceptual direction is settled, lock API/error/edge-case specifics, draft the contract (endpoints, fields, validation errors, role/permission checks, audit events, edge cases), and present a crisp "what changes vs. user-facing impact" summary plus any `SPEC-001` block for Owner approval before coding.

## 2. Implementation split (Swarm)
1. Implement directly **only** when the change is `<= 3 files AND <= 150 total changed lines` AND introduces no new behavior tests.
2. For all other changes — and **always** when adding/updating behavior tests — use `swarm` with `gemini-4-neon-medium` workers and disjoint file ownership:
   - Separate the **code worker** from the **test worker** for new feature logic so code and tests do not share one blind spot.
   - Inspect `git diff` across every worker's edits before accepting or committing.
3. **Mandatory test-worker pre-flight checklist** (include in `backend-tests` / `frontend-tests` briefs):
   - When changing external visibility, permissions, or grading/retention contracts, `git grep` **all** `tests/backend/*_test.php` and `e2e/live/*.spec.ts` for affected endpoints so existing tests are updated in the same pass.
   - PHP test traps: never assert `null` with `$arr['k'] ?? 'non-null'` (use `array_key_exists('k', $arr) ? $arr['k'] : 'missing'`); scope `notifications` queries by title/dedup prefix when a `notification_type` (like `remedial_assignment`) is shared across multiple events; never pass courses still referenced by `grading_configs` to `integration_retire_fixture_classes()`.
   - Live E2E cleanup traps: DentiSYS normalizes names to Title Case (`AtRisk` → `Atrisk`); `afterEach` archiving a class that may have a pending remedial must fall back from `cancelled` to `submit` + `finished` (`CLS-003`).

## 3. Visible behavior proof
- If the user can see anything on screen, load `dentisys-ui-demo` and produce a **`Behaviour Demo`** artifact (real-app screenshots of each step, never hand-written mockups) for Owner approval before committing.

## 4. Validation gates
1. Run the full fast sweep first (CRLF normalization on all changed files, `php -l`, **all** `tests/backend/*_test.php`, `doc_contract_test.php`, `npx tsc -b`, `npm test`) before launching `check-postgres.ps1`.
2. On the exact final files (zero untracked files), run gates in order so both stamps record the final tree in one pass:
   - `pwsh -ExecutionPolicy Bypass -File scripts/check-postgres.ps1` first (required whenever backend, database, migrations, Docker, or `e2e/live` changed).
   - `pwsh -ExecutionPolicy Bypass -File scripts/check.ps1` second.
3. Commit those exact tested files with author `Light505 <181879156+Light505@users.noreply.github.com>`, backlog ID in subject `(X.Y)`, and no AI trailers.
4. Verify `.git/dentisys-pass/<HEAD^{tree}>.check` (and `.pg` when required) match `HEAD^{tree}`.
