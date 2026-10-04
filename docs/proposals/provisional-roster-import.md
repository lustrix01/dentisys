# Provisional roster import

Implementation authorized by the Owner on 2026-10-04. The source is a private,
semi-confirmed sample; neither it nor its personal data may be published or
included in repository fixtures. No official Registrar format is confirmed.

## Current implementation contract

- Faculty previews a text PDF matching the sample's table layout, or CSV, TSV
  or delimited TXT. Unsupported/scanned PDFs produce a clear error.
- Required import fields: complete student number, first name, last name and a
  valid institutional email from the server-configured allowed domains. Parse
  supplied emails; missing or invalid emails block that row until corrected.
  Preserve supplied contact, sex and individual year level.
  Middle name, prefix and suffix are optional. Do not invent missing values.
- Match existing database field limits without truncation. Map Male/Female to
  the existing M/F sex codes; other values must fit the existing one-character
  storage field or be corrected in preview.
- Keep the original full name visible during preview. Ambiguous splits require
  explicit user review; do not silently infer the middle name. Every PDF row
  begins unselected. Selecting a row confirms source/name review.
- Owner decision: flag possible crossed-out rows and leave them unselected
  until reviewed. Red horizontal marks are a best-effort signal, not an
  authoritative exclusion decision; users must inspect the source for markings
  that cannot be detected.
- Confirm the source class context against an existing assigned current-year
  class. No automatic course/class creation or academic-term mutation.
- Resolve existing student numbers to server database IDs. Enroll existing
  Students without overwriting their identity. Keep existing authentication,
  institutional-domain, history, audit and historical-class safeguards.
- Partial failures remain visible; successful rows are removed from the retry
  preview. Do not silently report the entire file as successfully imported.
- The PDF is processed locally in the browser; only selected student fields
  reach existing authenticated APIs. No original-file storage or uploads.
- Account invitations remain separate. Grade-sheet importing remains unchanged.

## Specification addition (explicitly approved by the Owner)

Insert the following rule before section 9B:

```markdown
## IMP-001 - Provisional Student roster imports
**Status: APPROVED**

Faculty may import Student roster records into an existing assigned current-year
class using a provisional supported layout. The interface MUST state "Official
format not confirmed"; a sample does not establish official Registrar compatibility.
Preserve complete Student numbers and supplied identity/contact values. Do not
invent missing emails or year levels, silently resolve ambiguous name splits,
overwrite existing Student identities, or create classes from imported headers.
Require preview and target-class confirmation before saving. Flag possible
crossed-out rows and leave them unselected until reviewed; marking detection is
best effort and the Faculty must review the source. Resolve existing Students
through server identities and preserve permissions, historical-class restrictions,
audit history, account eligibility and separate invitation authority. Process the
original file locally and send only selected Student fields to existing APIs.
Official Registrar compatibility and grade-sheet importing remain unconfirmed.

Each selected import row MUST supply a complete Student number, first name,
last name and a valid institutional email from the server-configured allowed
domains. Extract supplied emails from supported source files; missing or
invalid emails MUST block that row until corrected in preview. Never fabricate
an email or overwrite an existing Student's email; invitation sending remains
a separate authorized action.
```

The Owner separately approved this exact IMP-001 addition on 2026-10-04.
It is recorded in spec.md and the dated amendment log.

## Institutional email amendment (explicitly approved by the Owner)

The Owner requested required institutional email and email parsing on 2026-10-04.
The Owner separately approved the following exact IMP-001 addition on 2026-10-04.
It is recorded in spec.md and the dated amendment log:

> Each selected import row MUST supply a complete Student number, first name,
> last name and a valid institutional email from the server-configured allowed
> domains. Extract supplied emails from supported source files; missing or
> invalid emails MUST block that row until corrected in preview. Never fabricate
> an email or overwrite an existing Student's email; invitation sending remains
> a separate authorized action.
