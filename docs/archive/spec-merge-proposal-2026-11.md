# spec.md merge proposal (2026-11)

Goal: each stacked or contradictory section of `spec.md` reads as ONE current rule plus ONE `History:` line. Nothing changes meaning: the proposed text says what the latest approved decision says. `spec.md` is not edited by this file; every block below is a proposal for Owner approval (AGENTS.md, SPEC-001).

How to read an entry: **Current text** is quoted from `spec.md` exactly (line numbers are those of the file when this proposal was written). **Proposed text** replaces the quoted lines. Where a paragraph only loses its date label, the entry lists exact find/replace pairs instead of repeating the paragraph.

| # | Section | spec.md lines | Kind | Owner question? |
|---|---|---|---|---|
| 1 | AUTH-003 / AUTH-004 (X1) | 161, 163-171 | both | no |
| 2 | REG-006 | 329-333 | stack | no |
| 3 | GRD-002 | 472-476, 484-486, 500-506 | stack | no |
| 4 | GRD-003 (X7, X8, X9) | 532-622 | both | yes (Q1, Q2) |
| 5 | EML-001 | 631-635 | stack | no |
| 6 | RUN-001 (X15) | 696-702 | contradiction | no |
| 7 | BIO-007 (X18) | 848, 856-858 | both | yes (Q3) |
| 8 | BIO-008 (X2, X3) | 878-884 | both | no |
| 9 | ATT-001 | 916, 924, 928-944 | stack | no |
| 10 | ATT-002 | 952-958 | stack | no |
| 11 | ATT-006 | 1004-1016 | stack | no |
| 12 | DEL-001 (X2, X4, X5, X6) | 1030-1041 | both | no |
| 13 | CLS-001 | 1085-1089 | stack | no |
| 14 | IMP-001 | 1108-1123 | both | no |
| 15 | UI-001 (X17) and 9B status | 1134, 1138-1156 | both | yes (Q6) |
| 16 | UI-002 | 1162-1172 | stack | no |
| 17 | UI-003 (X9-X12) | 1180-1230 | both | yes (Q4) |
| 18 | UI-004 (X1) | 1234-1236 | both | no |
| 19 | UI-005 | 1246-1248 | both | yes (Q7) |
| 20 | CLS-002 | 1252-1254 | stack | no |
| 21 | ROOM-001 | 1289-1295 | both | no |
| 22 | Section 11 (X16) | 1317-1330 | contradiction | no |

Checked, no change proposed (single decision, no stack and no contradiction): REG-001 (287), AUTH-005 (187), AUTH-007 (224), SEC-005 (413-427; audit contract is one rule, its inline "(2026-11-03)" is harmless), GRD-001 (439), ATT-003 (974), ATT-004 (986), ATT-007, CLS-003 (1258-1274, X14 confirmed: Dean/Admin screens are previews in code), ACA-002. `spec.md:67-68` names `docs/features.md` and `docs/roadmap.md`; both still exist in `docs/`, so no edit unless the docs pass archives them. Not on the audit list but found while reading: GRD-003 draft-versus-defaults conflict (entry 4), IMP-001 "do not create classes" versus the 2026-10-27 create-from-file rule (entry 14), ATT-006 first paragraph (entry 11), UI-001 "University email" versus casing rule (entry 15), UI-005 Sessions/Roll call versus Assigned Classes/Worksheet (entry 19), ROOM-001 retire rules (entry 21).

Owner questions: Q1 to Q7 (Q5 unused) are listed at the end of the file.

---

## 1. AUTH-003 / AUTH-004 - institutional domain (X1)

**Lines:** 161 (AUTH-003 amendment), 163-171 (AUTH-004). **Kind:** both (AUTH-004 still demands a multi-domain allowlist; line 161 supersedes it).

**Current text**

*Lines 161:*

> Owner-approved amendment (2026-11-09): DentiSys accepts only official `@bicol-u.edu.ph` addresses for account identity, Student records, invitations, sign-in, password recovery and outgoing application email. This supersedes the configurable multi-domain behavior above and the earlier AUTH-004 and UI-004 multi-domain decisions. Existing database records and active enrollments are not rewritten; a non-BU address cannot be used for a new or updated identity, class enrollment, activation, invitation, sign-in, recovery or outgoing email until corrected to an official address.

*Lines 163-171:*

> ## AUTH-004 — Institutional domains
>
> **Status: APPROVED**
>
> DentiSys MUST support a configurable allowlist containing multiple approved institutional domains.
>
> The product MUST NOT assume one permanent institutional domain.
>
> Both password-based and Google-assisted workflows MUST obey the applicable institutional-email policy.

**Proposed text**

Delete line 161 (and its blank line) from AUTH-003; the policy moves to AUTH-004. Replace lines 167-171 with:

````markdown
DentiSys accepts only official `@bicol-u.edu.ph` addresses for account identity, Student records, invitations, sign-in, password recovery and outgoing application email. Existing database records and active enrollments are not rewritten; a non-BU address cannot be used for a new or updated identity, class enrollment, activation, invitation, sign-in, recovery or outgoing email until corrected to an official address.

Both password-based and Google-assisted workflows MUST obey this policy.

History: original multi-domain allowlist; 2026-11-09 single official domain only. Records: docs/archive/.
````

**What is dropped**
- "MUST support a configurable allowlist containing multiple approved institutional domains" and "MUST NOT assume one permanent institutional domain": superseded by line 161 ("This supersedes the configurable multi-domain behavior above and the earlier AUTH-004 and UI-004 multi-domain decisions").
- The sentence "This supersedes ..." itself (now history).

**Consistency edits (optional, meaning-neutral once one domain is the rule):** `spec.md:884` "with an email on the allowed domain list" becomes "with an official `@bicol-u.edu.ph` email" (done inside entry 8); `spec.md:1127` "a valid institutional email from the server-configured allowed domains" becomes "a valid official `@bicol-u.edu.ph` email". Line 667 (table row "Multi-domain institutional allowlist | RETIRED") already agrees.

**Code check:** `backend/app/config.php:167-170` validates `ALLOWED_EMAIL_DOMAINS` but always returns `['bicol-u.edu.ph']`. Agrees. (`scripts/provision-vps.ps1:295` still prompts for `ALLOWED_EMAIL_DOMAINS`; a script clean-up, not a spec question.)

---

## 2. REG-006 - Secretary lifecycle

**Lines:** 329-333. **Kind:** stack (one section, then several, then unenroll).

**Current text**

*Lines 329-333:*

> Owner decision (2026-09-29): A Class Secretary is a Student who has been appointed to one class section. Faculty appoint a Student of their own current-year section. Each section has at most one Secretary, counting active and pending appointments together. The appointment uses the Student's existing DentiSys account. If the Student has no account yet, one invitation both activates the Student account (the Student sets a password) and records the appointment. Faculty may remove the appointment; the account then returns to plain Student access. An appointment ends automatically when its section is archived or its school year ends.
>
> Owner decision (2026-10-18): A Student may be appointed Class Secretary of more than one current-year section, including sections of different Faculty. Each section still has at most one Secretary (active and pending together). Removing or ending one appointment leaves the others; the account returns to plain Student access only when no current appointment remains.
>
> Owner-approved amendment (2026-10-22): Unenrolling a Student from a section also removes them as that section's Class Secretary. Their appointments in other sections are unaffected; if none remain, the Secretary appointment ends as when Faculty remove it.

**Proposed text**

Replace lines 329-333 with:

````markdown
A Class Secretary is a Student appointed to a class section. Faculty appoint a Student of their own current-year section. A Student may be appointed Class Secretary of more than one current-year section, including sections of different Faculty. Each section has at most one Secretary, counting active and pending appointments together. The appointment uses the Student's existing DentiSys account. If the Student has no account yet, one invitation both activates the Student account (the Student sets a password) and records the appointment. Faculty may remove an appointment; removing or ending one appointment leaves the others, and the account returns to plain Student access only when no current appointment remains. An appointment ends automatically when its section is archived or its school year ends. Unenrolling a Student from a section also removes them as that section's Class Secretary; their appointments in other sections are unaffected.

History: 2026-09-29 one section per Secretary; 2026-10-18 several sections allowed; 2026-10-22 unenrolling ends the appointment. Records: docs/archive/.
````

**What is dropped**
- "appointed to one class section" and "the account then returns to plain Student access" (single-section wording): superseded by 2026-10-18 ("more than one current-year section ... only when no current appointment remains").
- The line-333 sentence "if none remain, the Secretary appointment ends as when Faculty remove it": folded into "returns to plain Student access only when no current appointment remains".

**Code check:** not verified (Secretary appointment code is in `backend/controllers/SecretaryController.php` and `FacultyController.php`; not traced).

---

## 3. GRD-002 - Period grading and editable presets

**Lines:** 472-476, 484-486, 500-506 (dated paragraphs). **Kind:** stack (the 2026-11-10 note duplicates GRD-003).

**Current text**

*Lines 472-476:*

> Owner-approved amendment (2026-11-10): A saved combined period configuration
> for a lecture-only course opens as an editable Lecture-only draft with the
> Lecture defaults and a 50% Midterm / 50% Finals split. This draft requires no
> conversion action; defaults take effect only when Faculty saves. This exception
> does not change Lecture/Laboratory course behavior.

*Lines 484-486:*

> Owner decision (2026-09-28): Every class offering must have a saved grade-weight configuration before assessments are created or grades are computed. There is no fallback formula. A class without saved weights is reported as "grade weights required", and its existing results are preserved. Category weights must be greater than 0. The Grade Weights editor is shared by all sections of an offering. On first save, existing unlinked assessments are linked to categories by name, ignoring case and simple plurals ("Quiz" matches "Quizzes"); assessments that cannot be matched are assigned to a category by the Faculty member before the save completes.
>
> Owner decision (2026-10-12): Until a course's grade weights are saved once, the Grade Weights banner reads "BU Dental Medicine Default Grade Weights"; after the first save it reads "BU Dental Medicine Schema Active".

*Lines 500-506:*

> Owner decision (2026-10-28): Students see their own period and final grades, not individual assessment scores.
>
> Owner decision (2026-10-27): Grade sheets, class lists and report exports are Excel (.xlsx) files in the Dean's official layouts; see docs/contracts/official-exports.md.
>
> Owner-approved amendment (2026-10-29): Faculty Reports → Grades & Assessments exports a five-sheet Excel report and matching five-section PDF (Grade Computation-style assessment matrix, grade summary, Midterm Watchlist, attendance register, and interactive analytics graphs with source data). This report bundle is separate from the import-compatible Grade Computation workbook, which keeps its official `LEC`, `LAB`, `TFG`, and `DATA` sheets. See docs/contracts/official-exports.md X28.
>
> Owner decision (2026-10-29): Class lists keep their Excel export and also offer a styled PDF with the same class header details and roster columns. Faculty save the PDF from the browser print dialog.

**Proposed text**

Replace lines 472-476 with:

````markdown
A saved combined period configuration for a lecture-only course opens as an editable Lecture-only draft (GRD-003).
````

Replace line 484 with:

````markdown
Every class offering must have a saved grade-weight configuration before assessments are created or grades are computed. There is no fallback formula. A class without saved weights is reported as "grade weights required", and its existing results are preserved. Category weights must be greater than 0. The Grade Weights editor is shared by all sections of an offering. On first save, existing unlinked assessments are linked to categories by name, ignoring case and simple plurals ("Quiz" matches "Quizzes"); assessments that cannot be matched are assigned to a category by the Faculty member before the save completes.
````

Replace line 486 with:

````markdown
Until a course's grade weights are saved once, the Grade Weights banner reads "BU Dental Medicine Default Grade Weights"; after the first save it reads "BU Dental Medicine Schema Active".
````

Replace lines 500-506 with:

````markdown
Students see their own period and final grades, not individual assessment scores.

Grade sheets, class lists and report exports are Excel (.xlsx) files in the Dean's official layouts; see docs/contracts/official-exports.md. Class lists also offer a styled PDF with the same class header details and roster columns; Faculty save the PDF from the browser print dialog.

Faculty Reports → Grades & Assessments exports a five-sheet Excel report and matching five-section PDF (Grade Computation-style assessment matrix, grade summary, Midterm Watchlist, attendance register, and interactive analytics graphs with source data). This report bundle is separate from the import-compatible Grade Computation workbook, which keeps its official `LEC`, `LAB`, `TFG`, and `DATA` sheets. See docs/contracts/official-exports.md X28.

History: 2026-09-28 saved weights required; 2026-10-12 default banner; 2026-10-27 to 2026-10-29 Excel, student view, reports and class-list PDF; 2026-11-10 lecture-only draft moved to GRD-003. Records: docs/archive/.
````

**What is dropped:** nothing of substance; date labels only. The detail of the 2026-11-10 lecture-only draft (editable, Lecture defaults, 50/50, no conversion action, defaults effective on save, Lecture/Laboratory unchanged) now lives once, in GRD-003 (entry 4).

**Code check:** Lecture-only draft: `frontend/src/pages/faculty/GradeComputation.tsx:2137-2140, 4449-4451`. Banner texts and the rest: not verified.

---

## 4. GRD-003 - Separate Lecture and Laboratory grading (X7, X8, X9)

**Lines:** 532-546, 548-555, 557-573, 581-622. Lines 514-530 and 575-580 stay as they are. **Kind:** both.

**Current text**

*Lines 532-546:*

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

*Lines 548-555:*

> Authoritative Attendance retains its existing course-wide records and inclusive
> period date ranges. At most one authoritative Attendance-source category is
> permitted across both components in a period, preventing double-counting.
> Participation and Recitation are assessment-source categories unless Faculty
> explicitly selects the supported Attendance source. Separate Lecture/Laboratory
> attendance calculations are outside this amendment.
>
> Owner-approved amendment (2026-10-12): The Grade Weights screen no longer offers an Attendance source selector. Participation and Recitation are always assessment-source categories.

*Lines 557-573:*

> Existing overall and ungrouped period configurations, assessment and category
> identifiers, raw scores, history and saved grades remain preserved. Existing
> configurations continue their saved calculation until explicitly converted;
> historical offerings remain view-only. Updating an existing ungrouped period
> configuration for a Lecture/Laboratory course requires explicit validated
> conversion to Lecture/Laboratory grading. Faculty must assign existing
> categories and resolve ambiguous assessment mappings before conversion can be
> saved; the system must not guess mappings, replace existing categories with
> defaults, or rescale saved weights automatically. For a lecture-only course,
> Grade Weights opens an existing combined period configuration as an editable
> Lecture-only draft: it preserves the existing categories, IDs, weights, term
> shares, assessment links and scores. Defaults are used only when no saved
> configuration exists. The saved combined calculation remains active until
> Faculty saves the Lecture-only draft. The save must not rewrite recorded scores;
> current-term grades follow the existing save-triggered recomputation behavior.
> Conversion from grouped grading back to combined period lists is no longer
> supported.

*Lines 581-622:*

> The supplied syllabus defines the editable, unsaved default for new,
> unconfigured offerings: Lecture 60%, Laboratory 40%; Lecture categories Term Exam
> 50%, Quiz 20%, Outputs 20%, Participation 10%; Laboratory categories Practical Exam
> 50%, Laboratory Exercises 30%, Quiz 10%, Recitation 10%; Midterm 50%, Finals 50%.
> The same starting component category lists apply to both Midterm and Finals.
> Faculty may edit these values while preserving the separate component structure
> and all three 100% totals. Defaults are shown automatically without an Apply
> syllabus example action. Existing saved configurations and recorded grades must
> never be replaced automatically by default values.
>
> Owner-approved amendment (2026-10-26): Lecture-only courses. A course with
> Lecture units above 0 and Laboratory units of 0 is lecture-only; course units
> are the only source. Courses without recorded units keep Lecture/Laboratory
> grading, and Grade Weights points the Faculty to Classes & Rosters to set them.
> Laboratory-only courses keep Lecture/Laboratory grading. A lecture-only
> configuration has one Lecture category list per period and no component
> contributions; its default is the Lecture category list above with Midterm 50%
> and Finals 50%. Its period grade is the Lecture period grade, and its course
> grade is round(Midterm × Midterm share + Final × Final share), rounded once.
> This course-grade rule is provisional until confirmed against the official
> lecture-only grade sheet. Removing Laboratory units is blocked while any
> current-term offering of the course has Laboratory assessments; otherwise, and
> when Laboratory units are added, the saved configuration keeps its calculation
> until the Faculty's next Grade Weights save, which must use the new structure.
> Past school years are not affected. Saved scores are never deleted or
> rescaled, and grades change only through authorized recomputation. Detailed
> rules: docs/contracts/lecture-only-grading.md.
>
> Owner-approved amendment (2026-11-10): Attendance is not a grading category for
> lecture-only courses. The Lecture defaults are Term Exam 50%, Quiz 20%, Outputs
> 20%, and Participation 10%; Midterm and Finals are each 50%. Attendance records
> remain in Attendance Monitoring and do not contribute to the course grade. When
> a saved combined setup is opened as a Lecture-only draft, the Attendance grade
> category is removed from the draft and the default Lecture categories are used.
> The existing calculation remains active until Faculty saves; recorded
> assessment scores and attendance records are preserved. Lecture/Laboratory
> course behavior remains unchanged.
>
> Owner-approved amendment (2026-10-27): The Dean confirmed the default
> Midterm/Finals split is 50% / 50% (previously 30% / 70%) for both
> Lecture/Laboratory and lecture-only courses. It is only the unsaved default;
> saved configurations keep their own split.

**Proposed text**

Replace lines 532-546 with:

````markdown
A component percentage uses the existing category assessment and transmutation calculations within that component. Each period percentage is its Lecture percentage multiplied by the Lecture contribution plus its Laboratory percentage multiplied by the Laboratory contribution. Overall percentage is the resulting Midterm and Finals percentages combined using the saved term contributions. Rounding follows UI-003 (official BUCDM grade sheet calculation). Ungrouped calculation behavior remains unchanged.

Missing results in a positively weighted category, component or period keep the dependent grade incomplete. Missing grades must never become zero or cause renormalization. Existing GRD-001 transmutation and attendance completeness rules remain unchanged. Retention status is computed as in UI-003; grouped weights must not redefine retention policy.
````

Replace lines 548-555 with:

````markdown
A Lecture/Laboratory course may have a grading category named Attendance. Categories added in Grade Weights are always assessment-source, Attendance included: Faculty add an assessment to it and enter a score of their own judgment, like any other category. Transmutation is set per assessment as in GRD-001. A configuration saved earlier with an authoritative Attendance-source category keeps computing that category from attendance records within the inclusive period date ranges (Present, Late and Excused count 100%, Absent 0%; unresolved attendance keeps the grade pending), with at most one such category per period across both components; Grade Weights no longer creates one. Attendance is not a grading category for lecture-only courses (below). Separate Lecture/Laboratory attendance calculations are outside this amendment.
````

Replace lines 557-573 with:

````markdown
Existing overall and ungrouped period configurations, assessment and category identifiers, raw scores, history and saved grades remain preserved. Existing configurations continue their saved calculation until explicitly converted; historical offerings remain view-only. Updating an existing ungrouped period configuration for a Lecture/Laboratory course requires explicit validated conversion to Lecture/Laboratory grading. Faculty must assign existing categories and resolve ambiguous assessment mappings before conversion can be saved; the system must not guess mappings, replace existing categories with defaults, or rescale saved weights automatically. For a lecture-only course, Grade Weights opens an existing combined period configuration as an editable Lecture-only draft that needs no conversion action: the draft uses the Lecture defaults below with Midterm 50% and Finals 50%, the Attendance grade category is removed from it, and Faculty reassign assessments of removed categories before saving. The saved combined calculation remains active until Faculty saves the Lecture-only draft. The save must not rewrite recorded scores; recorded assessment scores and attendance records are preserved, and current-term grades follow the existing save-triggered recomputation behavior. Conversion from grouped grading back to combined period lists is no longer supported.
````

Replace lines 581-622 with:

````markdown
The supplied syllabus defines the editable, unsaved default for new, unconfigured offerings: Lecture 60%, Laboratory 40%; Lecture categories Term Exam 50%, Quiz 20%, Outputs 20%, Participation 10%; Laboratory categories Practical Exam 50%, Laboratory Exercises 30%, Quiz 10%, Recitation 10%; Midterm 50%, Finals 50% (the Dean-confirmed split, for Lecture/Laboratory and lecture-only courses alike). The same starting component category lists apply to both Midterm and Finals. Faculty may edit these values while preserving the separate component structure and all three 100% totals. Defaults are shown automatically without an Apply syllabus example action. Existing saved configurations and recorded grades must never be replaced automatically by default values; saved configurations keep their own split.

Lecture-only courses. A course with Lecture units above 0 and Laboratory units of 0 is lecture-only; course units are the only source. Courses without recorded units keep Lecture/Laboratory grading, and Grade Weights points the Faculty to Classes & Rosters to set them. Laboratory-only courses keep Lecture/Laboratory grading. A lecture-only configuration has one Lecture category list per period and no component contributions; its default is the Lecture category list above (Term Exam 50%, Quiz 20%, Outputs 20%, Participation 10%) with Midterm 50% and Finals 50%. Attendance is not a grading category for lecture-only courses: attendance records remain in Attendance Monitoring and do not contribute to the course grade. Its period grade is the Lecture period grade, and its course grade is round(Midterm × Midterm share + Final × Final share), rounded once. Removing Laboratory units is blocked while any current-term offering of the course has Laboratory assessments; otherwise, and when Laboratory units are added, the saved configuration keeps its calculation until the Faculty's next Grade Weights save, which must use the new structure. Past school years are not affected. Saved scores are never deleted or rescaled, and grades change only through authorized recomputation. Lecture/Laboratory course behavior is unchanged. Detailed rules: docs/contracts/lecture-only-grading.md.

History: 2026-10-12 Attendance source selector removed; 2026-10-26 lecture-only courses; 2026-10-27 default split 50/50 (was 30/70); 2026-11-10 no Attendance category for lecture-only. Records: docs/archive/.
````

**What is dropped**
- 537-539 "Grouped calculations use unrounded intermediate values ... existing precision for displayed/persisted results": superseded by UI-003 2026-10-26 ("replaces the exact-value rule of 2026-10-12") for current-term grades. Replaced by "Rounding follows UI-003".
- 543-546 "retention thresholds and manual override rules remain unchanged" and "Informational risk uses the saved grouped weights and existing risk rules": manual overrides removed and risk levels retired by UI-003 2026-10-17 ("Computed retention only", "Risk has no levels"). The Midterm Watchlist now uses the professor's Midterm category weights and lecture/laboratory split (UI-003).
- 549-553 "unless Faculty explicitly selects the supported Attendance source": superseded by 555 (2026-10-12, selector removed).
- 557-573 "preserves the existing categories, IDs, weights, term shares, assessment links and scores" and "Defaults are used only when no saved configuration exists" for the lecture-only draft: superseded by 2026-11-10 ("the Attendance grade category is removed from the draft and the default Lecture categories are used"; GRD-002 "with the Lecture defaults and a 50% Midterm / 50% Finals split"). Scores, attendance records and the active saved calculation are still preserved.
- 2026-10-26 "Midterm 50% and Finals 50%" kept; the "(previously 30% / 70%)" remark moved to History.

**Code check:** defaults `frontend/src/utils/periodGradingHelper.ts:50-72` and `backend/controllers/FacultyController.php:1465-1472`; lecture-only rejects Attendance `FacultyController.php:1413-1418`; draft with defaults `GradeComputation.tsx:4449-4451`; lecture-only single rounding `GradeComputation.tsx:2959-2965`. Lecture/Laboratory courses still accept an Attendance-source category (`FacultyController.php:1253-1259`: a category named "Attendance" becomes attendance-source; `GradeComputation.tsx:2511` "only one authoritative attendance category").

**Owner questions**
- Q1 (X7): Lecture/Laboratory courses can still have one Attendance-source category, so the proposed text keeps "At most one authoritative Attendance-source category". Confirm this is intended. Code makes a category named "Attendance" the attendance source; the spec does not say how Faculty create one. Options: (a) keep as proposed; (b) retire Attendance-source categories for all courses (needs code change).
- Q2: The lecture-only course-grade rule is still marked "provisional until confirmed against the official lecture-only grade sheet". Is it confirmed now? Options: keep "provisional" (proposed) or drop the sentence.

---

## 5. EML-001 - Faculty notices to students

**Lines:** 631-635. **Kind:** stack (line 631 still offers At-Risk and Privacy Consent notices).

**Current text**

*Lines 631-635:*

> Faculty may send At-Risk and Privacy Consent notices to their students using the institutional email template. When the email mode is `custom`, every outgoing email is delivered to Mailpit, and only recipients on the configured allowlist also receive it by real email; Faculty notices to other recipients are recorded in history as "Suppressed (test mode)". In `mailpit` mode all email goes to Mailpit only; in `smtp` mode all email is delivered normally.
>
> Owner-approved amendment (2026-10-12): Email Management has three tabs: Student invitations, Secretary, and History. Faculty At-Risk and Privacy Consent notices are not offered. The delivery modes (`custom`, `mailpit`, `smtp`) are unchanged for all other email.
>
> Owner-approved amendment (2026-11-10): Email Management provides Midterm Advisory and Remedial notice tabs. A Midterm Advisory remains Faculty-initiated: Faculty select eligible enrolled Students, preview the personalized message and recipient list, then explicitly send. No Midterm Advisory is sent automatically when eligibility changes. It may be sent only to a current-school-year enrollment presently on the server-calculated Midterm Watchlist under UI-003; it is informational, contains no numeric grade, and advises the Student to contact the Faculty member. A Remedial notice is sent automatically after an authorized Faculty save creates a current-school-year pending remedial attempt with a scheduled date, or changes that attempt's scheduled date to a different non-null date. It includes the course, attempt number and current scheduled date. Saving an unchanged date, removing a date, or recording an attempt outcome alone does not trigger an email. The schedule save remains committed if delivery fails; the delivery result is recorded in Email History and shown in Email Management for the matching attempt and date. Faculty may still preview and explicitly send a Remedial notice from Email Management as a retry. The server revalidates eligibility and uses the canonical Student institutional email at send time. Existing email delivery modes and allowlist behavior apply to both notice types. On mobile, the recipient lists use stacked blocks and tabs wrap without horizontal page scrolling.

**Proposed text**

Replace lines 631-635 with:

````markdown
Faculty may send Midterm Advisory and Remedial notices to their students using the institutional email template. Email Management has five tabs: Student invitations, Secretary, History, Midterm Advisory and Remedial. Faculty At-Risk and Privacy Consent notices are not offered. When the email mode is `custom`, every outgoing email is delivered to Mailpit, and only recipients on the configured allowlist also receive it by real email; Faculty notices to other recipients are recorded in history as "Suppressed (test mode)". In `mailpit` mode all email goes to Mailpit only; in `smtp` mode all email is delivered normally.

A Midterm Advisory remains Faculty-initiated: Faculty select eligible enrolled Students, preview the personalized message and recipient list, then explicitly send. No Midterm Advisory is sent automatically when eligibility changes. It may be sent only to a current-school-year enrollment presently on the server-calculated Midterm Watchlist under UI-003; it is informational, contains no numeric grade, and advises the Student to contact the Faculty member. A Remedial notice is sent automatically after an authorized Faculty save creates a current-school-year pending remedial attempt with a scheduled date, or changes that attempt's scheduled date to a different non-null date. It includes the course, attempt number and current scheduled date. Saving an unchanged date, removing a date, or recording an attempt outcome alone does not trigger an email. The schedule save remains committed if delivery fails; the delivery result is recorded in Email History and shown in Email Management for the matching attempt and date. Faculty may still preview and explicitly send a Remedial notice from Email Management as a retry. The server revalidates eligibility and uses the canonical Student institutional email at send time. Existing email delivery modes and allowlist behavior apply to both notice types. On mobile, the recipient lists use stacked blocks and tabs wrap without horizontal page scrolling.

History: 2026-10-12 three tabs, At-Risk and Privacy Consent notices removed; 2026-11-10 Midterm Advisory and Remedial tabs. Records: docs/archive/.
````

**What is dropped:** "Faculty may send At-Risk and Privacy Consent notices to their students" (line 631), superseded by 2026-10-12 ("are not offered"); "three tabs", superseded by 2026-11-10 (five tabs).

**Code check:** `frontend/src/pages/faculty/EmailManagement.tsx` has the invitation, History and Remedial/Midterm lists (lines 33, 130, 159-161, 202); exact tab labels not verified.

---

## 6. RUN-001 - Supported development runtime (X15)

**Lines:** 696-702. **Kind:** contradiction (stack list omits the biometric sidecar).

**Current text**

*Lines 696-702:*

> Current stack:
>
> * React/Vite frontend;
> * plain PHP API with Composer dependencies;
> * PostgreSQL;
> * Mailpit;
> * optional development-only pgAdmin.

**Proposed text**

Replace lines 698-702 (the bullets) with:

````markdown
* React/Vite frontend;
* plain PHP API with Composer dependencies;
* PostgreSQL;
* Mailpit;
* the biometric sidecar (YuNet and SFace through OpenCV; BIO-003, BIO-007);
* optional development-only pgAdmin.
````

**What is dropped:** nothing.

**Code check:** `docker-compose.yml` defines the `biometric` service (11 references); `docker-compose.web.yml:47`; `backend/app/config.php:236-251` selects it in development. Agrees.

---

## 7. BIO-007 - Approved and deferred technology selections (X18)

**Lines:** 848, 856-858. Line 854 and 864 stay. **Kind:** both (848 still says the numbers need Owner approval; 856 approves them; 858 changes attendance frames).

**Current text**

*Lines 848:*

> Owner decision (2026-10-11): Haar Cascade detection and LBPH verification were replaced by YuNet and SFace after offline calibration on the LFW dataset, run through the DentiSys pipeline, showed LBPH accepted about 46% of impostor attempts at the provisional rule, and no LBPH threshold rejected impostors while passing genuine users reliably. The enrollment samples are combined into one averaged SFace template, which is the only retained facial reference. Existing LBPH references expire when the switch is deployed, their encrypted files are deleted, and enrolled users re-enroll. The SFace threshold and repeated-match rule MUST be calibrated so that no impostor attempt in the calibration set is accepted while at least 95% of genuine attempts pass on a good camera; the resulting numbers still require Owner approval.

*Lines 856-858:*

> Owner decision (2026-10-11): The approved face-matching values are a YuNet detection score of at least 0.9, a minimum face size of 120 pixels, a sharpness (Laplacian variance) of at least 60 on the aligned face, an SFace cosine similarity of at least 0.44, and at least 3 matching frames in one attempt of up to 30 frames. A frame counts only when exactly one face meets the score and size limits. In offline calibration on 200 LFW people (about 185 genuine and 555 impostor attempts per camera profile), these values accepted no impostor attempt and passed about 95% of genuine attempts on both the good-camera and older-phone profiles, counting attempts with too few clear frames as not passing. The LFW set cannot show error rates below about 1 in 1,000, and team re-enrollment and live genuine and impostor tests on the demo server still follow.
>
> Owner decision (2026-10-13): To keep attendance quick, an attendance attempt uses one randomized action and 8 usable forward-facing frames plus the action frame; enrollment is unchanged. Replaying the 2026-10-11 LFW calibration with 8 usable frames accepted no impostor attempt and passed about 94% of genuine attempts (95% with 30 frames). The Owner accepts this for attendance, since a retry covers the difference, pending live testing on real cameras, which must also confirm that one action still resists printed photographs and on-screen replays.

**Proposed text**

Replace line 848 with:

````markdown
Haar Cascade detection and LBPH verification are retired: offline calibration on the LFW dataset, run through the DentiSys pipeline, showed LBPH accepted about 46% of impostor attempts at the provisional rule, and no LBPH threshold rejected impostors while passing genuine users reliably. The enrollment samples are combined into one averaged SFace template, which is the only retained facial reference. LBPH references expired when the switch was deployed, their encrypted files were deleted, and enrolled users re-enrolled.
````

Replace lines 856-858 with:

````markdown
The approved face-matching values are a YuNet detection score of at least 0.9, a minimum face size of 120 pixels, a sharpness (Laplacian variance) of at least 60 on the aligned face, an SFace cosine similarity of at least 0.44, and at least 3 matching frames in one attempt. A frame counts only when exactly one face meets the score and size limits. Enrollment is unchanged (20 to 30 usable samples, above). An attendance attempt uses one randomized action and 8 usable forward-facing frames plus the action frame. These values were calibrated so that no impostor attempt in the calibration set is accepted while at least 95% of genuine attempts pass on a good camera; the 8-frame attendance result of about 94% is accepted by the Owner, since a retry covers the difference. In offline calibration on 200 LFW people (about 185 genuine and 555 impostor attempts per camera profile), the values accepted no impostor attempt and passed about 95% of genuine attempts with up to 30 frames on both the good-camera and older-phone profiles, counting attempts with too few clear frames as not passing; with 8 usable frames they accepted no impostor attempt and passed about 94% of genuine attempts. The LFW set cannot show error rates below about 1 in 1,000. Team re-enrollment, live genuine and impostor tests on the demo server, and live testing on real cameras (which must also confirm that one action still resists printed photographs and on-screen replays) still follow.

History: 2026-10-11 YuNet and SFace replace Haar and LBPH, matching values approved; 2026-10-13 attendance uses 8 frames and one action. Records: docs/archive/.
````

**What is dropped**
- 848 "The SFace threshold and repeated-match rule MUST be calibrated ... the resulting numbers still require Owner approval": superseded by 856 (2026-10-11) approving the values. The calibration target is kept as a statement of how the values were set.
- 856 "of up to 30 frames" as the attempt size: replaced for attendance by 858 (8 usable frames); the 30-frame figure stays only as the calibration comparison.
- Line 864 and section 9 (blink, head-pose, liveness and timing numerics, protocol, layout, sizing, passive PAD, key management still deferred) stay unchanged: still true.

**Code check:** action count `backend/app/student_biometrics.php:370-375` (1 for attendance, 2 otherwise); 20 required samples `student_biometrics.php:149,160`; sidecar needs `usable >= match_count` and hits `>= match_count` (`biometric-sidecar/app.py:560`); thresholds are env values (`app.py:92-96`, `docker-compose.web.yml:63-67`). The "8 usable frames" number is not found in code; not verified.

**Owner question Q3:** the proposal reads "at least 3 matching frames" as counted within the 8 usable frames of an attendance attempt. Confirm, or state the intended rule.

---

## 8. BIO-008 - Rollout (X2, X3)

**Lines:** 878-884. **Kind:** both.

**Current text**

*Lines 878-884:*

> After the BIO-002 institutional privacy/consent review and the remaining technical approvals required by BIO-007 are complete, real biometrics is available by default. Student enrollment and use remain voluntary and require consent. A development biometric mock MAY remain only behind explicit development configuration. Mock and real enrollment MUST remain separate; real biometric failure or unavailable infrastructure MUST fall back to manual attendance and MUST NOT silently use the mock.
>
> Owner decision (2026-10-09): For the DEL-001 VPS demonstration deployment only, real biometrics MAY be enabled before the BIO-002 review by explicit server configuration (`BIOMETRIC_SIDECAR_ENABLED=true`), so the DentiSys team can test it. It then behaves as in local development. Only DentiSys team members enroll (BIO-002 note). Without that setting, production-like environments keep real biometrics disabled.
>
> Owner decision (2026-10-17): The production deployment is used only by the DentiSys team until BIO-002 is complete. Real biometrics stay off by default there and MAY be enabled manually with `BIOMETRIC_SIDECAR_ENABLED=true`; only team members enroll.
>
> Owner decision (2026-11-02): Production is a public test deployment. Accounts come only by invitation from the Dean or Faculty, with an email on the allowed domain list. Invited Students and Faculty may test DentiSys there, but it is not used for real attendance, grades or retention decisions, and the site and the face-enrollment consent say so. Real biometrics are on by default in production, with the existing BIO-002 consent, revocation and manual alternative. This stands in for the BIO-002 institutional review for this test deployment only; real institutional use still requires BIO-002. This supersedes the 2026-10-17 production decision.

**Proposed text**

Replace lines 878-884 with:

````markdown
After the BIO-002 institutional privacy/consent review and the remaining technical approvals required by BIO-007 are complete, real biometrics is available by default. Student enrollment and use remain voluntary and require consent. A development biometric mock MAY remain only behind explicit development configuration. Mock and real enrollment MUST remain separate; real biometric failure or unavailable infrastructure MUST fall back to manual attendance and MUST NOT silently use the mock.

Before the BIO-002 review, real biometrics runs only in the two DEL-001 deployments. Demo: for the DEL-001 VPS demonstration deployment, real biometrics MAY be enabled by explicit server configuration (`BIOMETRIC_SIDECAR_ENABLED=true`), so the DentiSys team can test it. It then behaves as in local development, and only DentiSys team members enroll (BIO-002 note). Without that setting, real biometrics stays disabled. Production: production is a public test deployment. Accounts come only by invitation from the Dean or Faculty, with an official `@bicol-u.edu.ph` email. Invited Students and Faculty may test DentiSys there, but it is not used for real attendance, grades or retention decisions, and the site and the face-enrollment consent say so. Real biometrics are on by default in production, with the existing BIO-002 consent, revocation and manual alternative. This stands in for the BIO-002 institutional review for this test deployment only; real institutional use still requires BIO-002.

History: 2026-10-09 demo opt-in; 2026-10-17 production off by default; 2026-11-02 production public test, biometrics on by default. Records: docs/archive/.
````

**What is dropped**
- 880 "Without that setting, production-like environments keep real biometrics disabled": narrowed to the demo; production is on by default under 884.
- 882 (2026-10-17) "production ... used only by the DentiSys team ... real biometrics stay off by default ... only team members enroll": superseded by 884 ("This supersedes the 2026-10-17 production decision").
- DEL-001 line 1032 "Production keeps real biometrics disabled until the BIO-002 review" is removed in entry 12 for the same reason.

**Code check:** `backend/app/config.php:238-251`: real biometrics activates in `single-server` only when `BIOMETRIC_SIDECAR_ENABLED=true` (code default false), and in development. "On by default" is delivered by `scripts/provision-vps.ps1:299-302` (prompt default `true` for both demo and production) and `docker-compose.vps.yml:35` (`:-false` if unset). Agrees as a deployment default; the app itself does not enable it without the setting.

---

## 9. ATT-001 - Attendance-session authority

**Lines:** 916, 924, 928-944. Lines 918-922, 926 stay. **Kind:** stack (the 24-hour limit at 938 versus 12 hours at 940; edit rules in five amendments).

**Current text**

*Lines 916:*

> Owner decision (2026-10-01): Faculty and Secretary may queue multiple sessions for today or a future Asia/Manila date, never a past date. Sessions open at the chosen date/time and reject attendance before opening. Overlapping sessions for the same class are rejected across both roles; the message identifies the existing date/time and the Faculty or Secretary who created it. End-time and absence-resolution rules remain unchanged.

*Lines 924:*

> Every session has a required class end time at or after the Late cutoff; it may fall on the next day (2026-11-05 amendment).

*Lines 928-944:*

> Owner decision (2026-10-10): A scheduled session may be edited until it opens. Editable fields are the same as at creation except the class section: date, opening time, Present cutoff, Late cutoff, class end time, room, biometric and geofence settings, location, and radius. Faculty may edit scheduled sessions for classes they are authorized to manage, including sessions a Secretary created for that class. A Secretary may edit only scheduled sessions they created. Edits follow the creation rules for timing, past dates, and overlaps; a session does not overlap with itself. Active, ended, and revoked sessions cannot be edited. Each edit is recorded in the audit trail with actor, timestamp, and previous and new values. Editing does not create or change attendance records.
>
> Owner-approved amendment (2026-10-12): In the current interface only Faculty edit scheduled sessions; the Secretary has no Edit action. The server rule above is unchanged.
>
> Owner-approved amendment (2026-10-12): In the current interface the session date cannot be changed when editing; the edit form shows it read-only. The server rule above is unchanged.
>
> Owner decision (2026-10-12): The edit form opens showing the session's saved values, never blanks or default values. An edit updates only what the user changed. Every field the user did not change (date, times, room, biometric, geofence, location, radius) keeps its saved value; for example, changing the room and turning on biometric leaves geofence as it was, and changing geofence and the room leaves biometric as it was. The edit form sends only the changed fields, and the server keeps the saved value of any field an edit does not send. Geofence starting off (ATT-002) applies only to new sessions.
>
> Owner decision (2026-10-12): Every attendance session, created or edited, must have an opening time, Present cutoff and Late cutoff. A session without them is rejected.
>
> Owner-approved amendment (2026-11-05): A session may end after midnight. Times later than the Opening time are on the session day; earlier times are on the next day ('next day'). The whole session must last under 24 hours.
>
> Owner decision (2026-11-06): A session lasts at most 12 hours; a longer session is rejected. This replaces "under 24 hours" in the 2026-11-05 amendment. Every session needs a room: one from the Dean's list, or a typed place ("Other place (custom)…") for anywhere else, including off-site.
>
> Owner decision (2026-11-06): Before a session is created or edited, DentiSys looks for overlaps with: (a) an open or scheduled session of another class in the same room; (b) an open or scheduled session of another class with the same Faculty; (c) a weekly meeting of another active class in the same room on that weekday within that class's term. These do not block. One pop-up lists each overlap (room, date or weekday, time, class code and title, Faculty name, and whether it is a booked session or a regular schedule) with Go back (default) and Book anyway. After Book anyway, the Faculty of each overlapped class gets an in-app notice (no email), and the confirmation is audited. Overlapping sessions of the same class stay rejected. Sessions that only touch (one ends when the next starts) do not overlap. Room names match ignoring case, spaces, dashes and dots. Existing bookings are not rechecked.
>
> Owner decision (2026-11-06): The overlap pop-up, the 12-hour limit and the room requirement apply to Faculty and Secretary when starting, scheduling or editing a session. Every save checks again and notifies again. Editing a session made before these rules applies them; sessions not edited are not rechecked.

**Proposed text**

Replace line 916 with:

````markdown
Faculty and Secretary may queue multiple sessions for today or a future Asia/Manila date, never a past date. Sessions open at the chosen date/time and reject attendance before opening. Overlapping sessions for the same class are rejected across both roles; the message identifies the existing date/time and the Faculty or Secretary who created it.
````

Replace line 924 with:

````markdown
Every session has a required class end time at or after the Late cutoff. Times later than the opening time are on the session day; earlier times are on the next day ("next day"), so a session may end after midnight. A session lasts at most 12 hours; a longer session is rejected.
````

Replace lines 928-944 with:

````markdown
Every attendance session, created or edited, must have an opening time, Present cutoff, Late cutoff, class end time and a room: one from the Dean's list, or a typed place ("Other place (custom)…") for anywhere else, including off-site. A session without them is rejected.

A scheduled session may be edited until it opens. Editable fields are the same as at creation except the class section: date, opening time, Present cutoff, Late cutoff, class end time, room, biometric and geofence settings, location, and radius. Faculty may edit scheduled sessions for classes they are authorized to manage, including sessions a Secretary created for that class. A Secretary may edit only scheduled sessions they created. Edits follow the creation rules for timing, past dates, and overlaps; a session does not overlap with itself. Active, ended, and revoked sessions cannot be edited. Each edit is recorded in the audit trail with actor, timestamp, and previous and new values. Editing does not create or change attendance records. These are the server rules; in the current interface only Faculty edit scheduled sessions (the Secretary has no Edit action), and the session date cannot be changed when editing (the edit form shows it read-only).

The edit form opens showing the session's saved values, never blanks or default values. An edit updates only what the user changed. Every field the user did not change (date, times, room, biometric, geofence, location, radius) keeps its saved value; for example, changing the room and turning on biometric leaves geofence as it was, and changing geofence and the room leaves biometric as it was. The edit form sends only the changed fields, and the server keeps the saved value of any field an edit does not send. Geofence starting off (ATT-002) applies only to new sessions.

Before a session is created or edited, DentiSys looks for overlaps with: (a) an open or scheduled session of another class in the same room; (b) an open or scheduled session of another class with the same Faculty; (c) a weekly meeting of another active class in the same room on that weekday within that class's term. These do not block. One pop-up lists each overlap (room, date or weekday, time, class code and title, Faculty name, and whether it is a booked session or a regular schedule) with Go back (default) and Book anyway. After Book anyway, the Faculty of each overlapped class gets an in-app notice (no email), and the confirmation is audited. Overlapping sessions of the same class stay rejected. Sessions that only touch (one ends when the next starts) do not overlap. Room names match ignoring case, spaces, dashes and dots. Existing bookings are not rechecked.

The overlap pop-up, the 12-hour limit and the room requirement apply to Faculty and Secretary when starting, scheduling or editing a session. Every save checks again and notifies again. Editing a session made before these rules applies them; sessions not edited are not rechecked.

History: 2026-10-01 queued sessions; 2026-10-10 to 2026-10-12 edit rules and required times; 2026-11-05 sessions may end after midnight; 2026-11-06 12-hour limit, room required, overlap pop-up. Records: docs/archive/.
````

**What is dropped**
- 938 "The whole session must last under 24 hours": replaced by 940 ("This replaces 'under 24 hours'").
- 916 "End-time and absence-resolution rules remain unchanged": relative to 2026-10-01 only; end time is now defined in the 924 paragraph, absence resolution stays in ATT-003.
- 924 "(2026-11-05 amendment)" reference: folded into the text.
- 930 and 932 were interface-only notes ("The server rule above is unchanged"); kept as the last sentence of the edit paragraph.
- Edit paragraph merges 928, 930, 932; the 942 overlap text keeps its wording (de-dated only).

**Code check:** `backend/app/attendance_sessions.php:373-374` (12-hour cap), `:356,371` (a redundant "under 24 hours" check still exists and is harmless, since 12 hours is stricter), `:9-10` (radius). Edit and overlap rules: not verified.

---

## 10. ATT-002 - Geofencing and location privacy

**Lines:** 952-958. **Kind:** stack (two decisions about the same session setting, dated out of order).

**Current text**

*Lines 952-958:*

> Owner decision (2026-10-12): Geofencing is off by default for new attendance sessions. Authorized Faculty or Secretary may disable it per session, select the session location on an embedded OpenStreetMap map, which can also center on the creator's current location, and configure the permitted radius. The default radius is 100 meters and radius values are configured and stored in meters. Only map tiles are requested from the tile provider; no Student data is sent to it.
>
> Owner decision (2026-10-11): The radius MUST be between 50 and 2,000 meters inclusive when a session is created or edited; other values are rejected. The minimum allows for phone GPS error indoors, and the maximum is more than twice the widest span of the BU Legazpi West campus (about 790 m), so a session pinned anywhere on that campus can cover all of it while a mistyped radius cannot cover a whole city.
>
> Student coordinates MAY be used temporarily to evaluate whether the Student is inside the permitted radius. Exact Student GPS coordinates MUST NOT be permanently stored and no Student location history may be created. Geofence passed/failed, configured session location and radius, and an audit timestamp may be retained. If enabled geofencing is denied or unavailable, automated biometric attendance cannot complete and manual fallback applies.
>
> Owner decision (2026-10-12): Before the face capture, the Student's location is checked against the session location and radius, and the Student is told whether they are inside, how far they are from the session location and the allowed radius. A location fix is used only when its reported accuracy is no worse than the radius and at most 100 meters; otherwise the Student is asked to retry, and after two imprecise attempts is directed to the Class Secretary or Course Instructor for manual attendance. The server repeats the check at submission. Coordinates and accuracy are not stored.

**Proposed text**

Replace lines 952-954 with:

````markdown
Geofencing is off by default for new attendance sessions. Authorized Faculty or Secretary may disable it per session, select the session location on an embedded OpenStreetMap map, which can also center on the creator's current location, and configure the permitted radius. The default radius is 100 meters and radius values are configured and stored in meters. The radius MUST be between 50 and 2,000 meters inclusive when a session is created or edited; other values are rejected. The minimum allows for phone GPS error indoors, and the maximum is more than twice the widest span of the BU Legazpi West campus (about 790 m), so a session pinned anywhere on that campus can cover all of it while a mistyped radius cannot cover a whole city. Only map tiles are requested from the tile provider; no Student data is sent to it.
````

In line 958, replace the opening "Owner decision (2026-10-12): Before the face capture" with "Before the face capture". Add at the end of the section (after line 958):

````markdown
History: 2026-10-11 radius 50 to 2,000 m; 2026-10-12 geofence off by default, map and pre-capture location check. Records: docs/archive/.
````

**What is dropped:** nothing; date labels only.

**Code check:** `backend/app/attendance_sessions.php:9-10`, `frontend/src/utils/geofenceRadius.ts:1-9` (50-2000). Default radius and off-by-default: not verified.

---

## 11. ATT-006 - Manual correction and Excused workflow

**Lines:** 1004-1016. Line 1018 stays. **Kind:** stack (line 1006 says Secretary keeps ordinary manual attendance; 2026-10-28 makes every Secretary change a request; 1012 sends requests to the Excused requests panel; 1014 moves them to a tab).

**Current text**

*Lines 1004-1016:*

> Successful automated biometric attendance requires no Faculty approval. Faculty may directly correct attendance through authorized attendance-management functionality.
>
> Secretary retains authorized ordinary manual attendance functionality. When a Student contacts the Secretary about an excuse, the Secretary may submit an Excused request in DentiSys; only Faculty may approve or reject that request. Secretary MUST NOT finalize Excused through a generic manual override. A rejection leaves the current attendance status unchanged. When a Student contacts Faculty directly, Faculty may apply an authorized correction directly.
>
> For attendance rates, Excused counts as attended.
>
> Owner-approved amendment (2026-10-22): A Secretary cannot change an attendance record whose Excused status comes from a Faculty-approved Excused request; the Secretary attendance list shows "Approved by Faculty" instead of the override action, and only Faculty can change it. In attendance rates, Late counts as attended, the same as Present.
>
> Owner decision (2026-10-28): Every Secretary manual attendance change — a first mark (Present, Late, Absent, Excused) or a change to an existing record — is a request that only the class's Faculty may approve or reject. Until approved, the record stays as it was. Biometric check-ins still need no approval. When the session ends, a student whose request is still pending is resolved to Absent like any unrecorded student; a later approval changes that record. Faculty review these requests in the existing Excused requests panel, which lists every Secretary request type.
>
> Owner decision (2026-11-06): Faculty review Secretary requests in a Secretary requests tab on the Attendance Monitoring page.
>
> Owner decision (2026-11-06): The tab lists requests from all the Faculty's classes, grouped by session, with filters for student name or ID, class, status and requested change. Faculty can approve or reject all requests of a session, or select requests (including all requests the filters show) and approve them; approving more than one asks for confirmation first. The roll-call request chip and the Faculty Dashboard pending badge open the tab.

**Proposed text**

Replace lines 1004-1016 with:

````markdown
Successful automated biometric attendance requires no Faculty approval. Faculty may directly correct attendance through authorized attendance-management functionality, including when a Student contacts Faculty directly.

Every Secretary manual attendance change, whether a first mark (Present, Late, Absent, Excused) or a change to an existing record, is a request that only the class's Faculty may approve or reject; this includes an Excused request when a Student contacts the Secretary about an excuse. Secretary MUST NOT finalize Excused through a generic manual override. Until approved, the record stays as it was, and a rejection leaves the current attendance status unchanged. When the session ends, a student whose request is still pending is resolved to Absent like any unrecorded student; a later approval changes that record. A Secretary cannot change an attendance record whose Excused status comes from a Faculty-approved Excused request; the Secretary attendance list shows "Approved by Faculty" instead of the change action, and only Faculty can change it.

Faculty review Secretary requests in a Secretary requests tab on the Attendance Monitoring page. The tab lists requests from all the Faculty's classes, grouped by session, with filters for student name or ID, class, status and requested change. Faculty can approve or reject all requests of a session, or select requests (including all requests the filters show) and approve them; approving more than one asks for confirmation first. The roll-call request chip and the Faculty Dashboard pending badge open the tab.

For attendance rates, Excused and Late count as attended, the same as Present.

History: 2026-10-22 approved Excused locked for Secretary; 2026-10-28 every Secretary change is a request; 2026-11-06 Secretary requests tab. Records: docs/archive/.
````

**What is dropped**
- 1006 "Secretary retains authorized ordinary manual attendance functionality": superseded by 2026-10-28 (the Secretary's manual changes are requests, not direct changes).
- 1012 "Faculty review these requests in the existing Excused requests panel": superseded by 1014 (2026-11-06, Secretary requests tab).
- "the override action" (1010) is now "the change action", because the Secretary's action is a request.

**Code check:** `frontend/src/pages/secretary/AttendanceList.tsx:684-694` ("Approved by Faculty", Cancel request on a pending request); `frontend/src/components/FacultyExcusedRequestsPanel.tsx:44,160` ("Secretary requests" section shown as a tab). Agrees.

---

## 12. DEL-001 - Image publishing and deployment (X2, X4, X5, X6)

**Lines:** 1030-1034, 1038-1041. Lines 1036, 1043-1047 stay. **Kind:** both.

**Current text**

*Lines 1030-1034:*

> Owner decision (2026-10-09): A demonstration deployment on one cloud VPS is approved for testing by the DentiSys team and invited volunteer Faculty and Students. It is not a production deployment and not the BIO-002 real Student deployment.
>
> Owner decision (2026-10-14): Two VPS environments. **Demo** (this DEL-001 deployment): Claude builds and pushes `:demo` images through a dedicated GitHub bot account that can write only the demo image packages, and may operate the demo VPS, including a loopback-only test entrance reached by SSH tunnel. **Production**: a separate VPS set up with the same scripts and hardening, running separate image packages (`dentisys-*-prod`, tag `:prod`). Production images are never rebuilt: after the Owner and Claude both approve the demo, the Owner promotes the exact demo images of the approved commit with one script. Claude has no access to the production VPS, its credentials or the `-prod` packages. Production keeps real biometrics disabled until the BIO-002 review and pgAdmin off by default.
>
> Owner decision (2026-11-02): The two environments of 2026-10-14 stay, on any VPS provider (currently Vultr, one account) instead of AWS. Both servers use their automatic `<ip>.sslip.io` address for now; production will move to its own domain later, which needs no amendment. Server requirements, versions, hardening and domains are in docs/hosting-requirements.md. Colleagues work up to pushing their own branch; only the Owner's PC merges, publishes images and operates the demo. All other 2026-10-14 rules are unchanged, including the promotion of exact tested demo images and Claude having no access to production.

*Lines 1038-1041:*

> * Traefik as the only public entry point (ports 80 and 443), with HTTP redirected to HTTPS and Let's Encrypt certificates for one hostname (initially a DuckDNS name; changing the hostname needs no amendment).
> * Application images (web, frontend, biometric) published to GitHub Container Registry under the Owner's account, built and pushed by the Owner from a tested commit. No CI/CD pipeline.
> * Watchtower updating only the labeled DentiSys application containers. A release that adds database migrations MUST be deployed with the deploy script or the database sync script, each of which backs up the database before migrating; Watchtower alone MUST NOT be relied on for such a release.
> * A deploy script, a nightly PostgreSQL backup that the Owner can copy off the server, host firewall guidance (SSH, 80, 443 only), a runbook, and an optional host hardening script that applies the Owner's hardening guide (steps 1–6) exactly as written, except that the AWS key replaces `ssh-copy-id` and the sudo account (`devops` by default) keeps a forwarding exception limited to the pgAdmin and Mailpit loopback ports.

**Proposed text**

Replace lines 1030-1034 with:

````markdown
Two VPS environments are approved, on any VPS provider (currently Vultr, one account), for testing by the DentiSys team and invited volunteer Faculty and Students. **Demo** (this DEL-001 deployment): it is not a production deployment and not the BIO-002 real Student deployment. Claude builds and pushes `:demo` images through a dedicated GitHub bot account that can write only the demo image packages, and may operate the demo VPS, including a loopback-only test entrance reached by SSH tunnel. **Production**: a separate VPS set up with the same scripts and hardening, running separate image packages (`dentisys-*-prod`, tag `:prod`), with pgAdmin off by default; real biometrics follow BIO-008. Production images are never rebuilt: after the Owner and Claude both approve the demo, the Owner promotes the exact demo images of the approved commit with one script. Claude has no access to the production VPS, its credentials or the `-prod` packages. Both servers use their automatic `<ip>.sslip.io` address for now; production will move to its own domain later, which needs no amendment. Server requirements, versions, hardening and domains are in docs/hosting-requirements.md. Colleagues work up to pushing their own branch; only the Owner's PC merges, publishes images and operates the demo.
````

Replace lines 1038-1041 (the bullets) with:

````markdown
* Traefik as the only public entry point (ports 80 and 443), with HTTP redirected to HTTPS and Let's Encrypt certificates for one hostname (the server's `<ip>.sslip.io` address or its own domain; changing the hostname needs no amendment).
* Application images (web, frontend, biometric) published to GitHub Container Registry under the Owner's account, built and pushed from the Owner's PC from a tested commit (demo images by Claude through the bot account; production images by the Owner's promotion script). No CI/CD pipeline.
* Watchtower updating only the labeled DentiSys application containers. A release that adds database migrations MUST be deployed with the deploy script or the database sync script, each of which backs up the database before migrating; Watchtower alone MUST NOT be relied on for such a release.
* A deploy script, a nightly PostgreSQL backup that the Owner can copy off the server, host firewall guidance (SSH, 80, 443 only), a runbook, and an optional host hardening script that applies the Owner's hardening guide (steps 1–6) exactly as written, except that the server provider's key replaces `ssh-copy-id` and the sudo account (`devops` by default) keeps a forwarding exception limited to the pgAdmin and Mailpit loopback ports.
````

Add at the end of the section (after line 1047):

````markdown
History: 2026-10-09 demonstration deployment; 2026-10-14 demo and production VPS with a bot account; 2026-11-02 any provider, sslip.io address. Records: docs/archive/.
````

**What is dropped**
- 1032 "Production keeps real biometrics disabled until the BIO-002 review": superseded by BIO-008 2026-11-02 (production on by default as a public test). pgAdmin-off-by-default kept.
- 1032 "instead of AWS" and the "AWS key" bullet wording (X6): the provider is Vultr per 1034.
- 1038 "initially a DuckDNS name" (X5): superseded by 1034 (`<ip>.sslip.io`, later its own domain).
- 1039 "built and pushed by the Owner from a tested commit" (X4): reconciled with 1032 (Claude pushes demo images through the bot on the Owner's PC).

**Code check:** `scripts/publish-images.ps1 -Tag demo`, `scripts/promote-prod.ps1` exist per `docs/release-guide.md`; `docs/hosting-requirements.md:30` names the sslip.io/domain plan. Not re-verified in code.

---

## 13. CLS-001 - Faculty class-section editing

**Lines:** 1085-1089. **Kind:** stack (2026-10-13 compares "same school year", 2026-11-06 narrows to school year and semester).

**Current text**

*Lines 1085-1089:*

> Owner decision (2026-10-01): Each lecture/laboratory meeting stores its weekday, start time and end time separately; different days may use different times. Existing schedules are preserved.
>
> Owner decision (2026-10-13): Saving a class schedule is blocked when one of its meetings overlaps, on the same weekday, a meeting of another active class section in the same school year that either uses the same room (any Faculty) or has the same instructor (any room). A meeting that starts exactly when another ends does not overlap. Rooms have their own schedules, and an instructor cannot teach two classes at the same time.
>
> Owner decision (2026-11-06): The schedule-conflict rule above compares only classes in the same school year and semester. Summer is its own semester. Saving a class schedule whose meeting overlaps an open or scheduled session of another class in the same room, or of another class with the same instructor, shows the session overlap pop-up (ATT-001) and does not block.

**Proposed text**

Replace lines 1085-1089 with:

````markdown
Each lecture/laboratory meeting stores its weekday, start time and end time separately; different days may use different times. Existing schedules are preserved.

Saving a class schedule is blocked when one of its meetings overlaps, on the same weekday, a meeting of another active class section in the same school year and semester (Summer is its own semester) that either uses the same room (any Faculty) or has the same instructor (any room). A meeting that starts exactly when another ends does not overlap. Rooms have their own schedules, and an instructor cannot teach two classes at the same time. Saving a class schedule whose meeting overlaps an open or scheduled session of another class in the same room, or of another class with the same instructor, shows the session overlap pop-up (ATT-001) and does not block.

History: 2026-10-01 separate meeting times; 2026-10-13 schedule conflict block; 2026-11-06 same term only, session overlap pop-up. Records: docs/archive/.
````

**What is dropped:** "in the same school year" alone, superseded by 2026-11-06 ("only classes in the same school year and semester").

**Code check:** `backend/app/class_meetings.php` exists; the conflict query was not traced.

---

## 14. IMP-001 - Roster imports

**Lines:** 1108-1123. Lines 1125-1129 stay. **Kind:** both (1112 "Do not ... create classes from imported headers" and "provisional supported layout" versus the 2026-10-26/27 official layouts and class creation; the 2026-11-02 rule supersedes the "reviews every split" rule).

**Current text**

*Lines 1108-1123:*

>
> Faculty may import Student roster records into an existing assigned current-year
> class using a provisional supported layout.
> Preserve complete Student numbers and supplied identity/contact values. Do not
> invent missing emails or year levels, silently resolve ambiguous name splits,
> overwrite existing Student identities, or create classes from imported headers.
> Require preview and target-class confirmation before saving. Flag possible
> crossed-out rows and leave them unselected until reviewed; marking detection is
> best effort and the Faculty must review the source. Resolve existing Students
> through server identities and preserve permissions, historical-class restrictions,
> audit history, account eligibility and separate invitation authority. Process the
> original file locally and send only selected Student fields to existing APIs.
> Owner decision (2026-10-26): The BU College of Dental Medicine "Official List of Enrolled Students" PDF and the official grade sheet workbook (.xlsx) are the official import layouts. Faculty upload them unchanged; DentiSys adapts to them. Owner decision (2026-10-28): imports are confirmed; no import file shows an "Official format not confirmed" label. Grade sheet import saves raw scores only, never computed grades, through the existing score rules; it never changes Grade Weights, never turns a blank into zero, and never overwrites a saved score without the Faculty's confirmation. File headers are checked against the selected class and differences are warnings. Owner decision (2026-10-27): When no existing class of the Faculty matches the official class list's course code, section, school year and semester, the Faculty may create the class from the file inside the roster import. The header prefills the Create Class fields (course, section, year level, Lecture and Laboratory units, Dean term and meetings); the Faculty confirms or corrects every field before saving, and Create Class validation applies. A matching existing class is offered instead of creating a duplicate. Owner decision (2026-10-28): The Academic term defaults to the Dean-defined term matching the file header when one exists. The Faculty may select a different Dean-defined term to correct a misread year or semester. Creating a class requires selecting a Dean-defined term in the current school year; class creation is blocked while the selected term is in a past school year. The selected term determines the new class school year. Importing into an existing class is unaffected. Detailed rules: docs/contracts/official-imports.md.
>
> Owner decision (2026-10-29): **Import Students** from a class roster view opens a separate modal that imports students into that already selected class. It does not ask for class details or a target class and cannot create a class. An official PDF header that differs from the selected class remains a warning for Faculty review. **Import Class and Roster** remains a separate modal for the file-based class and roster flow.
>
> Owner decision (2026-11-02): On an official class-list PDF, a name split is ambiguous when the name has no comma, a suffix (Jr., Sr., II–V), a surname particle (such as Dela, De Los, San) or three or more given names. Only ambiguous splits are flagged for the Faculty's review; other names follow the 2026-10-28 rule (the last given word is the middle name). Select all students ticks rows without errors that are neither flagged for name review nor possible crossed-out rows; those stay unselected until the Faculty ticks each one after checking the source. Students correct their own name after activation through Change Name. When the class list matches none of the Faculty's current-year classes, the dialog says a new class will be created and offers a link to import into one of the Faculty's existing classes instead. This supersedes the 2026-10-28 rule that the Faculty reviews every split.

**Proposed text**

Replace lines 1108-1123 with:

````markdown
Faculty may import Student roster records into an existing assigned current-year class, or create the class from the file as described below. The BU College of Dental Medicine "Official List of Enrolled Students" PDF and the official grade sheet workbook (.xlsx) are the official import layouts. Faculty upload them unchanged; DentiSys adapts to them. Detailed rules: docs/contracts/official-imports.md.
Preserve complete Student numbers and supplied identity/contact values. Do not invent missing emails or year levels, overwrite existing Student identities, or silently resolve ambiguous name splits. Require preview and target-class confirmation before saving. Flag possible crossed-out rows and leave them unselected until reviewed; marking detection is best effort and the Faculty must review the source. Resolve existing Students through server identities and preserve permissions, historical-class restrictions, audit history, account eligibility and separate invitation authority. Process the original file locally and send only selected Student fields to existing APIs.

Grade sheet import saves raw scores only, never computed grades, through the existing score rules; it never changes Grade Weights, never turns a blank into zero, and never overwrites a saved score without the Faculty's confirmation. File headers are checked against the selected class and differences are warnings. No import file shows an "Official format not confirmed" label.

When no existing class of the Faculty matches the official class list's course code, section, school year and semester, the Faculty may create the class from the file inside the roster import. The header prefills the Create Class fields (course, section, year level, Lecture and Laboratory units, Dean term and meetings); the Faculty confirms or corrects every field before saving, and Create Class validation applies. A matching existing class is offered instead of creating a duplicate. The Academic term defaults to the Dean-defined term matching the file header when one exists. The Faculty may select a different Dean-defined term to correct a misread year or semester. Creating a class requires selecting a Dean-defined term in the current school year; class creation is blocked while the selected term is in a past school year. The selected term determines the new class school year. Importing into an existing class is unaffected. When the class list matches none of the Faculty's current-year classes, the dialog says a new class will be created and offers a link to import into one of the Faculty's existing classes instead.

**Import Students** from a class roster view opens a separate modal that imports students into that already selected class. It does not ask for class details or a target class and cannot create a class. An official PDF header that differs from the selected class remains a warning for Faculty review. **Import Class and Roster** remains a separate modal for the file-based class and roster flow.

On an official class-list PDF, a name split is ambiguous when the name has no comma, a suffix (Jr., Sr., II–V), a surname particle (such as Dela, De Los, San) or three or more given names. Only ambiguous splits are flagged for the Faculty's review; other names follow the rule that the last given word is the middle name. Select all students ticks rows without errors that are neither flagged for name review nor possible crossed-out rows; those stay unselected until the Faculty ticks each one after checking the source. Students correct their own name after activation through Change Name.

History: 2026-10-26 official layouts; 2026-10-27 create class from file; 2026-10-29 Import Students modal; 2026-11-02 only ambiguous name splits flagged. Records: docs/archive/.
````

**What is dropped**
- "provisional supported layout" (1108) and "or create classes from imported headers" (1112): superseded by 2026-10-26 (official layouts) and 2026-10-27 (class created from the file in the roster import).
- "silently resolve ambiguous name splits": kept as "silently resolve ambiguous name splits" (unchanged meaning); 2026-11-02 "This supersedes the 2026-10-28 rule that the Faculty reviews every split" is folded into "Only ambiguous splits are flagged".
- The 2026-10-28 "last given word is the middle name" rule is cited by 1123 and defined in docs/contracts/official-imports.md; kept as a sentence here.

**Code check:** not verified (`frontend/src/utils/rosterImportHelper.ts`, `importDestination.ts`, `nameNormalization.ts` exist).

---

## 15. UI-001 - Canonical interface (X17), and the section 9B status

**Lines:** 1134 (9B status), 1138-1156. **Kind:** both (migration text is history; five stacked responsive and wording decisions; "University email" versus "University Email").

**Current text**

*Lines 1134:*

> **Status: APPROVED by the Owner's explicit request to amend the specification using UI Changes.pdf. Implementation pending.**

*Lines 1138-1156:*

> **Status: Implemented.** The `owhie_backend` interface migration and the related normalization are complete (`a7582d8`). Later interface changes are governed by the requirement that covers them.
>
> The complete `owhie_backend` interface is the visual and interaction baseline to migrate into `lighthal5`, supplemented by the nine-page `UI Changes.pdf`. This replaces earlier visual baselines and functional-first priorities. Scope includes every role, route, navigation item, form, table, dialog, style, asset, and responsive state, not only the illustrated screens.
>
> Owner decision (2026-10-13): Below 1280 px wide (phones, tablets and small laptops), every control, card and text MUST stay inside its box, and columns and data formats MUST match desktop: never merged, reordered or dropped. Desktop (1280 px and wider) keeps its layout. When the user has not chosen, the sidebar starts collapsed to icons on screens 768-1023 px wide; a saved open or collapsed choice wins.
>
> Owner decision (2026-11-03): Below 768 px wide, a data list that does not fit MAY show each row as a stacked block instead of a table that scrolls sideways. A block shows every field of the desktop row in the desktop data format. It MAY put the row's name or date first, show two related fields on one line (for example date · time, or course code · course name), and leave out a field that has no value for that row (shown as "—" on desktop). Where a block field has no visible label, it carries a label for screen readers. From 768 px up, tables follow the 2026-10-13 rule. This applies to the Student Dashboard enrolled subjects (approved 2026-11-03, which also uses blocks at 1024–1279 px), Student Attendance Logs, the Faculty and Secretary roll calls, the Faculty roster, the Reports grade summary, the Email Management invitation lists and the Audit Trail. In the collapsed sidebar each icon shows a short name under it, and the full name also appears on keyboard focus. This supersedes the "never merged, reordered" part of the 2026-10-13 decision for these lists below 768 px only.
>
> Owner-approved amendment (2026-11-11): Below 768 px, all Student and Secretary data tables use stacked row cards instead of horizontal scrolling, with every field and action preserved in each row. From 768 px up, the existing table layout and responsive scrolling rules remain in effect. This extends the 2026-11-03 phone-block rule to all Student and Secretary data tables.
>
> Owner-approved amendment (2026-11-13): The 2026-11-03 phone-block rule also applies to the three Faculty Retention Monitoring lists (Retention Status, Remedial Progression, Midterm Watchlist). Below 768 px each row is a stacked block with every field and action of the desktop row; grade values carry a short visible label. From 768 px up, the existing tables are unchanged.
>
> Owner decision (2026-11-03): Interface wording: buttons that start an attendance session say "Start session" (a future date says "Schedule session") and the session list is "Sessions", on Faculty and Secretary pages alike; a class with no grade yet shows the state "No grade yet" in a neutral grey pill, while a missing grade value reads "Pending"; school-year filters use "S.Y."; sign-in and password-reset forms label the field "University email"; the roll-call filter for rows without attendance reads "Not recorded" on both roll calls.
>
> Owner decision (2026-11-06): Interface casing. Text that names a place or a field uses Title Case: page titles, card and section headings, dialog titles, tabs, sidebar items, table column headers and form field labels (the same field has the same words in a form and in a table). Everything else uses sentence case: buttons, links, menu items, chips, pills and status values, placeholders, hints, tooltips, screen-reader labels, toasts, errors, empty states, confirmation text and option text. A heading that reads as a message (it would take a full stop, such as "Check your email" or "No assigned classes found") is sentence case. Role names (Faculty, Secretary, Dean, Student), names (DentiSys, Bicol University, BU, Google), the grading periods and components (Midterm, Finals, Lecture, Laboratory) and abbreviations (ID, PDF, CSV, 2FA) are always capitalised; other terms are lowercase inside sentences ("school year", "class section"), except that a page, tab or button name mentioned in other text keeps its own casing ("Open in Retention Monitoring", "Check the Archived Classes tab"). Semester names (1st Semester, 2nd Semester, Summer) are always capitalised. In Title Case, a, an, the, and, or, of, to, in, on, for, by, at, with, per and vs stay lowercase unless first or last; both halves of a hyphenated word are capitalised ("Check-In Time"); a bracketed note stays lowercase ("Middle Name (optional)"). Text is never typed in ALL CAPS; a style that shows capitals does it with CSS. The one exception is the printed class list, whose capitalised header copies the official form. This sets only casing; the words chosen in earlier decisions stay (the sign-in field reads "University Email").
>
> Delivery order is (1) copy the entire UI, (2) normalize the database to third normal form and support the UI's data, (3) connect frontend and backend and repair regressions. Tests may fail during intermediate UI migration; retain the failures as tracked work. Visual parity is not functional completion or proof of persistence.
>
> The source branch defines the interface, not automatic approval of its backend semantics. Explicit requirements below govern PDF/source differences. Unaffected authentication, permissions, privacy, history preservation, Docker/PostgreSQL, and authoritative-data rules remain in force. Unresolved behavior remains OPEN.

**Proposed text**

Replace line 1134 with:

````markdown
**Status: APPROVED by the Owner's explicit request to amend the specification using UI Changes.pdf (2026-09-24). Implemented.**
````

Replace lines 1138-1156 with:

````markdown
**Status: Implemented.** The `owhie_backend` interface migration and the related normalization are complete (`a7582d8`). Later interface changes are governed by the requirement that covers them.

The complete `owhie_backend` interface is the visual and interaction baseline, supplemented by the nine-page `UI Changes.pdf`. It replaces earlier visual baselines and functional-first priorities. Scope includes every role, route, navigation item, form, table, dialog, style, asset, and responsive state, not only the illustrated screens.

Below 1280 px wide (phones, tablets and small laptops), every control, card and text MUST stay inside its box. From 768 px up, columns and data formats MUST match desktop (never merged, reordered or dropped), and a table that does not fit scrolls inside its own box. Desktop (1280 px and wider) keeps its layout. Below 768 px, a data list that does not fit shows each row as a stacked block instead of a table that scrolls sideways. This applies to all Student and Secretary data tables, and to the Student Dashboard enrolled subjects (which also uses blocks at 1024–1279 px), Student Attendance Logs, the Faculty and Secretary roll calls, the Faculty roster, the Reports grade summary, the Email Management invitation lists, the Audit Trail, and the three Faculty Retention Monitoring lists (Retention Status, Remedial Progression, Midterm Watchlist). A block shows every field and action of the desktop row in the desktop data format. It MAY put the row's name or date first, show two related fields on one line (for example date · time, or course code · course name), and leave out a field that has no value for that row (shown as "—" on desktop). Where a block field has no visible label, it carries a label for screen readers; grade values in the Retention Monitoring blocks carry a short visible label. When the user has not chosen, the sidebar starts collapsed to icons on screens 768-1023 px wide; a saved open or collapsed choice wins. In the collapsed sidebar each icon shows a short name under it, and the full name also appears on keyboard focus.

Interface wording: buttons that start an attendance session say "Start session" (a future date says "Schedule session") and the session list is "Sessions", on Faculty and Secretary pages alike; a class with no grade yet shows the state "No grade yet" in a neutral grey pill, while a missing grade value reads "Pending"; school-year filters use "S.Y."; sign-in and password-reset forms label the field "University Email"; the roll-call filter for rows without attendance reads "Not recorded" on both roll calls.

Interface casing. Text that names a place or a field uses Title Case: page titles, card and section headings, dialog titles, tabs, sidebar items, table column headers and form field labels (the same field has the same words in a form and in a table). Everything else uses sentence case: buttons, links, menu items, chips, pills and status values, placeholders, hints, tooltips, screen-reader labels, toasts, errors, empty states, confirmation text and option text. A heading that reads as a message (it would take a full stop, such as "Check your email" or "No assigned classes found") is sentence case. Role names (Faculty, Secretary, Dean, Student), names (DentiSys, Bicol University, BU, Google), the grading periods and components (Midterm, Finals, Lecture, Laboratory) and abbreviations (ID, PDF, CSV, 2FA) are always capitalised; other terms are lowercase inside sentences ("school year", "class section"), except that a page, tab or button name mentioned in other text keeps its own casing ("Open in Retention Monitoring", "Check the Archived Classes tab"). Semester names (1st Semester, 2nd Semester, Summer) are always capitalised. In Title Case, a, an, the, and, or, of, to, in, on, for, by, at, with, per and vs stay lowercase unless first or last; both halves of a hyphenated word are capitalised ("Check-In Time"); a bracketed note stays lowercase ("Middle Name (optional)"). Text is never typed in ALL CAPS; a style that shows capitals does it with CSS. The one exception is the printed class list, whose capitalised header copies the official form. This sets only casing; the words chosen in the wording rule above stay.

The source branch defines the interface, not automatic approval of its backend semantics. Explicit requirements below govern PDF/source differences. Unaffected authentication, permissions, privacy, history preservation, Docker/PostgreSQL, and authoritative-data rules remain in force. Unresolved behavior remains OPEN. Visual parity is not functional completion or proof of persistence.

History: 2026-10-13 never merged below 1280 px; 2026-11-03 phone blocks below 768 px and wording rules; 2026-11-06 casing; 2026-11-11 all Student and Secretary tables; 2026-11-13 Retention Monitoring lists. Records: docs/archive/.
````

**What is dropped**
- 1140 "baseline to migrate into `lighthal5`" and 1154 "Delivery order is (1) copy the entire UI, (2) normalize the database to third normal form ..., (3) connect frontend and backend ... Tests may fail during intermediate UI migration; retain the failures as tracked work": completed migration steps (status line says so; X17). The sentence "Visual parity is not functional completion or proof of persistence" is kept.
- 1142 "columns and data formats MUST match desktop: never merged, reordered or dropped" below 1280 px: narrowed to 768 px and up by 2026-11-03 ("supersedes the 'never merged, reordered' part ... for these lists below 768 px only"), extended by 2026-11-11 and 2026-11-13.
- 1150 "University email" (field label): the casing rule (1152) says "the sign-in field reads 'University Email'", and the code reads "University Email".
- 9B status "Implementation pending": contradicts UI-001 "Implemented".

**Code check:** "University Email": `frontend/src/pages/auth/SsoLogin.tsx:361`, `ForgotPassword.tsx:132`. Breakpoints per page: not verified.

**Owner question Q6:** removing the "Delivery order" paragraph and changing the 9B status drops a procedural rule the migration has already completed. Options: (a) approve as proposed; (b) keep the paragraph as history in the archive only (same result in spec.md).

---

## 16. UI-002 - Score entry, deadlines, and weights

**Lines:** 1162-1172. Lines 1160 and 1174-1178 stay. **Kind:** stack.

**Current text**

*Lines 1162-1172:*

> Owner decision (2026-10-13): Below 1280 px wide, Full Matrix View shows a Pin switch (Full Name, or ID Number + Full Name; default Full Name) that keeps the chosen student columns at the left edge while the matrix scrolls sideways. ID Number and Full Name stay separate columns. At 1280 px and wider the switch is hidden and the matrix is unchanged.
>
> Owner decision (2026-11-03): Below 640 px wide only the Full Name column stays pinned, in a narrower column that wraps, and the Pin switch is hidden. From 640 px to 1279 px the switch reads "Keep visible while scrolling: Name / ID and name" (default Name). Below 1280 px the matrix grows to the screen height (at least its former 600 px). ID Number and Full Name stay separate columns, and at 1280 px and wider nothing changes. This supersedes the 2026-10-13 decision's phone behaviour and switch wording.
>
> Owner-approved amendment (2026-11-14), GRA-03: Full Matrix View has a "Show computation" switch, off by default and remembered per browser, shown at 1280 px and wider (other widths may follow by amendment). When it is on, each categorised assessment shows Score, % (score ÷ maximum × 100) and Transmuted. Transmuted is the value used in the category average: the transmuted percentage, the same % when transmutation is off, or "Absent (0)" when an absence on the linked session zeroes it. Each category shows "Average %" (formerly "Total") and its Weighted contribution. No points total is shown. Period results stay at the end of each period. Assessments not in a category show scores only. The values are the server's computation of saved scores; the switch changes no grade.
>
> Owner-approved amendment (2026-11-14), desktop pin: at 1280 px and wider, Full Matrix View also shows the "Keep visible while scrolling: Name / ID and name" switch (default Name) and pins the chosen student columns while the matrix scrolls sideways; ID Number is 120 px and Full Name 220 px wide. This replaces "at 1280 px and wider nothing changes" in the 2026-11-03 decision above; the screen-height growth stays below 1280 px only.
>
> Owner-approved amendment (2026-11-14), GRA-03 phones and tablets: the "Show computation" switch is shown at every width, with the same columns; this supersedes "shown at 1280 px and wider" above.
>
> Owner-approved amendment (2026-11-14), T4: Full Matrix View keeps a tab-only copy (browser session storage, per user and class) of scores typed but not yet saved. If the session ends by force, then after signing back in in the same tab the matrix offers "Restore" or "Discard" for the kept scores that still differ from the saved ones. Restored scores are ordinary unsaved edits. The user's own Sign out and closing the tab discard the copy.

**Proposed text**

Replace lines 1162-1172 with:

````markdown
Full Matrix View always pins the student columns at the left edge while the matrix scrolls sideways; ID Number and Full Name stay separate columns. At 640 px and wider a "Keep visible while scrolling: Name / ID and name" switch (default Name) chooses whether only Full Name, or ID Number and Full Name, stay pinned. Below 640 px only the Full Name column stays pinned, in a narrower column that wraps, and the switch is hidden. At 1280 px and wider ID Number is 120 px and Full Name 220 px wide. Below 1280 px the matrix grows to the screen height (at least 600 px).

Full Matrix View has a "Show computation" switch, shown at every width, off by default and remembered per browser. When it is on, each categorised assessment shows Score, % (score ÷ maximum × 100) and Transmuted. Transmuted is the value used in the category average: the transmuted percentage, the same % when transmutation is off, or "Absent (0)" when an absence on the linked session zeroes it. Each category shows "Average %" (formerly "Total") and its Weighted contribution. No points total is shown. Period results stay at the end of each period. Assessments not in a category show scores only. The values are the server's computation of saved scores; the switch changes no grade.

Full Matrix View keeps a tab-only copy (browser session storage, per user and class) of scores typed but not yet saved. If the session ends by force, then after signing back in in the same tab the matrix offers "Restore" or "Discard" for the kept scores that still differ from the saved ones. Restored scores are ordinary unsaved edits. The user's own Sign out and closing the tab discard the copy.

History: 2026-10-13 pin switch below 1280 px; 2026-11-03 phone and tablet pin rules; 2026-11-14 desktop pin, Show computation at every width, session-storage copy. Records: docs/archive/.
````

Place the History line after the last UI-002 paragraph (after line 1178) if the Owner prefers it at the section end.

**What is dropped**
- 1162 "Pin switch (Full Name, or ID Number + Full Name; default Full Name)", "At 1280 px and wider the switch is hidden": superseded by 2026-11-03 (wording "Keep visible while scrolling", phone behaviour) and 2026-11-14 (desktop pin, "replaces 'at 1280 px and wider nothing changes'").
- 1166 "shown at 1280 px and wider (other widths may follow by amendment)": superseded by 1170 ("shown at every width").
- Tags GRA-03 and T4 (kept in History only).

**Code check:** `frontend/src/components/GradebookMatrix.tsx:419-422` (pin widths 120/220 px at xl; 104/140 and 112 px below), `:462` (`max-sm:hidden` switch), `:93-98, 570-581` (Show computation, no width gate); `frontend/src/utils/matrixDraft.ts` (session copy). Agrees.

---

## 17. UI-003 - Midterm Watchlist and retention status (X9-X12)

**Lines:** 1180, 1184-1230. Lines 1182 stays. **Kind:** both.

**Current text**

*Lines 1180:*

> The Midterm Watchlist stays locked while the applicable student's midterm grades are incomplete and becomes accessible when complete. Authorized Faculty may manually unlock it for every student in the selected class, as clarified by the Owner on 2026-09-24. Unlocking changes visibility, not missing grades or academic completeness. Persist the class, actor, and timestamp; do not unlock another class implicitly.

*Lines 1184-1230:*

> Owner-approved naming update (2026-10-29): The Faculty retention page labels its computed final-grade view "Retention Status". "Midterm Watchlist" remains the separate early warning list.
>
> Owner decision (2026-09-28, superseded in part by 2026-11-13): The 2.50 course-grade trigger remains fixed college policy, is not an Admin setting, and applies to completed final course grades. Grades 2.5 through 4.9 are eligible for DentiSys remedial attempts. Grade 5.0 follows the in-person irregular reenrollment path outside DentiSys. Missing or incomplete grades remain unresolved.
>
> Owner-approved amendment (2026-09-26, superseded by 2026-11-13): DentiSys records the first and second remedial attempts separately, derives Pass/Fail from the stored percentage, and does not offer a third remedial attempt. Failure of the first permits the second; failure of the second requires cost recovery. Remedial outcomes do not replace the original course grade.
>
> Owner decision (2026-09-29) — Risk levels (Faculty Retention Monitoring and Midterm Watchlist): Risk shows how close a student is to needing remediation. It is recalculated for the current grading period (Midterm, or the running overall grade after Midterm): (1) take the student's completed assessments in the period; (2) add assumed future assessments one at a time, each the size of the student's average completed assessment in that period and scored 75%, a below-passing score (80% or below); (3) count how many are needed before the period grade reaches 2.50 or worse. High = 1-2 assumed assessments, or the grade is already 2.50 or worse; At Risk = 3-4; Low = 5 or more. Risk is informational and never creates remediation. Warning and Critical remain separate, manually set retention states. The assumed score and the bands are current policy and may change by amendment.
>
> Owner-approved amendment (2026-10-03): The Student midterm advisory uses the existing server-calculated Faculty Midterm Watchlist risk projection. High and At Risk results show an informational advisory; Low does not. Missing or insufficient assessment data remains Pending/Unavailable. A manual watchlist unlock changes visibility only. This advisory never assigns remediation or changes the final-grade 2.50 trigger.
>
> Owner-approved amendment (2026-10-12): The Faculty Midterm Watchlist has no lock and no manual unlock. It lists students whose midterm grades are complete, who have no final course grade yet, and whose exact midterm grade is 2.50 or worse. A student leaves the list once a final course grade exists. At-risk students are listed first. The badge shows the server risk level when available; otherwise High if the exact midterm grade is 3.00 or worse, else At Risk. This supersedes the 2026-09-24 lock/unlock rule. The Student advisory (2026-10-03) and the risk levels (2026-09-29) are unchanged.
>
> Owner decision (2026-10-09, provisional pending BUCDM confirmation): A percentage converts to the 1.00–5.00 grade by linear interpolation between 97% = 1.00, 94% = 1.25, 91% = 1.50, 88% = 1.75, 85% = 2.00, 82% = 2.25, 80% = 2.50, 78% = 2.75 and 75% = 3.00. 97% or more is 1.00; below 75% is 5.00. Server and client use the same conversion. Grades are stored and displayed rounded to two decimals, but the 2.50 remediation trigger and risk levels compare the exact unrounded grade, so rounding never creates a remediation flag. Only 80.00% or below reaches 2.50.
>
> Owner-approved amendment (2026-10-12): Calculations keep exact values through every step: category, period, course percentage and grade. Only the final course percentage and grade are rounded to two decimals for storage and display. Wherever a grade is shown, hovering, focusing or tapping it shows the exact grade and percentage.
>
> Owner-approved amendment (2026-10-17): BUCDM grade conversion. This replaces the provisional 2026-10-09 conversion. A percentage is first truncated to a whole percent (84.9% → 84%). Then: 99–100 = 1.0, 98 = 1.1, 97 = 1.2, 96 = 1.3, 95 = 1.4, 94 = 1.5, 93 = 1.6, 92 = 1.7, 91 = 1.8, 90 = 1.9, 89 = 2.0, 88 = 2.1, 87 = 2.2, 86 = 2.3, 85 = 2.4, 84 = 2.5, 82–83 = 2.6, 80–81 = 2.7, 78–79 = 2.8, 76–77 = 2.9, 75 = 3.0 (passing). Below 75%, a Midterm grade is 3.1 at 74%, worsening 0.1 per percent to 4.0 at 65% and below; a Final or overall course grade below 75% is 5.0. Server and client use the same conversion. The 2.50 remediation trigger is unchanged and now means 84% or below. In the 2026-09-29 risk levels, "80% or below" becomes "84% or below". Final grades saved in closed school years stay as recorded; current-term grades use this conversion when next computed or saved.
>
> Owner-approved amendment (2026-10-22): Grade rounding follows University policy. The course percentage is rounded to two decimals first, and that rounded value is truncated to a whole percent for the conversion (74.995% → 75.00% → 75% → 3.0). A stored course grade is recomputed automatically, in the same save, when Faculty delete an assessment, save the grading setup of that class, or re-enroll a previously unenrolled Student; a re-enrolled Student keeps their earlier scores and remedial history and their grade and retention status are recomputed from them. Past school-year classes are not recomputed. The Dean report flags a failing retention by the recorded course grade, not by re-converting the percentage with the current table.
>
> Owner-approved amendment (2026-10-26): Official BUCDM grade sheet calculation. The Dean's official grade sheet is the calculation authority for every Faculty. For current-term grades it replaces the exact-value rule of 2026-10-12, the truncation and Midterm below-75% rule of 2026-10-17, and the rounding rule of 2026-10-22. (1) A category percentage is the plain average of its assessments' effective percentages (GRD-001 transmutation applies per assessment); maximum points do not weight the average. (2) A component's period grade is the weighted sum of its category percentages, rounded to a whole percent (.5 rounds up). (3) With Lecture and Laboratory, a period grade is round(Lecture period grade × Lecture share + Laboratory period grade × Laboratory share), and the course grade is round(round(Midterm × Midterm share) + round(Final × Final share)). (4) A whole percent converts with the 2026-10-17 table (99–100 = 1.0 … 75 = 3.0); below 75% is 5.0 for Midterm, Final and course grades. (5) Hovering, focusing or tapping a grade shows its steps, e.g. "83.77% → 84% → 2.5"; this replaces the 2026-10-12 hover sentence. (6) Unchanged: a missing score keeps the dependent grade incomplete and never becomes zero; the remediation trigger is 2.50 or worse (84% or below); the Midterm Watchlist and Advisory use these grades; grades saved in closed school years stay as recorded. At release, every current-term course grade is recalculated once with these rules as one audited batch. Lecture-only courses are out of scope until added by amendment.
>
> Owner-approved amendment (2026-11-13): This amendment clarifies the current remedial, cost-recovery, transmutation and saved-record behavior. The 2.5–4.9 completed-final-grade remedial eligibility rule applies to every course type. A 5.0 is not eligible for DentiSys remedial attempts; irregular reenrollment is handled in person outside DentiSys and the displayed retention status is “Irregular reenrollment,” derived from the grade without changing saved records or schema. Each of up to two remedial attempts passes at a raw score of 75% or higher. Below 75% on attempt 1 permits attempt 2; failure of attempt 2 moves the student to cost recovery. Every course type shows remedial remarks. Cost recovery accepts a final grade from 1.0 to 5.0 in one-decimal increments; 1.0–2.4 passes and 2.5–5.0 fails. Excess precision is rejected when submitted. These results never replace the original course grade. The 2026-09-28 professional-course qualifier and the 2026-09-26 50% remedial threshold are superseded.
>
> Transmutation remains optional per assessment and uses the fixed formula in GRD-001. Attendance handling remains: Absent is 0%; Present, Late and Excused use the formula; unresolved linked attendance and missing scores remain incomplete; no link or a revoked session means attendance is not considered. Admin and Faculty cannot edit transmutation bounds. Legacy bounds remain stored for compatibility and do not affect calculations; compatibility responses report 50% and 100%. The Reports bundle spreadsheet and print view show effective transmuted percentages, not raw percentages.
>
> No existing grade, remedial outcome or cost-recovery outcome is bulk-recalculated or rewritten to apply this amendment. New writes and future computations use the clarified rules. A read-only review report identifies stored remedial attempts against 5.0 grades, remedial outcomes inconsistent with the 75% threshold, cost-recovery rows affected by the one-decimal/2.4 boundary, and assessments with legacy custom bounds. This supersedes the 2026-10-26 release-time batch recalculation instruction; preserved history is not backfilled.
>
> Owner-approved amendment (2026-10-17): Midterm Watchlist and Advisory. Faculty see "Midterm Watchlist" and Students see "Midterm Advisory". Both flag a student only when every Midterm assessment is graded, no final course grade exists, and the Midterm grade, using the professor's Midterm category weights and lecture/laboratory split, is 2.5 or worse. The projected risk level no longer flags a student before the Midterm is complete; it stays as the badge on a flagged student. This supersedes the 2026-10-03 advisory rule.
>
> Owner-approved amendment (2026-10-17): Risk has no levels. A student is either At Risk or not flagged; High, Low and other risk levels are not shown. A flagged student on the Midterm Watchlist or Midterm Advisory shows At Risk. The assumed-assessment projection (2026-09-29) is retired, and the Retention Watchlist has no Risk column. Reports show At Risk or nothing instead of risk levels. This supersedes the 2026-09-29 risk levels, the 2026-10-12 badge rule, and the badge sentence of the 2026-10-17 Midterm Watchlist amendment.
>
> Owner-approved amendment (2026-10-17): Computed retention only. Retention status comes only from system calculations: Active, Remedial (final grade 2.50 or worse), Cleared, and Archived. Faculty cannot set or override it by hand. Warning and Critical are retired. Existing manual overrides revert to the computed status; the audit log keeps their history. The Admin At-Risk Count is students who are Remedial or At Risk on a Midterm Watchlist. This supersedes the manual override rules and "Warning and Critical remain separate, manually set retention states".
>
> Owner-approved amendment (2026-10-17): The midterm tab ends with the term. Per course, once a final course grade or any remedial record exists, the course leaves the Midterm Watchlist and Midterm Advisory; it appears on the Retention Watchlist only if it is Remedial. Other courses still in their Midterm are unaffected. Student and Faculty dashboard midterm counts use the same rule as the midterm tabs.
>
> Owner decision (2026-10-12): In Single Activity View, an Auto-save toggle controls automatic saving. Owner decision (2026-10-17): When it is on, scores save after 10 seconds without typing, and also when Faculty switch assessment or view, leave the page, or press Save; when it is off, only the Save button saves. Full Matrix View always auto-saves the same way. Clearing a saved score is applied only by a manual Save (Save Scores Sheet or Save All Matrix Scores); until then the field is highlighted in amber and the Save button shows "(N to clear)". A save requested while another save is running runs right after it, and a manual Save stays manual. The browser warns before Faculty leave the page with unsaved or failed scores, including during the 10-second wait.
>
> Owner decision (2026-10-12): The Single Activity View Auto-save setting is remembered in this browser across page reloads; it starts on until Faculty change it.
>
> Owner decision (2026-10-12): In Single Activity View, switching assessment, class or course while scores are unsaved (Auto-save off, or a cleared saved score awaiting Save) asks "Discard unsaved scores?"; Cancel keeps the current assessment and its typed scores.
>
> Owner decision (2026-10-12): Changing the period or category filter so the current assessment leaves the list asks "Discard unsaved scores?" while scores are unsaved; Cancel keeps the filter. The search box never switches the assessment while scores are unsaved; the current assessment stays selected and is listed as "Current:".
>
> Owner decision (2026-10-12): The save chip next to Save Scores Sheet and Save All Matrix Scores shows the save state: "Saving...", "Save failed", "Unsaved changes" or "All changes saved".
>
> Owner decision (2026-10-12): In Single Activity View and Full Matrix View, auto-save saves every valid score and holds back only scores that are negative or over the assessment maximum; those stay red and unsaved until fixed. A manual Save still refuses while any score is invalid.

**Proposed text**

Delete line 1180 (the lock and manual-unlock rule is replaced by the Watchlist paragraph below).

Replace line 1184 with:

````markdown
The Faculty retention page labels its computed final-grade view "Retention Status". "Midterm Watchlist" remains the separate early warning list.
````

Replace lines 1186-1218 with:

````markdown
The 2.50 course-grade trigger is fixed college policy, is not an Admin setting, and applies to completed final course grades; on the BUCDM table it means 84% or below. Missing or incomplete grades remain unresolved. Completed final course grades 2.5 through 4.9 are eligible for DentiSys remedial attempts, for every course type. A grade of 5.0 is not eligible: irregular reenrollment is handled in person outside DentiSys, and the displayed retention status is "Irregular reenrollment", derived from the grade without changing saved records or schema. DentiSys records the first and second remedial attempts separately and offers no third. Each attempt passes at a raw score of 75% or higher, and Pass/Fail is derived from the stored percentage. Below 75% on attempt 1 permits attempt 2; failure of attempt 2 moves the student to cost recovery. Every course type shows remedial remarks. Cost recovery accepts a final grade from 1.0 to 5.0 in one-decimal increments; 1.0–2.4 passes and 2.5–5.0 fails; excess precision is rejected when submitted. Remedial and cost-recovery outcomes never replace the original course grade.

Retention status comes only from system calculations: Active, Remedial (final grade 2.50 or worse, except that 5.0 shows "Irregular reenrollment"), Cleared, and Archived. Faculty cannot set or override it by hand. Warning and Critical are retired. Existing manual overrides reverted to the computed status; the audit log keeps their history. The Admin At-Risk Count is students who are Remedial or At Risk on a Midterm Watchlist.

Faculty see "Midterm Watchlist" and Students see "Midterm Advisory". Neither has a lock or a manual unlock. Both flag a student only when every Midterm assessment is graded, no final course grade exists, and the Midterm grade, using the professor's Midterm category weights and lecture/laboratory split, is 2.5 or worse (84% or below). A flagged student shows "At Risk". There are no risk levels (High, Low and others are not shown), no assumed-assessment projection, and no Risk column on the Retention Watchlist; Reports show At Risk or nothing. Per course, once a final course grade or any remedial record exists, the course leaves the Midterm Watchlist and Midterm Advisory; it appears on the Retention Watchlist only if it is Remedial. Other courses still in their Midterm are unaffected. Student and Faculty dashboard midterm counts use the same rule as the midterm tabs. Missing or insufficient assessment data remains Pending/Unavailable. The Advisory is informational and never assigns remediation or changes the final-grade 2.50 trigger.

The Dean's official BUCDM grade sheet is the calculation authority for every Faculty. (1) A category percentage is the plain average of its assessments' effective percentages (GRD-001 transmutation applies per assessment); maximum points do not weight the average. (2) A component's period grade is the weighted sum of its category percentages, rounded to a whole percent (.5 rounds up). (3) With Lecture and Laboratory, a period grade is round(Lecture period grade × Lecture share + Laboratory period grade × Laboratory share), and the course grade is round(round(Midterm × Midterm share) + round(Final × Final share)). For a lecture-only course the period grade is the Lecture period grade and the course grade is round(Midterm × Midterm share + Final × Final share), rounded once (GRD-003). (4) A whole percent converts to a grade with this table: 99–100 = 1.0, 98 = 1.1, 97 = 1.2, 96 = 1.3, 95 = 1.4, 94 = 1.5, 93 = 1.6, 92 = 1.7, 91 = 1.8, 90 = 1.9, 89 = 2.0, 88 = 2.1, 87 = 2.2, 86 = 2.3, 85 = 2.4, 84 = 2.5, 82–83 = 2.6, 80–81 = 2.7, 78–79 = 2.8, 76–77 = 2.9, 75 = 3.0 (passing). Below 75% is 5.0 for Midterm, Final and course grades. Server and client use the same conversion. (5) Hovering, focusing or tapping a grade shows its steps, e.g. "83.77% → 84% → 2.5". (6) A missing score keeps the dependent grade incomplete and never becomes zero; the Midterm Watchlist and Advisory use these grades; grades saved in closed school years stay as recorded.

A stored course grade is recomputed automatically, in the same save, when Faculty delete an assessment, save the grading setup of that class, or re-enroll a previously unenrolled Student; a re-enrolled Student keeps their earlier scores and remedial history and their grade and retention status are recomputed from them. Past school-year classes are not recomputed. The Dean report flags a failing retention by the recorded course grade, not by re-converting the percentage with the current table. No existing grade, remedial outcome or cost-recovery outcome is bulk-recalculated or rewritten to apply the current calculation and remedial rules; new writes and future computations use them. A read-only review report identifies stored remedial attempts against 5.0 grades, remedial outcomes inconsistent with the 75% threshold, cost-recovery rows affected by the one-decimal/2.4 boundary, and assessments with legacy custom bounds. Preserved history is not backfilled.

Transmutation remains optional per assessment and uses the fixed formula in GRD-001. Attendance handling remains: Absent is 0%; Present, Late and Excused use the formula; unresolved linked attendance and missing scores remain incomplete; no link or a revoked session means attendance is not considered. Admin and Faculty cannot edit transmutation bounds. Legacy bounds remain stored for compatibility and do not affect calculations; compatibility responses report 50% and 100%. The Reports bundle spreadsheet and print view show effective transmuted percentages, not raw percentages.
````

Replace lines 1220-1222 with:

````markdown
In Single Activity View, an Auto-save toggle controls automatic saving. The setting is remembered in this browser across page reloads and starts on until Faculty change it. When it is on, scores save after 10 seconds without typing, and also when Faculty switch assessment or view, leave the page, or press Save; when it is off, only the Save button saves. Full Matrix View always auto-saves the same way. Clearing a saved score is applied only by a manual Save (Save Scores Sheet or Save All Matrix Scores); until then the field is highlighted in amber and the Save button shows "(N to clear)". A save requested while another save is running runs right after it, and a manual Save stays manual. The browser warns before Faculty leave the page with unsaved or failed scores, including during the 10-second wait.
````

In lines 1224, 1226, 1228 and 1230, delete the prefix "Owner decision (2026-10-12): " (find `Owner decision (2026-10-12): In ` replace `In `; and for 1226 `Owner decision (2026-10-12): Changing` replace `Changing`; for 1228 `Owner decision (2026-10-12): The save chip` replace `The save chip`). Add at the end of the section (after line 1230):

````markdown
History: 2026-09-26 to 2026-10-09 remedial rules, risk levels and provisional conversion; 2026-10-12 no lock, auto-save rules; 2026-10-17 BUCDM table, no risk levels, computed retention, 10-second auto-save; 2026-10-22 recompute triggers; 2026-10-26 official grade sheet calculation; 2026-11-13 remedial clarification, no bulk recalculation. Records: docs/archive/.
````

**What is dropped (each with the superseding decision)**
- 1180 lock and manual unlock; 1192 "A manual watchlist unlock changes visibility only": superseded by 1194 (2026-10-12, "no lock and no manual unlock ... supersedes the 2026-09-24 lock/unlock rule") (X10).
- 1186 (2026-09-28) "Grade 5.0 follows the in-person irregular reenrollment path" and "(superseded in part by 2026-11-13)": kept, folded with 1206. 1188 (2026-09-26) "first and second attempts, no third, failure of second requires cost recovery" kept; the 50% threshold (superseded by 2026-11-13 "75%") and the 2026-09-28 professional-course qualifier are dropped (X11).
- 1190 (2026-09-29) risk levels High/At Risk/Low, the assumed-assessment projection, "Risk is informational", "Warning and Critical remain separate, manually set retention states": superseded by 1214 (2026-10-17 "Risk has no levels", "projection retired") and 1216 ("Warning and Critical are retired") (X12).
- 1192 (2026-10-03) High and At Risk show the advisory, Low does not: superseded by 1212 and 1214 (2026-10-17).
- 1194 (2026-10-12) "badge shows the server risk level ... otherwise High if 3.00 or worse" and "At-risk students are listed first": the badge sentence is superseded by 1214; the listing order has no remaining meaning with a single flag (see Q4).
- 1196 (2026-10-09) linear interpolation, "stored and displayed rounded to two decimals", "80.00% or below reaches 2.50": superseded by 1200 (2026-10-17 table) and 1204 (2026-10-26).
- 1198 (2026-10-12) exact values through every step and the "exact grade and percentage" hover: replaced by 1204 ("replaces the exact-value rule ... this replaces the 2026-10-12 hover sentence").
- 1200 (2026-10-17) truncation to a whole percent and Midterm grades 3.1 to 4.0 below 75%, "'80% or below' becomes '84% or below'": replaced by 1204 ("replaces ... the truncation and Midterm below-75% rule") and by the retirement of risk levels.
- 1202 (2026-10-22) "rounded to two decimals first, then truncated": replaced by 1204 (rounding rule). Kept: the automatic recompute triggers and the Dean-report rule.
- 1204 "At release, every current-term course grade is recalculated once ... as one audited batch" and "Lecture-only courses are out of scope until added by amendment": the batch is superseded by 1210 (2026-11-13); lecture-only is covered by GRD-003 (2026-10-26), so one line was added to calculation rule (3).
- 1216 "Remedial (final grade 2.50 or worse)": adjusted for 5.0, which 1206 (2026-11-13) shows as "Irregular reenrollment".
- 1220 and 1222: merged; 1224-1230 are unchanged apart from dates.

**Code check:** no lock or unlock and no High/Low in `frontend/src/pages/faculty/RetentionMonitoring.tsx:74,899,911,993` (2.5 or worse, 84% or below); BUCDM table, whole-percent rounding and below 75% = 5.0: `frontend/src/utils/gradeHelper.ts:22-39`; lecture-only single rounding `GradeComputation.tsx:2959-2965`; computed retention and 5.0 label `backend/app/remedial_attempts.php:107-130`; auto-save 10 s `frontend/src/tests/periodGradingContract.test.ts:1121`. Remedial 75% and cost-recovery 1.0-2.4: audit cites `RetentionMonitoring.tsx:686-722`; server-side rounding and release-time batch: not verified in `backend/`.

**Owner questions**
- Q4: (a) 1194 says "At-risk students are listed first". With risk levels retired every flagged student is At Risk, so the proposal drops it. Options: drop (proposed), or keep a list order such as "worst Midterm grade first". (b) The proposal keeps "Missing or insufficient assessment data remains Pending/Unavailable" (2026-10-03) because 2026-10-17 supersedes only the advisory rule; confirm it still applies.

---

## 18. UI-004 - Email and invitations (X1)

**Lines:** 1234-1236. **Kind:** both (1234 still says "does not impose a single-domain restriction").

**Current text**

*Lines 1234-1236:*

> All email-entry controls default to `@bicol-u.edu.ph`, allowing local-part-only entry. Complete existing addresses and other server-allowed domains remain supported under AUTH-004. Preserve addresses and prevent duplicated suffixes; this default does not impose a single-domain restriction.
>
> Owner-approved amendment (2026-11-09): Only `@bicol-u.edu.ph` is accepted. A complete address from any other domain, including `gmail.com`, is rejected; email fields may still accept a local part and append the official domain. This supersedes the multi-domain sentence above.

**Proposed text**

Replace lines 1234-1236 with:

````markdown
All email-entry controls default to `@bicol-u.edu.ph`, allowing local-part-only entry. Only `@bicol-u.edu.ph` is accepted (AUTH-004): a complete address from any other domain, including `gmail.com`, is rejected; email fields may still accept a local part and append the official domain. Preserve addresses and prevent duplicated suffixes.

History: original multi-domain wording; 2026-11-09 single official domain only. Records: docs/archive/.
````

Place the History line after the last UI-004 paragraph (the "Faculty invitations follow the PDF's structured name fields ..." paragraph) if the Owner wants one History line per section.

**What is dropped:** "Complete existing addresses and other server-allowed domains remain supported under AUTH-004" and "this default does not impose a single-domain restriction": superseded by 1236 ("This supersedes the multi-domain sentence above").

**Code check:** `backend/app/config.php:170`; `frontend/src/pages/auth/SsoLogin.tsx` email field. Agrees.

---

## 19. UI-005 - Attendance and Secretary context

**Lines:** 1246-1248. **Kind:** both (2026-10-10 Sessions view with past sessions, Roll call view and quick timing choices; 2026-10-12 Assigned Classes grid, Worksheet, no past-sessions list, no quick choices). Not on the audit list.

**Current text**

*Lines 1246-1248:*

> Owner decision (2026-10-10): Attendance Monitoring separates session management from student records. A Sessions view shows the live session, upcoming sessions with Edit and Revoke, and past sessions, plus a "New attendance session" action placed apart from every session list. A Roll call view shows student attendance for a selected session. The Secretary uses the same structure. Session timing may be entered with quick choices or custom values that keep the window lengths when the opening time changes, and exact times are always available; timing validation is unchanged.
>
> Owner-approved amendment (2026-10-12): Attendance Monitoring shows an Assigned Classes grid and a Worksheet for the selected class. A session modal has two tabs: Current Session, and Upcoming Sessions with countdowns. There is no past-sessions list. Session timing uses exact times only; quick choices are removed. The Secretary sees the same layout in the blue palette. Timing validation and the other ATT rules are unchanged.

**Proposed text**

Replace lines 1246-1248 with:

````markdown
Attendance Monitoring shows an Assigned Classes grid and a Worksheet for the selected class (the roll call of student attendance), plus a "New attendance session" action placed apart from every session list. A session modal has two tabs: Current Session, and Upcoming Sessions with countdowns; upcoming sessions have Edit and Revoke. There is no past-sessions list. Session timing uses exact times only (quick choices are removed); timing validation is unchanged. The Secretary uses the same structure in the blue palette.

History: 2026-10-10 Sessions and Roll call views; 2026-10-12 Assigned Classes grid, Worksheet, two-tab session modal. Records: docs/archive/.
````

**What is dropped:** "past sessions" in the Sessions view, "quick choices or custom values that keep the window lengths when the opening time changes" (2026-10-12: "There is no past-sessions list", "quick choices are removed"); "A Roll call view shows student attendance for a selected session" is replaced by the Worksheet (see Q7).

**Code check:** `frontend/src/pages/faculty/AttendanceMonitoring.tsx:157-170` has the worksheet; "Assigned Classes", "Upcoming Sessions" and the modal tabs were not located by text search (not verified).

**Owner question Q7:** the 2026-10-12 amendment does not say whether the 2026-10-10 "Roll call view" (student attendance for a selected session) still exists apart from the Worksheet. Other rules still say "roll call" (ATT-006, UI-001). Options: (a) the Worksheet is the roll call (proposed); (b) keep a separate Roll call view and reword the paragraph; (c) the Owner states the layout.

---

## 20. CLS-002 - Current-year creation and historical classes

**Lines:** 1252-1254. **Kind:** stack (one added restriction).

**Current text**

*Lines 1252-1254:*

> Faculty may create classes only for the current school year. Past-school-year classes are view-only: Faculty cannot edit them, add students, or perform other mutations through those historical class surfaces. This narrows CLS-001's editing permission to eligible current-year classes. Obtain the current year from authoritative configuration, not the browser clock. The Owner selected 2026-2027 as the current school year on 2026-09-24. Any historical correction exception requires a separately approved rule. Class creation additionally requires a Dean-defined term (ACA-002).
>
> Owner decision (2026-11-06): Faculty cannot create a class in a term that has already ended (Asia/Manila).

**Proposed text**

In line 1252, replace the last sentence "Class creation additionally requires a Dean-defined term (ACA-002)." with:

````markdown
Class creation additionally requires a Dean-defined term (ACA-002) that has not already ended (Asia/Manila).
````

Delete line 1254 and add after line 1252:

````markdown
History: 2026-11-06 no class in a term that has already ended. Records: docs/archive/.
````

**What is dropped:** nothing; line 1254 is folded into the sentence above.

**Code check:** not verified.

---

## 21. ROOM-001 - Dean-managed rooms

**Lines:** 1289-1295. **Kind:** both (1295 "replaces the retire and delete rules above").

**Current text**

*Lines 1289-1295:*

> Owner decision (2026-11-05): The Dean manages the list of rooms: name (unique, ignoring case and extra spaces), group, and an optional location and radius. Faculty and Secretaries pick rooms from this list or type a custom room; classes and sessions keep the room name they saved. Renaming a room also renames it in classes, class meetings and scheduled sessions; sessions that already opened or ended keep the old name. The Dean may retire a room, which removes it from room lists. Classes and sessions already using it keep it, labelled "(retired)", with a warning where a room can be picked; saving is never blocked. A retired room can be restored. Only a retired room that no class, class meeting or session has ever used can be deleted. Retiring, deleting and renaming a room in use always ask for confirmation first. Picking a room with a saved location fills the session location and radius; geofence stays off until turned on (ATT-002). Every room change is audited.
>
> Owner decision (2026-11-06): Room groups are called categories and are their own list. The Dean may create, rename, retire, restore and delete categories. A room is added to, or restored into, an active category. A category can be retired only after all its rooms are retired, and deleted only when it has no rooms. The starting list is CDM-1, CDM-2 and CDM-3 in the category Lecture/Laboratory; the earlier starting rooms are removed, and classes that use their names keep them as typed rooms.
>
> Owner decision (2026-11-06), renaming: Only an active room can be renamed. A rename changes classes of the current and future school years, their class meetings, and sessions not yet opened. Sessions already opened, and everything in past school years, keep the old name. Each affected Faculty gets one in-app notice.
>
> Owner decision (2026-11-06), retiring and deleting (replaces the retire and delete rules above): A retired room cannot be picked, or typed as a custom room. A room is in use while a class whose term has not ended, its class meetings, or a session not yet opened uses it. When a room is retired, each Faculty with such classes or sessions gets one in-app notice listing them. The class and session edit forms cannot be saved until a retired room is changed; roster, attendance, grades and starting sessions keep working. A scheduled session in a retired room still opens on time, and Faculty and Secretary see a warning. Attendance corrections on sessions that already opened are not affected. Restoring a room changes nothing back and sends no notice. A retired room can be deleted only when it is not in use; past classes and sessions keep its name. Room notices go to the class's Faculty only; retiring or renaming a category sends none.

**Proposed text**

Replace lines 1289-1295 with:

````markdown
The Dean manages the list of rooms: name (unique, ignoring case and extra spaces), category and an optional location and radius. Faculty and Secretaries pick rooms from this list or type a custom room; classes and sessions keep the room name they saved. Picking a room with a saved location fills the session location and radius; geofence stays off until turned on (ATT-002). Every room change is audited.

Room categories are their own list. The Dean may create, rename, retire, restore and delete categories. A room is added to, or restored into, an active category. A category can be retired only after all its rooms are retired, and deleted only when it has no rooms. The starting list is CDM-1, CDM-2 and CDM-3 in the category Lecture/Laboratory; classes that used earlier starting rooms keep them as typed rooms. Retiring or renaming a category sends no notice.

Renaming: only an active room can be renamed. A rename changes classes of the current and future school years, their class meetings, and sessions not yet opened. Sessions already opened, and everything in past school years, keep the old name. Each affected Faculty gets one in-app notice.

Retiring and deleting: a retired room cannot be picked, or typed as a custom room, and is removed from room lists. A room is in use while a class whose term has not ended, its class meetings, or a session not yet opened uses it. When a room is retired, each Faculty with such classes or sessions gets one in-app notice listing them. The class and session edit forms cannot be saved until a retired room is changed; roster, attendance, grades and starting sessions keep working. A scheduled session in a retired room still opens on time, and Faculty and Secretary see a warning. Attendance corrections on sessions that already opened are not affected. A retired room can be restored; restoring changes nothing back and sends no notice. A retired room can be deleted only when it is not in use; past classes and sessions keep its name. Retiring, deleting and renaming a room in use always ask for confirmation first. Room notices go to the class's Faculty only.

History: 2026-11-05 Dean-managed rooms; 2026-11-06 categories, rename rules, retire and delete rules replaced. Records: docs/archive/.
````

**What is dropped**
- 1289 "Renaming a room also renames it in classes, class meetings and scheduled sessions; sessions that already opened or ended keep the old name": replaced by the 2026-11-06 renaming rule (current and future school years, sessions not yet opened).
- 1289 "Classes and sessions already using it keep it, labelled '(retired)', with a warning where a room can be picked; saving is never blocked" and "Only a retired room that no class, class meeting or session has ever used can be deleted": replaced by 1295 ("replaces the retire and delete rules above": forms cannot be saved until changed; deletable when not in use).
- 1289 "room group ... group": renamed "category" by 1291. "the earlier starting rooms are removed" kept as the typed-rooms sentence.

**Code check:** saving blocked for a retired room `frontend/src/pages/faculty/ClassesAndRosters.tsx:819-870`, `AttendanceMonitoring.tsx:697`, `StartSessionModal.tsx:194`; `backend/app/room_rules.php:11-17`; no "(retired)" label in code. Agrees with the latest decision.

---

## 22. Section 11 - Current Specification Supersessions (X16)

**Lines:** 1317-1330. **Kind:** contradiction (a one-time list of supersessions written in the future tense; each point already holds elsewhere).

**Current text**

*Lines 1317-1330:*

> # 11. Current Specification Supersessions
>
> Upon Owner approval of this specification:
>
> * Any roadmap statement describing Google as a **replacement** for password authentication is superseded.
> * The approved direction is **password authentication + Google Sign-In**.
> * Faculty and Student account establishment MUST require an authorized invitation and DentiSys password.
> * Google may be linked only after activation (REG-003); it MUST NOT provide invitation authority or enable public signup.
> * Google-linked users MUST retain email + password login capability.
> * The previous BIO-001 placeholder wording, insofar as it left biometric product requirements unresolved, is superseded by BIO-001–BIO-010 and ATT-001–ATT-006. Those product requirements and boundaries are approved and implemented as a research prototype; the numeric thresholds and other technical selections listed in BIO-007 and §9, and the BIO-002 institutional review, remain deferred.
>
> Affected roadmap/documentation should be aligned before or together with implementation of Google authentication.
>
> ---

**Proposed text**

Delete section 11 (heading line 1317 to the end of the file, including the trailing `---`; the `---` at line 1315 that ends section 10 stays). Nothing is added.

**What is dropped, and where each point already lives**
- "Google replaces password authentication is superseded; direction is password + Google": AUTH-001 ("supplements password authentication; it does not replace it").
- "Faculty and Student account establishment MUST require an authorized invitation and DentiSys password": REG-001, REG-002.
- "Google may be linked only after activation (REG-003); no invitation authority or public signup": REG-001, REG-003, REG-004.
- "Google-linked users MUST retain email + password login": AUTH-001, AUTH-005.
- "BIO-001 placeholder wording superseded by BIO-001 to BIO-010 and ATT-001 to ATT-006 ... thresholds in BIO-007 and section 9 and the BIO-002 review remain deferred": BIO-007, section 9, BIO-008.
- "Affected roadmap/documentation should be aligned": a past action item.

**Code check:** no code depends on section 11. `Claude outputs/spec-amendments-2026-09-29.md:161` mentions it historically; `docs/sync-audit-2026-11.md:407` is this item.

---

## Owner questions

**Owner answers (2026-11-14):** Q1 keep, as an ordinary judgment-graded category (text above rewritten from the code); Q2 drop "provisional" (done above); Q3 checked in code: the 3 matching frames (BIOMETRIC_MATCH_COUNT) are counted among the 9 frames of one attendance attempt (8 forward-facing plus the action frame, `Attendance.tsx:760`, `biometric-sidecar/app.py:539-568`), and at least 3 of them must be usable; Q4 yes; Q6 yes; Q7 the Worksheet is the roll call (code: Assigned Classes cards open the class roll call, `AttendanceMonitoring.tsx:1010,1068`).

- **Q1 (entry 4, X7):** may Lecture/Laboratory courses still have one Attendance-source grading category? Proposed text says yes (code agrees: a category named "Attendance"). Options: keep, or retire it for all courses.
- **Q2 (entry 4):** is the lecture-only course-grade rule still provisional? Options: keep "provisional" or drop it.
- **Q3 (entry 7):** is "at least 3 matching frames" counted within the 8 usable frames of an attendance attempt?
- **Q4 (entry 17):** drop "At-risk students are listed first" and keep "Pending/Unavailable" for missing midterm data? Options: as proposed, or choose a list order.
- **Q6 (entry 15):** approve removing the completed "Delivery order" paragraph and the 9B "Implementation pending" status.
- **Q7 (entry 19):** is the Worksheet the roll call, or is there still a separate Roll call view?

## Where code differs from the latest spec decision

None that changes a rule. Notes: (1) production biometrics are "on by default" only through the provisioning script default (`scripts/provision-vps.ps1:299-302`); the app itself needs `BIOMETRIC_SIDECAR_ENABLED=true` (`config.php:238-251`). (2) `attendance_sessions.php:371` still carries a redundant "under 24 hours" check beside the 12-hour cap. (3) `scripts/provision-vps.ps1:295` still asks for `ALLOWED_EMAIL_DOMAINS` although `config.php:170` forces one domain.
