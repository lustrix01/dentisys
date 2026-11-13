# Review of the 11–13 November work, November 2026

Claude reviewed the four commits made while it was unavailable: DeepSeek's `3d4f234` and `d3a3db8`, and Codex's `276b037` and `345b328`. Both gates (`check.ps1` and `check-postgres.ps1`) passed on `345b328`. The Owner approved the 2026-11-13 spec amendments and the visible changes, shown in the [Before/After demo](https://claude.ai/artifact/W1qHudotfjA6bMLnhDdkj6).

## Fixes from the review

- **No grade recalculation on promotion.** `scripts/promote-prod.ps1` no longer runs `recompute-current-grades.php apply` after each production promotion; `docs/release-guide.md` says so. The step was added for the 2026-10-26 release only, and the 2026-11-13 amendment forbids bulk recalculation. The single run on 13 November touched only current-term classes, which recalculate on every Faculty save anyway, and it is in the audit log (`grades_recomputed`).
- **A6, Academic Terms year header.** At 320 px "Current S.Y." dropped alone onto a second line. Below 360 px the header gap, side padding and chip padding are tighter, so the year, the term count and "Current S.Y." stay on one line. Wider screens are unchanged.
- **A7, Dean Reports drill-down header.** On every phone, on iPad and on a 1280 px laptop, Export Excel and Print PDF ran past the edge of the card. The header, filter group and filter row of all three drill-downs (Students, Retention, Attendance) now wrap, so the two buttons move together onto their own line inside the card when they do not fit.

- **B1, assessment dialog category (ticket T10 follow-up).** Confirm assessment no longer greys out while no grading category is picked. Pressing it marks Category Type with "Choose a grading category.", the same field-error pattern as the title and maximum score.
- **B2, roster import error once (ticket T3 follow-up).** An unreadable file no longer shows a pop-up banner on top of the dialog's own message, so the error appears once and stays.
- **C1, Retention Monitoring on phones (FAC-02).** Below 768 px the Retention Status, Remedial Progression and Midterm Watchlist tables use the roster's phone-block pattern: each row is a card with every field and action, student numbers never break, and grades carry a short visible label. Tablet and desktop are unchanged (desktop pixel-identical).
- **Test clean-up.** Removed a leftover "TEMP visual check" from `e2e/secretary.spec.ts` that saved screenshots to the temp folder on every run.

## Ticket batch 1 check (2026-11-13)

Claude re-checked the 11 tickets on the running app at iPhone SE and iPhone 13 mini sizes.

| Ticket | Result |
|---|---|
| T1 grade formula | Fixed: fixed `× 50 + 50`; a stored 0–50 range can no longer apply. New assessments still default to transmutation off (open Owner decision). |
| T2 password length | Fixed: 8–32 characters on every form and on the server. |
| T3 wrong file layout | Fixed: a lasting message per cause; shown once since B2. |
| T4 idle session | The early sign-out cause (10–25 minutes on polling pages) is fixed and covered by unit tests. A live 17-minute idle run stayed signed in, but the page had stopped polling before the token expired, so the renewal path was not exercised live. Full Matrix draft protection is still undecided. |
| T5 / FAC-02 iOS sideways scroll | Fixed in C1: on phones the three Faculty Retention Monitoring lists show each row as a card (Owner-approved UI-001 amendment, 2026-11-13). Before, only 4 of 7 columns fit at 375 px and the grade, state and action buttons were off-screen with no visible scroll bar on iPhones. |
| T6 Back to classes | Fixed: Back sits above the class name; nothing is cut at 320 or 375 px. |
| T7 create session button | Fixed: Start session when idle, Schedule session while live. |
| T8 4.84 threshold | Replaced by the 2026-11-13 amendment (2.5–4.9 remedial, 5.0 irregular reenrollment). |
| T9 session after browser close | Closed by the Owner: no change. |
| T10 blank maximum score | Fixed; the missing-category gap is fixed in B1. |
| T11 remedial pass 75% | Fixed, with server tests. |

## How it was checked

- Overflow was measured on all three drill-down tabs at 320, 360, 390, 430, 768, 1024, 1280, 1440 and 1920 px, with nothing outside the card.
- The 360 px and wider Academic Terms shots are pixel-identical to before.
- Light and dark mode were checked on screen, for A6, A7, B1, B2 and C1.
- C1: retention UI tests pass 7 of 7, including a new phone-card test at 375 px.
- B1/B2: focused UI suites (faculty, secretary, roster import, transmutation) pass 165 of 165.
- `npx tsc -b`, `eslint` on the changed files and `check.ps1` pass.

## Kept as is

- Argon2id stays for new passwords. A 32-character password can exceed bcrypt's 72-byte limit, and accounts already on Argon2id must stay verifiable.

## Backlog

- On phones the attendance worksheet's Refresh button stretches into a full-width bar (A1).
- Dean Settings has a leftover "Save appearance setting" button (A5).
