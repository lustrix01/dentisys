# Brief: new servers create the Superadmin at setup (Neon hand-off, emergency mode), 2026-11-28

Written by Claude with the Owner for Gemini 4 Neon high, run headless by Claude. Item: provisioning
Superadmin (spec SYS-001, ADM-001, DEL-001). Every product question here is settled: it is the agreed
contract. Claude reviews and merges.

## Setup (done by Claude; do not redo)

- Worktree `C:\Users\decha\Desktop\Github\dentisys-superadmin-provision`, **detached** at the current HEAD of
  `lighthal9-polish-tables`. Commit on the detached HEAD; Claude fast-forwards the branch after review.
- Docker: up (dev stack in `C:\Users\decha\Desktop\Github\dentisys`). No VPS is touched in this run: the
  Owner runs the real setup afterwards (demo `3.104.161.37`, production `13.55.10.243`, both AWS).
- Parallel Claude work: none.

## Rules

1. `.agents/rules/dentisys-neon.md` applies in full, with `AGENTS.md` and `CLAUDE.md`.
2. Path per item as that rule says; workers only with `/swarm` and `gemini-4-neon-medium` or `-low`.
3. Every command runs from the workspace root with repo-relative paths. Never `cd` first.
4. Never ask mid-run. A doubt: leave that part untouched, list the exact question, go on.
5. Never connect to a VPS, never run `provision-vps.ps1`, `deploy-vps.sh` or `upload-vps.ps1` against a server.

## Why

A new server today gets only the first Dean invitation (`spec.md` line ~370, `bootstrap-first-dean.php`, run
by `scripts/deploy-vps.sh` ~line 216). The Superadmin (exactly one, created only by the server script,
SYS-001) is a manual step written only in `docs/release-guide.md` "A site without a Superadmin". The Owner
wants new servers to create it at setup. The first Dean stays exactly as it is: the Dean invites Faculty,
the Superadmin never invites (ADM-001).

## Contract

1. **Prompts** (`scripts/provision-vps.ps1`, next to the "First Dean" prompts ~line 283, same `Read-Answer`
   style): `Superadmin first name`, `Superadmin last name`, `Superadmin email`.
   - With `-Production`: all three required. Without `-Production` (demo): the email may be left blank
     (`-Optional`), and then the names are not asked and no Superadmin is created (the demo's test seed
     brings its own test Superadmin).
   - Validation like the Dean's (~line 301): the email must use an allowed domain, and it must differ from
     the First Dean email (case-insensitive). Shown in the summary like the Dean's (not a secret).
2. **Carried to the server** as `SUPERADMIN_EMAIL`, `SUPERADMIN_FIRST_NAME`, `SUPERADMIN_LAST_NAME`, through
   the same path the `FIRST_DEAN_*` values take: `scripts/provision-vps.sh` (its key whitelist ~lines 54, 85,
   185) into the server `.env`. Not passed into the containers: only the setup script reads them.
3. **Created at setup**, in `scripts/deploy-vps.sh` right after the `bootstrap-first-dean.php` line: when
   `SUPERADMIN_EMAIL` is set **and no Superadmin account exists in any status**, run
   `account-admin.php create-superadmin --email … --first … --last … --reason "Created at server setup"`
   as `www-data` in the web container, answering its confirmation (it asks for `YES`, as
   `docs/release-guide.md` shows). When a Superadmin already exists, or the email is blank, skip with one
   line saying why. A failure behaves like the Dean line: `fail` when non-interactive, a `WARNING` otherwise.
   Reruns must never send a second link or create a second account.
4. **The "already exists" check** is your choice, smallest that works and is tested: for example a
   `--skip-if-exists` option on `create-superadmin` in `backend/bin/account-admin.php` (prints
   "Superadmin already exists; nothing to do." and exits 0), or a read-only query in `deploy-vps.sh`. Do not
   change what `create-superadmin` does without the option.
5. **Unchanged:** first Dean invitation, `bootstrap-first-dean.php`, the manual `create-superadmin` path for
   existing sites, every other prompt and default, production/demo differences other than item 1.

## Tests

- If you add the option: a backend or database test that runs `create-superadmin --skip-if-exists` twice on
  a database with no Superadmin and asserts exactly one Superadmin account and one invitation, plus one run
  with a Superadmin already present asserting nothing changes. Put it with the existing account-admin tests
  (find them with a search for `account-admin` under `tests/`).
- `bash -n scripts/deploy-vps.sh scripts/provision-vps.sh`; PowerShell parse check of
  `scripts/provision-vps.ps1` (`[System.Management.Automation.Language.Parser]::ParseFile`).

## Docs (current reference, same commit)

- `docs/deploy-from-scratch.md`: the prompt table (new rows, "blank on the demo"), and the step 1 list of what
  the setup creates.
- `README.md` B5a: the server script creates the Superadmin at setup on new servers; the manual command stays
  for existing sites.
- `docs/release-guide.md` "Setting up a new server" and "A site without a Superadmin": new servers do it at
  setup; the manual step is for an existing site only.
- `.env.vps.example` (and any other `.env` example the documentation contract asks for): the three
  `SUPERADMIN_*` lines with a one-line comment.

## Gates (once, on the final tree)

1. Syntax checks above, then the focused test file.
2. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` (output to a log file).
3. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-postgres.ps1` (backend and Docker-side scripts
   changed). Run it once with `$env:INTEGRATION_CONTINUE_ON_FAIL = '1'`, read every failure, fix all in one
   pass, then one normal confirming run. Foreground, timeout 600000, output to a log file.

**Commit:** `feat(deploy): new servers create the Superadmin at setup (SYS-001)` with body lines
`Contract: docs/archive/brief-provision-superadmin-2026-11-28.md` and `Test: <the test file>`.

## Answers to the readiness doubts (settled; they override anything above)

1. **`.env.vps.example`:** Claude added the three `SUPERADMIN_*` lines with their comment after the
   `FIRST_DEAN_*` block and committed them on the detached HEAD before this build. Do not read or edit any
   `.env*` file; rely on those exact keys (`SUPERADMIN_EMAIL`, `SUPERADMIN_FIRST_NAME`,
   `SUPERADMIN_LAST_NAME`). Leave `.env.vps.example` out of your worker file lists.

## Report

`docs/archive/report-provision-superadmin-2026-11-28.md` with the `dentisys-handoff` skill, section 4b: path
chosen, files changed, the "already exists" approach, test results, gate results, Doubts. Commit it.
