# lighthal7 local demo rehearsal — 2026-10-03

## Required split grading follow-up — 2026-10-04

The Owner approved [required split grading and syllabus defaults](proposals/mandatory-lecture-laboratory-defaults.md).
New or updated period configurations must use separate Lecture/Laboratory lists.
Unconfigured offerings start with editable, unsaved 60/40 component contributions,
30/70 period contributions, and the syllabus category weights in both periods.
The combined/split selector and optional example action are removed.
Implementation and validation are complete. TypeScript, 72 unit tests, lint
(zero errors), the full fast gate with 203 mocked browser tests and the full
PostgreSQL integration suite pass. All eleven live scenarios passed across the
full run and focused test corrections; the final scoped Auto Review is clean.

Existing saved demo configurations are preserved. An older combined period
configuration requires explicit forward conversion and Faculty category mapping
before changed weights can be saved. The demo is not automatically converted or
recomputed to show the defaults. All 27 existing demo configurations remain
legacy combined; refresh http://localhost:5173/grades to inspect the explicit
conversion action. The default editor was verified on an isolated test offering.
See [the grading walkthrough](lecture-laboratory-grading.md) and
[final evidence](HANDOFF_2026-10-04.md).

## Earlier Lecture/Laboratory extension — 2026-10-04

The earlier Owner approval introduced separate Lecture/Laboratory grading and
conversion back to combined period lists. The required-split amendment above
supersedes that conversion-back approval. The preceding feature was validated; see
[the current handoff](HANDOFF_2026-10-04.md) and
[the grading walkthrough](lecture-laboratory-grading.md).
Additive migration 045 is applied to this existing preview. Its original
academic rows and saved grade breakdowns still match the pre-migration snapshot.
No existing offering was converted or recomputed during preparation.

The final feature checks passed: TypeScript, 72 unit tests, lint with zero
errors, the full fast gate with 203 mocked browser tests, and the complete
PostgreSQL integration suite including grouped lifecycle coverage. All ten live
scenarios passed across the full run and focused fixture corrections. The
grouped example persisted 84% Midterm, 86% Finals and 85.4% overall. Faculty
Grade Weights/Summaries and Student My Classes were inspected at desktop and
phone widths; screenshot evidence is listed in the current handoff.

Runtime Auto Review is clean. The Owner authorized a final external follow-up
review of three test-only corrections after automatic approval review initially
rejected repository export. That review also exited 0 with no actionable
findings, confirming the UI selectors and preserved calculation/lifecycle
assertions. Their affected live scenarios passed; runtime files did not change.
The Owner subsequently requested committing the completed demo/grading batch and
pushing `lighthal7`. No merge or deployment was requested.

The existing all-role demo is running again at the address below with its
saved environment and current tested image. Health checks and complete
Faculty/Student retention API baseline comparisons passed. Original academic
rows, scores, configurations and saved grade breakdowns still match their
snapshots. Grouped test offerings exist only in retained, stopped integration
projects; the original demo was not reseeded or modified to manufacture results.

## Current verdict

The Owner approved the concrete fixes below with “Let's proceed with fixes”.
Dean report Class labels/CSV values now use the supplied readable names. Faculty
retention now batches assessment and attendance reads and reuses grading inputs
within each request. Changed-tree automated validation and affected desktop/phone
screen checks passed. The local password-based all-role rehearsal is ready;
the complete manual-demo checklist has not been accepted.

Reviewed branch: `lighthal7`, runtime commit `b076da3`. Existing local changes to
AGENTS.md and the handoff are preserved. The approved runtime fixes are local
uncommitted changes. That initial polish batch changed no specification, schema
or demo academic data; the approved October 4 extension is recorded above.
Sign-ins/sign-outs create
normal authentication audit records in the preview database.

## Use this environment

| Purpose | Address |
| --- | --- |
| Demo application | http://localhost:5173/login |
| Existing preview alias | http://127.0.0.1:15473/login |
| API health | http://127.0.0.1:18380/api/health |
| Local Mailpit | http://127.0.0.1:18325 |

The existing Docker project is `dentisys-compare-lighthal7-20261003`. It has its
own persisted database and fictional demo seed. Its frontend and backend
controllers read the current checkout; other backend files use the existing
image. Rebuild the affected image if later changes touch image-only files.

On October 4 the Owner requested port 5173 for testing. It was free and now
exposes this same demo, with port 15473 retained as an alias. Only the frontend
and web containers were recreated; the database container and volumes were
preserved. New application links use `http://localhost:5173`. Use that address
consistently and sign out before changing roles.

Do not reseed, reset, delete volumes or replace this database to prepare the
demo. Keep the stack running. The ignored local Compose override is
`_maintenance/branch-comparison-20261003/lighthal7.compose.json`; this guide
describes the existing setup, not a portable clean-machine installation.
For a fresh development setup, follow [development-environment.md](development-environment.md).

The additional port is configured by the ignored local helper
`_maintenance/grouped-demo-port5173.py`, which captures the existing container
environment into a local temporary Compose override. It validates the merged
configuration and starts only `web` and `frontend` without a build or dependencies.
After the port change, both frontend addresses and the proxied API health returned
HTTP 200; Admin, Faculty, Secretary and Student password login through port 5173
passed. Academic rows and saved grade breakdowns still match their snapshots.

Both API health routes passed `scripts/smoke.ps1 -BackendUrl
http://127.0.0.1:18380`; frontend `/login` returned HTTP 200.
Runtime configuration reported environment `test`, Student authentication enabled,
development mock identity disabled, biometrics disabled, location disabled and
browser attendance prototype disabled. Google is configured, but the browser
reported that this preview origin is not allowed for its client ID. Use password
sign-in for this rehearsal. Real Google/camera/location acceptance remains open.

## Suggested all-role sequence

Passwords are local-only fictional fixture credentials in [demo-accounts.md](demo-accounts.md).

| Order | Account | Walkthrough |
| --- | --- | --- |
| 1 | `admin@bicol-u.edu.ph` | Dashboard; Faculty Invitations pending/expired rows; Reports & Analytics current versus historical school year; Audit Trail. |
| 2 | `faculty@bicol-u.edu.ph` | Current CLINIC-4A/4B; Grade Computation; attendance worksheet; retention; reports/activity. |
| 3 | `secretary@bicol-u.edu.ph` | Dashboard; Attendance Monitoring; choose CLIN401 session dated 2026-09-23; Session History; same-account Student View and return. |
| 4 | `markanthony.hernandez@bicol-u.edu.ph` | Student Dashboard; My Classes current/archive separation; Retention Monitoring active/past courses; My Profile. |

The clinical Student shares the Faculty's CLINIC-4A course. The Secretary belongs
to CLINIC-4B. Current final grades are pending in this seed: present them as pending,
not completed academic outcomes. My Classes shows Schedule TBA where no canonical
meeting has been saved. Select a past school year for recorded grade examples.

Show Grade Computation's existing assessment selector and weights without saving
changes during the first rehearsal. Session Configuration is available, but
camera/geofence controls are not evidence of enabled providers. Attendance
history contains fictional seeded verification labels, not proof of live face
verification. Session start/end, overrides, invitations, exports, print and MFA
need a separate controlled rehearsal before claiming their manual acceptance.

## Initial rehearsal evidence and limits (before the fixes)

- Password sign-in, correct role landing and sign-out were exercised for all
  four roles. Ordinary Student My Profile resolves to that Student's record.
- Dean Dashboard, loaded Faculty Invitations, Reports and Settings were inspected.
  Reports contained 120 current-year Students; the Class column showed `21`
  rather than CLINIC-4A. The API already supplies both `classId` and `className`.
- Faculty Dashboard and Classes showed two sections / 30 Students. Grade
  Computation and attendance selectors loaded. Pending Remedials and the
  Retention Monitoring page each showed a connection error in this rehearsal.
  The client aborts requests after 15 seconds. A separate direct authenticated
  retention read returned HTTP 200, 60 records, in 8.58 seconds. Backend logs also
  record successful browser retention requests after the UI had shown failure.
  Query cost/concurrent-request pressure is a diagnosis to investigate, not a
  proven single root cause. Do not hide the failure or extend all request timers.
- Secretary Dashboard showed CLINIC-4B / 15 Students. Attendance Monitoring
  showed 90 seeded history records. Student View displayed the same Bea Mercado
  Alonzo identity and Student number; returning restored Secretary context.
- Student Dashboard showed CLINIC-4A, pending GWA and real attendance/clinical
  hours. Classes separated one current and four archived enrollments. Retention
  displayed Standing Pending and the original course grade as Pending.
- Desktop layout was inspected at 1440×1000. Secretary Dashboard and Student
  Classes were inspected at a requested 390×844 phone viewport. Their measured
  document width was 385 versus reported viewport width 391, with no whole-page
  horizontal overflow. This is limited responsive coverage, not every route.
- Student mobile retention screenshot is retained outside the repository at
  `C:/Users/decha/.codex/visualizations/2026/10/03/01a10218-1799-7a53-bcad-5aedabcf472e/lighthal7-student-retention-mobile.jpg`.

Existing accepted-tree validation remains applicable to unchanged runtime code:
production build, 194 mocked browser tests, 68 unit tests, full PostgreSQL gate
and nine live tests passed, as recorded in [the handoff](archive/HANDOFF_2026-10-03.md).
Those tests do not replace this manual rehearsal or invalidate its new finding.

## Approved-fix verification

- Request-local batching reduces the 60-enrollment grading projection to 10
  executed queries. Its SHA-256 projection hash remains
  `8aca610eb96e421a33c84828aab427e3d670a29df16b7813d5475677b48d84db`.
  The recovered preview returned Faculty retention in 0.44 seconds and Student
  retention in 0.156 seconds. Complete JSON equality checks passed for both
  against snapshots captured before edits, including all historical rows.
  Timing is local evidence, not a guarantee for another machine or dataset.
- Faculty Dashboard Pending Remedials now loads its server-backed empty result.
  Retention loads 30 current-year enrollments, 22 informational risk alerts and
  the CLINIC-4A/4B filters. Missing assessments remain incomplete. Desktop
  1440×1000 and phone 390×844 were inspected; phone document width was 385 versus
  reported viewport width 391, with no whole-page horizontal overflow.
- Dean Class cells use `className`; internal `classId` filtering is preserved.
  Summary/Retention CSVs quote comma/quote/newline labels and neutralize
  formula-leading class names as literal text. Two focused browser tests passed
  after this security correction. The live Summary shows CLINIC-4A instead of
  the internal ID; desktop and phone layouts were inspected with 120 records.
  Phone document width was 385 versus viewport 391. The in-app browser's live
  download-event capture timed out, so manual file-download confirmation and
  print acceptance remain open; CSV contents were verified by the focused tests.
- Type checks and all 68 unit tests passed. Lint reported 0 errors and 213
  existing warnings. The fast gate passed with 196 mocked browser tests. A new
  production build and focused lint check cover the later CSV correction.
  Focused lint passed with 0 errors and 25 existing warnings after a scoped
  explanation for the intentional control-character regex. That comment-only
  correction preserves the behavior covered by the build, tests and review.
- The first full database attempt stopped at the disposable project-name guard;
  the next exposed an incorrect new fixture expectation. The fixture uses 50/50
  category weights: an entered zero yields 68.75, confirmed by equal standalone
  and batched reads in a rolled-back test transaction. The assertion was
  corrected without changing runtime math. The final complete PostgreSQL gate
  passed, including migration/idempotence, backup/restore, integration, health,
  nine live browser tests and log checks. Its fresh project is
  `dentisys-integration-demo-polish-r2-20261003` (API 18680, UI 15773,
  Mailpit 18625). Temporary gate copy:
  `C:/Users/decha/AppData/Local/Temp/dentisys-demo-polish-no-reset-check.ps1`;
  it retains the original assertions, guards a fresh project, reuses the tested
  image, and removes initial/final volume deletion. Its full log is
  `C:/Users/decha/AppData/Local/Temp/dentisys-demo-polish-postgres-r2.log`.
- Auto Review command: `python -X utf8
  C:/Users/decha/.agents/skills/autoreview/scripts/autoreview --mode local
  --engine codex --prompt-file _maintenance/demo-polish-review.md` (plus local
  output-file options). The first finding identified formula injection through
  editable class names; it was verified, fixed and covered by both CSV tests.
  Final helper exited 0 with no actionable findings. Structured result:
  `C:/Users/decha/AppData/Local/Temp/dentisys-demo-polish-review-final.json`.
- Docker recovery restarted only the existing demo containers. No preview
  reseed, migration, provider change, academic mutation or volume deletion was
  performed. Database gates use fresh guarded integration projects, preserving
  every existing volume and retaining all original integration assertions.
  The two unsuccessful test projects were stopped after use to reduce resource
  pressure; their containers and volumes are retained. The accepted integration
  stack is kept. The demo remains running, signed out at `/login`, with temporary
  browser viewport overrides reset.
- Screenshots are retained outside the repository in
  `C:/Users/decha/.codex/visualizations/2026/10/03/01a10218-1799-7a53-bcad-5aedabcf472e/`:
  `lighthal7-faculty-retention-fixed.jpg`,
  `lighthal7-faculty-retention-mobile-fixed.jpg`,
  `lighthal7-dean-class-labels-fixed.png`, and
  `lighthal7-dean-reports-mobile-fixed.jpg`.

## Approved polish batch

The Owner approved this plan on 2026-10-03. These changes preserve existing API fields, permissions,
calculation rules, grade/attendance history and specification decisions.

1. **Faculty retention performance:** profile the existing read path on this
   seeded dataset, isolate expensive queries and apply the smallest measured
   correction. Preserve all 60 records, risk/grade values, completeness gates,
   current/history separation and manual overrides. Compare complete response
   payloads before/after; add focused regression evidence and verify concurrent
   browser loading stays within the existing timeout. Do not fabricate empty
   success, omit historical rows or blanket-increase the API timeout.
2. **Dean report class labels:** in `frontend/src/pages/admin/SystemAudit.tsx`,
   render supplied `className` (or an em dash when absent) in Student Summary and
   Retention tables; render the attendance row's own `className` in Attendance.
   Keep numeric `classId` for filtering/identity. Use readable class names in
   Student Summary/Retention CSV Class values, with proper CSV escaping. Preserve
   every row, grade, standing, attendance status and existing report column.
3. **Closeout:** rehearse the affected desktop/phone screens, verify report
   exports, run focused checks followed by required fast and PostgreSQL/live
   gates on the changed tree, and record exact results. Obtain approval before
   creating any additional demonstration scenario or changing provider settings.

No new product feature, visual redesign, dependency, schema migration or spec
amendment is proposed. The `active` standing label on ungraded Dean report rows
and Student Dashboard differs from Student Retention's pending wording; record
this for a separately agreed authoritative standing contract instead of changing
its semantics as incidental styling.

See [manual-demo-readiness.md](manual-demo-readiness.md) for the complete human
acceptance checklist. Its unperformed items remain Not Run.
