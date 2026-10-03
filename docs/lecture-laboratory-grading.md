# Lecture and Laboratory grading

Lecture/Laboratory grading is required for new or updated period configurations
in the Grade Weights Editor for a current-year offering. The configuration applies to every section of that
Faculty member's course, semester and school year.

The editor validates three layers:

1. Each Lecture or Laboratory category list totals 100%, separately for Midterm
   and Finals. All category weights are positive.
2. Lecture and Laboratory contributions total 100%. This ratio applies to both
   periods and is independent of course units.
3. Midterm and Finals contributions total 100%, as in existing period grading.

For example, a 60% Lecture / 40% Laboratory ratio combines Midterm component
results of 80% and 90% into 84%. Finals results of 90% and 80% combine into 86%.
With 30% Midterm / 70% Finals contributions, the overall percentage is 85.4%.
The server combines unrounded values and rounds the resulting grade for display
and storage. GWA remains a course result.

## Configure an offering

Open **Grade Computation → Grade Weights Editor**, check the target course, and
edit the separate Lecture and Laboratory lists. Set the component contributions and
the Midterm/Finals contributions. For each period, select the Lecture or Laboratory
category tab and edit its categories until that list totals 100%.

When converting an existing configuration, assign every existing category to a
component. Its identifier and linked assessments remain attached. A category
name such as Quiz may appear in both components. Names must be unique inside
one component and period. If an older unlinked assessment could match more than
one category, choose its exact target before saving.

An unconfigured offering automatically starts with editable, unsaved syllabus
defaults: Lecture 60% / Laboratory 40% and Midterm 30% / Finals 70%. Both periods
start with Lecture categories Term Exam 50%, Quiz 20%, Outputs 20%, Participation
10%; and Laboratory categories Practical Exam 50%, Laboratory Exercises 30%,
Quiz 10%, Recitation 10%. These become authoritative only after Faculty saves
them. Existing saved configurations are preserved.

Saving weights leaves recorded grades unchanged. Use the existing authorized
recomputation action when ready to apply the new weights to scores. Faculty and
Student grade details distinguish Lecture, Laboratory, Midterm, Finals and overall
results. A missing weighted result keeps the dependent grade incomplete; an
entered zero remains a real score.

Open **Summaries & Export** to see the four component results (Midterm Lecture,
Midterm Laboratory, Finals Lecture and Finals Laboratory), alongside the two
period grades and overall grade. Its CSV and print views include the component
columns; Faculty Reports also uses the server-provided breakdown. An older saved
result without component detail is shown as unavailable until recomputation,
and a result saved under an earlier configuration remains identified as prior.
Student My Classes displays the saved component breakdown, including older grouped
results retained after a conversion to combined categories made before the
required-split amendment. New conversion back to combined lists is unavailable.

## Attendance and existing configurations

Attendance continues using the course's existing records and inclusive period
date ranges. At most one category in a period may use the Attendance source,
across both components. Participation and Recitation use assessment scores unless
Faculty explicitly chooses Attendance. Assessment-linked transmutation remains
separate and follows the existing rules.

Existing combined configurations keep their saved calculations and grades until
explicitly converted. Editing their period weights requires forward conversion:
assign each retained category to Lecture or Laboratory and set valid totals
before saving. The system does not guess component mappings, overwrite categories
with defaults or rescale saved weights. Conversion back to combined period lists
is unavailable. Scores, history and recorded grades remain preserved until explicit
recomputation.

Past-school-year offerings remain view-only. Informational risk uses the saved
weights and existing risk rules; retention thresholds and manual overrides are
unchanged. Import workflows are outside this change.

The authoritative rules are [GRD-003 in spec.md](../spec.md) and
[the approved amendment record](spec-amendments-2026-10-04.md).
