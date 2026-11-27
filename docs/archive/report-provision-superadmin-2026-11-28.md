# Handoff Report: Provision Superadmin at VPS Setup (SYS-001, ADM-001, DEL-001)

Date: 2026-11-28

## Git state

- **Worktree:** `C:\Users\decha\Desktop\Github\dentisys-superadmin-provision` (detached `HEAD`)
- **Base before build:** `daff762d` (`chore(deploy): document SUPERADMIN_* in the VPS env example (SYS-001)`, on top of `5631797f` from `lighthal9-polish-tables`)
- **Feature commit:** `321b390677b0a4d92d505b7d1f0ffa9646efeeb4` — `feat(deploy): new servers create the Superadmin at setup (SYS-001)`
- **Feature tree (`HEAD^{tree}`):** `f6acf90a318392496e747a9ced6f518d20ce0606`
- **Report commit:** follows `321b3906` on the detached `HEAD`
- **Peer branch / parallel Claude overlap:** none

## Path chosen & worker models

- **Item:** `provision-superadmin` (SYS-001, ADM-001, DEL-001)
- **Path chosen:** `swarm` (2 workers)
- **Reason:** Changes 9 files across PHP CLI, VPS scripts, docs, and tests, and modifies product code together with its tests; per `.agents/rules/dentisys-neon.md`, implementation and tests were split across separate workers with disjoint file ownership.

| Worker | Model ID | Files Owned |
|---|---|---|
| `impl-superadmin` | `gemini-4-neon-medium` | `backend/bin/account-admin.php`, `scripts/provision-vps.ps1`, `scripts/provision-vps.sh`, `scripts/deploy-vps.sh`, `docs/deploy-from-scratch.md`, `README.md`, `docs/release-guide.md` |
| `test-superadmin` | `gemini-4-neon-low` | `tests/database/superadmin_split_integration.php`, `tests/backend/superadmin_split_test.php` |

Both workers were killed after diff review and gate verification.

## Files changed (commit `321b3906`)

1. **`backend/bin/account-admin.php`** — Added boolean flag `--skip-if-exists` to `account_admin_args()` and `create-superadmin`, and updated the top usage comment. Without `--skip-if-exists`, `create-superadmin` behavior is unchanged.
2. **`scripts/provision-vps.ps1`** — Added `Superadmin first name`, `Superadmin last name`, and `Superadmin email` prompts right after the First Dean prompts (`Read-Answer` style). With `-Production`, all three are required. Without `-Production` (demo), `Superadmin email` is asked first with `-Optional`; if blank, the name prompts are skipped and no `SUPERADMIN_*` keys are sent. When `SUPERADMIN_EMAIL` is set, validates it uses an allowed domain and differs case-insensitively from `FIRST_DEAN_EMAIL`. Non-secret `SUPERADMIN_*` values appear in the summary when set.
3. **`scripts/provision-vps.sh`** — Added `SUPERADMIN_FIRST_NAME`, `SUPERADMIN_LAST_NAME`, and `SUPERADMIN_EMAIL` to the stdin key whitelist (line 54), fresh-config validation (required when `IMAGE_SET=prod`; whenever `SUPERADMIN_EMAIL` is non-empty, requires names, allowed domain, and case-insensitive inequality with `FIRST_DEAN_EMAIL`), and `.env` value map (line 204). Values are written only to `/opt/dentisys/.env` (never passed into containers).
4. **`scripts/deploy-vps.sh`** — Right after `bootstrap-first-dean.php`, reads `SUPERADMIN_EMAIL`, `SUPERADMIN_FIRST_NAME`, and `SUPERADMIN_LAST_NAME` from `/opt/dentisys/.env` via `env_value` (unescaping `\'` to `'` in names). When `SUPERADMIN_EMAIL` is non-blank, invokes `account-admin.php create-superadmin --skip-if-exists --email "$SUPERADMIN_EMAIL" --first "$SUPERADMIN_FIRST_NAME" --last "$SUPERADMIN_LAST_NAME" --reason 'Created at server setup'` as `www-data` in `web` with stdin supplied via here-string `<<< 'YES'` (avoiding `set -o pipefail` + `SIGPIPE` when `--skip-if-exists` exits early). Failures call `fail` when `--non-interactive`, else emit a `WARNING` to stderr (matching `bootstrap-first-dean.php`). When `SUPERADMIN_EMAIL` is blank, prints `SKIP: Superadmin setup skipped (SUPERADMIN_EMAIL is blank).`
5. **`docs/deploy-from-scratch.md`** — Updated "What the command does" item 3 and the Section 3 prompt table with the Superadmin rows (required on production, blank on demo).
6. **`README.md`** — Updated Section B5a to state that new VPS servers create the Superadmin at setup (`provision-vps.ps1` / `deploy-vps.sh`), document `--skip-if-exists`, and clarify that the manual `create-superadmin` command stays for existing sites.
7. **`docs/release-guide.md`** — Updated "A site without a Superadmin" (manual step is for existing sites only) and "Setting up a new server" (production creates the Superadmin from prompts; demo leaves `Superadmin email` blank because the demo seed brings its own Superadmin).
8. **`tests/database/superadmin_split_integration.php`** — Added integration tests in Section C for `create-superadmin --skip-if-exists`:
   - Run 1 on a DB with 0 Superadmin rows: exits 0, creates 1 `Pending Activation` Superadmin, issues 1 live 7-day `faculty_invitation` token, sends 1 email (`email_outbox`), writes 1 `superadmin_invited` audit row as `system` with reason `'Created at server setup'`.
   - Run 2 while `Pending Activation` exists: exits 0, prints `Superadmin already exists; nothing to do.`, keeps the same `user_id` and live `token_id`, sends no second email, and writes no second audit row.
   - Run while an `Active` Superadmin exists (with a different valid email): exits 0, prints `Superadmin already exists; nothing to do.`, leaves the existing Superadmin untouched, sends 0 emails to the new address, and writes no tokens or audit rows.
   - Preserved all existing non-flag `create-superadmin` assertions and final cleanup.
9. **`tests/backend/superadmin_split_test.php`** — Added DB-free contract assertions verifying `backend/bin/account-admin.php` contains `--skip-if-exists` and `Superadmin already exists; nothing to do.`.

`.env.vps.example` was not read or modified (already updated by Claude in `daff762d`). No VPS was contacted and none of `provision-vps.ps1`, `deploy-vps.sh`, or `upload-vps.ps1` was executed.

## The "already exists" approach

Implemented via `--skip-if-exists` on `create-superadmin` in `backend/bin/account-admin.php`:

- Inside the `create-superadmin` transaction, before calling `superadmin_invitation_issue()` or `account_admin_confirm()`, when `--skip-if-exists` is set:
  1. Acquires `pg_advisory_xact_lock(hashtext('dentisys_superadmin'))`.
  2. Calls `account_admin_superadmin($pdo)` (`SELECT ... FROM user_accounts WHERE role = 'superadmin' FOR UPDATE`, matching any status).
  3. If a row exists, rolls back the transaction, prints `Superadmin already exists; nothing to do.`, and exits `0`.
- `scripts/deploy-vps.sh` passes `--skip-if-exists` and feeds confirmation with `<<< 'YES'`, ensuring reruns never issue a second link or create a second Superadmin account.

## Test and gate results

### 1. Syntax & focused checks (all passed on exact committed tree `f6acf90a3183`)

- `bash -n scripts/deploy-vps.sh scripts/provision-vps.sh` — **PASS** (exit 0)
- PowerShell `[System.Management.Automation.Language.Parser]::ParseFile('scripts/provision-vps.ps1', ...)` — **PASS** (0 parse errors)
- UTF-8 BOM check on all 9 changed files — **PASS** (0 BOMs)
- `php -l backend/bin/account-admin.php tests/backend/superadmin_split_test.php tests/database/superadmin_split_integration.php` — **PASS**
- `php tests/backend/superadmin_split_test.php` — **PASS**
- `php tests/backend/superadmin_contract_test.php` — **PASS**
- `php tests/documentation/doc_contract_test.php` — **PASS**

### 2. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`

- **Result:** **PASS** (exit 0)
- **Details:** Frontend build (`tsc -b && vite build`), 390/390 frontend unit tests, 4/4 git hook tests, all backend PHP lint + contract/unit tests inside Docker `web`, documentation contract test, and 380 mocked Playwright tests passed (1 flaky test `e2e/admin.spec.ts:189` passed on retry).
- **Stamp recorded:** `.git/dentisys-pass/f6acf90a318392496e747a9ced6f518d20ce0606.check` (`exists=True`, matches commit `321b3906`'s `HEAD^{tree}`).

### 3. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-postgres.ps1` (with `INTEGRATION_CONTINUE_ON_FAIL=1`)

- **Result:** **FAILED** at live Playwright step (`e2e/live/grade-submission.spec.ts`), exit 1 — **pre-existing base-branch defect unrelated to this change**.
- **Parts that PASSED:**
  - Private backup, empty-target restore, and First Dean SMTP failure/retry — **PASS**
  - `tests/database/ui_migration_test.php` — **PASS**
  - `tests/database/postgres_integration_test.php` (including `superadmin_split_integration.php` and all new `--skip-if-exists` assertions) — **ALL POSTGRESQL INTEGRATION TESTS PASSED**
  - `backend/bin/audit-verify-chain.php --strict` — **AUDIT CHAIN OK (812 events, last sequence 812)**
  - `scripts/smoke.ps1` (`/api/health` and `/healthcheck.php`) — **PASS**
  - Live Playwright: **27 passed**, 4 skipped (`demo-smoke.spec.ts`), **2 failed** (`e2e/live/grade-submission.spec.ts:111` and `:281`).
- **Stamp:** `.git/dentisys-pass/f6acf90a318392496e747a9ced6f518d20ce0606.pg` was **not written** because `check-postgres.ps1` stopped on the 2 pre-existing live Playwright failures.

## Known gaps / pre-existing issues left untouched

1. **Pre-existing live Playwright failure in `e2e/live/grade-submission.spec.ts` (lines 106 & 280):**
   - Both tests fail looking for `page.locator('div').filter({ has: page.getByRole('heading', { name: courseName }) }).last().getByTestId('class-grade-status')`.
   - Root cause verified from `test-results/.../error-context.md` and `git show 1eb8d39e`: base commit `1eb8d39e` (`feat(ui): /classes class cards use the standard solid card with green spine (T3)`) changed the class card root in `frontend/src/pages/faculty/ClassesAndRosters.tsx` from `<Card>` (`<div>`) to `<article>` and wrapped `<h3>` in an inner `<div className="min-w-0">` that does not contain `data-testid="class-grade-status"`. The chip itself renders accurately (`Not submitted` / `Midterm published`) inside the `<article>`.
   - Left untouched because `e2e/live/grade-submission.spec.ts` is outside the scope of this deploy/Superadmin task (changing `page.locator('div')` to `page.locator('article')` at lines 106 and 280 is a 2-line fix on `lighthal9-polish-tables`).
2. **Flaky mocked test observed once during `check.ps1`:** `e2e/admin.spec.ts:189` (`Dean Student Summary and Retention exports...`) timed out once waiting for heading `Class 22` and passed on retry.

## Doubts (not acted on)

None. The single readiness doubt (`.env.vps.example` guard block) was resolved by Claude in commit `daff762d` before the build pass.
