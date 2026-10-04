# Approved specification amendment: Lecture/Laboratory grading

Owner approval: 2026-10-04, "I approve of that amendment".

The exact proposal in [lecture-laboratory-grading.md](proposals/lecture-laboratory-grading.md) was approved. GRD-002 now distinguishes ungrouped category totals from grouped component totals, and GRD-003 records the explicitly selected Lecture/Laboratory mode.

## GRD-002 replacement paragraph

Faculty may customize each period's categories and weights. In existing
ungrouped period configurations, each period's category list must total exactly
100%, using the existing supported decimal precision. In explicit
Lecture/Laboratory grouped configurations, the component lists and contribution
weights follow GRD-003. The Midterm and Finals contributions must total exactly
100% in either mode.

## Inserted section

## GRD-003 - Separate Lecture and Laboratory grading

**Status: APPROVED**

Faculty may explicitly select Lecture/Laboratory grouped grading for an
authorized current-year offering. The configuration remains shared by its
sections and scoped to the Faculty member, course, semester and school year.

Grouped grading has Lecture and Laboratory components. Faculty sets positive
contribution percentages totaling exactly 100%. One offering-level component
ratio applies to both Midterm and Finals. Course units do not determine this
ratio. Existing Midterm/Final contributions remain separately editable.

Each component has its own Faculty-editable category list for each period.
Each component-period list must total exactly 100%, and each category weight
must be positive. Category names may repeat across components; names must be
unique within a component and period. Assessments reference a valid category
and resolve unambiguously to its component and period.

A component percentage uses the existing category assessment and transmutation
calculations within that component. Each period percentage is its Lecture
percentage multiplied by the Lecture contribution plus its Laboratory
percentage multiplied by the Laboratory contribution. Overall percentage is
the resulting Midterm and Finals percentages combined using the saved term
contributions. Grouped calculations use unrounded intermediate values for
weighted combinations and the existing precision for displayed/persisted
results. Ungrouped calculation behavior remains unchanged.

Missing results in a positively weighted category, component or period keep
the dependent grade incomplete. Missing grades must never become zero or cause
renormalization. Existing GRD-001 transmutation, attendance completeness,
retention thresholds and manual override rules remain unchanged. Informational
risk uses the saved grouped weights and existing risk rules; it must not
redefine retention policy.

Authoritative Attendance retains its existing course-wide records and inclusive
period date ranges. At most one authoritative Attendance-source category is
permitted across both components in a period, preventing double-counting.
Participation and Recitation are assessment-source categories unless Faculty
explicitly selects the supported Attendance source. Separate Lecture/Laboratory
attendance calculations are outside this amendment.

Existing overall and ungrouped period configurations remain unchanged. Grouped
grading requires an explicit validated conversion: preserve assessment and
category identifiers, scores, history and saved grade results, and require
Faculty to resolve ambiguous component mappings. Saving or converting a
configuration must not automatically rewrite grades; explicit authorized
recomputation applies the configuration. Historical offerings remain view-only.

Grade Weights, assessment selection, server computations, Faculty/Student
ledgers and applicable grade exports must identify Lecture and Laboratory
component results separately from Midterm, Finals and overall results. GWA
conversion remains at the existing course-result level; no new independent
Lecture/Laboratory transcript GWA is introduced.

The supplied syllabus is an optional editable example, not a university-wide
default: Lecture 60%, Laboratory 40%; Lecture categories Term Exam 50%, Quiz
20%, Outputs 20%, Participation 10%; Laboratory categories Practical Exam 50%,
Laboratory Exercises 30%, Quiz 10%, Recitation 10%; Midterm 30%, Finals 70%.
Apply the example only through an explicit Faculty action. Existing unsaved
defaults and saved configurations must not be silently replaced.

## Approved follow-up decision: explicit conversion back

The Owner answered the conversion question on 2026-10-04: "yes they can, but
they have to set it themselves, we will enforce separation of categories on
lecture and laboratory." The question requested approval to record this rule.
The three layers were restated: each component-period category list totals
100%, the Lecture/Laboratory contributions total 100%, and the Midterm/Finals
contributions total 100%.

Inserted in GRD-003:

> Owner decision (2026-10-04): Faculty may explicitly convert a saved grouped
> configuration back to one category list per period. Faculty must set positive
> category weights totaling exactly 100% and unique names within each period;
> the system must not automatically merge categories or rescale their weights.
> Conversion preserves existing category and assessment identifiers, raw scores,
> history and saved grades. Recorded grades change only through explicit
> authorized recomputation. Grouped mode continues enforcing separate Lecture
> and Laboratory category lists and all three weighting layers.

## Approved follow-up: mandatory split structure and syllabus defaults

Owner approval: 2026-10-04, "Approved", in response to the exact
[mandatory split amendment](proposals/mandatory-lecture-laboratory-defaults.md).
This supersedes the earlier optional structure, optional example and
conversion-back decision. The six approved replacements are recorded below.

> New, unconfigured offerings present an editable, unsaved Lecture/Laboratory
> period grading preset defined in GRD-003. Preset values become authoritative
> only after a successful server save; Faculty may customize all weights and
> categories within the required separate Lecture/Laboratory structure.

> Faculty may customize each component's categories and weights for each period.
> All new or updated period grading configurations must use the separate
> Lecture/Laboratory structure defined in GRD-003. Each component-period category
> list, the Lecture/Laboratory contributions, and the Midterm/Finals contributions
> must each total exactly 100%, using the existing supported decimal precision.

> In period configurations, any authoritative Attendance-source category uses
> authoritative attendance data and replaces the additional independent attendance
> contribution, preventing double-counting. Assessment-linked transmutation remains
> governed separately by GRD-001. The default categories in GRD-003 use assessment
> scores; they do not add an authoritative Attendance-source category automatically.

> Separate Lecture/Laboratory grading is mandatory for all new or updated period
> grading configurations on authorized current-year offerings. Grade Weights must
> not offer a combined/split structure selector or conversion back to combined
> period lists. The configuration remains shared by its sections and scoped to the
> Faculty member, course, semester and school year.

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

> The supplied syllabus defines the editable, unsaved default for new,
> unconfigured offerings: Lecture 60%, Laboratory 40%; Lecture categories Term Exam
> 50%, Quiz 20%, Outputs 20%, Participation 10%; Laboratory categories Practical Exam
> 50%, Laboratory Exercises 30%, Quiz 10%, Recitation 10%; Midterm 30%, Finals 70%.
> The same starting component category lists apply to both Midterm and Finals.
> Faculty may edit these values while preserving the separate component structure
> and all three 100% totals. Defaults are shown automatically without an Apply
> syllabus example action. Existing saved configurations and recorded grades must
> never be replaced automatically by default values.
# Provisional Student roster import

The Owner separately approved the exact IMP-001 rule in
[the provisional roster proposal](proposals/provisional-roster-import.md) on
2026-10-04. Added it before section 9B without changing unaffected rules.
The importer remains explicitly provisional: official format not confirmed.
The private sample and its personal records are not repository fixtures.

# Institutional email required for provisional imports

The Owner requested mandatory institutional email and parsing of supplied emails,
then separately approved the exact additional IMP-001 paragraph in
docs/proposals/provisional-roster-import.md on 2026-10-04. Every selected import
row requires a valid email from the server-configured allowed domains. Missing
or invalid email blocks that row until corrected; no email is fabricated and
existing Student emails are not overwritten. Invitations remain separate.
