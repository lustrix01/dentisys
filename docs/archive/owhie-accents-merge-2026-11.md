# Owhie's landing and Faculty accent changes merged, November 2026

Owhie's commit `259ef32` ("ui: refine landing and faculty visual accents", 2026-11-11) on `owhie-responsive` was merged into `lighthal9-responsive` on 2026-11-15, with review fixes in the same merge commit. It was the only commit on that branch not yet merged. The Owner approved the result after a three-way comparison of every change.

- Three-way comparison (your branch, Owhie's branch, merged): [Owhie Accents Merge](https://claude.ai/artifact/Q7nD9DWzD53g374FJjCtMj)

## Taken as Owhie built it

- Sidebar brand: "Denti" plus "SYS" in the role colour; the subtitle "BU College of Dental Medicine" is no longer shown in capitals; the logo has no coloured shadow.
- Sidebar collapse button: a bare chevron without the grey box (same accessible name).
- Avatar: a round, solid role-colour circle (Faculty's was a green-to-purple gradient). The role label under the name is grey.
- Faculty Attendance section tabs use the Faculty green (`clinical`); `docs/frontend.md` Page patterns updated.
- About page: wider gaps in the first slide. Landing background: dotted grid removed.

## Changed or fixed during the merge

| Owhie's branch | Merged |
|---|---|
| Faculty class cards: Dean purple changed to Faculty green (course chip, icons, View roster, section and Class Secretary chips, email suffix) | Same green; the date line keeps our "S.Y." school-year format (the one conflict) |
| Contact page: Email, Location and Facebook cards; the map link carried Facebook tracking parameters (`fbclid`, `pc=FACEBK`, `FORM`, `mid`, `mkt`) | Same cards; map link trimmed to the address and coordinates; the two new-tab links say "(opens in a new tab)" to screen readers |
| Landing footer unchanged: Legazpi City, bu-cdm@bicol-u.edu.ph, (052) 480-0100, contradicting the new Contact page | Daraga and bu-dmd@bicol-u.edu.ph; phone removed |

## Owner rulings (2026-11-15)

- Contact details: Owhie's are correct (bu-dmd@bicol-u.edu.ph, Daraga), used on the Contact page and the footer.
- Phone number and office hours: removed everywhere.
- Everything else taken as Owhie built it.

## How it was checked

- `scripts/check.ps1` and `scripts/check-postgres.ps1` on the merged tree.
- Every added line of Owhie's checked present in the merge, except the tracking-parameter map link.
- Real-app screenshots of every changed spot on all three sides (Faculty and Dean, light and dark, desktop and phone) for the comparison page.

## Follow-ups

- The About page still says "Contact the Office of the College Secretary", which the Contact page no longer lists.
