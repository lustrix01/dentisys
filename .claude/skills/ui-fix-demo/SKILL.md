---
name: ui-fix-demo
description: Shows every DentiSys UI change to the Owner as a before/after page made from real screenshots, in two stages - pick a look at the Owner's screen size first, then a full device check after approval - before anything is committed. Use for any visible change (colour, spacing, wording, layout, a new look), for responsive or layout bugs ("labels split", "buttons stacked", "cut off on mobile", "dark mode unreadable"), for UI audits or critiques, and whenever the Owner asks to see a change, even if they don't say "skill" or "demo". Whole-system user audits go to user-walkthrough-audit instead.
---

# UI change + real-app demo

The Owner judges UI work by looking at it, not by reading diffs, and decides fast. Most rejections happen on the first look, so that look must be cheap: one screen size, two options, side by side. The expensive work (every device, the full demo page) runs only after the Owner picks.

Read `references/dentisys.md` first: routes, gates, deploy steps and the Owner's standing rulings. Standing rulings beat your taste.

## Pick the route

| Change | Route |
|---|---|
| **Taste**: colour, spacing, wording, icon, a new look. Everyone sees it on every device. | A: options first |
| **Responsive**: something breaks at some widths, and you don't know which. | B: measure first |

Both routes end in Stage 2 (below). Never capture the full device list before the Owner has picked.

## Route A, Stage 1: options at the Owner's screen

1. Before editing, check the files you will touch are clean: `git status --short <files>`. If not, ask; never stash or overwrite the Owner's work.
2. Write `targets.json` with one target per spot, `"device": "quick"` (Desktop 1920 + iPhone 393), plus one `"theme": "dark"` copy on `"Desktop 1920"` when the change involves colour.
3. Capture Before: `node <skill>/scripts/shots.mjs <app.json> targets.json <shotsDir> before`.
4. For each option (two by default; one when it is a structural or component change):
   1. Make it as a real Tailwind/code edit. Vite hot-reloads; never inject CSS for a look you cannot build.
   2. Capture it: `... <shotsDir> A` (then `B`).
   3. Save it: `git diff -- <files> > <shotsDir>/A.patch`, then undo it exactly: `git apply -R <shotsDir>/A.patch`.
5. `python <skill>/scripts/verify.py <shotsDir>`. Fix every FAIL. Open the contact sheet for the main spot, and the sheet for any WARN. Do not open the rest.
6. Build the options page from `demo.json` with `versions` (see `build-demo.py` header): Before, Option A with `"rec": true`, Option B, one line of `desc` each, and an `ask` line. No steps, code panel, table or "checked" list at this stage.
7. `python <skill>/scripts/build-demo.py demo.json <shotsDir> <scratch>/<name>.html`, then `node <skill>/scripts/smoke-demo.mjs <name>.html <name>.png`: no errors, `flipped: true`, `peekWorks: true`, `phoneSidewaysScroll: false`.
8. Publish as a private Artifact and send one line: "Reply A, B, or what to change. A is the default." Stop and wait.

On "change X": edit the chosen option, recapture that one version only, rebuild at the same link. On "neither": ask one question, offer two new options.

## Route B, Stage 1: measure first, pictures only where it breaks

1. Run the device audit filtered to the touched area. Never read `audit-output/summary.md` or `report.json` whole; grep them:
   `AUDIT_TIER=full AUDIT_ROUTES=/grades AUDIT_ROLES=faculty npm run audit:devices`, then `grep -n "<route>" audit-output/summary.md`.
2. Check more than page overflow: content escaping its **card**, clipped text, one word split over two lines, squeezed button or chip labels, low contrast, codes and IDs breaking. Re-measure dark-mode contrast only after colour transitions settle. When you add a check, prove it fires by reverting a known fix.
3. Capture Before only for the failing spots at the failing devices. Group findings by kind, not by page.
4. Plan batches (A, B, C…), one kind of defect each, with the files touched. Put any choice that changes how something looks to the Owner with `AskUserQuestion`, recommendation first. Record each answer as a ruling and do not ask again.

## Stage 2: after approval

1. Apply the chosen option: `git apply <shotsDir>/A.patch`. For Route B, make the fix (a subagent may implement; you review).
2. Subagents over-reach on UI. **Read the diff, not the summary**, and revert any line the rule did not need: a removed `flex-wrap` that was still needed, a `nowrap` on a heading that should wrap, a layout changed at a width that was fine.
3. Prefer width-scoped classes (`max-[359px]:`, `lg:max-2xl:`) over global changes. Fit rules that held up: tighten padding or gaps first; `whitespace-nowrap` on labels, codes and chips; text + button rows get `flex-1 basis-64` on the text and `flex-wrap` on the row; `<wbr />` or U+2011 controls where a label breaks; icons get `shrink-0`.
4. Sweep: `AUDIT_TIER=full` on the touched routes and roles (numbers only), then capture `"device": "core"` (11 devices) for the changed spots, `before` and `after`. Before shots come from the code before the change: reuse Stage 1's `before/` when it is the same commit, otherwise `git stash push -- <src>` → capture → `git stash pop`, then check `git stash list` is empty.
5. `verify.py`: fix every FAIL. Open the main spot's sheet and every sheet with a WARN, nothing else.
6. **If another width breaks the approved look**: fix it with width-scoped classes so the approved Desktop 1920 and iPhone 393 stay pixel-identical (prove it with an `"expect": "same"` target). That needs no new approval. Only a visible change to what the Owner approved goes back to them, as one line.
7. Build the final demo (no `versions`): steps, before/after text, code panel, "checked" list and change table. Write for the Owner: plain words for where to look and what they will see; class names only in the code panel. Pills: agreed / needs your OK (anything beyond what was agreed) / recommendation.
8. The page embeds the core tier plus flagged spots, never the full tier; `build-demo.py` stops over 16 MB. Publish to the **same Artifact link** as the Stage 1 page.
9. Run the type check while iterating; wait for explicit approval; then the full gate (`./scripts/check.ps1`) and one commit per batch, with a message the Owner understands, e.g. `fix(ui): dashboard stat tiles never split words or values (UI batch 2D)`. Push and deploy only when the Owner says so.

## The demo page

One template for both stages: `assets/template.html`, filled only by `build-demo.py`. Never write or restyle a demo page by hand; if the page needs something new, change the template once and keep it for every later demo.

- Close-ups sit side by side at the top (Before | A | B, or Before | After); the full screen in a device frame sits below.
- Hold **B** to peek at the other version, **1–3** to pick, **← →** to change screen. The options page opens on the recommendation; the final demo opens on Before.

## Options built outside the working tree

When a subagent writes each option as file copies (the working tree holds work under review), back up the real files, copy option A in, capture `A`, copy B in, capture `B`, restore the backups and prove it with `cmp`. Never stash work you did not start.

## Files, print views and flows

- Print/PDF views: a target with `"print": true` (window.print is stubbed, print media, full page). When the PDF is a menu item, open it with `steps` (trigger, then `{"role": "menuitem", "name": "..."}`), not `click`, which only opens the menu. Export files: open the downloaded `.xlsx` and show its rows on the demo or attach the file; say which seed data it came from.
- Flows and dialogs (how it behaves, not how it looks) copy the 2026-10-12 Artifact demos named in `CLAUDE.local.md`. A hand-written demo page is never allowed: if a page needs something the template lacks, change the template once.

## Shot details that bite

- Tabs may be `role="tab"`; `tab` tries that first, then a button.
- Open menus and popovers close when the page scrolls: give the target `"noScroll": true` and no `text`, so the shot is the viewport as it is after the `click`.

- Targets: make `text` a regex that only the intended element matches, and add `closest` (e.g. `".grid"`) to frame the right container.
- Devices come from `audit/devices.json`: a name, or a tier (`quick`, `core`, `full`) for every device in it.
- Run the scripts from the project root (Playwright resolves from there). On Windows pass paths like `C:/Users/...`; prefix shell commands with `MSYS_NO_PATHCONV=1` when an argument starts with `/`.
- A demo can lie: once a locator matched the wrong tile and Before and After were identical. verify.py now fails identical pairs and warns when the screen changed outside the close-up; still open the main pair yourself.

## Shape of the conversation

- Each message starts with the state: which stage and batch, what is done, what is next.
- A stage ends with exactly one question to the Owner.
- Lead with what the Owner can now click or see. Caveats go in one line at the end.

## Wrap-up (when the series ends)

- Write a short changelog as `docs/archive/<topic>-<yyyy-mm>.md` with these sections: commits; what the user sees now; rulings; how it was checked; lessons.
- Link the changelog from `docs/archive/README.md`.
- Save new standing rulings into `references/dentisys.md`, so the next session does not ask again.
