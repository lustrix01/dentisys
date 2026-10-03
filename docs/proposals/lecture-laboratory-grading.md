# Lecture/laboratory grading proposal

Status: Approved by the Owner on 2026-10-04: "I approve of that amendment".
The exact amendment below has been recorded in spec.md as GRD-003 and the
GRD-002 category-total clarification. Implementation and validation are in progress.

## SPEC CHANGE REQUIRED

Affected rules: GRD-002, GRD-001 and SYS-002 preservation requirements.

Current rule: GRD-002 specifies one category list per period, with each list
totaling 100%, and combines Midterm and Finals using editable term contributions.

Requested behavior: Separate Lecture and Laboratory category lists, computed
component percentages, and a weighted combination into each period result.

Conflict: Each component list must total 100%, so the grouped period contains
two independently normalized lists rather than one. Existing configuration,
assessment mapping, calculation, ledger and risk paths need an explicit mode.

## Exact proposed spec.md amendment

Replace the GRD-002 paragraph beginning “Faculty may customize each period's
categories and weights” with:

> Faculty may customize each period's categories and weights. In existing
> ungrouped period configurations, each period's category list must total exactly
> 100%, using the existing supported decimal precision. In explicit
> Lecture/Laboratory grouped configurations, the component lists and contribution
> weights follow GRD-003. The Midterm and Finals contributions must total exactly
> 100% in either mode.

Insert the following section after GRD-002:

> ## GRD-003 - Separate Lecture and Laboratory grading
>
> **Status: APPROVED**
>
> Faculty may explicitly select Lecture/Laboratory grouped grading for an
> authorized current-year offering. The configuration remains shared by its
> sections and scoped to the Faculty member, course, semester and school year.
>
> Grouped grading has Lecture and Laboratory components. Faculty sets positive
> contribution percentages totaling exactly 100%. One offering-level component
> ratio applies to both Midterm and Finals. Course units do not determine this
> ratio. Existing Midterm/Final contributions remain separately editable.
>
> Each component has its own Faculty-editable category list for each period.
> Each component-period list must total exactly 100%, and each category weight
> must be positive. Category names may repeat across components; names must be
> unique within a component and period. Assessments reference a valid category
> and resolve unambiguously to its component and period.
>
> A component percentage uses the existing category assessment and transmutation
> calculations within that component. Each period percentage is its Lecture
> percentage multiplied by the Lecture contribution plus its Laboratory
> percentage multiplied by the Laboratory contribution. Overall percentage is
> the resulting Midterm and Finals percentages combined using the saved term
> contributions. Grouped calculations use unrounded intermediate values for
> weighted combinations and the existing precision for displayed/persisted
> results. Ungrouped calculation behavior remains unchanged.
>
> Missing results in a positively weighted category, component or period keep
> the dependent grade incomplete. Missing grades must never become zero or cause
> renormalization. Existing GRD-001 transmutation, attendance completeness,
> retention thresholds and manual override rules remain unchanged. Informational
> risk uses the saved grouped weights and existing risk rules; it must not
> redefine retention policy.
>
> Authoritative Attendance retains its existing course-wide records and inclusive
> period date ranges. At most one authoritative Attendance-source category is
> permitted across both components in a period, preventing double-counting.
> Participation and Recitation are assessment-source categories unless Faculty
> explicitly selects the supported Attendance source. Separate Lecture/Laboratory
> attendance calculations are outside this amendment.
>
> Existing overall and ungrouped period configurations remain unchanged. Grouped
> grading requires an explicit validated conversion: preserve assessment and
> category identifiers, scores, history and saved grade results, and require
> Faculty to resolve ambiguous component mappings. Saving or converting a
> configuration must not automatically rewrite grades; explicit authorized
> recomputation applies the configuration. Historical offerings remain view-only.
>
> Grade Weights, assessment selection, server computations, Faculty/Student
> ledgers and applicable grade exports must identify Lecture and Laboratory
> component results separately from Midterm, Finals and overall results. GWA
> conversion remains at the existing course-result level; no new independent
> Lecture/Laboratory transcript GWA is introduced.
>
> The supplied syllabus is an optional editable example, not a university-wide
> default: Lecture 60%, Laboratory 40%; Lecture categories Term Exam 50%, Quiz
> 20%, Outputs 20%, Participation 10%; Laboratory categories Practical Exam 50%,
> Laboratory Exercises 30%, Quiz 10%, Recitation 10%; Midterm 30%, Finals 70%.
> Apply the example only through an explicit Faculty action. Existing unsaved
> defaults and saved configurations must not be silently replaced.

## Proposed API contract and examples

Preserve existing routes and `schemaMode: 'periods'`. Add optional
`componentMode: 'combined' | 'lecture_laboratory'` and
`componentWeights: { lecture: number, laboratory: number }`. Existing payloads
retain combined behavior. In grouped mode, Midterm/Final category entries include
`component: 'Lecture' | 'Laboratory'`; existing category IDs remain authoritative.

Computed period results add component breakdowns with status, percentage,
categories and incomplete reasons. Existing period/overall fields retain their
meaning. Saved configurations, version checks, authorization and audit records
continue through existing handlers.

Implementation mapping contract: conversion of an existing configuration uses
`convertToLectureLaboratory: true`. Reuse `assessmentAssignments`, extending its
entries to `{ assessmentId, categoryId?, categoryName?, gradingPeriod?, component? }`.
A known category ID is preferred; new categories resolve by name, period and
component. Existing combined requests retain their established name matching.
The mapping-required error returns top-level `assessments` for Faculty to resolve.
Computed grouped periods use `components: { lecture, laboratory }`; each entry
contains `component`, `status`, `percentage`, `categories` and `incomplete`.

Approved follow-up (2026-10-04): explicit conversion back uses
`convertToCombined: true`. Faculty sets the single list in each period to 100%
with unique names, preserving identifiers and saved results. No automatic
category merging or weight rescaling occurs. The durable rule is recorded in
[the amendment log](../spec-amendments-2026-10-04.md) and GRD-003.

Example: Midterm Lecture 80 and Laboratory 90 at 60/40 produces 84; Finals
Lecture 90 and Laboratory 80 produces 86. With 30/70 period contributions,
overall is 85.4. Missing Laboratory results make the affected component and
period incomplete; a positively weighted incomplete period blocks overall.

Proposed errors (existing HTTP validation/version semantics retained):

- `GRADING_COMPONENT_WEIGHTS_INVALID`: missing/nonpositive component weight or
  component contributions not totaling 100%.
- `GRADING_COMPONENT_CATEGORY_INVALID`: missing/invalid component, category
  totals not 100% for that component-period, or duplicate name within it.
- `GRADING_COMPONENT_MAPPING_REQUIRED`: existing assessments cannot be mapped
  unambiguously during explicit conversion; save nothing until resolved.
- Existing duplicate Attendance-source rejection applies across both components.

## Implementation and verification after approval

Use additive ordered migrations and normalized component/category relationships;
preserve existing identifiers and database volumes. Extend existing grading
handlers and editor rather than introducing a parallel grading subsystem.
Wire grouped calculations into grade computation, retention/risk, Student reads
and applicable ledgers/exports. No import implementation is included.

Verify weighted arithmetic, unequal component ratios, category-name reuse,
missing scores, real zero scores, transmutation, attendance completeness,
conversion/version conflicts, authorization, historical restrictions, saved
grade preservation and subsequent explicit recomputation. Compare existing
ungrouped payloads/calculations with their baseline. Run focused checks, required
fast and fresh disposable PostgreSQL/live gates, and Auto Review.

Owner approval received on 2026-10-04; implementation follows the approved contract above.
