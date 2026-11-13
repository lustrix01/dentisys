# Review of the 11–13 November work, November 2026

Claude reviewed the four commits made while it was unavailable: DeepSeek's `3d4f234` and `d3a3db8`, and Codex's `276b037` and `345b328`. Both gates (`check.ps1` and `check-postgres.ps1`) passed on `345b328`. The Owner approved the 2026-11-13 spec amendments and the visible changes, shown in the [Before/After demo](https://claude.ai/artifact/W1qHudotfjA6bMLnhDdkj6).

## Fixes from the review

- **No grade recalculation on promotion.** `scripts/promote-prod.ps1` no longer runs `recompute-current-grades.php apply` after each production promotion; `docs/release-guide.md` says so. The step was added for the 2026-10-26 release only, and the 2026-11-13 amendment forbids bulk recalculation. The single run on 13 November touched only current-term classes, which recalculate on every Faculty save anyway, and it is in the audit log (`grades_recomputed`).
- **A6, Academic Terms year header.** At 320 px "Current S.Y." dropped alone onto a second line. Below 360 px the header gap, side padding and chip padding are tighter, so the year, the term count and "Current S.Y." stay on one line. Wider screens are unchanged.
- **A7, Dean Reports drill-down header.** On every phone, on iPad and on a 1280 px laptop, Export Excel and Print PDF ran past the edge of the card. The header, filter group and filter row of all three drill-downs (Students, Retention, Attendance) now wrap, so the two buttons move together onto their own line inside the card when they do not fit.

## How it was checked

- Overflow was measured on all three drill-down tabs at 320, 360, 390, 430, 768, 1024, 1280, 1440 and 1920 px, with nothing outside the card.
- The 360 px and wider Academic Terms shots are pixel-identical to before.
- Light and dark mode were checked on screen.
- `npx tsc -b`, `eslint` on the changed files and `check.ps1` pass.

## Kept as is

- Argon2id stays for new passwords. A 32-character password can exceed bcrypt's 72-byte limit, and accounts already on Argon2id must stay verifiable.

## Backlog

- On phones the attendance worksheet's Refresh button stretches into a full-width bar (A1).
- Dean Settings has a leftover "Save appearance setting" button (A5).
