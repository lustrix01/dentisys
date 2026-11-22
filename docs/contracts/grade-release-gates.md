# Grade release gates: Final Retention behind Submit grades (12.12) & Midterm Advisory publish (12.13)

Decisions agreed with the Owner during `/grill-me` on 2026-11-23 (Option 1 + Q1–Q8 below). Owner approved `SPEC-001` on 2026-11-23; applied to `spec.md` (`GRD-004`, `UI-003`). Amends [grade-submission.md](grade-submission.md) (13.8).

## Rule

Auto-saved scores stay working drafts inside **Grade Computation** until Faculty explicitly publish them:
- **Midterm (12.13):** Students, Dean counts, Retention Monitoring → At-Risk Students, and Email Management → Midterm Advisory see computed Midterm grades and At-Risk status only after Faculty clicks **Publish Midterm advisory** (snapshot-backed, scores stay unlocked).
- **Finals (12.12):** Students, Dean Dashboard/Reports, Faculty Retention Monitoring, Faculty Dashboard retention KPIs, Faculty Reports, and Email Management → Remedial see final course grades and Retention Status (`Remedial` / `Irregular reenrollment`) only after Faculty clicks **Submit grades** (`GRD-004`).

## Per-role visibility

| Surface / Role | Before Midterm publish | Midterm published, Finals not submitted | Finals submitted (`grades_submitted_at IS NOT NULL`) |
|---|---|---|---|
| **Faculty — Grade Computation** (Scores, Matrix, Grade Sheet, workbook export) | Live computed Midterm, Final, Course Grade & preview Remarks | Same live preview + banner shows published / dirty diff | Locked submitted view (or live Draft during open grade change) |
| **Faculty — Retention Monitoring** (At-Risk Students) | Empty for unpublished classes (+ signpost banner to Grade Computation) | Lists At-Risk students from published Midterm snapshot | Class leaves At-Risk Students (handed off to Retention Status) |
| **Faculty — Retention Monitoring** (Retention Status & Remedial Progression) | Hidden for unsubmitted classes (+ signpost banner); existing saved remedial rows stay readable read-only | Same (still waiting for Final submit) | Active (`Active` / `Remedial` / `Irregular reenrollment` / `Cleared`); remedial recording enabled when no open Dean draft |
| **Faculty — Dashboard KPIs, Faculty Reports, Email Management** | Midterm & Final counts/rows gated off for unpublished/unsubmitted classes | Midterm At-Risk KPI & Email Management → Midterm Advisory active; Final/Remedial still gated off | Final grade, Standing Grade, Class Grade Ledger exports, Retention & Remedials active |
| **Student** | Individual assessment scores visible; Midterm % = `Pending`, no Midterm Advisory; Final grade = `No grade yet`, no Retention Status | Published Midterm % & Midterm Advisory visible (At-Risk stays visible through Finals); Final grade = `No grade yet` | Final grade & Retention Status visible; Midterm Advisory retired for this course |
| **Dean / Superadmin** (Dashboard & Reports) | Class excluded from Midterm At-Risk, Final GWA, Good Standing, and Remedial counts | Included in Midterm At-Risk count (from published snapshot); excluded from Final GWA / Good Standing / Remedial | Included in Final GWA, Good Standing, Remedial, and Irregular Reenrollment counts |

## Decisions (Q1–Q8)

- **Q1 (External Final Grade visibility):** Before `Submit grades`, Students and Dean see `No grade yet` for Final Course Grade and no Retention Status; Students still see individual assessment scores, and Faculty still sees live previews in Grade Computation.
- **Q2 (Student Midterm visibility):** Before `Publish Midterm advisory`, Students see `Pending` for computed Midterm % and no Midterm Advisory; Students still see individual Midterm assessment scores.
- **Q3 (Publish eligibility):** Allowed for `periods`-mode classes whenever at least 1 enrolled student has a computed Midterm grade (even if 0 students are At-Risk or some students have missing Midterm scores). Confirmation modal lists every At-Risk student (or `"No students are At Risk"`) plus any students with missing Midterm scores. Hidden for `schema_mode = 'overall'` classes.
- **Q4 (Midterm in-app notifications):**
  - On **Publish** / **Update advisory**: send `"Midterm advisory in <course>"` to newly At-Risk students (deduped so unchanged At-Risk students are never re-notified); on **Update advisory**, send `"Midterm advisory cleared in <course>"` to students previously flagged At-Risk who are no longer At-Risk.
  - On **Unpublish**: clear `midterm_published_at` and `midterm_published_snapshot`, send no in-app notice.
  - Emails remain strictly Faculty-initiated via Email Management (`EML-001`).
- **Q5 (Final Retention in-app notifications):**
  - Remove automatic retention notifications from `faculty_save_computed_grade()` (auto-save never notifies).
  - On **Submit grades** (including Withdraw → Re-submit): send `"Remedial required in <course>"` to students entering Remedial (2.5–4.9) not already notified for the active remedial state; send `"Remedial no longer required in <course>"` to students previously notified as Remedial who are now passing (1.0–2.4); never duplicate-notify unchanged Remedial students.
  - On **Dean Approve Grade Change**: if an approved batch moves a student into or out of Remedial (2.5–4.9), send `"Remedial required"` / `"Remedial no longer required"`; normal passing grade changes remain silent (`GRD-004` Q7).
- **Q6 (Remedial recording guard):**
  - **24-hour Withdraw** stays allowed even if a remedial attempt was already recorded; saved remedial rows (`enrollment_remedial_attempts`) are **never** deleted and automatically restore on re-submit (`gradeChangedAfterRemedial` applies if the student's grade changed to passing).
  - Recording or scheduling new remedial attempts or cost-recovery results is refused (`409`) while `grades_submitted_at IS NULL` (unsubmitted or withdrawn) **or** while the class has an open (`draft` or `pending`) Dean grade-change batch.
  - Sending Remedial Notice emails is also refused (`409`) while unsubmitted/withdrawn or while a Dean grade-change batch is open.
- **Q7 (Faculty Reports):** Faculty Reports (`Grades & Assessments`, `Retention & Remedials`, and official Class Grade Ledger PDF/Excel exports) gate `final_gwa` and `retention_state` on `grades_submitted_at IS NOT NULL`, matching Retention Monitoring and Dean Reports. Faculty reviews live working grades in **Grade Computation → Grade Sheet** (and its workbook export).
- **Q8 (Existing data on rollout):**
  - Migration `073` backfills `midterm_published_at` + `midterm_published_snapshot` only for current-school-year active `periods`-mode classes that already have a `Sent` `Midterm Advisory` email in `email_outbox` (computed at backfill or on first read if snapshot is backfilled cleanly; see Data section).
  - Migration `073` does **not** auto-submit any unsubmitted current-year class that already has `enrollment_remedial_attempts`; existing saved attempts remain preserved and visible read-only until Faculty submits.
  - Development seed (`database/seeds/development-demo.sql`) and integration fixtures (`tests/fixtures/live-stack.sql`) are updated so seeded classes demonstrating Remedial and Midterm At-Risk are explicitly submitted / Midterm-published.

## Data (migration `073_grade_release_gates.sql`, additive)

On `class_sections`:
- `midterm_published_at timestamptz NULL`
- `midterm_published_by integer NULL REFERENCES user_accounts(user_id) ON DELETE SET NULL`
- `midterm_published_snapshot jsonb NULL`

Snapshot shape (`midterm_published_snapshot`):
```json
{
  "version": 1,
  "entries": {
    "1042": {
      "percentage": 83,
      "rawPercentage": 82.67,
      "gwa": 2.6,
      "isAtRisk": true,
      "gradedCount": 4,
      "totalCount": 4,
      "components": []
    }
  }
}
```
- Only students with a computed (`complete === true`) Midterm grade at publish time have an entry; students with missing Midterm scores have no entry (shown as `Pending` externally until included in a later **Update advisory**).
- Dirty detection: compare live `faculty_watchlist_midterm()` per active enrollment against `midterm_published_snapshot.entries` (percentage, gwa, `isAtRisk`, or newly complete / newly incomplete enrollments).
- Backfill: for current-school-year active classes with a `Sent` `Midterm Advisory` email in `email_outbox`, set `midterm_published_at` to the earliest sent timestamp; snapshot entries are populated from current Midterm assessments (or recomputed if `midterm_published_at IS NOT NULL AND midterm_published_snapshot IS NULL`).

## API

### Extended existing endpoints

1. **`GET /api/faculty/classes`** — adds per-class fields:
   - `midtermPublished: boolean`
   - `midtermPublishedAt: string | null`
   - `midtermAdvisoryDirty: boolean`
   - `midtermAtRiskCount: number` (published count if published, else live ready count)

2. **`GET /api/faculty/classes/grade-submission?csId=<id>`** — extends response with:
   - `retentionImpact: Array<{ enrollmentId: number, name: string, studentNumber: string, grade: number, outcome: 'remedial' | 'irregular_reenrollment' }>` (students who will enter Remedial or Irregular reenrollment on Submit)
   - `midterm: { eligible: boolean, schemaMode: 'periods' | 'overall', published: boolean, publishedAt: string | null, dirty: boolean, readyCount: number, atRisk: Array<{ enrollmentId: number, name: string, studentNumber: string, grade: number, percentage: number }>, missing: Array<{ name: string, studentNumber: string, missingCount: number }>, diff: { added: Array<{ enrollmentId: number, name: string, studentNumber: string, grade: number }>, removed: Array<{ enrollmentId: number, name: string, studentNumber: string, grade: number | null }> } }`

3. **`POST /api/faculty/classes/grade-submission`** (`{ csId }`):
   - Recomputes fresh enrollment grades inside the transaction before setting `grades_submitted_at`.
   - Sets `grades_submitted_at`, `grades_submitted_by`, `grades_grace_until`.
   - Emits idempotent `"Remedial required"` / `"Remedial no longer required"` in-app notifications (comparing against prior `remedial_assignment` notification state for each enrollment).
   - Returns the updated `grade-submission` payload.

### New Faculty endpoints (own classes only; others `403`)

| Method | Path | Input | Output |
|---|---|---|---|
| `POST` | `/api/faculty/classes/midterm-advisory/publish` | `{ csId }` | Same `grade-submission` payload (`midterm.published = true`, `dirty = false`) |
| `POST` | `/api/faculty/classes/midterm-advisory/unpublish` | `{ csId }` | Same `grade-submission` payload (`midterm.published = false`) |

Note: `POST /api/faculty/classes/midterm-advisory/publish` handles both initial **Publish Midterm advisory** and subsequent **Update advisory** (comparing previous snapshot vs new snapshot for diff notifications and audit event code).

### Errors

- `403`: Non-owner Faculty or non-Faculty role.
- `409`:
  - `"Midterm advisory applies only to classes using Midterm and Final periods."` (`schema_mode = 'overall'`)
  - `"Enter complete Midterm scores for at least one student before publishing."` (`readyCount === 0`)
  - `"Grades for this class are already submitted."` (publish/unpublish on a submitted class)
  - `"Grades for this class are archived."` (publish/unpublish on an archived class)
  - `"Midterm advisory is not published for this class."` (unpublish when unpublished)
  - `"Submit the class grades before recording a remedial result."` (remedial/cost-recovery save while unsubmitted or withdrawn)
  - `"Finish or discard the open grade change before recording a remedial result."` (remedial/cost-recovery save while a Dean `draft`/`pending` batch exists)
  - `"Submit the class grades before sending remedial notices."` (Email Management → Remedial send while unsubmitted/withdrawn or open batch)
  - `"Publish the Midterm advisory before sending Midterm advisory emails."` (Email Management → Midterm Advisory send while unpublished)

### Example

```json
POST /api/faculty/classes/midterm-advisory/publish
{"csId": 41}
→ 200 {
  "status": "not_submitted",
  "midterm": {
    "eligible": true,
    "schemaMode": "periods",
    "published": true,
    "publishedAt": "2026-10-15T14:20:00+08:00",
    "dirty": false,
    "readyCount": 28,
    "atRisk": [
      {"enrollmentId": 1042, "name": "Dela Cruz, Juan", "studentNumber": "2024-0011", "grade": 2.6, "percentage": 83}
    ],
    "missing": [],
    "diff": {"added": [], "removed": []}
  }
}
```

## Notifications (in-app)

- `midterm_advisory` (new notification type):
  - Added to At-Risk on Publish/Update: `"Midterm advisory in <course>"` — `"Your published Midterm grade in <course> (<section>) is <grade>. This is an informational advisory; contact your Faculty for academic support."`
  - Cleared from At-Risk on Update: `"Midterm advisory cleared in <course>"` — `"Your updated Midterm grade in <course> (<section>) is <grade>. You are no longer listed on the Midterm Advisory."`
  - Deduplication key tracks transition state (`midterm-advisory:<enrollmentId>:at_risk:<cycle>` only when transitioning from non-at-risk → at-risk, and `midterm-advisory:<enrollmentId>:cleared:<cycle>` only when transitioning from at-risk → non-at-risk, where `<cycle>` increments only on actual state flips, never on unchanged students).
- `remedial_assignment` (existing notification type, moved from auto-save to Submit grades & Dean Approve Grade Change):
  - Same titles/bodies as existing `faculty_notify_grade_retention_change`, keyed on actual state transition (`none/cleared -> remedial` or `remedial -> cleared`) so re-submitting after Withdraw with an unchanged Remedial student never sends a duplicate, while fixing `2.6 -> 2.2` sends `"Remedial no longer required"`.

## Audit

Area `grading`:
- `midterm_advisory_published` (records published student count + At-Risk count)
- `midterm_advisory_updated` (records added/removed At-Risk counts)
- `midterm_advisory_unpublished`

## UI screens & `docs/frontend.md` Page patterns

- **Grade Computation** (`frontend/src/pages/faculty/GradeComputation.tsx` & `frontend/src/components/GradeSubmissionBanner.tsx`):
  - Class-picker bar stays untouched (only `S.Y.`, `Class`, `Submit grades`).
  - `GradeSubmissionBanner` adds the pre-submit Midterm lifecycle states using the existing `NoticeBanner` standard:
    - Not published (when `readyCount > 0` and `schemaMode === 'periods'`): `information` banner (`"Midterm advisory not published (N At-Risk ready)."` + **`Publish Midterm advisory`**).
    - Published, clean: `information` banner (`"Midterm advisory published on <date> · N At-Risk."` + **`Unpublish`**).
    - Published, dirty: `warning` (amber) banner (`"Midterm scores changed since published."` + **`Update advisory`** + **`Unpublish`**).
    - Submitted: existing 13.8 banners (Midterm banner hidden).
  - Confirmation modals reuse the existing `ConfirmDialog` (`requestConfirmation`) pattern:
    - **Publish / Update Midterm advisory**: lists At-Risk students (with Midterm grade) or `"No students are At Risk"`, lists any students with missing Midterm scores, and states that flagged students will appear on At-Risk Students / Midterm Advisory and receive an in-app notice (emails stay manual in Email Management).
    - **Submit grades**: existing missing-scores list + new section listing students entering **Remedial** or **Irregular reenrollment** who will be placed in Retention Status and notified.
- **Class cards** (`frontend/src/utils/gradeStatusChip.ts`): add neutral/info chip `"Midterm published"` between `"Not submitted"` and `"Submitted"`.
- **Retention Monitoring** (`frontend/src/pages/faculty/RetentionMonitoring.tsx`) & **Email Management** (`frontend/src/pages/faculty/EmailManagement.tsx`): standard `NoticeBanner` signpost when Faculty has unpublished Midterm or unsubmitted Final classes, linking directly to **Grade Computation** (no duplicate publish/submit buttons).

## Spec amendments (Approved by Owner 2026-11-23 and applied to `spec.md`)

1. **`GRD-004` (Grade submission and Dean approval):**
   - Update paragraph 1: Submit confirmation lists students with missing scores **and students entering Remedial or Irregular reenrollment**. Final course grades and Retention Status become visible to Students, the Dean, Retention Monitoring, Faculty Reports and Email Management only after grades are submitted (Faculty continue seeing live computed previews inside Grade Computation). `"Remedial required"` / `"Remedial no longer required"` in-app notifications are sent on submission (and when a Dean-approved grade change moves a student into or out of Remedial), not during score auto-save. Withdrawing within 24 hours remains allowed even if a remedial attempt was recorded; saved remedial attempts are never deleted and restore on re-submission; recording new remedial or cost-recovery results is refused while a class is unsubmitted, withdrawn or has an open grade change.
   - Add Midterm advisory paragraph: For classes using Midterm and Final periods, Faculty publish Midterm grades and At-Risk status via **Publish Midterm advisory** after a confirmation listing At-Risk students and missing Midterm scores (allowed once at least one student has a computed Midterm grade, including zero At-Risk). Midterm scores stay editable; edits after publishing keep the published snapshot unchanged until Faculty click **Update advisory** (or **Unpublish**). Publishing/updating sends in-app notices to newly At-Risk students (and cleared notices when a student leaves At-Risk); emails remain Faculty-initiated under `EML-001`. Details: `docs/contracts/grade-release-gates.md`.
2. **`UI-003` (Midterm Watchlist and retention status):**
   - Update paragraph 5 & 6: Retention Status and final course grades apply externally only to submitted classes (`GRD-004`). Midterm Watchlist (At-Risk Students) and Midterm Advisory (and Students' computed Midterm percentage) become active when Faculty publish the class's Midterm advisory (`GRD-004`), use the published Midterm snapshot, and remain active until the class's Final grades are submitted (rather than dropping when unsubmitted Final scores exist).
