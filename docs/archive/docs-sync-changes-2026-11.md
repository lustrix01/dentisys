# Step 3: current-reference docs synced to the code

Working tree only: nothing staged, committed or pushed. No Docker run except `docker compose config --quiet` (passes). `git diff --check` clean (only the usual LF/CRLF warnings). No touched file has a BOM. Line endings of each file were preserved. An untracked `docs/archive/spec-merge-proposal-2026-11.md` exists in the tree; I did not create it.

## Changed statements

### README.md
| Old | New | Proof |
|---|---|---|
| Runtime table: no VPS row (R2) | Added "VPS demo and production (DEL-001)" row linking release-guide and deploy-from-scratch | spec RUN-002; `docker-compose.vps.yml` |
| `git switch lumbanglighthal-owhie` (x3) (R1) | `git switch <current development branch>` in A2 only; A11 and B2 say "as in A2" | Owner question 1 |
| A8 step 1: only the landmark model | Also names the YuNet and SFace files, own SHA-256, points to calibration doc (R5) | `docker-compose.yml:49-57`, `docker-compose.web.yml:74-82` |
| A8 step 3: `BIOMETRIC_SIDECAR_URL=http://biometric:8000` (R4) | Removed; says Compose fixes the address | `docker-compose.yml:112`, `docker-compose.web.yml:44` |
| A8: "Also set BIOMETRIC_YUNET_*..." | names the two `*_SHA256` values explicitly | compose files |
| B3: "Every `replace_with_` value must be replaced; script refuses otherwise" (R6) | Script checks exactly 8 keys; Compose also needs every BIOMETRIC_* value, model path and hash | `start-single-server.ps1:21`, `.sh:16`, `docker-compose.web.yml:61-82` |
| B3 table: one model path/hash row (R7) | three host paths and three hashes, "container cannot start without all three" | `docker-compose.web.yml:72-82` |
| B3 BIOMETRIC row: "stays off until approved" | All seven required by Compose; real biometrics off because web.yml does not forward `BIOMETRIC_SIDECAR_ENABLED` | `config.php:248`, `docker-compose.web.yml` (no such key) |
| B8: biometrics "disabled outside development until approved" | off in this mode; VPS overlay forwards the switch | `docker-compose.vps.yml:35` |
| A4: no `-NoBuild` (R9) | Added | `start-dev.ps1:3` |
| Validation table: "link/reference checks" (R11) | "a check that the files and paths you mention exist" (no link checker exists) | `scripts/check.ps1` has none |
| Documentation list (R10); "empty AWS account" | Added release guide, hosting requirements, features/frontend/benchmark; "empty VPS provider account" | files exist |

### AGENTS.md (A1-A3 only)
Added "private biometric sidecar (Python/Flask)" (`biometric-sidecar/app.py`); removed "configurable multi-domain allowlists" (`config.php:170`); "demo and production VPS setup (DEL-001)".

### CLAUDE.md
`pwsh` (7.6.9) -> `pwsh` (C1).

### .env.example
| Old | New | Proof |
|---|---|---|
| SMTP_CA_FILE "no Compose file forwards it" (E1) | dev Compose forwards it; web.yml (single-server, VPS) does not | `docker-compose.yml:91` |
| ALLOWED_EMAIL_DOMAINS "kept for compatibility" | parsed/validated but value replaced by bicol-u.edu.ph | `config.php:170` |
| `SHOW_DEV_RESET_LINK=true`, `SHOW_DEV_INVITATION_LINK=true` as live settings (E3) | lines replaced by a comment: read by backend (dev, default true) but never forwarded, so no effect | `config.php:336-337`; no compose file lists them |
| `BIOMETRIC_SIDECAR_URL=` "leave blank" (E4) | line removed; comment says Compose fixes `http://biometric:8000` | `docker-compose.yml:112` |
| "Advanced overrides ... not passed by the provided Compose files" (E2) | scoped to docker-compose.yml; notes `docker-compose.test.yml` forwards RATE_LIMIT_STORAGE_DIR | `docker-compose.test.yml:25` |
| (missing vars) | added commented: APP_TIMEZONE, BIOMETRIC_SIDECAR_TIMEOUT_SECONDS, MAILPIT_SMTP_HOST/PORT (defaults noted), WEB_IMAGE, FRONTEND_IMAGE, BIOMETRIC_IMAGE | `config.php:234,326,349-350`; compose image lines |

### .env.vps.example
Header now "VPS deployment (demo and production)". Replica comment: "Owner decision 2026-11-04 ... demo runs 1 and 1; production keeps 3" -> default 3, each server's own `.env` holds the real number (E5). APP_ENV / APP_HTTP_PORT lines kept (the launcher substitutes line by line) but commented as unused on the VPS (E6, E7: `docker-compose.web.yml:8`, `docker-compose.vps.yml:74`). APP_BASE_URL/APP_IS_HTTPS noted as overridden by the overlay (`vps.yml:33-34`). BIOMETRIC_SIDECAR_ENABLED comment "DEL-001 demo opt-in" -> neutral switch description, only read when APP_ENV=single-server (`config.php:248`). "Team demonstration" -> "The launcher offers true" (`provision-vps.ps1:299`). ALLOWED_EMAIL_DOMAINS: value ignored note. No variable line added or removed.

### .env.single-server.example
Header notes the 8 keys checked by the start scripts and what Compose additionally requires; APP_ENV "not read by anything" (E6); biometric block says real biometrics stay off but the sidecar needs every value (`docker-compose.web.yml` does not forward the switch); BIOMETRIC_CHALLENGE_TTL_SECONDS "not forwarded by web.yml, backend default 120 applies" (`config.php:242`); model-path comment names all three models.

### docker-compose comments (comments only; `docker compose config --quiet` passes)
`docker-compose.web.yml:9,91`: "custom also needs COMPOSE_PROFILES=mailpit" -> start and VPS scripts pass `--profile mailpit` (S8; `start-single-server.ps1:35`, `deploy-vps.sh:119`). `docker-compose.yml:75`: "explicit APP_ENV" -> web.yml fixes APP_ENV=single-server.

### Scripts (comment headers/help only)
New 2-5 line headers (purpose, parameters, who calls it): check.ps1, migrate.ps1, smoke.ps1, pgadmin.ps1, test-e2e.ps1, check-postgres.ps1, sync-vps-db.ps1, upload-vps.ps1, publish-images.ps1, provision-vps.ps1, harden-vps.ps1, start-dev.ps1/.sh, start-single-server.ps1/.sh (16 + 4 files; S5, S6). One-liners for backup-vps.sh, deploy-vps.sh, harden-vps.sh, migrate-vps.sh, provision-vps.sh (S10). demo-vps.ps1 header now lists all demo.env keys (S2) and calls recompute-grades "deliberate one-off, not part of a release". start-single-server `.ps1`/`.sh`: comment that only 8 keys are checked (S7). Not changed: the error string in `demo-vps.ps1:25` (see Not done).

### docs/features.md (11 statement edits + dated header removal)
| Old | New | Proof |
|---|---|---|
| "checked ... on lighthal7 on 2026-10-07 ... lighthal8 on 2026-10-09" (D3) | removed | n/a |
| "approved High / At Risk / Low risk levels" (D1) | "single At Risk flag (no risk levels)" | no High/Low in `RetentionMonitoring.tsx`; spec UI-003 |
| "each passing at 50% or more" (D2) | 75% | `RetentionMonitoring.tsx:722,1231,1254` |
| "export as CSV or a printable PDF" (D4) | .xlsx or printable PDF; class lists included | `Reports.tsx:606,621,957`, `ClassesAndRosters.tsx:1367`, `GradeComputation.tsx:3117`, `SystemAudit.tsx:325` |
| "Midterm Watchlist ... or Faculty unlock the class; locked classes hidden" | no lock or manual unlock on screen | `retentionMonitoringContract.test.ts:99-100` (lock/unlock removed) |
| Faculty invitation "allowed domains ... AUTH-004" | only `@bicol-u.edu.ph`, AUTH-003 | `config.php:170` |
| dated add-ons "AUTH-005 amendment 2026-11-11", "2026-10-17 conversion table", "spec amendment 2026-10-26", "since 2026-10-28" (D5) | dates dropped | n/a |
| Deliberate boundaries: "production deployment ... out of scope" | demo and production VPS exist | `docker-compose.vps.yml`, release-guide |
| (missing) | added bullet: Dean/Admin class-section, course-catalog, people screens are non-authoritative previews (X14) | `pages/admin/Classes.tsx`, `CourseCatalog.tsx`, `PeopleAndAccounts.tsx` contain no API calls |

### docs/frontend.md (6)
Dropped "UI-001, 2026-11-03", "Owner review of 2026-11-07" + Filter Bar demo link, "Owner decisions of 2026-11-06" + Tab Bar demo link, "approved ... 2026-11-11", "Owner decision, spec"; page-wrapper line number `:789` -> "the outer div of the page" (`RetentionMonitoring.tsx:797`, D15). "Not settled yet" sentence left (see Owner Q).

### docs/lecture-laboratory-grading.md (D17 and more)
Rounding example rewritten to whole-percent (84%, 86%, 85% = round(25+60), was 85.4%): `FacultyController.php:3010-3027`, `gradeHelper.ts:25`. "CSV and print views" -> "Excel and print views". Attendance paragraph: editor only shows assessment-source categories (`GradeComputation.tsx:591,606`); server still computes an existing Attendance-source category, forbidden in lecture-only (`FacultyController.php:1413`). "Informational risk ... manual overrides unchanged" -> retention computed, no manual override (spec UI-003; `RetentionMonitoring.tsx` has no override). Amendment-record link to archive replaced by spec section IDs and the imports contract. Added lecture-only pointer.

### docs/architecture.md, docs/single-server.md
Added the biometric sidecar to the stack list (D13) and diagram (D11; `docker-compose.web.yml:56-89`); removed "development foundation, not deployment automation" (D14); "P03 real Student authentication" -> "Real Student authentication" (D12).

### docs/biometric-attendance-decisions.md, biometric-calibration-deployment.md, demo-biometrics.md
"two-action active-liveness" -> one action for attendance, two for enrollment (D18; `student_biometrics.php:370-375`). MATCH_COUNT row: "3 frames of up to 30" -> attendance captures 9 frames (8 + action frame), enrollment up to 30 (D19; `Attendance.tsx:760`, `FaceRegistration.tsx:453`, `app.py:557-563`). Fail-closed paragraph rewritten to what config does (`config.php:248`). History removed: LBPH replacement on 2026-10-11, "Owner decision 2026-09-28", "approved 2026-10-11", "references made before 2026-10-11", "one-day local demo". 12 + 2 + 2 edits.

### docs/hosting-requirements.md (D20-22)
Dropped "Approved by the Owner on 2026-11-02", "since 2026-11-05", "Benchmarked 2026-11-04", "Owner decision 2026-11-05", "2026-10-09 rule", "Accepted risks (Owner, 2026-11-02)" dates; added "each server's own `.env` holds the number it runs". The production-key exception is kept as an undated live risk (Owner Q3).

### docs/deploy-from-scratch.md (D23-25)
Removed the AWS-proof / "Since 2026-11-02" paragraph; "3 web + 3 frontend" -> `WEB_REPLICAS`/`FRONTEND_REPLICAS` (3 + 3 default); prerequisite "Windows PowerShell 5.1" -> PowerShell 7 (`pwsh`, as every command in the doc); "CSV/PDF export" -> Excel/PDF; "spec 2026-11-02" -> spec BIO-008; rolling-update row no longer says "the demo runs 1". AWS block (section 2) kept as an alternative provider.

### docs/release-guide.md (D27-29)
Dropped "Owner decisions 2026-10-14 and 2026-11-02"; removed the grade-rules one-off sentence from step 6; tunnel port -> `DEMO_LOCAL_PORT` (`demo-vps.ps1:77`); `git checkout lighthal9-responsive` -> `git checkout -`; "spec, 2026-11-13 amendment" -> spec UI-003; listed all `demo.env` keys.

### docs/vps-deployment.md (D26, 25 edits)
Retitled "VPS deployment"; removed the "Since 2026-11-02 ... written on AWS" banner and the AWS-only steps (EC2, Elastic IP, Security Group, Session Manager, .pem) in Quick start, Host/DNS/firewall and Before you start, rewritten provider-neutral with Vultr (`-InitialUser root`; `harden-vps.ps1:13-21` supports root); example key `aws.pem` -> `server-key`; "demonstration ... only team members enroll" split into demo vs production (spec BIO-008); `BIOMETRIC_SIDECAR_ENABLED` paragraph: read only with APP_ENV=single-server (`config.php:248`), no demo-only wording; "three web and three frontend replicas" -> `WEB_REPLICAS`/`FRONTEND_REPLICAS` default 3 (`docker-compose.vps.yml:31,73`); "The biometric gate audit found..." and "An earlier deploy installed..." history narration reworded; dated "2026-11-04 benchmarks" dropped. Not changed: the Watchtower "archived on 2025-12-17" fact (still true).

### docs/manual-demo-readiness.md (D30)
Removed the "UI migration status (2026-09-24)" banner; OUTPUT-01 CSV -> Excel/PDF; 40/60 preset -> 50/50 default (`GradeComputation.tsx:422`).

### docs/benchmark.md
Removed "Contract agreed 2026-11-04 (grill-me ...)" and the dated access-log note.

### docs/contracts (6 files)
audit-logging.md: status "APPROVED (2026-10-17)" + demo link -> "Current contract"; 4 "(decided 2026-10-17)" removed; "Owhie responsive merge" amendment label removed; section 6 retitled; row-count effect sentence removed. demo-academics.md / demo-auth.md: "delivered for the local demo" / "Local demo" removed (all 14 routes in the file exist in `backend/routes/api.php`; the test `academic_demo_contract_test.php` only needs the file). official-exports.md: status line, "What exists today" -> "Background (before this contract)", rules heading date, "Next steps" section deleted. lecture-only-grading.md: status line, headings "Owner answers (grill, date)", "Spec change (applied date)", "API (agreed for the build, date)", "Implementation impact". official-imports.md: 26 "(Owner, 2026-10-26)" style parentheticals stripped, status, section 3-4b headings ("needs Owner approval before applied" -> applied), "Known differences" rewritten (only the blank-score difference remains), "Today" column renamed "Before this contract", "Next steps" deleted, G10 "to be confirmed" removed, section 4c rewritten: promotion does not recalculate grades (matches `promote-prod.ps1` having no recompute call and spec UI-003), script is a deliberate one-off. All rule IDs and cited sections (audit 3-5, R12/R13, imports 2 and 4c, X1-X26, L*, G*) kept.

### database/README.md (D36, D37)
Tree no longer lists only migrations 001-005; points at the folder and the `NNN_lowercase_description.sql` rule (`doc_contract_test.php:34-44`); seeds/reports listed; "root README, section 6" -> section A6; 046 and 048 narrations rewritten as present rules (`academic_terms` table, computed retention); ID-002 / `a7582d8` plan paragraph reduced.

### docs/database/security-data-dictionary.md, docs/ias/module-a-identity-access.md
Title "Phase 2/P03 (15 Tables...)" -> neutral; "P03"/"P06" milestone codes removed; "Implementation update" banner -> "Current model"; `POST /api/activate-secretary` -> `/api/secretary/activate` (D31; `routes/api.php:241`).

## Owner questions
1. README R1: which branch should `git switch <current development branch>` name (README A2; A11 and B2 refer back to it)? Options: `main` (stale since 2026-07), the current working line, or a long-lived `develop`/release branch.
2. Replica counts (D20/E5): `docs/hosting-requirements.md` says both servers run 1 and 1; the old `.env.vps.example` comment said production keeps 3; code default is 3 and the real values live in each server's `.env` (not in the repo). I stated "default 3, each server's `.env` holds the number" and kept hosting-requirements' "both run 1 and 1". Confirm, or say production runs 3.
3. The "first production server was created with the demo key" risk (hosting-requirements, Accepted risks): I kept it as an undated live statement because I cannot see the server. Is it closed? If yes, delete the line.
4. `docs/frontend.md` "Not settled yet: page header, notice banners (three looks today), tables, empty states" (D16): I could not verify from code; left as is. Still true, or move to the backlog?
5. spec vs code: attendance Attendance-source categories (X7). Code and spec GRD-002 549-553 still allow an existing Attendance-source category on non-lecture-only courses, but the editor no longer offers it. I wrote what the code does; spec lines 549-553 need your decision.
6. spec BIO-008 / DEL-001 vs code: calibration doc says values are "development-only" while production runs real biometrics by default (BIO-008 2026-11-02). I kept the "provisional development values" language in `biometric-calibration-deployment.md`; confirm that wording is still wanted.
7. `docs/contracts/official-imports.md`, `official-exports.md` and `lecture-only-grading.md` still read as grill/proposal write-ups (Q&A tables, option A-D, "Background (before this contract)"). The audit classed them as records to archive; I only removed stale status text. Archive them, or keep as references?
8. `docs/manual-demo-readiness.md` has 14 "Last reviewed: 47e2029c..." stamps (a fill-in convention, not changed). Keep, or drop the field?
9. `docs/deploy-from-scratch.md` still carries the AWS alternative (section 2, table row for key pairs, troubleshooting `growpart`). Keep as an optional provider or delete AWS entirely?
10. Spec contradictions I did not touch (spec.md out of scope): X1-X12, X15-X18 and the S-* stacks in the audit; plus spec/code mismatch: spec RUN-001 omits the sidecar; spec says "3 of up to 30 frames" while attendance sends 9 (amended in BIO-007 2026-10-13, consistent).

## Behaviour bugs found (not fixed)
1. `.env.example:96-97` (before edit): `SHOW_DEV_RESET_LINK` / `SHOW_DEV_INVITATION_LINK` set in `.env` are never forwarded: no `docker-compose*.yml` lists them, `config.php:336-337` always uses the default `true`. Impact: README/dev docs imply they can be switched off; they cannot. Doc now says so.
2. `README.md` A8 step 3 (before edit) told users to set `BIOMETRIC_SIDECAR_URL`; `docker-compose.yml:112` and `docker-compose.web.yml:44` hard-code it, so the step was a no-op. Doc fixed.
3. `docker-compose.web.yml:61-82`: biometric sidecar needs all `BIOMETRIC_*`, model paths and hashes (`:?`) even though real biometrics stay off in single-server mode (web.yml never forwards `BIOMETRIC_SIDECAR_ENABLED`). Impact: single-server cannot start without biometric assets. Start scripts (`start-single-server.ps1:21`, `.sh:16`) only validate 8 keys, so placeholders like `replace_after_calibration` pass the script and fail later in Compose.
4. `BIOMETRIC_CHALLENGE_TTL_SECONDS` is listed in `.env.single-server.example` but `docker-compose.web.yml` does not forward it (backend default 120 applies); other web.yml-only gaps: `APP_TIMEZONE`, `BIOMETRIC_SIDECAR_TIMEOUT_SECONDS`, `SMTP_CA_FILE` cannot be set on single-server/VPS.
5. Dead route: `backend/routes/api.php:703-704` `/api/faculty/retention/watchlist/unlock` plus `unlockFacultyWatchlistApi` in `apiClient.ts:1006` remain although the screen has no lock/unlock (spec UI-003, `retentionMonitoringContract.test.ts:99`).
6. `scripts/demo-vps.ps1:25` throws "Create it from the template in the rollout notes"; no such document exists (S1/D38). Message text not changed (not a comment).
7. VPS template: `.env.vps.example` APP_ENV/APP_HTTP_PORT lines are copied to the server `.env` but read by nothing.

## Not done
- `docs/roadmap.md`, `docs/PRODUCT_BACKLOG.md`, `docs/README.md`, `spec.md`, `CLAUDE.local.md`, `docs/archive/**`: out of scope as instructed.
- Audit D38/S1: the error string in `scripts/demo-vps.ps1:25` is code, not a comment; release-guide "A new release PC" now lists the demo.env keys as the template substitute.
- Audit sec. 3 vars deliberately not added to the examples: `VITE_API_BASE_URL` (already in `frontend/.env.example:3`), `BIOMETRIC_MAX_REQUEST_BYTES` and `BIOMETRIC_STORAGE_DIR` (sidecar-internal, Compose fixes/ignores), `ALLOWED_EMAIL_DOMAIN` (legacy, ignored; mentioned in a comment), test/tooling vars (`E2E_*`, `DB_TEST_*`, `BENCH_*`, `AUDIT_BASE_URL`, `CI`, `REPO_ROOT`, `DOCKER_CONFIG`, `POSTGRES_*`, `GHCR_TOKEN`), `PGADMIN_ENABLED`/`FRONTEND_REPLICAS`/`WEB_REPLICAS` etc. (already in `.env.vps.example`). `VITE_API_PROXY_TARGET` / `VITE_USE_POLLING`: fixed by Compose.
- Audit D16 (frontend "Not settled yet"), X-rows and S-rows (spec.md): not edited.
- docs/vps-deployment.md lines 233-701 were skimmed, not re-verified line by line (replicas, pgAdmin, tunnel and backup sections match `docker-compose.vps.yml` and `harden-vps.sh` as far as read); only AWS/dated/narrative text was changed.
- docs/demo-accounts.md, docs/development-environment.md: audit found them clean; no edits.
- `official-imports.md` and `lecture-only-grading.md` still contain dated references to spec amendments inside rule text (e.g. "2026-10-17 table", "replaces the 2026-10-12 hover sentence"): 12 occurrences left because they identify a rule, not a status.
