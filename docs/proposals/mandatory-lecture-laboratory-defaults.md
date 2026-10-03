# Mandatory Lecture/Laboratory period grading and defaults

Status: approved by the Owner on 2026-10-04: "Approved".
The exact amendment below is applied to spec.md; implementation and validation
are complete. Final evidence is recorded in [the handoff](../HANDOFF_2026-10-04.md).

The Owner requested removal of the combined/split period grading structure
selector and use of the supplied syllabus as the default split configuration.
This supersedes the earlier approval allowing conversion back to combined lists.

## Exact proposed specification amendment

In GRD-002, replace the two paragraphs defining the unsaved preset and its
category lists with:

> New, unconfigured offerings present an editable, unsaved Lecture/Laboratory
> period grading preset defined in GRD-003. Preset values become authoritative
> only after a successful server save; Faculty may customize all weights and
> categories within the required separate Lecture/Laboratory structure.

Replace the GRD-002 paragraph beginning "Faculty may customize each period's"
with:

> Faculty may customize each component's categories and weights for each period.
> All new or updated period grading configurations must use the separate
> Lecture/Laboratory structure defined in GRD-003. Each component-period category
> list, the Lecture/Laboratory contributions, and the Midterm/Finals contributions
> must each total exactly 100%, using the existing supported decimal precision.

Replace the GRD-002 sentence beginning "In period configurations, the preset
Attendance category" with:

> In period configurations, any authoritative Attendance-source category uses
> authoritative attendance data and replaces the additional independent attendance
> contribution, preventing double-counting. Assessment-linked transmutation remains
> governed separately by GRD-001. The default categories in GRD-003 use assessment
> scores; they do not add an authoritative Attendance-source category automatically.

In GRD-003, replace the opening paragraph beginning "Faculty may explicitly
select" with:

> Separate Lecture/Laboratory grading is mandatory for all new or updated period
> grading configurations on authorized current-year offerings. Grade Weights must
> not offer a combined/split structure selector or conversion back to combined
> period lists. The configuration remains shared by its sections and scoped to the
> Faculty member, course, semester and school year.

Replace the GRD-003 paragraphs beginning "Owner decision (2026-10-04)" and
"Existing overall and ungrouped period configurations" with:

> Existing overall and ungrouped period configurations, assessment and category
> identifiers, raw scores, history and saved grades remain preserved. Existing
> configurations continue their saved calculation until explicitly converted;
> historical offerings remain view-only. Updating an existing ungrouped period
> configuration requires explicit validated conversion to Lecture/Laboratory
> grading. Faculty must assign existing categories and resolve ambiguous assessment
> mappings before conversion can be saved; the system must not guess mappings,
> replace existing categories with defaults, or rescale saved weights automatically.
> Saving or converting a configuration must not rewrite recorded grades; explicit
> authorized recomputation applies the saved configuration. Conversion from grouped
> grading back to combined period lists is no longer supported.

Replace the final GRD-003 paragraph beginning "The supplied syllabus" with:

> The supplied syllabus defines the editable, unsaved default for new,
> unconfigured offerings: Lecture 60%, Laboratory 40%; Lecture categories Term Exam
> 50%, Quiz 20%, Outputs 20%, Participation 10%; Laboratory categories Practical Exam
> 50%, Laboratory Exercises 30%, Quiz 10%, Recitation 10%; Midterm 30%, Finals 70%.
> The same starting component category lists apply to both Midterm and Finals.
> Faculty may edit these values while preserving the separate component structure
> and all three 100% totals. Defaults are shown automatically without an Apply
> syllabus example action. Existing saved configurations and recorded grades must
> never be replaced automatically by default values.

All other specification rules remain unchanged.

## Implementation impact

- Remove the period structure selector and optional example action; show the
  separate Lecture and Laboratory editors directly for unsaved period drafts.
- Return and display these defaults consistently from the server and frontend.
- Enforce separate structure for period configuration saves on the server;
  reject conversion back to combined lists while retaining legacy reads and
  validated forward conversion with explicit category/assessment mapping.
- Preserve existing saved data and historical views. Do not auto-convert demo
  offerings, rewrite grades, reseed data or delete persisted volumes.
- Update focused UI, API and calculation contract tests and complete the required
  fast and PostgreSQL/live gates before reporting implementation complete.
