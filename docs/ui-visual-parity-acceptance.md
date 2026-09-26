# UI visual parity acceptance

**Frozen source:** `owhie_backend@e9ead0b3f8a4b0c49904a2274d3e80264203098b`

**Capture date:** 2026-09-25

## Current handoff — 2026-09-26

The accepted stable visual evidence below is unchanged and was not rerun. A
focused follow-up was captured for the two password-recovery pages after their
Gemini-owned presentation pass. The normal
development database is now migrated through 029. The historical Docker
interruption and pre-fix 4/8 live result belong to an earlier tree; the kept
disposable `dentisys-final-0926b` run passed migrations 001-025 and the 8/8 live
browser gate, but is not current 026-029 evidence. This document covers visual
evidence only; real Google and physical-camera acceptance remain separate
manual checks.

## Stable route coverage

The final stable capture used two isolated Docker stacks: the frozen source
stack on `16173/19080` and the current-tree destination stack on
`16174/19081`. Both used the unchanged `database/seeds/development-demo.sql`
fixture. The normal development database and volume were not used or modified
for this comparison.

The matrix contains 39 active route states at both `1440x900` and `390x844`,
for both source and destination: 156 PNGs total. Every capture completed with
zero browser/page/HTTP errors and every final URL matched its requested route.
The generated coverage manifest is:

```text
C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\matched-source-destination-stable\coverage-compact.json
```

## Password-recovery follow-up

The current destination captures for Forgot Password and Reset Password at
both required viewports are under:

```text
C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\matched-source-destination-stable\password-recovery-follow-up
```

Inspection against the frozen-source captures confirms that the email field,
institutional suffix, password/confirmation fields, reset actions, and return
links remain present and usable. The destination deliberately uses Gemini's
approved presentation-only two-panel treatment rather than the source's
single-column styling. This is a destination presentation deviation, not a
missing recovery capability; password recovery remains required by
[`AUTH-005`](../spec.md#auth-005-password-authentication), and the live API,
Mailpit delivery, expiry, replay, policy, and token-consumption checks pass.

The route groups explicitly covered are:

- Public: login, landing, forgot/reset password, and all three activation routes.
- Admin: dashboard, faculty invitations, reports, audit trail, profile, settings.
- Faculty: dashboard, retention, classes, rosters, students, grades, attendance,
  reports, email management, audit trail, profile, settings.
- Secretary: dashboard, start session, attendance, override, audit trail, profile,
  settings.
- Student: dashboard, attendance, attendance logs, face registration, classes,
  retention, profile.

## Significant dialog coverage

Read-only/open-state captures are in:

```text
C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\dialogs
```

The 24-state dialog sweep covers both viewports and both sides. Sixteen safe
open states were captured and inspected: Create Class, Assessments Manager,
Grade Weights Editor, Attendance Override (source), and invitation Edit,
Create Class, Assessments Manager, and Grade Weights Editor (destination).
The initial remaining states were classified rather than treated as missing
evidence: the frozen source has no invitation Edit, while the Secretary review
/ override surface exists on both sides. The source and destination captures
show the page-level review controls; the destination attendance actions
required a real persisted record and correction inputs for the confirmation
state. A later disposable live fixture enabled those destination states and
produced four additional captures at both viewports:

```text
C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\matched-source-destination-stable\dialog-follow-up\destination-faculty-attendance-correction-1440x900.png
C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\matched-source-destination-stable\dialog-follow-up\destination-faculty-attendance-correction-390x844.png
C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\matched-source-destination-stable\dialog-follow-up\destination-secretary-attendance-confirmation-1440x900.png
C:\Users\decha\.codex\visualizations\2026\09\25\01a0d7d2-8945-7cc2-8d71-1d6545638ae9\matched-source-destination-stable\dialog-follow-up\destination-secretary-attendance-confirmation-390x844.png
```

The Faculty capture covers `/attendance` with a persisted Present record and
the Correction modal opened for Present → Late. The Secretary capture covers
`/secretary/override` with the same fixture selected, a changed status, and a
valid reason through the confirmation modal. No send, save, start, revoke,
import, or camera action was submitted. Invitation Edit is a destination-only
lifecycle enhancement absent from the frozen source. Secretary review /
override is a shared source-and-destination surface, not source-only
functionality; the destination confirmation modal is the live follow-up state
captured here, and no source confirmation-modal capture is claimed.

The visible modal pairs were inspected directly. The destination Create Class
dialog uses a selected course offering, current school year, semester, year
level, and separate lecture/laboratory rooms. The frozen source dialog uses
free-form course code/title, section, venue, days, and time. This is an
approved destination deviation required by `spec.md`'s current-school-year,
course/offering, and distinct-room contract; it is not unreviewed CSS drift.
The destination invitation Edit dialog is a current lifecycle capability absent
from the frozen source and is recorded as a destination enhancement, not
silently counted as source parity.

## Pair inspection and approved deviations

The inspected Admin dashboard, Faculty dashboard/classes/grades, Admin reports,
Secretary override, Student dashboard, login, and mobile Student captures show
the same navigation, typography, card hierarchy, spacing, controls, and
responsive structure. No additional presentational code change was justified
by the stable pair review.

The following differences are deliberate semantic/data differences:

1. The destination uses the authoritative current API and canonical projections;
   the frozen Student source displays a development-only attendance/biometric
   prototype banner and mock metric cards. The destination Student dashboard
   displays enrolled classes, authoritative GWA, attendance, clinical hours,
   and retention-alert cards instead. This follows [`spec.md`'s
   server-authoritative academic decision rule](../spec.md); real
   camera/provider acceptance remains a separate manual gate.
2. The frozen source and destination use the same SQL fixture, but the source
   and current controller contracts expose different assigned-class/report
   records and source-only prototype announcements. These are content/state
   differences, not a mismatch in responsive layout; destination data was not
   replaced with source mock data. The destination retains the current API and
   historical-data rules in [`spec.md`'s UI-005 and academic sections](../spec.md).
3. Google provider display is configuration-dependent. Offline comparison uses
   the disabled-provider state; real Google acceptance remains separate under
   [`spec.md`'s AUTH-002/AUTH-003 Google rules](../spec.md).
4. Secretary/source browser-session simulation text and destination
   authoritative session/attendance messaging differ because the destination
   preserves the approved server-backed workflow required by [`spec.md`'s
   UI-005 and attendance-session rules](../spec.md). No camera or provider
   state was claimed from this visual run.
5. The destination Create Class dialog uses a selected course offering,
   current school year, semester, year level, and separate lecture/laboratory
   rooms, while the frozen source uses free-form course code/title, section,
   venue, days, and time. This is the approved destination deviation required
   by [`spec.md`'s current-school-year, course/offering, and distinct-room
   contract](../spec.md); it is not unreviewed CSS drift.
6. The destination invitation Edit dialog is a current lifecycle capability
   absent from the frozen source. It is recorded as a destination enhancement,
   not silently counted as source parity; invitation/activation behavior stays
   governed by [`spec.md`'s REG-002/REG-006 rules](../spec.md).

This document records visual acceptance for the executable UI surface with the
above approved deviations. It does not claim acceptance of real Google,
physical-camera, or other external-provider behavior.
