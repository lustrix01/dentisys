# Grade Weights Editor: Gemini Frontend Handoff

Status: frontend plan only. Configuration storage is implemented and validated on `codex/period-grading-config`. Period computation is not implemented: attendance attribution awaits the Owner's decision. Do not present this stage as a complete grading feature or merge it into `lighthal5`.

The implementation must be made on an isolated frontend branch or worktree. Do not merge it into the active branch as part of the UI handoff. No frontend implementation is included in this document.

Backend closeout validation (2026-09-23): `scripts/check.ps1` passed, including 116 mocked browser tests; `scripts/check-postgres.ps1` passed, including the PostgreSQL integration suite and all eight live browser tests. The live grading test now registers response listeners before navigation/reload; its assertions are unchanged. Luna XHigh review identified two valid issues (categoryless legacy conversion and concurrent assessment membership changes), both fixed with regression coverage. Its subsequent integer/bigint foreign-key objection was rejected after verifying the actual PostgreSQL constraints and successful migrations. Review used `autoreview --mode local --engine codex --model gpt-5.6-luna --thinking xhigh --no-web-search`.

## Approved behavior and boundaries

`spec.md` is authoritative. The relevant approved decisions are:

- GRD-001 keeps raw assessment points authoritative, preserves the approved transmutation formula and attendance states, and keeps unresolved attendance incomplete. Assessment-linked transmutation remains separate from ordinary attendance grading (`spec.md:396-411`).
- GRD-002 keeps configurations scoped to Faculty member, course, semester, and school year. A new unconfigured offering gets an editable unsaved starting preset: 40% Midterm and 60% Finals. Each period is independently customizable and totals exactly 100%; the two period contributions also total exactly 100% (`spec.md:415-425`).
- Preset values become authoritative only after a successful server save. Existing saved configurations must never be replaced automatically (`spec.md:427-427`).
- Assessments must reference a valid category for their offering and grading period, and existing assessment identifiers, category references, raw scores, and assessment maximum scores must survive (`spec.md:429-429`).
- Existing single-list configurations keep their current calculation until an explicit validated conversion. Conversion must not silently change recorded grades (`spec.md:431-431`). Saving a configuration does not rewrite persisted results; an authorized recomputation applies the saved configuration (`spec.md:435-435`).
- In period mode, the Attendance category uses authoritative attendance data and replaces the additional independent attendance contribution, so attendance is not double-counted (`spec.md:437-437`). The assignment of attendance records to Midterm and Finals is still awaiting an Owner decision.
- Grade displays and exports must distinguish authoritative Midterm, Finals, and overall results. An unavailable period result must never be replaced with the overall grade (`spec.md:439-439`).

There is no approval for Admin-wide grading presets. There is also no approval for persisting a category maximum score in the grading configuration. Keep Faculty configuration offering-scoped and keep assessment `maxScore` at the assessment level. Do not add either concept to the frontend API payload while the backend contract is pending.

## Exact source preset to reproduce

The source is `owhie_backend` at commit `bd5ab789cc537f1503fc78357ad5937e7926651a`, in `frontend/src/pages/faculty/GradeComputation.tsx`.

| Preset area | Category | Weight | Source default maximum |
| --- | --- | ---: | ---: |
| Midterm | Quiz | 25% | 50 |
| Midterm | Activity | 25% | 50 |
| Midterm | Midterm Exam | 40% | 100 |
| Midterm | Attendance | 10% | 100 |
| Finals | Quiz | 20% | 50 |
| Finals | Activity | 20% | 50 |
| Finals | Laboratory | 20% | 100 |
| Finals | Final Exam | 30% | 100 |
| Finals | Attendance | 10% | 100 |

The source term ratio is Midterm 40% / Final 60% (`GradeComputation.tsx:605-611`), and the source opens on the Midterm editor tab (`:613`). The rows above are the exact source defaults (`:622-647`). Source UI also used `New Category`, weight `0`, and maximum `50` for an added row (`:767-773`).

The maximum values in this table are source assessment defaults for planning and verification. Because category-maximum persistence is not approved, the final UI must either show them as read-only context or omit them from the persisted grading editor. A changed category weight or name must never rewrite existing assessment maximums. New assessment behavior must continue to use the assessment-level maximum supplied by the assessment form and server contract.

## Source UI to carry over

The source editor provides the intended interaction model:

1. A target course context (`:1650-1680`).
2. A term-ratio card with Midterm and Final number inputs. Editing one side automatically complements the other to 100 (`:1683-1730`).
3. Separate Midterm and Final period tabs with live totals (`:1732-1767`).
4. Editable category name and weight rows with add/delete controls (`:1770-1834`).
5. One save action and a validation strip showing the term split and each period total (`:1837-1854`).

Adapt that visual hierarchy to the current lighthal5 offering selector. The selector must remain tied to course, semester, school year, and the authorized Faculty assignment; do not restore the source's hard-coded subject list or course-name mapping.

## Backend contract gate

### Implemented configuration contract

Use `GET /api/faculty/grading-config` with `courseId`, `semester`, and `schoolYear` query parameters. An unconfigured offering returns `configuration: null` and `defaults` containing `schemaMode: "periods"`, `termRatio: { midterm: 40, final: 60 }`, `midtermCategories`, and `finalCategories`. Defaults have no saved IDs or version and contain no category maximum scores.

Use `PUT /api/faculty/grading-config` with the same offering identifiers. For period mode, send `schemaMode: "periods"`, the latest `version` (omit or use zero for creation), `termRatio`, `midtermCategories`, and `finalCategories`. Category inputs contain optional existing `id`, `name`, `weight`, and `sortOrder`; do not submit generated persistent identifiers. Both lists must independently total 100%. Weights and ratio values accept the existing four-decimal precision.

Converting an existing overall configuration also requires the explicit boolean `convertFromOverall: true`. Preserve existing category IDs: one legacy ID may appear in both period lists with independently edited names, weights, and order. Use a period-plus-ID key for frontend rows rather than assuming the ID uniquely identifies one displayed row across both tabs.

Saved configurations return `schemaMode`, `version`, offering context, and `categories`. In period mode, they additionally return `termRatio`, `midtermCategories`, and `finalCategories`. Category snapshots contain `id`, `name`, `weight`, `sortOrder`, `gradingPeriod` (`Midterm` or `Final`), and period-specific `inUse`. Render the period lists rather than treating the combined `categories` list as a single 100% configuration. The legacy `categories` save payload remains supported for overall mode.

Handle structured errors without discarding the draft:

- `409 GRADING_CONFIGURATION_VERSION_CONFLICT`: reload confirmation required.
- `409 GRADING_PERIOD_CONVERSION_REQUIRED`: explicit conversion consent missing.
- `409 GRADING_SCHEMA_MODE_CONFLICT`: period-to-overall conversion is not supported by this stage.
- `409 GRADING_CATEGORY_IN_USE`: referenced category or period membership cannot be removed.
- `422 GRADING_CATEGORY_PERIOD_MAPPING_INVALID`: incompatible category-period mapping.
- `422 GRADING_CATEGORY_PERIOD_MAPPING_REQUIRED`: conversion would leave existing assessments without matching period categories; use the returned `assessmentReferences` to identify the missing mappings.
- `422 GRADING_PERIOD_COMPUTATION_PENDING`: recomputation of period configurations is unavailable in this stage and leaves persisted grades untouched.

Do not advertise period calculations, conversion readiness for production, or Midterm/Final result fields until the next backend phase is complete. Configuration UX may be built and tested on the isolated branch while that dependency remains explicit. Attendance input fields and period-result response fields are still pending; do not invent them.

The existing frontend client still represents a flat offering-scoped category list in `frontend/src/services/apiClient.ts`. Extend its types to the implemented configuration contract above. Retain positive category weights, unique names/order, exact 100% totals, stable identifiers, `inUse` state, version conflicts, referenced-category protection, and first-save legacy assessment mapping errors.

Use the implemented configuration fields above, not the source branch's subject-code API. Wait for the next backend contract before implementing attendance attribution or successful period recomputation. Do not emulate missing server behavior in local state.

Until the contract is final, keep conversion, recomputation, and period-aware attendance controls behind a clearly bounded integration point. A disabled or unavailable state is safer than a client-side guess.

## Draft and saved preset behavior

Treat the preset as a draft initializer, never as a hidden save.

- When the server says an authorized offering is unconfigured, initialize a draft with the exact 40/60 ratio and category rows above. Show a clear “Suggested starting preset — unsaved” state. Do not create a server configuration until Faculty selects Save.
- When the server returns an existing configuration, hydrate the draft exactly from that response. Never reapply the preset because a list is empty, a period is incomplete, or a browser cache contains older values.
- Keep a saved snapshot separate from the editable draft. The offering selector and Reload action must warn before discarding dirty changes. Switching offerings must clear all period state before loading the new offering so one offering's preset cannot leak into another.
- On successful save, replace the draft and saved snapshot with the server's canonical response and version. On validation, network, conflict, mapping, or in-use failure, preserve the draft and its dirty state.
- Do not use localStorage as an academic configuration authority. A browser refresh must read the server configuration or show an explicit load error; it must not silently restore a stale preset.
- If a future approved contract provides a “Restore suggested defaults” control, it must reset the draft only, require confirmation when dirty, and never save automatically. “Copy Midterm to Finals” is similarly optional and draft-only.

## Explicit legacy conversion and recomputation UX

Opening the editor must not convert a saved single-list configuration. Existing single-list behavior continues until Faculty explicitly starts a validated conversion.

The conversion flow should be a reviewable, server-backed operation:

1. Show that the offering is in legacy single-list mode and explain that conversion changes the active grading model only after confirmation.
2. Present the proposed period ratio and category mapping for review, using persisted category identifiers from the backend. Surface any missing or ambiguous mappings reported by server validation. Do not require or invent a separate preview endpoint.
3. Require an explicit confirmation. Do not silently rename, delete, or reassign assessment categories in the browser.
4. Preserve assessment identifiers, stable category references where the server permits them, raw scores, and assessment maximums. Surface the server's mapping or conflict error without clearing the draft.
5. After a successful conversion, reload the canonical period configuration and show its saved version. Do not claim an audit result beyond what the server actually returns.

Saving the configuration must show a “saved configuration; persisted results unchanged” state. Applying it requires an explicit authorized recomputation action supplied by the backend contract. The recomputation flow should show a confirmation and then server-returned counts/statuses for applied, incomplete, or rejected results. It must preserve raw scores and GRD-001 transmutation behavior, and it must never fabricate grades from client-local data. A failed recomputation leaves the saved configuration visible and clearly reports that prior results remain in place.

## Period editor controls

Use the current lighthal5 editor safeguards while adopting the source layout:

- Keep offering scope, Reload Latest, version display, dirty-state discard confirmation, server-response hydration, stable category IDs, and `inUse` deletion protection.
- Keep exact 100% validation for each period and the period contribution ratio. Reuse the current decimal precision rules rather than the source's integer-only checks.
- Validate blank names, case-insensitive duplicate names within the period, invalid/zero/out-of-range weights, duplicate ordering, and any backend-approved cross-period constraints before enabling Save.
- Keep category order controls and send the server-approved order on save. Do not use array position as a durable identifier.
- Do not persist category maximums. Existing assessments retain their own maximum scores; score-entry validation continues to use each assessment maximum.
- Use the current error patterns for version conflict, category assignment required, category in use, unauthorized offering, and load failure. A failed save must not show success or replace the draft.

The Attendance row is a period category in period mode. It must not be accompanied by an extra independent attendance contribution. The UI should explain that attendance is authoritative and separate assessment-linked transmutation remains governed by GRD-001.

Attendance attribution is pending an Owner decision. The frontend must not assign records to Midterm or Finals by guessing from browser dates, offering date ranges, semester percentages, or assessment dates. Until the approved rule and response status exist, display attendance-dependent period results as pending/incomplete and direct the user to the backend result rather than showing zero.

## Assessment manager and score entry

The existing assessment manager already displays category, grading period, maximum score, and actions in `frontend/src/pages/faculty/GradeComputation.tsx:1843-2010`. Preserve that workflow and connect it to the period configuration after the backend contract is available.

- Keep the assessment period selector. Display “Midterm” and “Finals” in the UI while mapping to the backend's approved enum through the typed adapter; do not invent a new enum before the contract is final.
- When an offering has a valid period configuration, filter category choices by the assessment's selected period and require a stable category reference. An assessment must never be saved against a category from the other period.
- When editing an existing assessment, preserve its category reference, raw score, and assessment maximum. If a period change makes its category invalid, show a blocking reassignment state and require Faculty to choose a valid category.
- New assessment score bounds continue to use the assessment's own `maxScore`. The source maximums may be used as non-authoritative starting hints only if the final contract explicitly supports that behavior; do not persist category maximums or rewrite existing assessments.
- Keep transmutation validation and deterministic attendance-session selection from the current modal. A period category change must not change GRD-001's raw-score or attendance-link rules.
- Keep single-activity and matrix score entry, score range validation, manual save, auto-save, and server recomputation. A client save is not evidence that an authoritative grade was recomputed.

## Honest summaries and CSV export

Period mode must show three distinct values when the backend supplies them: authoritative Midterm result, authoritative Finals result, and authoritative overall result. A missing or pending period must display an explicit unavailable state such as “Pending,” not the overall value.

The current export writes one overall `subj.grade` into `Midterm Grade`, `Final Grade`, and `Overall GWA` (`GradeComputation.tsx:1197-1205`). This must not survive period mode. Update the display and CSV only from server-returned authoritative values. For legacy single-list mode, label the result as legacy/overall according to the approved contract rather than duplicating one value under period headings. Preserve search, sorting, printing, and audit behavior where their data remains valid.

When attendance is unresolved or its period attribution is unavailable, the summary and CSV must preserve that status. They must not convert it to zero, a failing grade, or a copied overall result.

## Out of scope

Do not add Admin-wide preset management, Admin controls for Faculty period schemas, persisted category maximums, client-side period attendance attribution, automatic legacy conversion, automatic recomputation on save, unrelated retention or attendance redesign, or a second local grading authority.

## Browser verification for the implemented UI

After Gemini implements the UI against the approved contract, verify it in the Docker-backed development stack in a real browser at desktop and narrow widths. The verification should use an authorized Faculty with at least one unconfigured offering, one existing legacy offering, and one offering with assessments.

1. Open the Grade Weights Editor for an unconfigured offering. Confirm the exact 40/60 ratio and nine source rows appear as an editable unsaved draft. Change a ratio, category name, weight, and order; confirm each period total and the Save state update.
2. Leave edits dirty and switch offerings or choose Reload Latest. Confirm the discard prompt and confirm that the new offering does not inherit the prior draft.
3. Save, reload, and revisit. Confirm the server values and version return exactly; refresh must not restore a local stale preset. Confirm an existing saved configuration never receives the source defaults automatically.
4. Exercise blank/duplicate names, malformed or zero weights, non-100 period totals, and non-100 term ratio. Confirm no request is accepted and no false success appears.
5. Verify version conflict, in-use category deletion, legacy assessment mapping, unauthorized offering, and load failure states preserve the draft and offer the correct reload/recovery action.
6. Verify the explicit legacy conversion review, confirmation, and server result. Confirm opening the editor and ordinary saves do not convert or recompute by themselves.
7. Verify explicit recomputation applies the saved configuration only through the server, preserves raw scores and assessment maximums, and reports incomplete/pending results without substituting zero or the overall grade.
8. In the assessment modal, switch Midterm/Finals and confirm only valid period categories are selectable. Confirm existing assessment identifiers, category references, raw scores, and maximums survive edits. Confirm score-entry bounds still use assessment maximums.
9. Verify period Attendance does not create a second independent attendance contribution. Until the Owner-approved attribution rule is implemented, confirm attendance-dependent period results remain visibly pending/incomplete rather than guessed.
10. Verify summary tables, print output, and CSV distinguish Midterm, Finals, and overall values, and that unavailable values are explicit. Confirm no single overall value is copied into multiple period columns.

After these checks pass, update the relevant grading section of `docs/manual-demo-readiness.md` with the verified UI path and limitations. Configuration conversion is implemented in the backend; do not claim the conversion UI is verified until its browser checks pass. Period computation remains unavailable until the Owner's attendance attribution decision is implemented and verified.
