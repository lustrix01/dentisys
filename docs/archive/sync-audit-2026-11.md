# DentiSys documentation sync audit, 2026-11

Scope: branch `lighthal9-responsive`, commit `ea4e40f`, clean tree, audited 2026-11-14. Read-only audit: no file changed except this report, nothing committed, no Docker or migration run. The real `.env` and `~/.dentisys` files were not opened.

Target doc model:
- **Current reference** = describes the present system, edited in place, no "as of" / "update:" add-ons.
- **Dated record** = handoffs, merge notes, reviews, audits, changelogs, built proposals, dated spec-amendment files; belongs in `docs/archive/`.

Method notes: links were checked with a Node script (`scratchpad/links.mjs`, 844 refs in 102 md files); env vars with `scratchpad/env.mjs`; script/route references with `scr.mjs` and `routes.mjs`. Line numbers are 1-based as of this commit.

---

## 1. Classification table

Legend: **REF** = current reference, **REC** = dated record (move to `docs/archive/`), **MIXED** = current content plus dated add-ons (edit in place, move the dated part out).

### 1a. Top-level `docs/*.md`

| File | Class | Reason |
|---|---|---|
| README.md | REF (MIXED) | Index; lines 19-34 ("Current work") list dated change docs and handoffs; line 20 "checked against the code on 2026-10-07" |
| architecture.md | REF | 9-line stack overview, matches compose (but see sec. 2: omits sidecar) |
| frontend.md | REF (MIXED) | Page patterns / breakpoints; carries dated inline notes (lines 15, 43, 55, 59: "UI-001, 2026-11-03", "Owner review of 2026-11-07", "Owner decisions of 2026-11-06", "approved ... 2026-11-11") and links to private Artifact demos |
| features.md | MIXED | Implemented-features list, but header line 3 is "checked ... on `lighthal7` on 2026-10-07 ... updated on `lighthal8` on 2026-10-09"; several entries are wrong (sec. 2) |
| roadmap.md | REC | "What's next (Owner-set 2026-10-07)": all 4 items are Done in the backlog (3.1, 3.2, 5.5, 5.8, 7.2) |
| PRODUCT_BACKLOG.md | MIXED | Living backlog (REF) but header says `lighthal7` 2026-10-07, lists "only open work" yet holds Done/Dropped/Implemented items, and has stale statuses (sec. 7) |
| GRADING-QA.md | REC | Self-declared "Historical handoff draft" before 2026-11-13 implementation |
| HANDOFF_2026-10-04.md | REC | Self-declared "Historical record (2026-10-08)" |
| HANDOFF_2026-10-11.md | REC | One-task handoff for `lighthal8` task `t5` |
| away-review-2026-11.md | REC | Review of 11-13 Nov commits |
| benchmark.md | REF (MIXED) | Contract of `scripts/benchmark.ps1` (REF) but cites run of 2026-11-04 at lines 3, 48 |
| biometric-attendance-decisions.md | REF (MIXED) | Implementation decisions; line 10-11 carry 2026-10-11 replacement history; line 11 wrong (sec. 2) |
| biometric-calibration-deployment.md | REF (MIXED) | Current parameter table plus history ("replaced on 2026-10-11", "Owner decision, 2026-09-28", lines 30-39, 73) |
| bucdm-policy-proposal.md | REC | "Status: PROPOSED"; the one approved row is already in spec.md |
| casing-2026-11.md | REC | Changelog |
| class-from-class-list-2026-10.md | REC | Changelog of built feature |
| demo-accounts.md | REF | Matches `database/seeds/development-demo.sql`; no dated text |
| demo-biometrics.md | REF (MIXED) | "backend contract for the one-day local demo" (line 3); line 91 "enrollments made before 2026-10-11" |
| deploy-from-scratch.md | REF (MIXED) | Runbook; lines 5-6 narrate "proven on 2026-10-10 on AWS ... Since 2026-11-02 Vultr"; line 167 "spec 2026-11-02" |
| development-environment.md | REF | No dated text |
| field-validation-2026-10.md | REC | Changelog |
| hosting-requirements.md | REF (MIXED) | Requirements table; dated decisions at lines 3, 13, 14, 16, 49, 62, 71-75 ("Accepted risks (Owner, 2026-11-02)", "Temporary exception 2026-11-05") |
| lecture-laboratory-grading.md | REF (stale) | How the editor works; rounding text outdated (sec. 2); lines 55, 78 point to amendment records |
| lecture-only-2026-10.md | REC | Changelog |
| local-demo-lighthal7.md | REC | "lighthal7 local demo rehearsal - 2026-10-03" |
| manual-demo-readiness.md | REF (MIXED) | Living checklist but line 3 banner "UI migration status (2026-09-24)" points at an archived plan |
| official-imports-2026-10.md | REC | Changelog |
| owhie-landing-reports-merge-2026-11.md | REC | Merge note |
| owhie-merge-2026-10.md | REC | Merge note |
| owhie-responsive-merge-2026-10.md | REC | Merge note |
| owhie-responsive-workflow-merge-2026-11.md | REC | Merge note |
| owhie-roster-import-merge-2026-10.md | REC | Merge note |
| owhie-session-timeout-merge-2026-11.md | REC | Merge note |
| release-guide.md | REF (MIXED) | Release checklist; branch-specific (line 60) and one-off (line 46, 77) text |
| rooms-times-merge-2026-11.md | REC | Merge/audit note |
| session-default-times-2026-10.md | REC | Changelog |
| single-server.md | REF | Prototype description; stale bits in sec. 2 |
| spec-amendments-2026-10-01.md | REC | Dated amendment record (already in spec.md) |
| spec-amendments-2026-10-03.md | REC | same |
| spec-amendments-2026-10-04.md | REC | same (166 lines; links `proposals/lecture-laboratory-grading.md`) |
| spec-amendments-2026-10-09-deployment.md | REC | same; says DuckDNS/AWS, superseded by DEL-001 2026-11-02 |
| spec-amendments-2026-10-09.md | REC | same; blended conversion, superseded twice |
| spec-amendments-2026-10-10-academic-terms.md | REC | same |
| spec-amendments-2026-11-03-responsive-audit.md | REC | same; not linked from docs/README.md |
| ui-polish-2026-10.md | REC | Changelog |
| ui-polish-2026-11.md | REC | Changelog ("committed locally, not pushed") |
| vps-deployment.md | REF (MIXED) | 701-line server reference; line 5 dated banner "Since 2026-11-02 ... written on AWS" and AWS-only steps lines 25-146 |
| walkthrough-2026-10.md | REC | Changelog |
| walkthrough-fixes-2026-11.md | REC | Changelog |

### 1b. `docs/contracts/`

| File | Class | Reason |
|---|---|---|
| archived-class-views.md | REC | "Approved and built (2026-10-27)"; not linked from docs/README.md |
| audit-logging.md | REF (MIXED) | Contract that "replaces the audit wording in spec.md" (status line 2: APPROVED 2026-10-17); still the audit reference |
| class-from-class-list.md | REC | Built contract (linked from docs/README) |
| demo-academics.md | REF | Route snippets; **read by `tests/backend/academic_demo_contract_test.php:23`** - do not move without changing that test |
| demo-auth.md | REF | Password-change endpoint contract |
| lecture-only-grading.md | REC | Built contract; referenced by tests/e2e comments only |
| official-exports.md | REC | Built contract (commit abb45db); not linked from docs/README.md |
| official-imports.md | REC | Built contract |
| secretary-attendance-requests.md | REC | Line 3 says "not built yet": wrong, built (migration 052, spec ATT-006, features.md:54). Not linked from docs/README.md |
| session-default-times.md | REC | Built contract; not linked from docs/README.md |

### 1c. `docs/database/`, `docs/ias/`, `docs/proposals/`

| File | Class | Reason |
|---|---|---|
| database/erd-target-integrated.md | REC | "Phase 2 Baseline" (15 tables; live schema has 57 migrations) |
| database/normalization-relation-assessment.md | REC | "Date: 2026-09-25" assessment |
| database/phase-2-migration-mapping.md | REC | Self-declared "Historical Phase 2 baseline mapping" |
| database/security-data-dictionary.md | MIXED | Data dictionary (REF) with dated "P03"/migration notes at lines 3-6 |
| database/ui-field-normalization-audit.md | REC | "Preparation" audit; lists migrations 018-029 only |
| ias/module-a-identity-access.md | MIXED | Design reference with "Implementation update" banner at line 3; wrong route at line 200 (sec. 2) |
| ias/module-c-perimeter-defense.md | REC | "Design Reference" endpoint table of routes that do not exist (sec. 2) |
| proposals/gra-03-matrix-computation.md | REC | **Already built** (spec UI-002 amendments 2026-11-14, `GradebookMatrix.tsx:93-98,574-581`); its line 3 is stale ("Phones and tablets are the next step") |
| proposals/lecture-laboratory-grading.md | REC | Built (spec GRD-003) |
| proposals/mandatory-lecture-laboratory-defaults.md | REC | Built (spec GRD-003) |
| proposals/provisional-roster-import.md | REC | Built (spec IMP-001) |

### 1d. Other current-reference files in scope

| File | Class | Reason |
|---|---|---|
| README.md, AGENTS.md, CLAUDE.md, spec.md, database/README.md | REF | spec.md and database/README.md are MIXED (sec. 4 and sec. 2) |
| .env.example, .env.vps.example, .env.single-server.example | REF (MIXED) | Contain "Owner decision 2026-11-04" (.env.vps.example:18) and decision narration |

Counts: 49 top-level docs + 10 contracts + 5 database + 2 ias + 4 proposals = 70 files. REC: 47. Clean REF: 6. MIXED or stale REF: 17. `docs/archive/` already exists (README plus 26 records) and is the target for the 47 REC files; `docs/images/` holds the screenshots those records link to, so move it with them.

**Cross-check before moving files:** `tests/backend/academic_demo_contract_test.php:23` reads `docs/contracts/demo-academics.md`; `tests/documentation/doc_contract_test.php:19-25` requires `README.md, AGENTS.md, spec.md, docs/README.md, docs/features.md, docs/roadmap.md, database/README.md` to exist and be non-empty. Moving `docs/roadmap.md` to the archive would fail the documentation contract (check.ps1) unless the test is changed. `spec.md:67-68` names `docs/features.md` and `docs/roadmap.md` as live documents.

---

## 2. Wrong or stale statements

Format: `file:line` - current text - what the code does (proof) - correction.

### 2a. README.md

| # | Where | Current text | Reality | Correction |
|---|---|---|---|---|
| R1 | README.md:58, 242, 304 | `git switch lumbanglighthal-owhie` | That branch last commit is 2026-10-01 (`61bf040`); `lighthal9-responsive` is 273 commits ahead; `origin/main` is the default branch but dates from 2026-07-18 | Name the branch people should actually use (decision for Owner: `main` or the current line); one place, not three |
| R2 | README.md:5-9 | Runtime table lists only Development (Supported), Single-server (Unfinished), Separate servers (Not implemented) | `spec.md:718` (RUN-002): "The approved VPS demonstration deployment (DEL-001) is the only supported non-local deployment"; demo and production VPS exist | Add a row "VPS demo and production (DEL-001)" linking `docs/release-guide.md` and `docs/deploy-from-scratch.md` |
| R3 | README.md:3, 38-43 | Stack: frontend, PHP API, PostgreSQL, sidecar, Mailpit | Matches `docker-compose.yml` services db, mailpit, biometric, web, frontend (+ pgadmin via `docker-compose.override.yml:1-2`) | OK |
| R4 | README.md:184 | `.env`: `BIOMETRIC_SIDECAR_URL=http://biometric:8000` | `docker-compose.yml:112` hard-codes `BIOMETRIC_SIDECAR_URL: http://biometric:8000`; the `.env` value is never read by Compose | Delete the line from step 3 (and from `.env.example:127`, or mark it unused) |
| R5 | README.md:163-171 | Only the face-landmarker model is downloaded; hash for it only | `docker-compose.yml:56-58, 49-52` and `docker-compose.web.yml:73-82` also require YuNet and SFace model files and their `*_SHA256`; `.env.example:147-150` lists them | Say all three models and three hashes are needed, point to `docs/biometric-calibration-deployment.md` for the file names |
| R6 | README.md:312 | "Every value that starts with `replace_with_` must be replaced; the start script refuses to run otherwise." | `scripts/start-single-server.ps1:21` / `.sh:15` check only 8 keys (`APP_BASE_URL DB_PASS DB_ADMIN_PASS JWT_* MFA_* AUDIT_MAC_KEY_B64 SMTP_HOST SMTP_FROM`). Other placeholders (`replace_after_calibration`, `./replace_with_host_model_path`, `BIOMETRIC_*`) pass the check; Compose then fails only on empty values (`docker-compose.web.yml:61-82` use `:?`) | "The script checks these 8 keys; Compose also needs every `BIOMETRIC_*`, model path and hash to be set" |
| R7 | README.md:314-326 | B3 table has no row for `BIOMETRIC_YUNET_*`, `BIOMETRIC_SFACE_*`, model host paths | `docker-compose.web.yml:63-82` makes all of them required (`:?`) even though "biometric stays off" | Add them; the single-server stack cannot start without them |
| R8 | README.md:322 | `EMAIL_PROVIDER` ... custom | `docker-compose.web.yml:9` comment says custom "needs COMPOSE_PROFILES=mailpit"; scripts pass `--profile mailpit` (`start-single-server.ps1:39-42`) | Doc fine; fix the Compose comment (sec. 2g) |
| R9 | README.md:80-85 | start-dev steps | Matches `start-dev.ps1`; the `-NoBuild` switch (`start-dev.ps1:3`) is undocumented | Add `-NoBuild` to A10 or leave |
| R10 | README.md:434-439 | "Documentation" list | Omits `docs/release-guide.md`, `docs/hosting-requirements.md`, `docs/frontend.md`, `docs/features.md`, `docs/benchmark.md` | Add or point to `docs/README.md` only |
| R11 | README.md:27 | "[Validation rules for contributors]" duplicates AGENTS.md "Validation" | Duplicate wording can drift (e.g. README:424 "link/reference checks" - no such check exists, see sec. 6) | Keep one copy |

### 2b. AGENTS.md

| # | Where | Current text | Reality | Correction |
|---|---|---|---|---|
| A1 | AGENTS.md:11 | "configurable multi-domain allowlists ... are approved" | `spec.md:161` (AUTH-003, 2026-11-09) supersedes multi-domain; `backend/app/config.php:170` returns only `bicol-u.edu.ph` | Delete "configurable multi-domain allowlists" |
| A2 | AGENTS.md:10-11 | Stack list: React/Vite, PHP, PostgreSQL, Mailpit, pgAdmin | Missing the biometric sidecar (Python/Flask, `biometric-sidecar/app.py`) | Add "private biometric sidecar" |
| A3 | AGENTS.md:15 | "The approved deployment is the DEL-001 VPS setup ... plus the private-LAN single server" | `spec.md:1032, 1034`: two VPS environments (demo and production) | Say "demo and production VPS (DEL-001)" |
| A4 | AGENTS.md:21, 44 | "product backlog" | Exists (`docs/PRODUCT_BACKLOG.md`) | OK |

### 2c. CLAUDE.md (project) and CLAUDE.local.md

| # | Where | Current text | Reality | Correction |
|---|---|---|---|---|
| C1 | CLAUDE.md:4 | "`pwsh` (7.6.9)" | `pwsh --version` on this PC: 7.7.0 (Windows PowerShell 5.1.26100 correct) | Drop the patch version |
| C2 | CLAUDE.md:22-24 | `PreToolUse` hook in `.claude/settings.json` | Present (`.claude/settings.json:3-21`, `guard-encoding.mjs`), but the command path is absolute `C:/Users/decha/...` | OK; note path is machine-specific |
| C3 | CLAUDE.local.md "Git" | "Work on the current branch (now `lighthal9-responsive`)" | True today; not a doc fault | Local file; leave |

### 2d. Current-reference docs

| # | Where | Current text | Reality / proof | Correction |
|---|---|---|---|---|
| D1 | docs/features.md:42 | "the approved High / At Risk / Low risk levels" | `spec.md:1214` (2026-10-17): "Risk has no levels"; `RetentionMonitoring.tsx` has no High/Low badge | "...the single At Risk flag" |
| D2 | docs/features.md:44 | "Two remedial attempts, each passing at 50% or more" | `spec.md:1206` (2026-11-13): 75%; code `RetentionMonitoring.tsx:686,720-722` ("75% or higher passes") | "passing at 75% or more" |
| D3 | docs/features.md:3 | "checked against the code on `lighthal7` on 2026-10-07 ... updated on `lighthal8` on 2026-10-09" | Branch and dates are stale; list contains items from 2026-11-11 (line 12-13) | Delete the dated sentence |
| D4 | docs/features.md:40 | "export as CSV or a printable PDF" | `spec.md:502` (2026-10-27): exports are .xlsx in official layouts; commit abb45db | Verify each export's format; line 39 already says .xlsx |
| D5 | docs/features.md:12, 35, 46 | "AUTH-005 amendment 2026-11-11", "the 2026-10-17 conversion table", "since 2026-10-28" | Dated add-ons inside the reference | Drop dates; state the rule |
| D6 | docs/roadmap.md:5-9 | 4 numbered "next" items | Backlog statuses: 3.1 Done, 3.2 Done, 5.5 Done, 5.8 Done, 7.2 Done | Rewrite as the real next items or fold into the backlog and delete the file (spec.md:68 and the doc contract name it, see sec. 1) |
| D7 | docs/README.md:19 | "Last handoff: HANDOFF_2026-10-04" | Newer `HANDOFF_2026-10-11.md` exists and is not listed; both are dated records | Remove "Last handoff" from the reference index; put records under "Archive" |
| D8 | docs/README.md:20 | "open work only ... checked against the code on 2026-10-07" | The backlog holds Done/Dropped/Implemented rows (sec. 7) | Reword after the backlog is cleaned |
| D9 | docs/README.md:22-34 | 13 change docs listed under "Current work" | Each is a dated record | Move to an "Archive" list |
| D10 | docs/README.md | Does not link: `GRADING-QA.md`, `HANDOFF_2026-10-11.md`, `spec-amendments-2026-11-03-responsive-audit.md`, `contracts/archived-class-views.md`, `contracts/official-exports.md`, `contracts/secretary-attendance-requests.md`, `contracts/session-default-times.md`, all of `proposals/*` | Orphans (listed by `scratchpad` script) | Archive or link |
| D11 | docs/single-server.md:7-9 | "separate containers for Nginx frontend, PHP API, and PostgreSQL" diagram `Browser -> Nginx -> PHP API -> PostgreSQL` | `docker-compose.web.yml:56-89` also runs the `biometric` sidecar (web `depends_on` it, line 46-48); README:285-289 diagram includes it | Add the sidecar |
| D12 | docs/single-server.md:26 | "P03 real Student authentication" | "P03" is an old milestone code, no definition anywhere current | Replace with plain wording |
| D13 | docs/architecture.md:3 | Stack list | Omits biometric sidecar | Add |
| D14 | docs/architecture.md:9 | "intentionally a development foundation, not deployment automation" | DEL-001 deployment now exists (`scripts/deploy-vps.sh`, `provision-vps.*`) | Delete or rewrite |
| D15 | docs/frontend.md:(Page wrapper row) | `pages/faculty/RetentionMonitoring.tsx:789` | The `space-y-6 animate-fade-in max-w-7xl mx-auto` wrapper is at `RetentionMonitoring.tsx:797`; line 789 is `);` | Cite without a line number or use 797 |
| D16 | docs/frontend.md:(Page patterns) "Not settled yet: the page header, notice banners (three looks today), tables and empty states" | Cannot verify; say whether still true | Re-check; if still open move to backlog |
| D17 | docs/lecture-laboratory-grading.md:18-20 | "The server combines unrounded values and rounds the resulting grade" and examples 84% / 86% / 85.4% | `spec.md:1204` (2026-10-26): each period grade is rounded to a whole percent, course grade is round(round(M x share) + round(F x share)); GRD-003 line ~536 text is the older rule | Rewrite the example with whole-percent rounding |
| D18 | docs/biometric-attendance-decisions.md:11 | "two-action active-liveness analysis" | `backend/app/student_biometrics.php:370-375`: attendance uses 1 action, enrollment 2; spec BIO-007 2026-10-13 | "one random action for attendance, two for enrollment" |
| D19 | docs/biometric-calibration-deployment.md (table, `BIOMETRIC_MATCH_COUNT` row) | "Any 3 matching frames in one attempt of up to 30 frames" | `spec.md:858` (2026-10-13): attendance attempt uses 8 usable frames + action frame; enrollment unchanged | Verify against `StudentBiometricController` and state attendance vs enrollment |
| D20 | docs/hosting-requirements.md:14 | "**Both servers run 1 and 1**" replicas | `.env.vps.example:18` "demo runs 1 and 1 ... production keeps 3"; `docs/deploy-from-scratch.md:22-23` "3 web + 3 frontend + 1 biometric"; `docker-compose.vps.yml:31,73` default 3 | Pick one truth per server and state it once; the .env.vps.example comment and hosting-requirements contradict each other |
| D21 | docs/hosting-requirements.md:13 | "both servers since 2026-11-05" / "Benchmarked 2026-11-04" | Dated narrative inside requirements | Move to a record |
| D22 | docs/hosting-requirements.md:75 | "Temporary exception (Owner, 2026-11-05): the first production server was created with the demo key" | Dated, will go stale | Move to a record or ask Owner to close |
| D23 | docs/deploy-from-scratch.md:5-6 | "proven end to end on 2026-10-10 on AWS ... Since 2026-11-02 both servers live on Vultr" | Dated narrative; AWS block at 57-59 | Keep the Vultr steps; move AWS to an appendix or drop |
| D24 | docs/deploy-from-scratch.md:35 | "Windows PowerShell 5.1" prerequisite | Scripts are run as `pwsh -NoProfile -ExecutionPolicy Bypass -File ...` everywhere else in the same doc (e.g. line 167) | State PowerShell 7 |
| D25 | docs/deploy-from-scratch.md:22-23 | "3 web + 3 frontend + 1 biometric containers" | See D20 | Reconcile |
| D26 | docs/vps-deployment.md:5 | Banner "written on AWS: where it says Security Group, Elastic IP, EC2 ..., use the provider equivalents" and body lines 25-146 AWS-only (c7i-flex.large 4 GB) | `docs/hosting-requirements.md:13` says Vultr 1 vCPU / 2 GB | Rewrite provider-neutral; remove the banner |
| D27 | docs/release-guide.md:60 | `git checkout lighthal9-responsive` | Hard-coded working branch | `git checkout -` or "your previous branch" |
| D28 | docs/release-guide.md:46 | "For the grade-rules release, Claude first shows you ... recompute-grades preview ... apply" | One-off. `spec.md:1210` (2026-11-13) says no bulk recalculation on promotion; line 77 repeats it. `demo-vps.ps1:6` still offers `recompute-grades` | Delete the one-off; keep the script note only if the action stays |
| D29 | docs/release-guide.md:46 | tunnel at `http://localhost:15180` | Port comes from `DEMO_LOCAL_PORT` in `~/.dentisys/demo.env` (`demo-vps.ps1:77`); not in repo | Say "the `DEMO_LOCAL_PORT` port" |
| D30 | docs/manual-demo-readiness.md:3 | "UI migration status (2026-09-24): Follow the UI-first plan (archive/ui-migration-plan.md)" | `spec.md:1138`: UI-001 "Implemented ... complete (`a7582d8`)" | Delete the banner |
| D31 | docs/ias/module-a-identity-access.md:200 | `POST /api/activate-secretary` | `backend/routes/api.php:241` is `/api/secretary/activate` | Fix path |
| D32 | docs/ias/module-c-perimeter-defense.md:31-48 | Endpoint table `/api/class-sections`, `/api/enrollments`, `/api/enrollments/{id}/archive`, `/api/assessments/{id}/scores`, `/api/biometrics/consent`, `/api/biometrics/enroll/{student_id}`, `/api/invitations/{id}/revoke` | None exists in `backend/routes/api.php` | Archive (design reference, not the current API) |
| D33 | docs/contracts/secretary-attendance-requests.md:3 | "not built yet" | Built (migration `052_secretary_attendance_requests.sql`, spec ATT-006, features.md:54) | Archive |
| D34 | docs/proposals/gra-03-matrix-computation.md:3 | "built for desktop ... Phones and tablets are the next step" | `spec.md:1170`: switch at every width; `GradebookMatrix.tsx:93-98` has no width gate | Archive |
| D35 | docs/PRODUCT_BACKLOG.md | see sec. 7 | | |
| D36 | database/README.md:8-16 | Directory tree lists migrations 001-005 only and seeds `development-demo.sql` only; "see the root README, section 6" (line ~37) | `database/migrations/` has 57 files (001-057); `database/seeds/` also has `generate_development_demo.py`, `fix-hashes.sql`; `database/reports/` exists; README section is "A6" | Replace the tree with "ordered `NNN_name.sql`, see `ls`"; fix the section pointer |
| D37 | database/README.md:40-60 | Narrative per migration (046, 048) | Migration history belongs in the migration files or a record | Move out |
| D38 | docs/demo-vps / `scripts/demo-vps.ps1:25` | "Create it from the template in the rollout notes" | No "rollout notes" document exists (grep of repo) | Point at `docs/release-guide.md` "A new release PC", or add a `demo.env.example` |

### 2e. Docs claims that checked out (no action)

README A1-A5 addresses/ports (frontend 5173, API 8080, Mailpit 8025, pgAdmin 5050 - `docker-compose.yml:21,72,139`, `docker-compose.pgadmin.yml:5`); `smoke.ps1 -CheckPgAdmin` (`smoke.ps1:4`); `dev-lan-https.ps1 -Disable`; `start-single-server.* ` backup name pattern (`start-single-server.ps1:56`); `scripts/test-e2e.sh`; hosting-requirements versions (Traefik v3.6.2 `docker-compose.vps.yml:6`, Watchtower 1.7.1 :115, PostgreSQL 18, PHP 8.4 `Dockerfile:6`, Node 24 `frontend/Dockerfile:1`, nginx 1.27 :18, Python 3.11, pgAdmin 9.16); backups "newest 14" (`backup-vps.sh:53`); Ubuntu 26.04 check (`harden-vps.sh:46`); SSH PermitOpen 5050/8025 (`harden-vps.sh:198`); frontend.md auth routes (`App.tsx:201-216`) and breakpoints; demo-accounts vs seed.

### 2f. Script help text and comment headers

| # | Script:line | Current text | Problem | Correction |
|---|---|---|---|---|
| S1 | scripts/demo-vps.ps1:25 | "Create it from the template in the rollout notes" | No such document | See D38 |
| S2 | scripts/demo-vps.ps1:1-7 | Header lists actions; `DEMO_*` keys not documented | Keys read at lines 36-39: `DEMO_SSH_HOST/USER/KEY/PORT`, `DEMO_LOCAL_PORT`, `DEMO_REMOTE_PORT`; `demo-test.ps1:23` also `DEMO_{ADMIN,FACULTY,SECRETARY,STUDENT}_{EMAIL,PASSWORD}`; `benchmark.ps1:59` `DEMO_BASE_URL` | List all keys once (names only) in this header or a doc |
| S3 | scripts/benchmark.ps1:5 | "`~/.dentisys/demo.env` (DEMO_BASE_URL, DEMO_SSH_*, ...)" | Matches code | OK |
| S4 | scripts/demo-test.ps1:8 | `PROD_SSH_PORT (2202)` default | `promote-prod.ps1:85` default 2202 | OK |
| S5 | scripts/check.ps1 (no header) | No comment saying what it runs | See sec. 6 | Add a 10-line header listing the gates |
| S6 | scripts/start-dev.ps1, migrate.ps1, smoke.ps1, pgadmin.ps1, test-e2e.ps1, check-postgres.ps1, sync-vps-db.ps1, upload-vps.ps1, publish-images.ps1, provision-vps.ps1, harden-vps.ps1, start-single-server.ps1 | No help/comment header | Parameters only discoverable by reading `param()` | Add `.SYNOPSIS` (as `dev-lan-https.ps1:1-14` does) |
| S7 | scripts/start-single-server.ps1:20 / .sh:15 | "Set $key in the single-server environment" | Only 8 keys validated (see R6) | Either validate all required keys or say so in a comment |
| S8 | docker-compose.web.yml:9 | "custom also needs COMPOSE_PROFILES=mailpit" | `start-single-server.*` pass `--profile mailpit` instead; `.env.single-server.example` has no COMPOSE_PROFILES | Reword: "the start scripts enable the profile" |
| S9 | docker-compose.vps.yml:1 | "use after web and database Compose files" | Correct (`release-guide.md:98` shows the 3-file command) | OK |
| S10 | scripts/*.sh | `backup-vps.sh`, `deploy-vps.sh`, `harden-vps.sh`, `migrate-vps.sh`, `provision-vps.sh` | No usage header read; they are run by the `.ps1` launchers | Add one-line "run via provision-vps.ps1" comment |

### 2g. Env-example comment errors (also in sec. 3)

| # | Where | Text | Reality |
|---|---|---|---|
| E1 | .env.example:63-65 | "SMTP_CA_FILE ... the provided Compose files do not forward it to the web container" | `docker-compose.yml:91` forwards it (dev); only `docker-compose.web.yml` does not |
| E2 | .env.example:153-160 | "not passed into the web container by the provided Compose files": `RATE_LIMIT_STORAGE_DIR` | `docker-compose.test.yml:25` forwards it |
| E3 | .env.example:96-97 | `SHOW_DEV_RESET_LINK=true`, `SHOW_DEV_INVITATION_LINK=true` listed as settings | No Compose file forwards them (`config.php:336-337` reads them); changing `.env` does nothing |
| E4 | .env.example:127 | `BIOMETRIC_SIDECAR_URL=` "leave blank" | `docker-compose.yml:112` hard-codes it; value is never read from `.env` |
| E5 | .env.vps.example:18 | "demo runs 1 and 1; production keeps 3" | Contradicts hosting-requirements.md:14 (D20) |
| E6 | .env.vps.example:21, .env.single-server.example:14 | `APP_ENV=single-server` | `docker-compose.web.yml:8` hard-codes it; never read from the env file |
| E7 | .env.vps.example:25 | `APP_HTTP_PORT=8080` | VPS overlay resets frontend ports (`docker-compose.vps.yml:74`) |

### 2h. Dated add-ons inside current-reference docs (grep: "as of", "update", dates)

README.md:131,323 (domain policy, ok-in-place); docs/features.md:3,12,35,46; docs/frontend.md:15,43,55,59; docs/hosting-requirements.md:3,13,14,16,49,62,71,75; docs/deploy-from-scratch.md:5-6,167; docs/vps-deployment.md:5,101,109; docs/release-guide.md:4,46,77; docs/biometric-attendance-decisions.md:10; docs/biometric-calibration-deployment.md:30,38,39,73; docs/demo-biometrics.md:91; docs/benchmark.md:3,48; docs/manual-demo-readiness.md:3; docs/roadmap.md:3; docs/PRODUCT_BACKLOG.md:3,52,72,78,84,130,134,136,142,178,184,198,218,243,253,261,265,277,281,297 (27 lines); docs/README.md:20; .env.vps.example:18; database/README.md:42,60.

---


## 3. Environment variables

Sources scanned: `backend/` (`config_value()`/`getenv()` in `backend/app/config.php`, `request.php:178`, `bin/bootstrap-first-dean.php:26`), `frontend/` (`vite.config.ts`, `src/services/apiClient.ts:41`), `biometric-sidecar/app.py`, `scripts/`, `e2e/`, `tests/`, `playwright*.ts`, and every `docker-compose*.yml` (`${VAR}` and `environment:` keys). Columns "yes / comment only / no" show whether the var appears as `KEY=` in each example file; "comment only" = appears only inside a `#` line.

Reading the table: "Read where" lists the kinds of readers (PHP, frontend, sidecar, compose, scripts, tests) and up to two file:line references. Variables with no PHP/script reader and no compose reader show "nothing" (read only by the example file). Not listed: OS variables (`ID`, `VERSION_ID`, `UBUNTU_CODENAME`, `SUDO_USER`) and PHP server variables (`HTTP_*`, `SCRIPT_FILENAME`).

Out-of-repo settings read by scripts (names only, files not opened): `~/.dentisys/demo.env` keys `DEMO_SSH_HOST`, `DEMO_SSH_USER`, `DEMO_SSH_KEY`, `DEMO_SSH_PORT`, `DEMO_LOCAL_PORT`, `DEMO_REMOTE_PORT`, `DEMO_BASE_URL`, `DEMO_{ADMIN,FACULTY,SECRETARY,STUDENT}_{EMAIL,PASSWORD}` (`demo-vps.ps1:36-39`, `demo-test.ps1:23`, `benchmark.ps1:59`); `~/.dentisys/prod.env` `PROD_SSH_HOST/PORT/USER/KEY` (`promote-prod.ps1:83-92`); `~/.dentisys/prod-test.env` `PROD_BASE_URL`, `PROD_{ADMIN,FACULTY,SECRETARY,STUDENT}_{EMAIL,PASSWORD}` (`demo-test.ps1:15`). None is documented as a template in the repo (see S1).


| Var | Read where | .env.example | .env.vps.example | .env.single-server.example | Notes |
|---|---|---|---|---|---|
| ALLOWED_EMAIL_DOMAIN | PHP, compose: backend/app/config.php:146, docker-compose.yml:99 | no | no | no | Legacy singular fallback. Value is ignored: config.php:170 always returns bicol-u.edu.ph. Only mentioned in a comment (.env.example:78). |
| ALLOWED_EMAIL_DOMAINS | PHP, compose: backend/app/config.php:142, backend/app/config.php:145 | yes | yes | yes | Parsed and validated, but the result is forced to bicol-u.edu.ph (config.php:170); any other value has no effect. |
| APP_BASE_URL | PHP, compose: backend/app/config.php:228, docker-compose.yml:77 | yes | yes | yes | Required for single-server (config.php:229). In .env.vps.example it is derived from APP_DOMAIN. |
| APP_DEBUG | PHP, compose: backend/app/config.php:271, docker-compose.override.yml:11 | yes | no | no | Forwarded only by docker-compose.override.yml:11 (dev). |
| APP_DOMAIN | compose: docker-compose.vps.yml:34, docker-compose.vps.yml:56 | no | yes | no | VPS overlay only (hostname for Traefik and APP_BASE_URL). |
| APP_ENV | PHP, tests, compose: backend/app/config.php:208, backend/bin/validate-config.php:7 | yes | yes | yes | docker-compose.web.yml:8 hard-codes single-server, so the APP_ENV lines in .env.vps.example:21 and .env.single-server.example:14 are read by nothing. |
| APP_HTTP_PORT | compose: docker-compose.web.yml:108 | no | yes | yes | docker-compose.web.yml:108; the VPS overlay resets ports (docker-compose.vps.yml:74), so APP_HTTP_PORT=8080 in .env.vps.example is unused on the VPS. |
| APP_IS_HTTPS | PHP, compose: backend/app/config.php:282, docker-compose.yml:78 | yes | yes | yes | In VPS overlay fixed to "true" (docker-compose.vps.yml:33). |
| APP_TIMEZONE | PHP: backend/app/config.php:234 | no | no | no | config.php:234, default Asia/Manila. No Compose file forwards it and no example lists it. |
| AUDIT_BASE_URL | other: playwright.device-audit.config.ts:14 | no | no | no | Device-audit Playwright config only. |
| AUDIT_MAC_KEY_B64 | PHP, scripts, tests, compose: backend/app/config.php:300, scripts/check-postgres.ps1:31 | yes | yes | yes |  |
| BACKEND_HTTP_PORT | scripts, compose: scripts/check-postgres.ps1:26, docker-compose.yml:72 | yes | no | no |  |
| BENCH_FACULTY_EMAIL | scripts: scripts/benchmark.ps1:91 | no | no | no | benchmark.ps1 sets these for its own run; not an .env key. |
| BENCH_FACULTY_PASSWORD | scripts: scripts/benchmark.ps1:91 | no | no | no | benchmark.ps1 sets these for its own run; not an .env key. |
| BENCH_STUDENT_EMAIL | scripts: scripts/benchmark.ps1:92 | no | no | no | benchmark.ps1 sets these for its own run; not an .env key. |
| BENCH_STUDENT_PASSWORD | scripts: scripts/benchmark.ps1:92 | no | no | no | benchmark.ps1 sets these for its own run; not an .env key. |
| BIOMETRIC_BLINK_THRESHOLD | compose: docker-compose.yml:43, docker-compose.web.yml:68 | yes | yes | yes |  |
| BIOMETRIC_CHALLENGE_TTL_SECONDS | PHP, compose: backend/app/config.php:242, docker-compose.yml:114 | yes | yes | yes | Forwarded by dev Compose and the VPS overlay; web.yml (single-server) does not forward it, though .env.single-server.example lists it. |
| BIOMETRIC_DIAGNOSTIC_SCORES | sidecar, compose: biometric-sidecar/app.py:554, docker-compose.yml:45 | yes | yes | yes |  |
| BIOMETRIC_HEAD_TURN_RATIO | compose: docker-compose.yml:44, docker-compose.web.yml:69 | yes | yes | yes |  |
| BIOMETRIC_IMAGE | compose: docker-compose.yml:34, docker-compose.web.yml:59 | no | yes | no | Image tag interpolation (docker-compose.yml:34, web.yml:59, vps.yml:107). Only .env.vps.example lists it; dev default dentisys-biometric:local. |
| BIOMETRIC_MATCH_COUNT | compose: docker-compose.yml:42, docker-compose.web.yml:67 | yes | yes | yes |  |
| BIOMETRIC_MAX_REQUEST_BYTES | sidecar: biometric-sidecar/app.py:26 | no | no | no | Sidecar only (app.py:26, default 52428800); not forwarded by Compose. |
| BIOMETRIC_MIN_FACE_PX | compose: docker-compose.yml:39, docker-compose.web.yml:64 | yes | yes | yes |  |
| BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE | compose: docker-compose.yml:40, docker-compose.web.yml:65 | yes | yes | yes |  |
| BIOMETRIC_SFACE_COSINE_THRESHOLD | compose: docker-compose.yml:41, docker-compose.web.yml:66 | yes | yes | yes |  |
| BIOMETRIC_SFACE_MODEL_HOST_PATH | compose: docker-compose.yml:57, docker-compose.web.yml:82 | yes | yes | yes |  |
| BIOMETRIC_SFACE_SHA256 | compose: docker-compose.yml:51, docker-compose.web.yml:76 | yes | yes | yes |  |
| BIOMETRIC_SIDECAR_ENABLED | PHP, compose: backend/app/config.php:239, docker-compose.vps.yml:35 | no | yes | no | config.php:239; VPS overlay only (vps.yml:35). Only effective when APP_ENV=single-server (config.php:248); dev ignores it. |
| BIOMETRIC_SIDECAR_SHARED_SECRET | PHP, sidecar, scripts, compose: backend/app/config.php:237, biometric-sidecar/app.py:83 | yes | yes | yes | Sidecar rejects secrets shorter than 32 characters. |
| BIOMETRIC_SIDECAR_TIMEOUT_SECONDS | PHP: backend/app/config.php:326 | no | no | no | config.php:326, default 20. Documented in biometric-calibration-deployment.md but not forwarded by Compose or listed in any example. |
| BIOMETRIC_SIDECAR_URL | PHP: backend/app/config.php:236 | yes | no | no | config.php:236. docker-compose.yml:112 and web.yml:44 hard-code http://biometric:8000, so the .env value (and README A8 step 3) is a no-op. |
| BIOMETRIC_STORAGE_DIR | sidecar: biometric-sidecar/app.py:27 | no | no | no | Sidecar only; Compose hard-codes /var/lib/dentisys-biometric. |
| BIOMETRIC_STORAGE_KEY_B64 | sidecar, compose: biometric-sidecar/app.py:119, docker-compose.yml:37 | yes | yes | yes |  |
| BIOMETRIC_YUNET_MODEL_HOST_PATH | compose: docker-compose.yml:56, docker-compose.web.yml:81 | yes | yes | yes |  |
| BIOMETRIC_YUNET_SCORE_THRESHOLD | compose: docker-compose.yml:38, docker-compose.web.yml:63 | yes | yes | yes |  |
| BIOMETRIC_YUNET_SHA256 | compose: docker-compose.yml:49, docker-compose.web.yml:74 | yes | yes | yes |  |
| CI | other: playwright.config.ts:7, playwright.config.ts:8 | no | no | no | Playwright config. |
| COMPOSE_PROFILES | nothing | no | yes | no | Read by docker compose itself; deploy/backup/migrate-vps.sh set it blank then add the mailpit profile for EMAIL_PROVIDER=custom. docker-compose.web.yml:9 comment tells single-server users to set it, but start-single-server.* pass --profile instead. |
| CORS_ALLOWED_ORIGINS | PHP: backend/app/config.php:289 | comment only | no | no | config.php:289; commented-out example, not forwarded by any Compose file. |
| DB_ADMIN_PASS | scripts, compose: scripts/check-postgres.ps1:22, scripts/migrate.ps1:5 | yes | yes | yes |  |
| DB_ADMIN_USER | scripts, compose: scripts/check-postgres.ps1:21, scripts/migrate.ps1:4 | yes | yes | yes |  |
| DB_HOST | PHP, compose: backend/app/config.php:273, docker-compose.yml:79 | yes | no | no | Dev Compose forwards; web.yml hard-codes db (.env.single-server.example says it is intentionally absent). |
| DB_NAME | PHP, scripts, compose: backend/app/config.php:275, scripts/check-postgres.ps1:23 | yes | yes | yes |  |
| DB_PASS | PHP, scripts, other, compose: backend/app/config.php:277, scripts/check-postgres.ps1:25 | yes | yes | yes |  |
| DB_PORT | PHP, compose: backend/app/config.php:274, docker-compose.yml:80 | yes | no | no | Dev Compose forwards; web.yml hard-codes 5432. |
| DB_TEST_HOST | tests: tests/database/postgres_integration_test.php:6 | no | no | no | Backend integration tests only. |
| DB_TEST_NAME | tests: tests/database/postgres_integration_test.php:8 | no | no | no | Backend integration tests only. |
| DB_TEST_PASS | tests: tests/database/postgres_integration_test.php:10 | no | no | no | Backend integration tests only. |
| DB_TEST_PORT | tests: tests/database/postgres_integration_test.php:7 | no | no | no | Backend integration tests only. |
| DB_TEST_USER | tests: tests/database/postgres_integration_test.php:9 | no | no | no | Backend integration tests only. |
| DB_USER | PHP, scripts, other, compose: backend/app/config.php:276, scripts/check-postgres.ps1:24 | yes | yes | yes |  |
| DEV_BROWSER_ATTENDANCE_PROTOTYPE_ENABLED | PHP, compose: backend/app/config.php:215, docker-compose.yml:96 | yes | yes | yes |  |
| DEV_MOCK_BIOMETRIC_ENABLED | PHP, compose: backend/app/config.php:213, docker-compose.yml:94 | yes | yes | yes |  |
| DEV_MOCK_IDENTITY_ENABLED | PHP, compose: backend/app/config.php:212, docker-compose.yml:93 | yes | yes | yes |  |
| DEV_MOCK_LOCATION_ENABLED | PHP, compose: backend/app/config.php:214, docker-compose.yml:95 | yes | yes | yes |  |
| DOCKER_CONFIG | scripts: scripts/promote-prod.ps1:57, scripts/promote-prod.ps1:113 | no | no | no | promote-prod.ps1 sets a temporary Docker config dir. |
| E2E_ADMIN_EMAIL | tests: e2e/live/live.spec.ts:7 | no | no | no | Live Playwright specs; set by demo-test.ps1 / check-postgres.ps1. |
| E2E_ADMIN_PASSWORD | tests: e2e/live/live.spec.ts:8 | no | no | no | Live Playwright specs. |
| E2E_BASE_URL | scripts, tests, other: scripts/check-postgres.ps1:295, scripts/demo-test.ps1:31 | no | no | no | Live Playwright specs; set by check-postgres.ps1:295 and demo-test.ps1. |
| E2E_FACULTY_EMAIL | tests: e2e/live/class-from-class-list.spec.ts:20, e2e/live/lecture-only.spec.ts:5 | no | no | no | Live Playwright specs. |
| E2E_FACULTY_PASSWORD | tests: e2e/live/class-from-class-list.spec.ts:21, e2e/live/lecture-only.spec.ts:6 | no | no | no | Live Playwright specs. |
| E2E_GROUPED_FACULTY_EMAIL | tests: e2e/live/grouped-grading.spec.ts:3 | no | no | no | Live Playwright specs. |
| E2E_GROUPED_FACULTY_PASSWORD | tests: e2e/live/grouped-grading.spec.ts:4 | no | no | no | Live Playwright specs. |
| E2E_MAILPIT_BASE_URL | scripts, tests: scripts/check-postgres.ps1:296 | no | no | no | Live Playwright specs; set by check-postgres.ps1:296. |
| E2E_SECRETARY_EMAIL | tests: e2e/live/live.spec.ts:11 | no | no | no | Live Playwright specs. |
| E2E_SECRETARY_PASSWORD | tests: e2e/live/live.spec.ts:12 | no | no | no | Live Playwright specs. |
| E2E_STUDENT_PASSWORD | tests: e2e/live/grouped-grading.spec.ts:6, e2e/live/live.spec.ts:13 | no | no | no | Live Playwright specs. |
| EMAIL_PROVIDER | PHP, scripts, compose: backend/app/config.php:222, scripts/deploy-vps.sh:117 | yes | yes | yes | Default is mailpit in dev/test and smtp otherwise (config.php:222); web.yml defaults smtp. |
| EMAIL_TEST_ALLOWLIST | PHP, compose: backend/app/config.php:335, docker-compose.yml:101 | yes | yes | yes |  |
| FIRST_DEAN_EMAIL | compose: docker-compose.yml:102, docker-compose.web.yml:12 | yes | yes | yes |  |
| FIRST_DEAN_FIRST_NAME | compose: docker-compose.yml:104, docker-compose.web.yml:14 | yes | yes | yes |  |
| FIRST_DEAN_LAST_NAME | compose: docker-compose.yml:106, docker-compose.web.yml:16 | yes | yes | yes |  |
| FIRST_DEAN_MIDDLE_NAME | compose: docker-compose.yml:105, docker-compose.web.yml:15 | yes | yes | yes |  |
| FIRST_DEAN_PREFIX | compose: docker-compose.yml:103, docker-compose.web.yml:13 | yes | yes | yes |  |
| FIRST_DEAN_SUFFIX | compose: docker-compose.yml:107, docker-compose.web.yml:17 | yes | yes | yes |  |
| FRONTEND_BIND_ADDRESS | compose: docker-compose.yml:139 | yes | no | no | Written by scripts/dev-lan-https.ps1 (touches only this and VITE_DEV_HTTPS). |
| FRONTEND_HTTP_PORT | scripts, compose: scripts/check-postgres.ps1:27, docker-compose.yml:139 | yes | no | no |  |
| FRONTEND_IMAGE | scripts, compose: scripts/check-postgres.ps1:90, docker-compose.yml:133 | no | yes | no | Image tag interpolation; dev default dentisys-frontend:local, single-server :single-server. Only .env.vps.example lists it. |
| FRONTEND_REPLICAS | compose: docker-compose.vps.yml:73 | no | yes | no | VPS overlay only (default 3). |
| GHCR_TOKEN | scripts: scripts/deploy-vps.sh:22 | no | no | no | deploy-vps.sh:22; prompted, never stored (.env.vps.example:13 says so). |
| GHCR_USERNAME | nothing | no | yes | no | Read by deploy-vps.sh:94,187,191 and provision-vps.* (found by key list, not by name lookup). |
| GOOGLE_CLIENT_ID | PHP, scripts, compose: backend/app/config.php:232, scripts/check-postgres.ps1:35 | yes | yes | yes | Blank disables Google. |
| JWT_ACCESS_TTL | PHP: backend/app/config.php:293 | comment only | no | no | config.php:293, default 86400; commented-out example, not forwarded. |
| JWT_SIGNING_KEY_B64 | PHP, scripts, compose: backend/app/config.php:292, scripts/check-postgres.ps1:29 | yes | yes | yes |  |
| MAILPIT_SMTP_HOST | PHP: backend/app/config.php:349 | no | no | no | config.php:349 (default mailpit); no Compose forwarding, no example. |
| MAILPIT_SMTP_PORT | PHP: backend/app/config.php:350 | no | no | no | config.php:350 (default 1025); no Compose forwarding, no example. |
| MAILPIT_UI_PORT | scripts, compose: scripts/check-postgres.ps1:28, docker-compose.yml:24 | yes | yes | yes | dev Compose:24, web.yml:97 (profile mailpit). |
| MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH | compose: docker-compose.yml:55, docker-compose.web.yml:80 | yes | yes | yes |  |
| MEDIAPIPE_FACE_LANDMARKER_MODEL_PATH | sidecar: biometric-sidecar/app.py:192 | no | no | no | Sidecar; Compose fixes /app/models/face_landmarker.task. (YuNet/SFace *_MODEL_PATH are fixed the same way.) |
| MEDIAPIPE_FACE_LANDMARKER_SHA256 | compose: docker-compose.yml:47, docker-compose.web.yml:72 | yes | yes | yes |  |
| MFA_ENCRYPTION_KEY_B64 | PHP, scripts, compose: backend/app/config.php:296, scripts/check-postgres.ps1:30 | yes | yes | yes |  |
| PGADMIN_DEFAULT_EMAIL | compose: docker-compose.vps.yml:134, docker-compose.pgadmin.yml:7 | yes | yes | no | Dev (docker-compose.pgadmin.yml:7 has defaults) and VPS (required). |
| PGADMIN_DEFAULT_PASSWORD | compose: docker-compose.vps.yml:135, docker-compose.pgadmin.yml:8 | yes | yes | no |  |
| PGADMIN_ENABLED | scripts: scripts/deploy-vps.sh:124 | no | yes | no | deploy-vps.sh:124 only (VPS); Compose never reads it. |
| PGADMIN_HTTP_PORT | scripts, compose: scripts/pgadmin.ps1:16, docker-compose.vps.yml:132 | yes | yes | no | Dev Compose, VPS overlay and scripts/pgadmin.ps1. |
| POSTGRES_DB | other: database/apply-migrations.sh:4 | no | no | no | Set by Compose db service from DB_NAME; read by database/apply-migrations.sh. |
| POSTGRES_PASSWORD | other: database/apply-migrations.sh:9 | no | no | no | Set from DB_ADMIN_PASS; read by apply-migrations.sh. |
| POSTGRES_USER | other: database/apply-migrations.sh:5 | no | no | no | Set from DB_ADMIN_USER; read by apply-migrations.sh. |
| RATE_LIMIT_ENABLED | PHP: backend/app/config.php:303 | comment only | no | no | config.php:303; commented-out example, not forwarded. |
| RATE_LIMIT_STORAGE_DIR | PHP: backend/app/config.php:304 | comment only | no | no | config.php:304; forwarded only by docker-compose.test.yml:25. Example comment claims no Compose file passes it. |
| REPO_ROOT | tests: tests/backend/password_change_test.php:5, tests/database/postgres_integration_test.php:5 | no | no | no | Backend tests only. |
| SHOW_DEV_INVITATION_LINK | PHP: backend/app/config.php:337 | yes | no | no | config.php:337 (dev only). No Compose file forwards it, so setting it in .env does nothing; the code default (true) always applies. |
| SHOW_DEV_RESET_LINK | PHP: backend/app/config.php:336 | yes | no | no | config.php:336 (dev only). Not forwarded by any Compose file: setting it in .env does nothing. |
| SMTP_CA_FILE | PHP, compose: backend/app/config.php:346, docker-compose.yml:91 | yes | no | no | Forwarded by docker-compose.yml:91 (dev) but not web.yml. .env.example:63-64 says no provided Compose file forwards it: wrong for dev. |
| SMTP_ENCRYPTION | PHP, compose: backend/app/config.php:344, docker-compose.yml:86 | yes | yes | yes |  |
| SMTP_FROM | PHP, compose: backend/app/config.php:343, docker-compose.yml:88 | yes | yes | yes |  |
| SMTP_HOST | PHP, compose: backend/app/config.php:339, docker-compose.yml:84 | yes | yes | yes |  |
| SMTP_PASS | PHP, compose: backend/app/config.php:342, docker-compose.yml:90 | yes | yes | yes |  |
| SMTP_PORT | PHP, compose: backend/app/config.php:340, docker-compose.yml:85 | yes | yes | yes |  |
| SMTP_USER | PHP, compose: backend/app/config.php:341, docker-compose.yml:89 | yes | yes | yes |  |
| SMTP_VERIFY_PEER | PHP, compose: backend/app/config.php:345, docker-compose.yml:87 | yes | yes | yes |  |
| STUDENT_AUTH_ENABLED | PHP, scripts, compose: backend/app/config.php:218, scripts/check-postgres.ps1:32 | yes | yes | yes | .env.vps.example sets true (demo), the others false. |
| TRAEFIK_ACME_EMAIL | compose: docker-compose.vps.yml:16 | no | yes | no | VPS overlay only. |
| TRUSTED_PROXY_CIDRS | PHP, compose: backend/app/request.php:178, docker-compose.yml:108 | comment only | yes | comment only | request.php:178. Examples list it only as a comment; Compose defaults apply. |
| VITE_API_PROXY_TARGET | frontend: frontend/vite.config.ts:28 | no | no | no | frontend/vite.config.ts:28; docker-compose.yml:141 hard-codes http://web:80. |
| VITE_DEV_HTTPS | frontend, compose: frontend/vite.config.ts:13, docker-compose.yml:142 | yes | no | no | vite.config.ts:13; written by dev-lan-https.ps1. |
| VITE_USE_POLLING | frontend: frontend/vite.config.ts:24 | no | no | no | vite.config.ts:24; dev Compose hard-codes "true", test Compose "false". |
| WATCHTOWER_POLL_INTERVAL | compose: docker-compose.vps.yml:122 | no | yes | no | VPS overlay only (default 300). |
| WEB_IMAGE | compose: docker-compose.yml:70, docker-compose.web.yml:6 | no | yes | no | Image tag interpolation; only .env.vps.example lists it (required there). |
| WEB_REPLICAS | compose: docker-compose.vps.yml:31 | no | yes | no | VPS overlay only (default 3). |


### 3a. Summary of env findings

**Read by code but missing from every example file** (add, or document as internal): `APP_TIMEZONE`, `ALLOWED_EMAIL_DOMAIN` (legacy, ignored), `BIOMETRIC_SIDECAR_TIMEOUT_SECONDS`, `MAILPIT_SMTP_HOST`, `MAILPIT_SMTP_PORT`, `VITE_API_BASE_URL`, `BIOMETRIC_MAX_REQUEST_BYTES`, `BIOMETRIC_STORAGE_DIR` (sidecar, fixed by Compose), `WEB_IMAGE`/`FRONTEND_IMAGE`/`BIOMETRIC_IMAGE` (absent from `.env.example`, present in `.env.vps.example`). Test and tooling vars (`E2E_*`, `DB_TEST_*`, `BENCH_*`, `AUDIT_BASE_URL`, `CI`, `REPO_ROOT`, `DOCKER_CONFIG`) are not meant for `.env`.

**In `.env.example` but with no effect in the dev stack** (never forwarded to the web container by `docker-compose.yml`): `SHOW_DEV_RESET_LINK`, `SHOW_DEV_INVITATION_LINK`, `BIOMETRIC_SIDECAR_URL` (hard-coded at `docker-compose.yml:112`), `CORS_ALLOWED_ORIGINS`, `JWT_ACCESS_TTL`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_STORAGE_DIR` (the last four are commented-out examples and honestly described), `TRUSTED_PROXY_CIDRS` (commented, Compose default used).

**In an example file but read by nothing in that deployment**: `.env.vps.example`: `APP_ENV` (web.yml fixes it), `APP_HTTP_PORT` (ports reset by overlay), `APP_BASE_URL`/`APP_IS_HTTPS` are interpolated but then overridden by the overlay (`docker-compose.vps.yml:33-34`), `BIOMETRIC_CHALLENGE_TTL_SECONDS` (forwarded by the overlay, ok), `GHCR_USERNAME` (read by `deploy-vps.sh` only). `.env.single-server.example`: `APP_ENV`, `BIOMETRIC_CHALLENGE_TTL_SECONDS` (web.yml does not forward it), `ALLOWED_EMAIL_DOMAINS` (forwarded, value ignored by config.php:170).

**Required by Compose but easy to miss** (`:?` in `docker-compose.web.yml`): `APP_BASE_URL`, `BIOMETRIC_SIDECAR_SHARED_SECRET`, `BIOMETRIC_STORAGE_KEY_B64`, all seven calibration values, three model host paths and three `*_SHA256` (lines 27, 45, 61-82). `.env.single-server.example` ships placeholders (`replace_after_calibration`) the start script does not reject (README R6).

**Wrong comments**: E1-E7 in sec. 2g.

**Defaults that differ by file** (documented behaviour should say which): `EMAIL_PROVIDER` dev `mailpit` (`docker-compose.yml:92`), single-server/VPS `smtp` (`docker-compose.web.yml:10`); `SMTP_ENCRYPTION` `none` vs `starttls`; `SMTP_VERIFY_PEER` `false` vs `true`; `DB_PASS` has a committed default only in `docker-compose.yml:8,87` (not in `.web.yml`/`.database.yml`).

Not checked: whether `.env` itself matches `.env.example` (the real file was not opened).

---

## 4. spec.md

File is 1,330 lines, about 130 KB. Section IDs below; line numbers are in the current file.

### 4a. Contradictions (two rules that cannot both hold, or a rule the code does not follow)

| # | Lines | Rule A | Rule B / code | Resolution suggested |
|---|---|---|---|---|
| X1 | 167-171 (AUTH-004) vs 161 (AUTH-003 amendment 2026-11-09) | AUTH-004: "MUST support a configurable allowlist containing multiple approved institutional domains ... MUST NOT assume one permanent institutional domain" | 161 says it supersedes AUTH-004 and UI-004 multi-domain; `config.php:170` forces `['bicol-u.edu.ph']` | Mark AUTH-004 as superseded in its own text (or reword to one domain) |
| X2 | 1032 (DEL-001, 2026-10-14) vs 884 (BIO-008, 2026-11-02) | DEL-001: "Production keeps real biometrics disabled until the BIO-002 review and pgAdmin off by default" | BIO-008 line 884: real biometrics on by default in production (it says it supersedes 2026-10-17 decision at 882, not this sentence) | Strike the biometrics clause from line 1032 |
| X3 | 882 vs 884 | 882 (2026-10-17): production biometrics off by default, `BIOMETRIC_SIDECAR_ENABLED=true` to enable | 884 supersedes it explicitly | Delete 882 once 884 is the rule (record the history in a record file) |
| X4 | 1039 vs 1032 | Line 1039: images "built and pushed by the Owner from a tested commit" | Line 1032: "Claude builds and pushes `:demo` images through a dedicated GitHub bot" | Reword 1039 to "built and pushed by the Owner's PC (demo images through the bot account)" |
| X5 | 1038 vs 1034 | Line 1038: certificates for one hostname "initially a DuckDNS name" | Line 1034: `<ip>.sslip.io` for now, then `bu-dentisys.com` (`docs/hosting-requirements.md:30`) | One sentence: hostname is chosen per server, changing it needs no amendment |
| X6 | 1041 | "applies the Owner's hardening guide ... except that the AWS key replaces `ssh-copy-id`" | Provider is Vultr (1034) | "provider key" |
| X7 | 549-553 (GRD-002) vs 555 | 549-553: "Participation and Recitation are assessment-source categories unless Faculty explicitly selects the supported Attendance source"; "at most one authoritative Attendance-source category" | 555 (2026-10-12): the selector is gone, always assessment-source; 609 (2026-11-10): attendance is not a grading category for lecture-only; ATT-004 986 still defines attendance-in-grade values | Rewrite 549-553 to the current rule; state whether Lecture/Lab courses may still have an Attendance category |
| X8 | 537 (GRD-003) vs 1204 (UI-003 2026-10-26) | GRD-003: "Grouped calculations use unrounded intermediate values" | 1204: each period grade is rounded to a whole percent, course grade = round(round(M) + round(F)); `docs/lecture-laboratory-grading.md:18` repeats the old text | Edit GRD-003 line to say "rounded as in UI-003" |
| X9 | 543-546 (GRD-003) | "retention thresholds and manual override rules remain unchanged"; "Informational risk uses the saved grouped weights" | 1214/1216 (2026-10-17): risk levels retired, manual overrides removed, computed retention only | Remove both phrases |
| X10 | 1180 (UI-003) vs 1194 | 1180: Midterm Watchlist "stays locked ... Authorized Faculty may manually unlock it" | 1194 (2026-10-12): "no lock and no manual unlock ... supersedes the 2026-09-24 lock/unlock rule"; 1192 still mentions "A manual watchlist unlock" | Delete 1180 second sentence and the unlock text in 1192 |
| X11 | 1186 and 1188 | Marked "superseded in part/by 2026-11-13" but still carry the old rules (2.5-4.9 eligibility is still current; 50% threshold at 1188-1190 is not) | 1206 states 75% | Remove the superseded parts, keep one rule |
| X12 | 1190, 1192, 1194, 1196, 1198-1204, 1212 | Risk levels, assumed-assessment projection, provisional conversion, exact-value rule, truncation rule, rounding rule | Each is superseded by a later amendment (1214, 1200, 1202, 1204) | See stack S-UI003 below |
| X14 | 1274 (CLS-003) vs code | "Dean/Admin class-section, course-catalog and people/accounts screens are non-authoritative UI previews" | Matches code: `pages/admin/Classes.tsx`, `CourseCatalog.tsx`, `PeopleAndAccounts.tsx` have no API calls and sample data (`Classes.tsx:35-41`) | none (note: `docs/features.md` says nothing of this) |
| X15 | 696-702 (RUN-001) | "Current stack" omits the biometric sidecar | Compose runs it; BIO-007 line 850 treats it as part of the deployment | Add one bullet |
| X16 | 1319 (§11) | "Upon Owner approval of this specification:" | Past-tense history; items 1-5 are one-time supersessions (Google, BIO-001 placeholder) | Fold into AUTH-001/BIO sections, delete §11 |
| X17 | 1138 (UI-001) | "Status: Implemented ... baseline to migrate into `lighthal5`" (1140) | Migration is done; rules for lighthal5/PDF pages are history | Reduce to the current interface rules |
| X18 | 848 vs 856 (BIO-007) | 848: "resulting numbers still require Owner approval" | 856 (2026-10-11) approves the values; 864 still lists blink/head-pose/liveness/timing numerics as deferred while 1061 (§9) repeats them | Keep 864/1061 (still true for blink and head turn); delete the approval caveat from 848 |

### 4b. Stacked dated decisions (current single rule each stack resolves to)

Each row: section / lines / the stack / the rule it resolves to (verified against code where noted).

| ID | Heading / lines | Stack | Resolves to (current rule) | Code check |
|---|---|---|---|---|
| S-UI002-pin | UI-002, 1162-1172 | 2026-10-13 pin switch below 1280 px (Full Name | ID + Full Name) -> 2026-11-03 (below 640 px only Full Name pinned, switch hidden; 640-1279 switch reads "Keep visible while scrolling: Name / ID and name", default Name; screen-height growth) -> 2026-11-14 desktop pin (also at 1280 px+, ID 120 px, Name 220 px; supersedes "at 1280 px and wider nothing changes") | "Full Matrix View always pins the student columns while scrolling sideways. At 640 px and wider a 'Keep visible while scrolling: Name / ID and name' switch (default Name) chooses Name only or ID and name; below 640 px only Name is pinned (narrower, wraps) and the switch is hidden. At 1280 px+ ID is 120 px and Name 220 px; below 1280 px the matrix grows to the screen height (at least 600 px)." | Code agrees: `GradebookMatrix.tsx:420-422` (pin widths), 461-480 (switch, `max-sm:hidden`) |
| S-UI002-compute | UI-002, 1166, 1170 | 2026-11-14 "Show computation" at 1280+ -> same day amendment "at every width" | "Show computation switch at every width, off by default, remembered per browser" | `GradebookMatrix.tsx:93-98, 570-581`: no width gate |
| S-UI002-T4 | UI-002, 1172 | 2026-11-14 session-storage copy | One rule; no stack | `utils/matrixDraft.ts` exists (backlog 10.2 says not implemented: stale) |
| S-UI001 | UI-001, 1142-1152 | 2026-10-13 (never merged below 1280) -> 2026-11-03 (phone blocks below 768 px for listed lists, supersedes "never merged" below 768) -> 2026-11-11 (all Student and Secretary tables) -> 2026-11-13 (three Retention lists); wording and casing decisions 2026-11-03, 11-06 | "Below 768 px: Student and Secretary data tables, the lists named on 1144 and the three Retention lists show stacked row cards with every field and action; 768-1279 px keep desktop columns inside their box; sidebar collapses to icons at 768-1023 px unless the user chose" + casing/wording rules | Not verified per page |
| S-UI003-remedial | UI-003, 1186, 1188, 1206, 1210 | 2026-09-26 (50%, two attempts) + 2026-09-28 (professional-course qualifier) -> 2026-11-13 clarification | "Remedial for completed final grades 2.5-4.9, every course type; 5.0 = irregular re-enrollment outside DentiSys; two attempts, each passing at 75%; failing attempt 2 -> cost recovery (one-decimal grade 1.0-5.0, pass 1.0-2.4); no bulk recalculation" | `RetentionMonitoring.tsx:686-722` uses 75 |
| S-UI003-grade | UI-003, 1196-1204 | 2026-10-09 provisional conversion -> 2026-10-12 exact values -> 2026-10-17 BUCDM table + truncation -> 2026-10-22 rounding -> 2026-10-26 official grade sheet calculation (replaces all three) -> 2026-11-13 "no bulk recalculation" (supersedes 1204's release-time batch) | "Category % = plain average of effective assessment %; period grade = weighted sum rounded to whole percent (.5 up); Lecture/Lab combine with round(); course = round(round(M share) + round(F share)); whole percent converts with the 2026-10-17 table, below 75% = 5.0; hover shows steps; closed-year grades unchanged; no bulk recalculation" | Not verified in `backend` (large) |
| S-UI003-risk | UI-003, 1190, 1192, 1194, 1212, 1214, 1216, 1218 | 2026-09-29 risk levels + projection -> 2026-10-03 advisory -> 2026-10-12 no lock + badge -> 2026-10-17 (flag only when midterm complete; no levels; computed retention only; term end) | "Midterm Watchlist/Advisory flags a student only when every Midterm assessment is graded, no final grade or remedial exists, and the Midterm grade is 2.5 or worse; badge is only At Risk; retention status is computed (Active, Remedial, Cleared, Archived)" | No High/Low in `RetentionMonitoring.tsx`; but `docs/features.md:42` still says levels |
| S-UI003-save | UI-003, 1220-1230 | 2026-10-12 auto-save -> 2026-10-17 10-second debounce | "Auto-save after 10 s without typing and on switching/leaving/pressing Save; clearing a saved score only on manual Save; invalid scores held back" | Not verified |
| S-GRD002 | GRD-002, 453-506 | Original, then 2026-09-28, 2026-10-12 (default banner), 2026-10-27 (Excel), 2026-10-28 (students see period/final only), 2026-10-29 (reports, class list PDF), 2026-11-10 (combined config note) | Eight dated paragraphs; the rule set is one list of current behaviours | Not verified |
| S-GRD003 | GRD-003, 510-627 | Mandatory split -> 2026-10-12 selector removed -> 2026-10-26 lecture-only -> 2026-10-27 defaults 50/50 (was 30/70) -> 2026-11-10 attendance not a category for lecture-only | "Lecture/Laboratory mandatory except lecture-only (units: Lecture>0, Lab 0); default Midterm 50/Finals 50; lecture-only Lecture defaults Term Exam 50, Quiz 20, Outputs 20, Participation 10; no Attendance category in lecture-only" | Defaults not verified |
| S-AUTH003 | AUTH-003/004/UI-004, 161, 167, 1234-1236 | Multi-domain -> 2026-11-09 single domain | "Only `@bicol-u.edu.ph`" | `config.php:170` |
| S-AUTH005 | AUTH-005, 187 | Password policy -> 2026-11-13 8-32 code points NFC | One rule | Max 32 `validation.php:447`; hashing Argon2id per backlog 10.5 |
| S-AUTH007 | AUTH-007, 224 | Seven-day session -> 2026-11-11 30-minute idle | "30 minutes idle, 7 days absolute" | `auth_runtime.php:536` |
| S-REG001 | REG-001, 287 | Invitation expiry -> 2026-10-28 7 days | One rule | Not verified |
| S-REG006 | REG-006, 329-333 | 2026-09-29 one section -> 2026-10-18 more than one section -> 2026-10-22 unenroll removes Secretary role | "A Student may be Class Secretary of several current-year sections; unenrolling removes that appointment only" | Not verified |
| S-ATT001 | ATT-001, 916-944 | 2026-10-01 queue sessions -> 2026-10-10 edit until open -> 2026-10-12 (4 amendments: Secretary has no Edit, date read-only, edit shows saved values, required times) -> 2026-11-05 past midnight ("under 24 hours") -> 2026-11-06 (12-hour max replaces 24; room required; overlap pop-up; applies to Faculty and Secretary) | "Sessions may be queued for today/future Manila dates; edit until open (Faculty only, date fixed); opening time, Present and Late cutoffs and class end required; a session lasts at most 12 hours and may end after midnight; a room is required; overlaps with other classes in the same room or the same class are warned" | 12 h: `attendance_sessions.php:373`; 24-hour sentence at line 938 still present |
| S-ATT002 | ATT-002, 952-958 | 2026-10-11 radius 50-2000 -> 2026-10-12 geofence off by default | One rule | Not verified |
| S-ATT006 | ATT-006, 1010-1016 | 2026-10-22 Secretary cannot change approved Excused -> 2026-10-28 every Secretary change is a request -> 2026-11-06 Secretary requests tab | "Every Secretary manual change is a request Faculty approve; review in a Secretary requests tab" | migration 052 |
| S-BIO007 | BIO-007, 848-858 | 2026-10-11 LBPH -> SFace -> 2026-10-11 values (YuNet 0.9, 120 px, 60, 0.44, 3 of 30) -> 2026-10-13 attendance uses 8 usable frames + one action | Enrollment 20-30 samples, two actions; attendance one action, 8 usable frames; thresholds as 856 | Action count `student_biometrics.php:370-375` |
| S-BIO008 | BIO-008, 880-884 | 2026-10-09 VPS demo opt-in -> 2026-10-17 production off by default -> 2026-11-02 production on by default | "Demo: on only by `BIOMETRIC_SIDECAR_ENABLED=true`; production: on by default (public test)" | `config.php:248` |
| S-DEL001 | DEL-001, 1030-1047 | 2026-10-09 demo -> 2026-10-14 two VPS + bot account -> 2026-11-02 any provider, sslip.io | Three paragraphs plus an unamended bullet list that disagrees (X2, X4, X5) | |
| S-EML001 | EML-001, 633-635 | 2026-10-12 three tabs -> 2026-11-10 Midterm Advisory and Remedial tabs | "Tabs: Student invitations, Secretary, History, Midterm Advisory, Remedial" | `EmailManagement.tsx` not verified |
| S-ROOM001 | ROOM-001, 1289-1295 | 2026-11-05 rooms -> 2026-11-06 categories, rename, retire/delete ("replaces the retire and delete rules above") | One rule set | `RoomController.php` exists |
| S-CLS001/002 | CLS-001 1085-1089; CLS-002 1252-1254 | 2026-10-01 meetings -> 2026-10-13 conflict block -> 2026-11-06 same term only; 2026-11-06 no class in an ended term | One rule each | Not verified |
| S-SEC005 | SEC-005, 413-425 | 2026-10-17 audit contract | One rule; defers to `docs/contracts/audit-logging.md` | |
| S-IMP001 | IMP-001, 1119-1123 | 2026-10-26 official imports -> 2026-10-29 Import Students modal -> 2026-11-02 ambiguous name split | One rule set | Not verified |
| S-GRD001 | GRD-001, 439 | 2026-11-14 T1 new assessments start with transmutation enabled | One rule | `GradeComputation.tsx:902` sets true; `PRODUCT_BACKLOG.md:265` says "still default OFF": stale |

Count: 17 contradiction rows (X1-X18 without X13; X14 only confirms code matches) and 27 stack rows (S-*).

---

## 5. Broken links and file-path references

Scope: README.md, AGENTS.md, CLAUDE.md, CLAUDE.local.md, spec.md, and 97 further `.md` files under `docs/` (including `docs/archive`): 102 files, 844 references (relative markdown links with anchors, plus backticked paths). GitHub-style anchors; CRLF-aware. Script: `scratchpad/links.mjs`.

**Result outside `docs/archive/`: 0 broken markdown links, 0 broken anchors, 0 broken path references.** Items the script flagged first were false alarms (paths relative to `frontend/` or `frontend/src/pages/`): `docs/PRODUCT_BACKLOG.md:214` (`src/services/apiClient.ts`, exists at `frontend/src/services/apiClient.ts`), `docs/walkthrough-fixes-2026-11.md:33` (names relative to `frontend/src/pages/`, all exist). Cross-check with Section 2: references to the **external Artifact URLs** (claude.ai) cannot be checked.

References that are textual but not checkable by link: `docs/ias/module-c-perimeter-defense.md` endpoints (D32), `docs/release-guide.md:46`.

**Inside `docs/archive/`: 52 broken references** (all stale paths from before the files moved into `archive/`, or deleted files). They are acceptable in a dated archive but the archive README says the files are kept as history; fixing is optional:


| File | Line | Broken reference |
|---|---|---|
| branch-comparison-2026-10-03.md | 43 | MISSING PATHREF `frontend/src/pages/secretary/ManualAttendanceOverride.tsx` |
| FIX_PLAN_2026-09-27.md | 80 | MISSING PATHREF `secretary/AttendanceList.tsx` |
| FIX_PLAN_2026-09-27.md | 80 | MISSING PATHREF `faculty/AttendanceMonitoring.tsx` |
| FIX_PLAN_2026-09-27.md | 82 | MISSING PATHREF `faculty/ClassesAndRosters.tsx` |
| FIX_PLAN_2026-09-27.md | 97 | MISSING PATHREF `frontend/src/pages/faculty/StudentManagement.tsx` |
| FIX_PLAN_2026-09-27_R2.md | 3 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27.md` |
| FIX_PLAN_2026-09-27_R2.md | 1450 | MISSING PATHREF `docs/SESSION_HANDOFF.md` |
| FIX_PLAN_2026-09-27_R2.md | 1452 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27.md` |
| FIX_PLAN_2026-09-27_R2.md | 1452 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27_R2.md` |
| FIX_PLAN_2026-09-27_R3.md | 3 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27.md` |
| FIX_PLAN_2026-09-27_R3.md | 5 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27_R2.md` |
| FIX_PLAN_2026-09-27_R3.md | 27 | MISSING PATHREF `docs/fix-assets/r3/development-demo.sql` |
| FIX_PLAN_2026-09-27_R3.md | 28 | MISSING PATHREF `docs/fix-assets/r3/demo-accounts.md` |
| FIX_PLAN_2026-09-27_R3.md | 29 | MISSING PATHREF `docs/fix-assets/r3/generate_development_demo.py` |
| FIX_PLAN_2026-09-27_R3.md | 163 | MISSING FILE docs/development-environment.md |
| FIX_PLAN_2026-09-27_R3.md | 170 | MISSING FILE database/seeds/development-demo.sql |
| FIX_PLAN_2026-09-27_R3.md | 188 | MISSING FILE docs/demo-accounts.md |
| FIX_PLAN_2026-09-27_R3.md | 209 | MISSING PATHREF `seeds/development-demo.sql` |
| FIX_PLAN_2026-09-27_R3.md | 219 | MISSING FILE demo-accounts.md |
| FIX_PLAN_2026-09-27_R3.md | 220 | MISSING FILE manual-demo-readiness.md |
| FIX_PLAN_2026-09-27_R3.md | 220 | MISSING FILE demo-accounts.md |
| FIX_PLAN_2026-09-27_R3.md | 271 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27_R3.md` |
| FIX_PLAN_2026-09-27_R3.md | 385 | MISSING PATHREF `docs/SESSION_HANDOFF.md` |
| FIX_PLAN_2026-09-27_R3.md | 394 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27_R3.md` |
| gemini-local-demo-handoff.md | 11 | MISSING PATHREF `docs/local-demo-functional-delivery-plan.md` |
| gemini-local-demo-handoff.md | 11 | MISSING PATHREF `docs/integration-status.md` |
| gemini-local-demo-handoff.md | 37 | MISSING PATHREF `frontend/src/pages/faculty/StudentManagement.tsx` |
| HANDOFF_2026-09-29.md | 51 | MISSING PATHREF `faculty/Dashboard.tsx` |
| HANDOFF_2026-09-29.md | 58 | MISSING PATHREF `archive/spec-amendments-2026-09-29.md` |
| HANDOFF_2026-09-29.md | 204 | MISSING PATHREF `docs/ui-migration-plan.md` |
| HANDOFF_2026-09-29.md | 293 | MISSING PATHREF `docs/ui-migration-plan.md` |
| HANDOFF_2026-10-01.md | 46 | MISSING PATHREF `docs/schedule-session-contract-2026-10-01.md` |
| HANDOFF_2026-10-03.md | 407 | MISSING PATHREF `docs/branch-comparison-2026-10-03.md` |
| HANDOFF_2026-10-03.md | 445 | MISSING PATHREF `docs/manual-branch-comparison-2026-10-03.md` |
| integration-status.md | 24 | MISSING PATHREF `docs/local-demo-functional-delivery-plan.md` |
| lumbang-final-transfer-review.md | 37 | MISSING PATHREF `frontend/src/pages/secretary/ManualAttendanceOverride.tsx` |
| SESSION_HANDOFF.md | 8 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27.md` |
| SESSION_HANDOFF.md | 8 | MISSING PATHREF `docs/FIX_PLAN_2026-09-27_R2.md` |
| SESSION_HANDOFF.md | 158 | MISSING PATHREF `docs/ui-migration-status.md` |
| ui-migration-status.md | 51 | MISSING PATHREF `tmp/pdfs/ui-changes-1.png` |
| ui-migration-status.md | 51 | MISSING PATHREF `tmp/pdfs/ui-changes-9.png` |
| ui-migration-status.md | 53 | MISSING PATHREF `docs/ui-visual-parity-acceptance.md` |
| ui-source-inventory.md | 24 | MISSING PATHREF `frontend/src/pages/LandingPage.tsx` |
| ui-source-inventory.md | 41 | MISSING PATHREF `frontend/src/pages/faculty/ClassManagement.tsx` |
| ui-source-inventory.md | 50 | MISSING PATHREF `frontend/src/pages/faculty/StudentManagement.tsx` |
| ui-source-inventory.md | 54 | MISSING PATHREF `frontend/src/pages/secretary/ManualAttendanceOverride.tsx` |
| ui-source-inventory.md | 57 | MISSING PATHREF `frontend/src/pages/secretary/StartSession.tsx` |
| ui-visual-parity-acceptance.md | 51 | MISSING ANCHOR ../../spec.md#auth-005-password-authentication |
| ui-visual-parity-audit.md | 3 | MISSING PATHREF `docs/ui-visual-parity-acceptance.md` |
| ui-visual-parity-audit.md | 6 | MISSING PATHREF `docs/ui-source-inventory.md` |
| ui-visual-parity-audit.md | 6 | MISSING PATHREF `docs/ui-migration-plan.md` |
| ui-visual-parity-audit.md | 42 | MISSING PATHREF `frontend/src/pages/faculty/ClassManagement.tsx` |


The archive links are listed for completeness. Every one points at a file that was moved into `docs/archive/` (the old `docs/` prefix), a file deleted earlier (`docs/fix-assets/`, `tmp/pdfs/`), or a source file renamed since September (`ManualAttendanceOverride.tsx`, `StudentManagement.tsx`, `ClassManagement.tsx`, `StartSession.tsx`, `LandingPage.tsx` under old paths). One also targets a renamed spec heading: `ui-visual-parity-acceptance.md:51` -> `../../spec.md#auth-005-password-authentication` (heading is "AUTH-005 — Password authentication", GitHub slug `auth-005--password-authentication`, with the em dash).

Non-archive items worth fixing anyway (all current-reference files): none broken. But two cross-file traps:
- `tests/backend/academic_demo_contract_test.php:23` reads `docs/contracts/demo-academics.md` (silently passes with an empty string if the file moves, see sec. 1 note).
- `docs/README.md:1-72` links 40 files; archiving the 47 REC files removes most of those links, so the index must be rewritten in the same change.

---

## 6. Existing docs checks

**What `scripts/check.ps1` checks about docs.** Only one docs step, near the end (`check.ps1`, "Documentation contract test"):

```
docker compose run --rm --no-deps -v "${root}:/workspace:ro" web php /workspace/tests/documentation/doc_contract_test.php
```

Implementation: `tests/documentation/doc_contract_test.php` (54 lines). It does only this:
1. `require_nonempty_file` for `README.md`, `AGENTS.md`, `spec.md`, `docs/README.md`, `docs/features.md`, `docs/roadmap.md`, `database/README.md` (lines 18-27): file exists and is non-empty.
2. Migrations: `database/migrations/*.sql` is non-empty; each name matches `^\d{3}_[a-z0-9_]+\.sql$`; no duplicate numeric prefix (lines 29-47).
3. Then `require_once ../backend/invitation_onboarding_contract_test.php` (line 52), which is a backend test, not a doc check.

There is **no** check for: links or anchors, env-var coverage, dated files outside `docs/archive/`, doc content, `.env.example` completeness, script help text, or `git diff --check`. README.md:424 and AGENTS.md "Validation" tell contributors to run "link/reference checks" but no such check exists.

Other doc-adjacent guards: `.githooks/pre-commit` runs `.githooks/check-staged-encoding.mjs` (BOM, UTF-16, mojibake, invalid UTF-8) on staged files; `.claude/hooks/guard-encoding.mjs` blocks 5.1 writes. `tests/backend/academic_demo_contract_test.php:23-40` reads `docs/contracts/demo-academics.md` as input (not a doc check). `scripts/check.ps1` also fails on obsolete runtime strings (`email_mfa`, `XAMPP`, ...) in backend/frontend code (lines ~44-48), not in docs. `git diff --check` is only advice (AGENTS.md "Validation").

**Where new checks would slot in.**

| Check | Best place | Why |
|---|---|---|
| Relative-link and anchor check (what `scratchpad/links.mjs` does), skipping `docs/archive/` | New `scripts/check-docs.mjs`, called from `check.ps1` right after the documentation contract step (needs only host Node, already required by `npm run test:e2e` on the next line) | PHP test runs inside the `web` container with `/workspace` mounted read-only, which has no Node |
| Env-var check: every `getenv`/`config_value`/`${VAR}`/`import.meta.env` name appears in an example file or an allowlist file of internal vars, and no example key is unread | Same `check-docs.mjs` (logic of `scratchpad/env.mjs`), allowlist committed next to it | Needs both PHP and Compose scanning; easier in Node |
| "No dated file outside archive": fail when a file in `docs/` (top level, not `archive/`) matches `-20\d\d-\d\d` or `20\d\d-\d\d(-\d\d)?\.md`, or a reference doc contains "as of"/"Update:" | `check-docs.mjs`; or extend `doc_contract_test.php` with a `glob(docs/*-20*.md)` assertion | Filename rule is trivial in PHP; the text rule is easier in Node |
| Required-file list | Keep in `doc_contract_test.php:18-27`; update it when `docs/roadmap.md` or `docs/features.md` change | Moving `roadmap.md` to the archive fails this test (sec. 1 note) |
| Encoding | Already in `.githooks` | none |

---

## 7. docs/PRODUCT_BACKLOG.md

**Header (line 3) stale claims**
- Line 3: "checked against the code on `lighthal7` on 2026-10-07": branch gone, date 5+ weeks old; the file has been edited since (2026-11-14 entries).
- Line 5: "This file lists only work that is Partial, Not started or Unclear": it also lists Done (3.1, 3.2, 5.5, 5.8, 7.2, 9.6, 9.8), Dropped (4.1), Implemented (10.1, 10.4), Closed (10.9), and a status-less 9.9.
- Line 5: "the order of work is in the roadmap": `docs/roadmap.md` is entirely Done items.
- Line 259: "Ticket batch 1 (2026-11-11) - remaining backlog" holds items now delivered; line 261 points to gitignored evidence in `audit-output/tickets-2026-11-15/`.
- Line 253-255, 265, 269: contradict commit `302277f` and spec 2026-11-14 (below).
- Numbering: there is no 5.10 (5.9 then 5.11).
- `docs/README.md:20` repeats "checked against the code on 2026-10-07".

| ID | Title | Backlog says | Code shows | Evidence |
|---|---|---|---|---|
| 2.1 | Remove remaining browser and mock business data | Partial | **Partial** | `frontend/src/pages/student/studentGates.ts`, `services/developmentProviders.ts` exist; Dean `Classes.tsx:35-41`, `CourseCatalog.tsx`, `PeopleAndAccounts.tsx` are sample-data previews (spec CLS-003 line 1274) - not mentioned in 2.1 |
| 2.2 | Manual-test dataset | Partial: "no maintained dataset" | **Done** (stale) | `database/seeds/development-demo.sql` (all four roles), `docs/demo-accounts.md`, README A6; `tests/fixtures/live-stack.sql` |
| 3.1 | Read-only profiles with Change Name | Done | **Done** | `components/ChangeNameDialog.tsx`; features.md:16-18 |
| 3.2 | Authenticator confirmation for name changes | Done | **Done** | features.md:18 |
| 4.1 | Dean My Activity | Dropped (2026-10-15) | **Dropped** | `AuditTrail.tsx` is a 298-byte wrapper over `components/AuditTrailPage.tsx` |
| 4.2 | Dean Dashboard | Partial (no test) | **Done in code** | no "Quick Action" strings in `frontend/src/pages/admin/`; `Dashboard.tsx` uses the API |
| 4.3 | Faculty invitation row actions | Partial | **Not verified** | `FacultyInvitation.tsx` (39 KB) not inspected |
| 4.4 | Dean Settings cleanup | Partial (no test) | **Done in code** | No "Course Component Ratios" or "Retention Standard" string anywhere in `frontend/src`; `admin/Settings.tsx:90` shows a fixed "Retention trigger: Grade 2.5" text |
| 4.5 | Dean view of grade/attendance changes | Unclear | **Not done** | `components/AuditTrailPage.tsx:393` still says class work is not shown |
| 4.6 | Course catalog control | Unclear | **Not done** | `admin/CourseCatalog.tsx` has no API calls (preview) |
| 4.7 | Account deactivation | Not started | **Not done** | no "deactivat" in `AdminController.php` or `routes/api.php` |
| 5.1 | Faculty Dashboard | Partial | **Partial** | no "Quick Action" in `pages/faculty/`; count mismatch (9.1) unverified |
| 5.2 | Grade Computation confirmations | Partial | **Not verified** | |
| 5.3 | Midterm Watchlist cannot assign remedial | Partial | **Not verified** | |
| 5.4 | Remedial record details | Partial | **Not verified** | |
| 5.5 | Attendance worksheet date | Done | **Done** | roadmap item 2 |
| 5.6 | Large attendance lists | Partial | **Mostly done** | sticky bounded table `AttendanceMonitoring.tsx:1708-1711` |
| 5.7 | Email Management filtering | Partial | **Not verified** | no course -> section -> student filter seen in `EmailManagement.tsx` |
| 5.8 | Email History from the outbox | Done (2026-10-15) | **Done** | migration `047_email_outbox_action.sql` |
| 5.9 | Class archiving follow-ups | Not started | **Not done** | wording still at `ClassesAndRosters.tsx:1484, 1583` ("Past school-year classes are view-only.") |
| 5.11 | Client requests waiting on information | Unclear | **Mixed** | cost recovery bullet is already "implemented" (spec 1206); other bullet blocked |
| 6.1 | Student Dashboard data | Partial | **Partial** | see 2.1 |
| 7.1 | Secretary Dashboard | Partial (no test) | **Done in code** | no "Quick Action" in `pages/secretary/` (Student `Dashboard.tsx:251-254` still has one, outside this item) |
| 7.2 | Manual Override filtering | Done | **Done** | roadmap item 4 |
| 8.1 | Field validation and password controls | Partial | **Partial** | `GoogleLinkCard.tsx:181` has `type="password"` and no reveal control (also 10.5) |
| 8.2 | 2FA settings confirmation hardening | Not started; "recovery-code regeneration writes no audit event" | **Partial** | `MfaController.php:144` audits `mfa_recovery_codes_regenerated`; handler rate limits at 256, 315, 385, 446 - per-action limits not verified |
| 9.1 | Faculty class counts | Unclear | **Not verified** | |
| 9.2 | Grade Computation tab strip on phones | Unclear | **Probably done** | all tab bars now use `components/Tabs.tsx` with `shortLabel` (9.8, frontend.md:32-34) |
| 9.3 | Build warnings | Unclear | **Not verified** | needs a build |
| 9.4 | Official Registrar import/export | Not started: "exporting ... next feature; contract still to be agreed" | **Done** (stale) | `docs/contracts/official-exports.md`; commit `abb45db` "CSV exports become Excel; grade sheet and class list"; spec 502-506 |
| 9.5 | Live Google verification | Externally blocked | **n/a** | |
| 9.6 | UI follow-ups from Nov polish audit | Done (2026-11-06) | **Done** | `docs/casing-2026-11.md` |
| 9.7 | Wording follow-ups | Not started | **Not done** | `components/email/EmailPreviewModal.tsx:75,84,111` still "DentiSYS Portal"; other bullets unverified |
| 9.8 | Tab bar UX follow-ups | Done | **Done** | `components/Tabs.tsx` |
| 9.9 | Full Matrix follow-ups (GRA-03) | no status line; "Show computation ... desktop-only, comes next"; "slow score loading"; "Excel export" | **Largely done** (stale) | `GradebookMatrix.tsx:570-581` no width gate; commit `302277f`: "Faculty scores load in one request"; spec UI-002 line 1170. Excel export of % / Transmuted: not seen |
| 10.1 | T1 transmutation defaults | Implemented; "New assessments still default to transmutation OFF" | **Done; last sentence wrong** | `GradeComputation.tsx:902` sets enabled on new; spec GRD-001 line 439; commit `302277f` |
| 10.2 | T4 Full-Matrix sign-out proof | Not started; "sessionStorage draft ... not implemented" | **Done** (stale) | `frontend/src/utils/matrixDraft.ts`, `tests/matrixDraft.test.ts`; spec UI-002 line 1172; commit `302277f` |
| 10.3 | T5 iOS Safari verification process | Not started | **Not verified** | no "webkit" in `e2e/`, `playwright*.ts` or `audit/` (backlog says WebKit descriptors "now exist": cannot confirm) |
| 10.4 | T8 + T11 grading clarification | Implemented | **Done** | `RetentionMonitoring.tsx:686-722`; spec 1206 |
| 10.5 | T2 hashing and password-form polish | Hashing implemented; reveal control remains | **As stated** | `GoogleLinkCard.tsx:181` |
| 10.6 | T3 remaining import polish | Not started | **Not done** | `pages/landing/FeaturesPage.tsx:24, 184` still advertise "PDF / Excel Roster Import" |
| 10.7 | T6 other header/layout defects | Backlog | **Not verified** | |
| 10.8 | T7 session-card follow-ups | Backlog | **Not verified** | |
| 10.9 | T9 no action | Closed | **Closed** | |

Counts: 44 items. Code shows done (incl. dropped, closed, mostly done, done in code): 20; partial, mixed or as stated: 7; not done: 6; not verifiable by reading code or not applicable: 11.

---

## Summary: counts per section

| Section | Count |
|---|---|
| 1 Classification | 70 files: 47 dated records, 6 clean references, 17 mixed/stale references; 4 built proposals; 1 contract marked "not built" that is built |
| 2 Stale statements | README 11 rows (R1-R11, 7 real defects), AGENTS 3, CLAUDE.md 1, docs 38 rows (D1-D38), scripts 10 rows (S1-S10), env-example comments 7, plus 40 files with dated add-ons |
| 3 Env vars | 121 variables listed; 9 read by code but in no example; 8 example keys with no effect or no reader in their deployment; 7 wrong example comments |
| 4 spec.md | 17 contradiction rows, 27 stacked-decision rows |
| 5 Links | 844 refs checked; 0 broken outside archive; 52 broken inside `docs/archive/` |
| 6 Docs checks | 1 existing check (file presence and migration names); 0 link, env or dated-file checks |
| 7 Backlog | 44 items; header has 6 stale claims; stale statuses: 2.2, 9.4, 9.9, 10.1 (last sentence), 10.2 |

## Top 10 findings

1. **README tells everyone to `git switch lumbanglighthal-owhie`** (README.md:58, 242, 304), a branch 273 commits behind the current line.
2. **docs/features.md:42,44 contradict spec and code**: "High / At Risk / Low risk levels" (spec 2026-10-17: no levels) and remedial "50% or more" (spec and code: 75%).
3. **spec.md contradicts itself on production biometrics and image publishing**: DEL-001 line 1032 says production biometrics stay disabled; BIO-008 line 884 says on by default; line 1039 says Owner builds images while 1032 says Claude does; line 1038 says DuckDNS while 1034 says sslip.io.
4. **AUTH-004 (spec 167) still requires a multi-domain allowlist**; AUTH-003 (161), code (`config.php:170`) and README say only `bicol-u.edu.ph`. AGENTS.md:11 repeats the old multi-domain approval.
5. **Backlog and roadmap are dead**: `roadmap.md` lists four finished items; the backlog says "checked on lighthal7 2026-10-07", marks T4 "not implemented" and T1 "default OFF" though commit 302277f shipped both, and says official export is "next" though it shipped.
6. **Env examples**: `SHOW_DEV_RESET_LINK`, `SHOW_DEV_INVITATION_LINK`, `BIOMETRIC_SIDECAR_URL` are in `.env.example` but not forwarded to the web container (README A8 step 3 is a no-op); `APP_TIMEZONE`, `VITE_API_BASE_URL`, `BIOMETRIC_SIDECAR_TIMEOUT_SECONDS`, `MAILPIT_SMTP_*` are read by code and in no example; `.env.example:63-65` wrongly says `SMTP_CA_FILE` is not forwarded.
7. **Replica count is contradictory**: `hosting-requirements.md:14` "both servers run 1 and 1", `.env.vps.example:18` "production keeps 3", `deploy-from-scratch.md:22` "3 web + 3 frontend".
8. **Single-server README claims the start script rejects every `replace_with_` value**, but it checks only 8 keys, and single-server cannot start without the seven calibration values and three model paths/hashes that B3 does not list (README.md:312-326).
9. **Doc contract and one backend test depend on doc files**: `doc_contract_test.php:18-27` requires `docs/roadmap.md` and `docs/features.md`; `academic_demo_contract_test.php:23` reads `docs/contracts/demo-academics.md`. Archiving must update them first. No link, env or dated-file check exists although README:424 and AGENTS.md promise "link/reference checks".
10. **Archive hygiene**: 47 dated records sit in `docs/` and are indexed as "Current work" in `docs/README.md`; `contracts/secretary-attendance-requests.md:3` says "not built yet" (it is built); `proposals/gra-03-matrix-computation.md:3` says phones are next (done); 8 contracts/proposals/amendments are orphaned from the index; `database/README.md:8-16` shows migrations 001-005 only (57 exist).

Not checked or only spot-checked: per-feature behaviour claims in `docs/features.md` beyond those listed; spec rules marked "Not verified" in sec. 4b; `docs/vps-deployment.md` body (701 lines) beyond provider text and versions; `docs/manual-demo-readiness.md` checklist items (551 lines); archive content; `docs/contracts/*` field-level claims; the Artifact (claude.ai) links.
