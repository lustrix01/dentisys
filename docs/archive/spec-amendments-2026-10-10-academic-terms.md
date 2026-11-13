# Approved specification amendment: Dean-defined academic terms

Owner approval: 2026-10-10. Live testing on the DEL-001 VPS showed that face
enrollment failed with "Biometric enrollment requires an active academic term
with an end date": no screen ever set a class's `term_end_date` (only the
development seed did). The Owner asked for "the most reliable way that doesn't
need so many manual interactions", required edge cases (forgotten dates,
summer classes) to be handled, asked "shouldn't classes have the term dates set
by the dean?", chose that references follow a changed end date, chose an
in-app (not email) next-term reminder, and approved the exact text below with
"Yes".

## New section ACA-002 - Dean-defined academic terms

See spec.md ACA-002 (inserted before CLS-001).

## Added to CLS-002

> Class creation additionally requires a Dean-defined term (ACA-002).

## Added to BIO-005

> "Semester end" is the end date of the Dean-defined term (ACA-002).

## Consequences recorded for the Owner

- Faculty cannot create a class until the Dean has defined that term; "Copy
  previous school year" keeps this to a few seconds a year.
- Existing classes link to terms by semester and school year; nothing is
  recreated. On the VPS the Dean defines 1ST 2026-2027 once after release.
