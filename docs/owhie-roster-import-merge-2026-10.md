# Owhie's roster import changes merged, October 2026

Owhie's branch `owhie-responsive` (`9fe007d`, one commit on top of `ee4a376`) was merged into `lighthal9-responsive` on 2026-10-28. The defects found in review were fixed in the same merge. The Owner approved the result after a three-way comparison of every change. Two Owner rulings made during the review ("Sex" instead of "Gender", middle-name split) follow in a separate commit.

- Review of his branch (Before/After, verdict per change): [Owhie Roster Import Review](https://claude.ai/artifact/54rwdACY7xV9DvpehmNvhm)
- Three-way comparison (your branch, Owhie's branch, fixed merge): [Owhie Roster Import Merge Comparison](https://claude.ai/artifact/7LzphwnGbLNqSRe6J6PQv7)

## Taken as Owhie built it

- Import Roster dialog titled "Class Details & Student Roster Import", with normal-case labels and "(Current year)" marked in the term list.
- One card per student with labelled fields instead of the wide table (readable on phones).
- New-class errors beside each field; overlapping meetings outlined, with advice to change the day or time.
- No "Official format not confirmed" label; the grey note appears once a file is chosen (Owner: imports are confirmed).
- The file box hides once a file is read (N3).
- Solid background on every dialog instead of see-through glass (N2).
- A past-year class list can create a class once the Faculty picks a current-year term (N1; spec IMP-001 and class-from-class-list N3–N5).
- Biometric sidecar Dockerfile creates `/app/models`.

## Changed or fixed during the merge

| Owhie's branch | Merged |
|---|---|
| "Target class section" removed: the Faculty never saw which class the students went into | Hidden until a file is read, then shown with the picked class (Owner ruling) |
| "Select all visible" ticked crossed-out and name-review rows and marked them reviewed | Flagged rows are skipped and stay one-by-one |
| Flagged rows lost "Review the source and name fields before selecting this row." | Message restored |
| Past-year file: "ask the Dean to add" a term the Dean already has, shown twice | One message: "This file is for AY X. Choose a Y term to create the class here." |
| Missing room reported twice | Only "Enter a room." under each empty room |

## Follow-up commit (Owner rulings, 2026-10-28)

- "Sex" instead of "Gender" on student cards, the error message, the sample CSV and the class-list export. Registrar files headed "Gender" still import.
- "Last, First Middle": the last given word is the middle name ("Dechavez, Mickole Romero" → First Mickole, Middle Romero). Particles stay with it ("Dela Cruz", "De La Cruz"), and Jr./Sr./II–V go to Suffix. The Faculty still reviews every split.

## Owner rulings

- Imports are confirmed: no import file shows "Official format not confirmed" (spec IMP-001, official-imports P6).
- The target class is shown only after a file is read.
- N1, N2 and N3 approved as Owhie built them.
- Sex, not gender; middle name taken from the last given word.

## How it was checked

- Type check; 214 unit tests; 250 mocked browser tests (tests updated only where an approved change moved or renamed a control; new checks for flagged rows, Select all and the target class); live specs updated the same way; `scripts/check.ps1`; `scripts/check-postgres.ps1`.
- Every line Owhie added was compared with the merged code. Apart from class names, only the items in the table above differ.
- Real screenshots of all three versions with the same fixed API answers, pixel-compared so that "as-is" items match Owhie's version and changed items differ.
