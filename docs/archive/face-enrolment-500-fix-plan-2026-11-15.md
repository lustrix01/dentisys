# Face enrolment 500 — fix plan (2026-11-15)

For: the implementer (Codex). Branch: `lighthal9-responsive`. Read `AGENTS.md` first.

## Scope (hard limits — read before anything else)

This is a one-file hotfix. Do only what this plan says, in the order it says.

**Files you may create or change: exactly these two.**
- Create `database/migrations/064_biometric_active_without_expiry.sql` (content below, verbatim).
- Commit this plan file as it is (`docs/archive/face-enrolment-500-fix-plan-2026-11-15.md`). Do not edit it.

**Everything else is read-only.** That includes all PHP, the sidecar, the frontend, tests, e2e, other migrations, `spec.md`, `docs/`, scripts, `.env` files, Docker/Compose files and `package*.json`. No formatting, renames, refactors, lint fixes, dependency updates or "while I'm here" changes. Do not run `npm install`, formatters or code generators that rewrite files.

**Commands you may run: only those listed in "Verify locally" and "Ship", plus read-only `git status` / `git diff` / `git log`.** No `git checkout`/`switch`/`merge`/`rebase`/`reset`/`stash`, no force-push, no other branches. Never delete or recreate a Docker volume or database.

**If anything fails or does not match this plan, stop.** That includes a gate failing, an unexpected file in `git status`, or a script asking for something the plan doesn't mention. Do not work around it, and do not fix unrelated failures. Report the exact command and output to the Owner and wait.

Before committing, `git status` must show only the two files above. If it shows anything else, stop.

## Symptom

Production, Student → Face Registration → capture → upload:

> A server error occurred. Try again later. Adjust lighting, face the camera directly, and start a fresh capture, or contact your Faculty/Secretary for manual attendance.

Every enrolment fails: first-time enrolment and "Update my face".

## Root cause (reproduced locally, proven)

Commit `6706bcb` (backlog 12.2, "faces kept between terms") changed the success UPDATE in
`backend/controllers/StudentBiometricController.php` (around line 406) to write
`reference_expires_on = NULL, reference_term_id = NULL, reference_cs_id = NULL` while setting
`enrollment_status = 'active'`.

The database still has the check constraint from `database/migrations/011_student_biometric_attendance.sql:115`:

```sql
ck_biometric_active_reference CHECK (
  enrollment_status <> 'active' OR (
    consent_status = 'approved' AND face_enrolled = 1
    AND protected_object_reference IS NOT NULL AND btrim(protected_object_reference) <> ''
    AND reference_expires_on IS NOT NULL      -- <== now always violated
    AND enrolled_at IS NOT NULL AND revoked_at IS NULL))
```

Postgres rejects the row (`SQLSTATE 23514`), PHP has no specific handler, so
`student_biometric_emit_exception` returns a generic 500 → the frontend shows the message above.

Evidence (local stack, current code):
- `POST /api/student/biometric/enrollment` → `500 INTERNAL_ERROR` after ~13 s (sidecar succeeded).
- db log: `new row for relation "biometric_profiles" violates check constraint "ck_biometric_active_reference"`.
- In a rolled-back transaction, recreating the constraint without `reference_expires_on IS NOT NULL` lets the same UPDATE succeed.

Data impact so far: none. The failure path rolls back, revokes the new sidecar reference, restores the previous profile, and audits `biometric_enrollment_failed`. Existing faces are untouched.

## Fix (one new file)

Create `database/migrations/064_biometric_active_without_expiry.sql`:

```sql
-- Backlog 12.2 follow-up: faces no longer expire at term end (spec BIO-005), so an active face no longer needs reference_expires_on.
-- Same constraint as 011 minus that one condition. Without this every enrolment fails with a check violation (HTTP 500).
ALTER TABLE biometric_profiles DROP CONSTRAINT IF EXISTS ck_biometric_active_reference;
ALTER TABLE biometric_profiles
    ADD CONSTRAINT ck_biometric_active_reference
    CHECK (
        enrollment_status <> 'active'
        OR (
            consent_status = 'approved'
            AND face_enrolled = 1
            AND protected_object_reference IS NOT NULL
            AND btrim(protected_object_reference) <> ''
            AND enrolled_at IS NOT NULL
            AND revoked_at IS NULL
        )
    );
```

Do NOT:
- change PHP, the sidecar or the frontend (the code already matches spec 12.2; only the schema lags);
- edit migration 011 (migrations are ordered and append-only);
- touch existing rows' `reference_expires_on` (out of scope, see Follow-ups).

Write the file as UTF-8 without BOM (see `CLAUDE.md` "Encoding safety").

## Verify locally

1. Apply: `./scripts/migrate.ps1`
2. Re-run the reproduction (below). Expected: `enrollment 201`, body has `"enrollmentStatus":"active"`.
3. Gates (DB change): `./scripts/check.ps1` then `./scripts/check-postgres.ps1`. Both must pass.
4. If a gate fails on something unrelated to migration 064, stop and report it (see Scope). Do not fix it.

Reproduction script (needs the face frames in `~/.dentisys/benchmark-face`, already on this machine). Save outside the repo, e.g. `%TEMP%\enrol.mjs`, run with
`node %TEMP%\enrol.mjs http://localhost:8080 student@bicol-u.edu.ph Student123! %USERPROFILE%\.dentisys\benchmark-face`:

```js
import fs from 'node:fs';
import path from 'node:path';
const [base, email, password, dir] = process.argv.slice(2);
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
if (!login.access_token) { console.log('login failed', login); process.exit(1); }
const auth = { authorization: `Bearer ${login.access_token}` };
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
let ch;
for (let i = 0; i < 40; i++) { // retry until the random challenge matches the recorded actions
  const r = await fetch(`${base}/api/student/biometric/liveness/challenge`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'enrollment' }) });
  ch = await r.json();
  if (!r.ok) { console.log('challenge', r.status, ch); process.exit(1); }
  if (JSON.stringify(ch.actions) === JSON.stringify(manifest.enrollActions)) break;
}
const fd = new FormData();
fd.append('challengeId', ch.challengeId); fd.append('challengeToken', ch.challengeToken); fd.append('idempotencyKey', crypto.randomUUID());
for (const f of fs.readdirSync(dir).filter((n) => n.startsWith('enroll-')).sort()) fd.append('frames[]', new Blob([fs.readFileSync(path.join(dir, f))], { type: 'image/jpeg' }), f);
const r = await fetch(`${base}/api/student/biometric/enrollment`, { method: 'POST', headers: auth, body: fd });
console.log('enrollment', r.status, (await r.text()).slice(0, 300));
```

The Student must already have consent granted (the seeded `student@` account has).

## Ship as a hotfix (Owner approved Codex to push and deploy demo and prod, 2026-11-15)

Stop at the first failure and report it. Do not continue to the next step.

1. Commit only the migration and this plan: `fix(biometrics): allow active faces without a term expiry (migration 064)`. Author `Light505`, no AI trailers (no Co-Authored-By lines).
2. `git push` to `lighthal9-responsive`. Never force-push.
3. Demo:
   1. `./scripts/publish-images.ps1 -Tag demo`. Note the 12-character sha it prints.
   2. `./scripts/demo-vps.ps1 migrate` (required: this release adds a migration; it backs up first).
   3. `./scripts/demo-vps.ps1 wait-deploy <sha>`
   4. `./scripts/demo-test.ps1`
   5. `./scripts/demo-vps.ps1 tunnel-start`, then run the reproduction against `http://localhost:<DEMO_LOCAL_PORT>` with the demo Student account from `~/.dentisys/demo.env` (`DEMO_STUDENT_EMAIL` / `DEMO_STUDENT_PASSWORD`; never print the password). Expected: `enrollment 201`.
4. Production: `.\scripts\promote-prod.ps1 -Sha <sha> -DryRun` first, then without `-DryRun`.
   - HEAD must equal `<sha>` (the script refuses otherwise).
   - **The Owner must be at the keyboard.** The script stops twice for secrets that only the Owner types into the terminal: (a) a GitHub token with `write:packages` for `light505`, and (b) the `devops` sudo password on the production VPS (asked by `sync-vps-db.ps1` while it backs up and applies migration 064). Never ask for these in chat, never store them, never put them in a file or a command line.
   - The script applies the migration before it switches images, so a failed migration leaves production untouched.
5. Ask the Owner to try Face Registration on production. Report: the tested sha, the result of each step above, and anything skipped.

Never touch the production `.env`, database or containers outside `promote-prod.ps1`.

## Why the gates missed it

`check-postgres.ps1` / e2e did not exercise a real enrolment UPDATE against the real schema after 12.2. Not fixed here; see Follow-ups.

## Follow-ups (out of scope: Codex must NOT do any of these; listed only for the Owner)

1. Regression test: a Postgres-backed test that performs a successful enrolment (or at least the success UPDATE) against the migrated schema.
2. Frontend wording: a plain 500 lands in the "Adjust lighting…" branch of `FaceRegistration.tsx` (~line 413), which misleads Students when the server is at fault.
3. Old faces still carry `reference_expires_on` (e.g. 2026-12-18), returned as `expiresAt` by the profile API, and `academic_year.php` still propagates term dates to them. Harmless now, but inconsistent with "faces kept between terms".
4. Production log access: the `devops` account needs a sudo password for `docker logs`, so prod errors can't be read non-interactively.
