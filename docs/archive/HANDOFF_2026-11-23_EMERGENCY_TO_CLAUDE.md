# Emergency Contributor Handoff to Claude Code (2026-11-23)

- **Branch:** `lighthal9-responsive-emergency` (pushed to `origin/lighthal9-responsive-emergency`)
- **Base:** `lighthal9-responsive` at `b296c56`
- **Target for Claude:** Review and integrate into `lighthal9-responsive` via `colleague-merge` (never merged or promoted by Antigravity; VPS and `lumbang_final` untouched).

---

## 1. Completed Work & Verified Commits (`b296c56..HEAD`)

| Commit | Backlog | Summary | Gate Stamps (`.git/dentisys-pass/`) |
|---|---|---|---|
| `44e7233`, `5dedbc1` | **9.25** | 8-character minimum hint & validation alignment across remaining reason modals (People & Accounts, Face Enrolment Flags, Audit Trail revoke) | Verified earlier in emergency series |
| `53ea31f`, `1c544e6` | **9.29** | Fixed Grade Weights mobile header title/Reload overlap (393 px) and Assessments tab sticky-header overlap (1920 px) | Verified earlier in emergency series |
| `0a3a5df`, `3ebd6a7` | **9.30** | Date-aware fallback to class term dates when `academic_terms` has no matching row, preserving `lateFromEarlierTerms` | Verified earlier in emergency series |
| `8358237` | **12.9** | Migration `072_face_revoke_requests.sql`; Student face revocation approval queue (8–240 char reason, cancel, face usable while pending), mismatch update blocking (`F2`), repeat-revoke flagging (`F3`, 3+/term), unified Superadmin Face Enrolments page + Overview tile; `spec.md` (`BIO-002`, `BIO-005`, `BIO-009`, `ADM-001`) amended with Owner approval | `63c3abb6c8e105b0a8c0cee2151ac0fd2070463f` (`.check` + `.pg`) |
| `def2ab4` | **12.10** | Closed `PUT /api/student/biometric/consent { granted: false }` instant `.sface` deletion bypass for enrolled/enrolling Students (`409 revocation_approval_required` / `409 biometric_enrollment_in_progress`), stale-`enrolling` recovery & past-term expiry; `spec.md` (`BIO-002`) amended with Owner approval; logged **12.11 Optional** | `cdec92cd1fef7ec6792779bf5099fe45dab4c63f` (`.check` + `.pg`) |
| `7b6ce5f`, `d764e95` | **12.12 + 12.13** | Migration `073_grade_release_gates.sql`; gated external Final grades, Retention Status, Faculty Reports, Dean Dashboard/Reports, Email Management, and `"Remedial required"` / `"Remedial no longer required"` in-app notices behind `Submit grades` (24h Withdraw stays allowed without deleting saved remedials; new remedial writes refused `409` while unsubmitted, withdrawn, or during open Dean draft); added snapshot-backed `Publish Midterm advisory` / `Update advisory` / `Unpublish` in unified `GradeSubmissionBanner` (class-picker bar untouched, unlocked Midterm scores, confirmation modals previewing At-Risk / missing scores / `retentionImpact`, `/grades` signposts, Student `Pending` Midterm & `In progress` Final); `spec.md` (`GRD-004`, `UI-003`) amended with Owner approval; Stage 2 Final Demo approved by Owner | `5f2040756c28023db3719009f7ea50f5bc3511d5` (`.check` + `.pg`: 364/364 mocked Playwright 0 flaky, 362 frontend unit tests, 29/29 live Playwright E2E, full Postgres + sidecar integration including `grade_release_gates_integration.php`) |
| `f2eabb5` | Backlog doc | Marked `12.12` and `12.13` implemented in `docs/PRODUCT_BACKLOG.md` and added **12.14 Optional** (follow-up UI responsiveness, theme/color alignment, and placement polish pass for `12.12` + `12.13`) | Doc-only (`doc_contract_test.php` + `git diff --check`) |
| *(this commit)* | Handoff doc | Added this archive handoff (`docs/archive/HANDOFF_2026-11-23_EMERGENCY_TO_CLAUDE.md`) | Doc-only (`doc_contract_test.php` + `git diff --check`) |

---

## 2. Integration Notes for `colleague-merge` (Claude Review Checklist)

1. **Migrations added:** `072_face_revoke_requests.sql` (`12.9`) and `073_grade_release_gates.sql` (`12.12`/`12.13`) — both additive and tested in disposable PostgreSQL (`001`–`073`). Verify `073`'s `email_outbox` Midterm Advisory backfill query and `development-demo.sql` seed parity.
2. **Authoritative contracts added & current docs updated:**
   - [face-revoke-approval.md](../contracts/face-revoke-approval.md) (`12.9`, `12.10`)
   - [grade-release-gates.md](../contracts/grade-release-gates.md) (`12.12`, `12.13`)
   - `spec.md` amended (explicit Owner `SPEC-001` approvals on 2026-11-22 and 2026-11-23; note `d764e95` omitted the `Spec-approved: 2026-11-23` trailer in its commit body — Owner explicitly approved Tab 4 of the contract visualizer before coding, recorded in `docs/contracts/grade-release-gates.md`).
   - `docs/features.md`, `docs/contracts/grade-submission.md`, and `docs/PRODUCT_BACKLOG.md` updated in place.
3. **Final gate stamp after merge:** Because `f2eabb5` and this handoff commit sit on top of `d764e95` (which holds `.check` + `.pg` on tree `5f2040756c28`), re-run `scripts/check.ps1` (and `scripts/check-postgres.ps1` if any code changes during `colleague-merge`) on the final merged commit on `lighthal9-responsive` before publishing images.
4. **Owner-requested follow-ups & open items:**
   - **12.14 Optional (Owner, 2026-11-23):** Owner approved the `12.12`/`12.13` UI demo to merge, and logged `12.14` for a later UI responsiveness, theme/color cohesion, and control-placement polish pass on the new `12.12`/`12.13` elements.
   - **12.11 Optional (Owner, 2026-11-23):** Pause-consent biometric withdrawal model (distinct from `12.9` normal revocation).
   - **Pre-existing live test race noticed during `check-postgres.ps1`:** `e2e/live/live.spec.ts:455` (`secretary authoritative session lifecycle`) occasionally hits a Playwright strict-mode collision (`getByRole('link', { name: 'Attendance Monitoring', exact: true })` matching both the sidebar link and Owhie's self-linking header breadcrumb from **9.27** for 1 frame right after navigating to `/`). Passed cleanly on retry; good context when tackling **9.27**.
   - **Real-iPhone 320/390 px check:** Remains Owner-controlled per release.
   - **Remaining unbuilt actionable code backlog items:** `9.21`, `9.27`, `9.28`, `12.6` (post-defense), `13.11`, plus optional `12.7`, `12.11`, `12.14`.

---

## 3. Rules & Workflow Lessons Created During Antigravity Gemini (Consider Adopting in Claude Code)

During the entire Antigravity Gemini emergency period, the Owner and Antigravity iteratively refined a set of rules and skills under `~/.gemini/config/plugins/dentisys-emergency/`. Below are the durable rules that prevented real bugs, saved hours of gate/token waste, and improved Owner communication — surfaced here so Claude Code can adopt the beneficial ones into `CLAUDE.md`, `.claude/skills/`, or hooks:

### A. Validation & Gate Speed (Biggest Time/Token Saver)
- **Pre-gate full fast sweep (~15 s, mandatory before `check-postgres.ps1`):** Before launching Docker `check-postgres.ps1`, run in one pass:
  1. Normalize CRLF (UTF-8 no BOM) on every changed file in `git status --porcelain` so `scripts/test-stamp.ps1` (`git add -A` under `$ErrorActionPreference = 'Stop'`) never aborts on `LF will be replaced by CRLF` warnings.
  2. Run `php -l` + **every** `tests/backend/*_test.php` (not just 2–3 files — use one `docker compose run --rm --no-deps web` if native Windows PHP lacks `intl`/`pdo_sqlite`). In `12.12`/`12.13`, skipping 2 static contract tests (`academic_demo_contract_test.php`, `recompute_current_grades_test.php`) invalidated a passing 10-minute `.pg` stamp and cost ~25 minutes of reruns.
  3. Run `php tests/documentation/doc_contract_test.php`.
  4. Run `npx tsc -b` + `npm test` in `frontend/`.
- **Strict `INTEGRATION_CONTINUE_ON_FAIL=1` & warm-container debug loop:** Never drop `$env:INTEGRATION_CONTINUE_ON_FAIL = '1'` until **0 failures** remain (dropping it early cost 3 extra cold Docker teardown/rebuild cycles). Iterate on brand-new `tests/database/*_integration.php` files inside one warm running container (`docker compose exec web php ...`) before running the cold-start `check-postgres.ps1` stamp pass.
- **Gate order & single-pass tree stamping:** Run `check-postgres.ps1` **before** `check.ps1` on any backend/DB/migration/`tests/database` change; keep zero untracked files during the final gate run; commit those exact files and verify `.git/dentisys-pass/<HEAD^{tree}>.pg` and `.check` match `HEAD^{tree}`.
- **Redirect verbose gate logs:** Always redirect `pwsh` gate output to a scratch log file and read only `EXIT` + failing lines / last ~30 lines (open full log only on failure) to keep context lean.
- **Windows PowerShell 5.1 safety:** Never use `powershell.exe` redirection (`>`), `Set-Content`, or `Out-File` to write repo files (creates UTF-16LE or UTF-8 BOM, tripping `.githooks/check-staged-encoding.mjs`); use native edit tools or Node `fs.writeFileSync(..., 'utf8')`, and run official gate scripts with `pwsh`.
- **Commit audit trailer for spec edits:** Whenever a commit modifies `spec.md` (with explicit Owner approval), include `Spec-approved: YYYY-MM-DD` in the commit message body.

### B. Engineering Quality & Multi-Agent Separation
- **Never share one blind spot between code and tests:** For any feature, behavior change, or non-trivial bug fix, split implementation and tests across separate agents/workers with strictly disjoint file ownership (and always inspect the real `git diff`, never trust a worker's summary alone). In `12.12`/`12.13`, independent tests caught 2 genuine notification bugs (`remedial_assignment` scheduling notices masking `"Remedial required"`, and passed-remedial Re-submit triggering false `"Remedial no longer required"`) plus 4 UI/external-visibility contradictions before commit.
- **Pre-implementation critic pass on complex features:** Spawning a read-only Architecture & UX Critic against the live codebase *before* coding `12.12`/`12.13` prevented shipping contradictory `"2.6 Deficient + Cleared"` Student screens and `"2.6 + Good Standing"` Dean counts, and led to reusing `GradeSubmissionBanner` instead of adding a second toolbar button.
- **Two-stage feature alignment (Stage A plain prose → Stage B `/grill-me`):** Before asking multiple-choice HTTP/DB/API questions, discuss the core product tension and 2–3 high-level options in plain prose. Only after the conceptual direction is settled, lock API/error/edge-case specifics in `/grill-me`, draft the contract, and get explicit `SPEC-001` approval.
- **DentiSYS test-worker pre-flight checklist:**
  - When changing external visibility, permissions, or grading/retention contracts, `git grep` **all** `tests/backend/*_test.php` and `e2e/live/*.spec.ts` for affected endpoints (e.g. `e2e/live/grouped-grading.spec.ts` broke under `12.12` because it read Student grades before Submit).
  - Verify raw SQL column names (`audit_events` uses `action_code`/`target_type`/`target_id`; `notifications` uses `recipient_user_id`/`notification_type`/`entity_type`/`entity_id`/`deduplication_key`) and `NOT NULL`/`CHECK` constraints against migrations before running tests.
  - PHP traps: never assert `null` using `$arr['k'] ?? 'non-null'` (evaluates to `'non-null'` when value IS `null` — use `array_key_exists`); scope `notifications` queries by title/dedup prefix when a `notification_type` is shared across events; never pass courses still referenced by `grading_configs` to `integration_retire_fixture_classes()`.
  - Live E2E traps: DentiSYS normalizes person names to Title Case (`AtRisk` → `Atrisk`); `afterEach` archiving a class that may have a pending remedial must fall back from `cancelled` to `submit` + `finished` (`CLS-003`).

### C. UI Demo & Visual Cohesion
- **Real-app screenshots only:** Never build hand-written HTML/CSS UI mockups; capture real Vite + Playwright Before (detached worktree at base commit, cleaned up cleanly) vs. After screenshots on Desktop 1920 + iPhone 393 + dark mode with `scrollWidth <= innerWidth` measurements.
- **Theme & placement parity check before `Verdict: pass`:** Added after Owner feedback (`12.14`) — explicitly verify new UI elements match the role's existing accent palette (emerald/clinical for Faculty, blue for Student/Secretary, slate/neutral for read-only/pending), match sibling button heights/radii in the same card, and keep mobile (393 px) vertical header/banner chrome minimal.

### D. Owner Communication & Edit Discipline (`owner-style-and-edits.md`, ADHD-Optimized)
- **Reply style (unless Owner says `"normal mode"`):**
  - First line is the direct answer or next action (no preamble, no recap, no closers like "let me know" / "hope this helps").
  - Multi-step work: numbered list, one bounded action per step, fewest steps that work; restate state each turn.
  - Max 5 items per list (most relevant first; categorize if completeness requires more).
  - Literal phrasing, no idioms/figurative language; concrete time units; ranked options (2–4, recommendation first).
  - End code changes with 1 line on what was skipped or not checked; end every open turn with **one** concrete next action doable in under 2 minutes.
- **Edit discipline:** Smallest change that solves the task; reuse existing helpers/components; trust `git diff` over worker summaries; revert any line the task did not need.
