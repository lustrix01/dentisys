# DentiSys specifics

Repo `C:\Users\decha\Desktop\Github\dentisys`. `AGENTS.md`, `CLAUDE.local.md` and `spec.md` win. The 2026-10 series is the worked example: `docs/archive/walkthrough-2026-10.md` (commits, rulings, lessons) and the report https://claude.ai/artifact/R4m3YnByXTLHJrUsLrPkvy.
Run/gate/device-sweep/screenshot commands live in the **ui-fix-demo** skill (`references/dentisys.md`, `scripts/shots.mjs` with `steps`); reuse them, don't copy them.

## Roles, order, real device
| Role | Login (dev) | Device | Must-walk jobs |
|---|---|---|---|
| Dean (Admin) | `admin` | desktop | invite Faculty, academic terms, reports, System Audit, email logs, dashboard numbers vs DB |
| Faculty | `faculty`, or a fresh invite | desktop + phone | create class (room/time clash), roster import, start/schedule session, attendance, grades setup → scores → compute → export, Secretary requests panel, student invites |
| Secretary | `secretary` | phone + desktop | roll call per session, attendance change requests (ATT-006: need Faculty approval), dashboard KPIs |
| Student | fresh invite (7-day link) | phone | accept invite, face registration, check-in (dev mocks), attendance, classes, grades only (no scores) |
Seeded passwords: `ui-fix-demo/references/dentisys.app.json`. Fresh test accounts made in 2026-10: Faculty `ana.testcruz`, Student `bea.testlopez` (seed-pattern passwords); add per-role `app.json` copies in `audit-output/<batch>/` for them.

## Before any walk
- Mail: `.env` must be Mailpit-only (`EMAIL_PROVIDER=mailpit`, SMTP_USER/PASS blank). Read invites at http://localhost:8025. In dev the invite API also returns `invitation_link`.
- Face/camera can't run in the review browser: use the dev biometric/location mocks (`DEVELOPMENT_LOCATION_FIXTURES`); a real-phone face test is the Owner's.
- Data-changing flows run locally only. The demo is checked read-only (`scripts/demo-live-check.mjs`, DB counts). No emails from the demo.
- `.claude/skills/user-walkthrough-audit/scripts/local-states-example.mjs` shows how to force states (new Faculty with no classes, room clash, form errors, approved request label) with Playwright + API.

## Known traps
- Times: always Manila; raw UTC from the API is a recurring bug (`formatManilaWhen`).
- Capped queries (e.g. a `LIMIT 500`) make dashboards wrong silently; compare with the DB.
- Google button follows browser language unless the script URL has `?hl=en`.
- Gates: `scripts/check.ps1` and `scripts/check-postgres.ps1` in **separate** processes; never `git stash` while one runs. New migrations: `scripts/migrate.ps1` locally (backs up first).
- Mocked e2e: `scripts/test-e2e.ps1` with NO_COLOR/FORCE_COLOR unset.

## Deploy (only when told) — `CLAUDE.local.md` "Demo deploy and test"
1. `publish-images.ps1 -Tag demo` from a `git worktree add --detach` copy.
2. New migration → `demo-vps.ps1 migrate` first; then `demo-vps.ps1 wait-deploy <sha12>`.
3. `demo-test.ps1` (smoke 4/4 + audit chain), then `node .claude/skills/user-walkthrough-audit/scripts/demo-live-check.mjs` adapted to the release.
4. Report sha + `.\scripts\promote-prod.ps1 -Sha <sha>`. Commit nothing until the Owner promotes (needs HEAD == sha, clean tree).

## Boundaries
Never touch the production VPS, its credentials or `:prod` images. Never read `~/.dentisys/demo.env` values into chat. Dean invite user_id 1 is the Owner's. The Owner's real class lists/spreadsheets in Downloads are never committed, uploaded or printed. spec.md changes only with explicit Owner approval.
