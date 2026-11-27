# Brief: server setup fails early, not after 15 minutes (Neon hand-off, emergency mode), 2026-11-28

Written by Claude with the Owner for Gemini 4 Neon high, run headless by Claude. Item: provisioning
hardening (DEL-001). Owner's words: "fix the script this time. Don't let it happen again." Claude reviews
and merges.

## Setup (done by Claude's driver; do not redo)

- Worktree `C:\Users\decha\Desktop\Github\dentisys-provision-hardening`, **detached** at the current HEAD of
  `lighthal9-polish-tables` (`49167a32` or later). Commit on the detached HEAD.
- No server is touched in this run. Never connect to a VPS or run `provision-vps.ps1`, `deploy-vps.sh` or
  `upload-vps.ps1` against one.

## Rules

`.agents/rules/dentisys-neon.md`, `AGENTS.md` and `CLAUDE.md` apply. Workers only with `/swarm` and
`gemini-4-neon-medium` or `-low`. Commands from the workspace root with repo-relative paths. Never ask
mid-run: list doubts and go on. Never read or edit `.env*` files.

## What failed on 2026-11-28 (three real AWS setups)

1. **Mail, found only at the end.** Production setup ran ~15 minutes, then the first Dean invitation email
   failed ("Invitation e-mail delivery failed ... First Dean invitation failed; check SMTP configuration",
   `scripts/deploy-vps.sh` ~line 216). The Gmail address / App Password typed at the prompts
   (`scripts/provision-vps.ps1` ~lines 279–281) were most likely wrong; nothing checked them earlier.
2. **Superadmin step vs older images.** `deploy-vps.sh` calls `account-admin.php create-superadmin
   --skip-if-exists` (added in `321b3906`). On a server whose web image predates that option, the old
   parser reads `--skip-if-exists` as an option taking the next argument, the email ends up empty, and setup
   fails with "Refused: Email is required" (happened twice on the demo).
3. **`-NewInstance` on Windows.** `provision-vps.ps1` (~lines 100–120) scans the new host key with Windows
   `ssh-keyscan`, which fails against OpenSSH 10.2 servers ("choose_kex: unsupported KEX method
   sntrup761x25519-sha512@openssh.com") and then throws "No replacement host key was obtained", although
   the server is fine. Plain `ssh` from the same PC connects to it.

## Contract

1. **Check the Gmail login at the prompt** (`provision-vps.ps1`), right after the App Password is typed and
   before anything is sent to the server: an SMTP login to `smtp.gmail.com:587` with STARTTLS and AUTH,
   **sending no email**, from the PC (plain .NET `TcpClient`/`SslStream`, no new dependency). On a refused
   login: say "Gmail refused this address and App Password" and ask both again, up to 3 tries, then stop
   with that message. When the PC cannot reach port 587 at all (network), warn and continue (the server
   may still reach it). Put the check in one small function; unit-test the reply parsing if it is separable.
2. **Superadmin step never breaks setup on an older image** (`deploy-vps.sh`): before calling
   `create-superadmin --skip-if-exists`, check that the web container's `account-admin.php` contains
   `skip-if-exists`. If not: print `WARNING: this web image cannot create the Superadmin at setup; after the
   next image update run: <the exact manual create-superadmin command with the configured email and names>`
   and continue (no failure, no second invitation). Same for a failed create when non-interactive is off.
3. **`-NewInstance` works on Windows** (`provision-vps.ps1`): when `ssh-keyscan` gets no key, fall back to
   reading the host key with `ssh` itself into a temporary known_hosts file
   (`-o UserKnownHostsFile=<temp> -o StrictHostKeyChecking=accept-new -o BatchMode=yes`, connecting with
   the given key and initial user on port 22, then 2202), show the fingerprint as today, and replace the
   old entries only after the Owner confirms, as today. Keep `ssh-keyscan` as the first try.
4. **Mail failure message** (`deploy-vps.sh`, first Dean line): when it fails, say exactly how to fix it on
   the server without a new setup: edit `SMTP_USER` / `SMTP_PASS` in `/opt/dentisys/.env`, then rerun the
   same `provision-vps.ps1` command (it continues the existing setup). No behaviour change otherwise.
5. Unchanged: every other prompt, default, check and message; the Superadmin rules from
   `docs/archive/brief-provision-superadmin-2026-11-28.md`.

## Docs (same commit)

`docs/deploy-from-scratch.md` troubleshooting table: one row each for "Gmail refused" at the prompt, the
Superadmin warning on an older image, and the mail failure fix. Nothing else.

## Tests and gates (once, on the final tree)

1. PowerShell parse check of `scripts/provision-vps.ps1`; `bash -n scripts/deploy-vps.sh`.
2. Any unit test you add, run once.
3. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1` (output to a log file).
4. `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-postgres.ps1` once with
   `$env:INTEGRATION_CONTINUE_ON_FAIL = '1'`: the live `e2e/live/grade-submission.spec.ts` failures are a
   known open bug (9.32); list any other failure under Doubts, do not fix unrelated tests.

**Commit:** `fix(deploy): setup checks the Gmail login early, survives older images and rebuilt servers`
with body lines `Contract: docs/archive/brief-provision-hardening-2026-11-28.md` and `Test: <file>` or
`Test: none - <reason>`.

## Report

`docs/archive/report-provision-hardening-2026-11-28.md` (`dentisys-handoff` skill, section 4b): path,
files, how each of the three failures is now handled, test and gate results, Doubts. Commit it.

## Answers to the readiness doubts (settled; they override anything above)

1. **`-NewInstance` confirmation:** keep today's behaviour exactly: no new `Read-Host` in
   `Reset-InstanceHostKeys`; the existing later confirmation is the one meant by "as today".
2. **Older-image Superadmin warning:** (a) print the short form, with each value shell-quoted:
   `sudo docker exec -it -u www-data dentisys-web-1 php /var/www/html/backend/bin/account-admin.php create-superadmin --email '<e>' --first '<f>' --last '<l>' --reason 'Created at server setup'`.
   (b) Yes: image has the option and the create fails -> `fail` when `--non-interactive`, otherwise
   warn with the manual command and continue; image lacks the option -> always warn and continue.
3. **`-NewInstance` fallback:** use `$SshPort` (no hardcoded 2202). Probe port 22 with `$InitialUser`,
   then `$SshPort` with `$User`.
