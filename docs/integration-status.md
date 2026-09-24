# Local integration status

## Current planning amendment - 2026-09-24

The current task checkout started clean at `67e16a0`; the continuation reports local `lighthal5` at the same functional commit. New UI source is `owhie_backend` at `bd5ab789cc537f1503fc78357ad5937e7926651a`. The [UI-first plan](ui-migration-plan.md) supersedes older integration priorities below. This amendment does not merge branches, run migrations, or declare UI/runtime completion. Preserve all parked changes and volumes. Older ref inventories below are timestamped historical snapshots, not current branch verification.

Inventory captured 2026-09-24 01:04:26 +08:00 after integrating the reviewed period-grading line.

## Integrated line

- `lighthal5` advanced from `2ab45a3d1b8a076d1a3d89338c3905c7d5a897e2` to `666ed4eeb4f94e9f385104296278b777bcb24cb5` by fast-forward.
- `gemini/period-grading-frontend` points to the same `666ed4e...` commit and has the same tree (`20a9008...`).
- The reviewed source is an ancestor-preserving fast-forward; no remote push, reset, deletion, migration execution, or database-volume action was performed.
- `lighthal5` is 12 commits ahead of cached `origin/lighthal5` (`bd9d1f1...`).

Validation: `git diff --check 2ab45a3... lighthal5` passed; the source and integrated refs have identical trees; `2ab45a3...` is an ancestor of `666ed4e...`. Existing reviewed evidence remains applicable to this identical tree: the source line had 40 unit tests, 5 focused checks, a 125-test Gemini run, and 8 PostgreSQL checks reported clean.

## Worktrees and local state

All registered worktrees were read-only inspected and are clean at their recorded HEADs:

- Root: `lighthal5` at `666ed4e...`; preserved untracked `.agent-worktrees/` and `docs/local-demo-functional-delivery-plan.md`.
- `.codex/worktrees/8a1e/dentisys`: detached `a5d625e...`, an ancestor of `lighthal5`.
- `.codex/worktrees/ce13/dentisys`: detached `87b0fa8...`, one cherry-pick-unique biometric commit.
- `.agent-worktrees/faculty-contract-migration`: `codex/faculty-contract-migration` at `930ac1d...`.
- `dentisys-biometric-backend`: `ai/student-biometric-attendance-2026-09-22/backend` at `e5e102a...`.
- `dentisys-biometric-config-backend`: `codex/biometric-sidecar-configuration-2026-09-22-backend` at `0fc0ab7...`.
- `dentisys-biometric-frontend`: `ai/student-biometric-attendance-2026-09-22/frontend` at `3a02354...`.

One stash remains and was not applied: `stash@{0}` (`f077c7a`), WIP refresh-token rotation/reuse detection/server-side logout. It changes five auth/runtime and database-test files (+702/-37) and has no recorded review result.

## Ref inventory against `lighthal5`

The comparison uses raw symmetric commit counts plus cherry-pick-aware right-only commits to avoid treating alternate commit IDs as pending work.

Already contained or identical: `ai/faculty-contract-ui-integration`, `codex/period-grading-config`, `lighthal`, `lighthal3`, `lighthal4`, `main`, `owhie-backend`, `owhie_fixFront`, `origin/lighthal`, `origin/lighthal3`, `origin/lighthal4`, `origin/lighthal5`, `origin/lumbang`, `origin/main`, and `origin/owhie_fixFront`.

Raw-divergent but patch-equivalent (zero cherry-pick-unique commits): `ai/faculty-ui-migration`, `codex/faculty-contract-migration`, `ai/student-biometric-attendance-2026-09-22/frontend`, and `codex/biometric-sidecar-configuration-2026-09-22-backend`. Their working trees are clean; do not merge their alternate histories.

## Residual candidates

| Ref | Unique change and evidence | Disposition |
| --- | --- | --- |
| `ai/student-biometric-attendance-2026-09-22/backend` | Four raw-right commits, one cherry-pick-unique: `4e73c91` adds timing fields/assertions to `tests/database/postgres_integration_test.php`. The branch otherwise overlaps the already integrated biometric line. | Safe only as a separately reviewed test follow-up; do not merge under the grading scope. |
| Detached `87b0fa8` | One unique commit, “Harden biometric model configuration”; eight files, including sidecar/config/docs/test changes. | Review with biometric owners; no merge. |
| `stash@{0}` | Auth refresh/reuse/logout WIP; five files, +702/-37; no test evidence in metadata. | Keep parked; review separately. |
| `lighthal2` / `origin/lighthal2` | Four unique older full-stack commits, including the incomplete faculty redesign; broad 500-file divergence. | Stale/superseded. |
| `owhie_backend` / `origin/owhie_backend` | Three unique alternate grading/class/retention commits (`6398620`, `a64a942`, `bd5ab78`); 12-file change from its base. | Superseded by the reviewed grading implementation; do not merge. |
| `origin/anj` / `origin/owhie` | One unique incomplete faculty grade/attendance redesign (`dd3e6eb`). | Stale/incomplete. |
| `origin/owhie-backend` | One unique older “last update of owhie” commit (`f753afd`). | Stale. |
| `origin/mic-backend-attempt` | Unrelated Express/TypeScript/Prisma backend skeleton (`ab82835`). | Outside the PHP/PostgreSQL stack; stale. |
| `origin/mic-backend2` | Old PHP config workaround (`f44b8e0`). | Stale. |
| `origin/pyro` | Old Docker/XAMPP hybrid skeleton (`dffc0ef`, `dd6aebc`). | Conflicts with the Docker Compose-only repository rule; do not integrate. |

No other local branch, cached remote-tracking ref, registered worktree, or stash showed a safe unreviewed integration for this grading request. The next concrete follow-up, if biometric work is later authorized, is to review `4e73c91` and `87b0fa8` against the current `lighthal5` biometric code as separate changes.
