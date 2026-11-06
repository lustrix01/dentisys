# UI polish, November 2026: changelog

A polish pass over the screens built in `0c69670` (room categories, the session overlap pop-up and the Secretary Requests tab), plus nearby rough spots on Academic Terms, Rooms, Classes and Attendance. Branch `lighthal9-responsive`; committed locally, not pushed.

## What changed

| Commit | What the user sees now |
|---|---|
| `ae2a6b6` | Titles (headings, dialog titles, tabs) are Title Case; buttons and chips stay sentence case. The Attendance tabs read "Assigned Classes \| Secretary Requests". The overlap pop-up shows one card per clash: class and title, a coloured "Booked session" or "Regular schedule" chip, grey "Same room" / "Same Faculty" chips, and one line with who, room, day and time. Its main button matches the Start session form (green for Faculty, blue for the Secretary), and several clashes scroll inside the pop-up. Secretary Requests shows dates as "Mon, Nov 2, 2026" and cutoffs in 12 h, lines its columns up on desktop, gives all filters the same height, greys out "Approve selected" until something is ticked, and keeps the count and both group buttons on one row on phones. On Rooms, Retire category is disabled with a hint while the category still has active rooms, and the Retired tab's hint says to move the classes first, then delete. "1 Student" instead of "1 Students". The Create Class term field takes its own row, so the term isn't cut off. The current school year card on Academic Terms is solid like the other cards. |

## Owner rulings

- Casing: Title Case only for titles (page, card and section headings, dialog titles, tabs). Buttons, chips, pills and links stay sentence case. Role names (Faculty, Secretary, Dean, Student) are always capitalised. Form labels follow the other labels in the same form.
- The Attendance tab is "Assigned Classes", the same words the page already uses.
- Retire category while it still has active rooms: disabled with a hint, the same pattern as a room's Delete.
- Overlap pop-up: the cards version, chosen over a tidied list.
- Cards keep the look of the system's other cards (solid background, no see-through tint).

## How it was checked

- A device audit over Terms, Rooms, Classes, Attendance, Secretary Requests and the Secretary page, before and after. The 224 too-small tap targets and the squeezed "Approve selected" on Secretary Requests are gone, and no new findings appeared.
- Before/After demo from real screenshots, approved by the Owner: https://claude.ai/artifact/Uc1YMbct2JUbCMUMxVYhKN
- `./scripts/check.ps1` (280 mocked UI tests) and `./scripts/check-postgres.ps1` (integration plus 15/15 live) passed.

## Lessons

- One casing rule for every label overshoots: the Owner wants Title Case only where something is a title.
- A see-through tint changes pixels by less than the demo check's threshold. The check now warns about it ("faint change, check it by eye") instead of failing.
- Stashing and restoring for Before shots can leave line-ending-only changes in unrelated files. Restore those before staging.

Left for the backlog: see [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md) section 9.6.
