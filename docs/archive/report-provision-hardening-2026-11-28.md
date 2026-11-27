# Handoff Report: Provisioning Hardening (DEL-001)

Date: 2026-11-28

## Git state

- **Worktree:** `C:\Users\decha\Desktop\Github\dentisys-provision-hardening` (detached `HEAD`)
- **Base before build:** `49167a32aa42b645ecff5b624ee2862c35177ee9` (`chore(workflow): Neon brief for the Superadmin at VPS setup`)
- **Fix commit:** `64ce954f186204b104d02290db83e3f5be2e4e92` — `fix(deploy): setup checks the Gmail login early, survives older images and rebuilt servers`
- **Fix tree (`HEAD^{tree}`):** `1bde461777df245df60725dbb1ff5e1c52dd2c13`
- **Report commit:** follows `64ce954f` on the detached `HEAD`
- **Peer branch / parallel Claude overlap:** none

## Path chosen & worker models

- **Item:** `provision-hardening` (DEL-001)
- **Path chosen:** `swarm` (2 workers)
- **Reason:** Changes 4 files across PowerShell provisioning, Bash deploy script, troubleshooting docs, and unit tests, and modifies product code together with its tests; per `.agents/rules/dentisys-neon.md`, implementation and tests were split across separate `gemini-4-neon-medium` / `gemini-4-neon-low` workers with disjoint file ownership.

| Worker | Model ID | Files Owned |
|---|---|---|
| `impl-provision` | `gemini-4-neon-medium` | `scripts/provision-vps.ps1`, `scripts/deploy-vps.sh`, `docs/deploy-from-scratch.md` |
| `test-provision` | `gemini-4-neon-low` | `tests/scripts/provision_vps_test.ps1` |

Both workers were killed after diff inspection and verification.

## Files changed (commit `64ce954f`)

1. **`scripts/provision-vps.ps1`**
   - Added self-contained SMTP reply/login helpers (`ConvertFrom-SmtpReply`, `Resolve-SmtpAuthReply`, `Test-GmailSmtpLogin`) before `Push-Location`.
   - Wrapped the Gmail address and App Password prompts in a 3-attempt loop that verifies login against `smtp.gmail.com:587` before anything is sent to the server.
   - Updated `Reset-InstanceHostKeys` (`-NewInstance`) to fall back to `ssh` into a temporary `known_hosts` file when `ssh-keyscan` obtains no host key.
2. **`scripts/deploy-vps.sh`**
   - Updated the First Dean non-interactive failure message to explain how to fix SMTP credentials in place without a new setup.
   - Added `shell_quote()` and an image capability check (`grep -Fq -- 'skip-if-exists' /var/www/html/backend/bin/account-admin.php`) before running `account-admin.php create-superadmin --skip-if-exists`, falling back to a warning with the exact shell-quoted manual command.
3. **`docs/deploy-from-scratch.md`**
   - Added three rows to the Section 7 Troubleshooting table: `"Gmail refused this address and App Password"` at the prompt, `WARNING: this web image cannot create the Superadmin at setup`, and `First Dean invitation failed` / SMTP failure during setup. No other section was edited.
4. **`tests/scripts/provision_vps_test.ps1`**
   - Added standalone PowerShell 7 unit tests (53 assertions) parsing `scripts/provision-vps.ps1` with zero syntax errors, dot-evaluating only the three SMTP helpers from the AST, testing `ConvertFrom-SmtpReply` and `Resolve-SmtpAuthReply` across single-line, multi-line, truncated, empty, and malformed replies, and testing `Test-GmailSmtpLogin` against a guaranteed-closed ephemeral `127.0.0.1` loopback port.

No `.env*` file was read or modified. No VPS was contacted, and none of `provision-vps.ps1`, `deploy-vps.sh`, or `upload-vps.ps1` was executed against any server.

## How each of the three failures is now handled

1. **Wrong Gmail address / App Password found only after ~15 minutes**
   - Right after `Gmail App Password` is entered in `scripts/provision-vps.ps1` (before uploading or touching the server), `Test-GmailSmtpLogin` opens a plain .NET `TcpClient`/`SslStream` connection to `smtp.gmail.com:587`, upgrades with `STARTTLS`, runs `AUTH LOGIN` (matching `backend/app/mailer.php`, preserving spaces in App Passwords), and sends `QUIT` without sending any email (`MAIL FROM` / `RCPT TO` / `DATA` are never sent; BSTR and credential byte arrays are cleared in `finally`).
   - On a refused login (`5xx` auth reply): disposes the rejected `SecureString`, prints `Gmail refused this address and App Password. Check both and try again.`, and re-prompts both address and App Password up to 3 attempts, then throws `Gmail refused this address and App Password.` so nothing is sent to the server.
   - On network unreachability (DNS/TCP/timeout/TLS/transient `4xx`): prints a warning that the PC could not reach `smtp.gmail.com:587` and continues (the server may still reach it).
   - If the First Dean invitation still fails later on the server (`scripts/deploy-vps.sh`), the non-interactive error message now tells the operator to edit `SMTP_USER` and `SMTP_PASS` in `/opt/dentisys/.env` on the server and rerun the same `provision-vps.ps1` command (continuing the existing setup).
2. **Superadmin step breaking setup on an older web image**
   - Before invoking `account-admin.php create-superadmin --skip-if-exists`, `scripts/deploy-vps.sh` checks inside the running `web` container with `grep -Fq -- 'skip-if-exists' /var/www/html/backend/bin/account-admin.php`.
   - If `skip-if-exists` is absent (older image): prints `WARNING: this web image cannot create the Superadmin at setup; after the next image update run: sudo docker exec -it -u www-data dentisys-web-1 php /var/www/html/backend/bin/account-admin.php create-superadmin --email '<e>' --first '<f>' --last '<l>' --reason 'Created at server setup'` (with each value single-quoted via `shell_quote`) and continues without failing or sending a second invitation, even in `--non-interactive` mode.
   - If `skip-if-exists` is present and `create-superadmin` fails: calls `fail` when `--non-interactive` is on, and prints a `WARNING:` with the manual command and continues when `--non-interactive` is off.
3. **`-NewInstance` failing on Windows against OpenSSH 10.2**
   - `Reset-InstanceHostKeys` in `scripts/provision-vps.ps1` keeps `ssh-keyscan` as the first try on ports `22` and `$SshPort`.
   - If `ssh-keyscan` obtains no key on either port, it falls back to running `ssh` with `-i $identity -o IdentitiesOnly=yes -o UserKnownHostsFile=<temp> -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10 -T -p <port> <user>@$Ip true` into a unique temp file under `[IO.Path]::GetTempPath()`, probing port `22` with `$InitialUser` first and then `$SshPort` with `$User`.
   - When the temp file contains a host key, it fingerprints it via `ssh-keygen -l -f -`, displays the fingerprints as before, deletes the temp file in `finally`, and removes old entries via `ssh-keygen -R` with today's existing flow (no new `Read-Host` prompt).

## Test and gate results

### 1. Syntax, unit tests, and documentation contract (on exact committed tree `1bde461777df`)

- UTF-8 no-BOM check on all 4 changed/added files — **PASS**
- PowerShell AST parse check (`scripts/provision-vps.ps1`, `tests/scripts/provision_vps_test.ps1`) — **PASS** (0 errors)
- `bash -n scripts/deploy-vps.sh` — **PASS** (exit 0)
- `pwsh -NoProfile -ExecutionPolicy Bypass -File tests/scripts/provision_vps_test.ps1` — **PASS** (`PASS: 53 assertions passed, 0 failed.`, exit 0; verifies new helpers and closed-port unreachable behavior without contacting any remote host)
- `docker compose run --rm --no-deps -v "${PWD}:/workspace:ro" web php /workspace/tests/documentation/doc_contract_test.php` — **PASS**

### 2. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`

- **Result:** **PASS** (exit 0)
- **Details:** Compose config checks, runtime validator negative test, MariaDB/PostgreSQL scans, frontend build (`tsc -b && vite build`), 390/390 frontend unit tests, 4/4 git hook tests, PHP lint + all backend tests inside Docker `web`, documentation contract test, and 381/381 mocked Playwright E2E tests passed.
- **Stamp recorded:** `.git/dentisys-pass/1bde461777df245df60725dbb1ff5e1c52dd2c13.check` (`exists=True`, matches commit `64ce954f`'s `HEAD^{tree}`).

### 3. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-postgres.ps1` (with `INTEGRATION_CONTINUE_ON_FAIL=1`, isolated project `dentisys-integration-prov`)

- **Result:** **FAILED** at live Playwright step (`e2e/live/grade-submission.spec.ts`), exit 1 — only the known open bug (9.32).
- **Parts that PASSED:**
  - Private backup, empty-target restore, and First Dean SMTP failure/retry — **PASS**
  - `tests/database/ui_migration_test.php` — **PASS**
  - `tests/database/postgres_integration_test.php` — **ALL POSTGRESQL INTEGRATION TESTS PASSED**
  - `backend/bin/audit-verify-chain.php --strict` — **AUDIT CHAIN OK (811 events, last sequence 811)**
  - `scripts/smoke.ps1` (`/api/health` and `/healthcheck.php`) — **PASS**
  - Live Playwright: **27 passed**, 4 skipped (`demo-smoke.spec.ts`), **2 failed** (`e2e/live/grade-submission.spec.ts:33` and `:154`, known open bug 9.32).
- **Stamp:** `.git/dentisys-pass/1bde461777df245df60725dbb1ff5e1c52dd2c13.pg` was **not written** because `check-postgres.ps1` exited non-zero on the 2 known live Playwright failures (note: commit `64ce954f` changes no server-side paths tracked by `test-stamp.ps1`'s `$ServerPaths`).

## Known gaps / pre-existing issues left untouched

- Pre-existing live Playwright failures in `e2e/live/grade-submission.spec.ts` (lines 111 & 281, known open bug 9.32): `page.locator('div').filter({ has: page.getByRole('heading', { name: courseName }) })` fails to find `class-grade-status` after class cards moved to `<article>`. Left untouched per brief.
- `Test-GmailSmtpLogin` live STARTTLS/AUTH exchange against `smtp.gmail.com:587` and `-NewInstance` live `ssh` fallback against an OpenSSH 10.2 server were not executed because this run touches no remote server; reply parsing, auth status classification, and closed-port unreachability are unit-tested locally in `tests/scripts/provision_vps_test.ps1`.

## Doubts (not acted on)

None. All three readiness doubts were settled by Claude before the build pass and implemented as specified.
