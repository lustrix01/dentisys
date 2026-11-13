# UI polish, October 2026: changelog

A device-by-device UI defect sweep, fixed in small approved batches on branch `lighthal9-responsive`. Everything below is pushed. Production runs `49b54ea18b01` (Owner promoted it on 2026-10-25 after the demo site passed).

## What changed

| Commit | Batch | What the user sees now |
|---|---|---|
| `66651d8` | Fixes 1–6 | Dark mode readable in Grade Weights and Reports. Face Registration buttons stay inside their card. The View Attendance footer, period cards, MFA card, class cards, roster header and mobile header fit on small phones without splitting labels. |
| `ab55095` | 2A | Button and link labels stay on one line. "Convert to Lecture/Laboratory" may wrap after the slash only below 420px. |
| `71e5afc` | 2B | Tab bars keep each label on one line. Tabs that don't fit wrap whole tabs to a second row. Exceptions: Student My Classes tabs and the Scores view toggle stay side by side. |
| `3786dcd` | 2C | Student IDs, section codes, S.Y. labels and chips never break across lines. Wide tables scroll sideways inside their card. |
| `29fcbeb` | 2D | Dashboard stat-tile labels wrap only between words, and values never split. "SIGN‑INS" and "Check‑Ins" use non-breaking hyphens. |
| `b03442b` | 2E | The dean toolbar, the schema banner and the course picker fit at every width. |
| `3ca2930` | 2F+2G | 112 dead colour classes removed. 37 dark-mode classes fixed (they used Tailwind shades that don't exist). Small grey text changed from `slate-400` to `slate-500` (`dark:slate-400`), except placeholders, disabled text and icons. |
| `49b54ea` | 2H | Last contrast items fixed: the "Selected class" label, the header role label, the chart legend, the dark chart tooltip (`frontend/src/index.css`), and the Secretary/Student switcher in dark mode. |

Contrast result: in light mode, no text is below 3:1. In dark mode, only the decorative breadcrumb "/" is below 3:1.

## Owner rulings (apply to future UI work)

- Keep items on their old line by tightening padding or gaps. Never split a label. Move a whole group down only when it cannot fit.
- Tabs that don't fit wrap whole tabs, except the two side-by-side exceptions above.
- Codes and chips never break. Tables scroll inside their card.
- Desktop at 1920px stays pixel-identical unless it is broken there.
- Dead colour classes are replaced by whatever renders today's look. Only colours that are visibly wrong get changed.
- Every visible change gets a clickable Before/After demo built from real app screenshots before approval. The demos for this work: [UI Fixes Demo](https://claude.ai/artifact/EYustnvshVGxtctec1YaS9) (1–6) and [UI Fixes Batch 2](https://claude.ai/artifact/WJaZ1UK7iYB8zNEU9Q4foR) (A–H).

## How it was checked

- **Device audit** (`npm run audit:devices`): this is `audit/device-audit.spec.ts` with the config `playwright.device-audit.config.ts`. It runs 15 devices from 320px to 1920px, every role, every route, every tab and both themes. Narrow a run with `AUDIT_DEVICES`, `AUDIT_ROLES`, `AUDIT_ROUTES` and `AUDIT_THEMES`. Output goes to `audit-output/` (gitignored). The checks are:
  - page overflow;
  - content escaping or clipped by its card;
  - clipped text;
  - a word split across lines;
  - a squeezed button label;
  - low contrast;
  - text overlap.

  Its dark-mode contrast numbers are unreliable: it measures during the 200ms colour fade, so re-measure after the colours settle.
- Each batch also got:
  - measurements at the widths it changed;
  - pixel comparisons at 1920/390/375 against the previous commit;
  - `npx tsc -b`;
  - `./scripts/check.ps1` before the commit.
- Demo site: `demo-test.ps1` passed for all four roles on `49b54ea18b01`, plus live checks of label wrapping, grey shades and the tooltip CSS.

## Lessons

- An audit that checks only page overflow misses content poking out of a card. The card check now catches it, and it was proved by reverting a fix and seeing the check fail.
- Subagent UI diffs over-reached in almost every batch. Examples: removing `flex-wrap` that was still needed, adding `nowrap` to a name heading, changing layouts at widths that were fine. Review every changed line, and compare pixels at widths that should not change.
- A demo screenshot can show the wrong spot when its text locator matches more than one element (the D3/D4 tiles first showed "no change"). Check each Before/After pair before publishing.
- A codemod regex that spans newlines can pair the wrong quotes. Keep string patterns single-line, and diff dark mode after any colour codemod.
