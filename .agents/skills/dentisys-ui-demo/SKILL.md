---
name: dentisys-ui-demo
description: Real-app Before/After UI demo and design review workflow for DentiSys in Antigravity. Use for any visible UI change (layout, wording, spacing, colors, modals, controls) before committing.
---

# DentiSys UI Demo & Design Review (Antigravity)

Owner standing rule: **never** build hand-written HTML/CSS mockups. Every UI demo uses real screenshots of the running DentiSys app (same route, same mocked or live data, same viewports).

## 1. Before editing UI
1. Read `docs/frontend.md` ("Page patterns", "Filters, search and list actions", "Phone blocks") and `AGENTS.md` ("Interface consistency").
2. Copy the existing standard part and its exact classes (`Modal`, `Card`, `Tabs`, `ListToolbar`, `ExportMenu`, `SortableHeader`). Do not invent a second look for an existing job or add new stacked full-width cards above content.
3. Check `spec.md` UI-001 casing when wording changes: titles and labels Title Case; buttons and messages sentence case; no ALL CAPS typed in code.
4. **Theme & placement parity:** Match the role's existing accent palette (emerald/clinical for Faculty, blue for Student/Secretary, slate/neutral for read-only/pending), match sibling button heights/radii in the same card, and keep mobile (393 px) header/banner chrome minimal so primary content stays visible above the fold.

## 2. Capture real Before vs. After screenshots
1. Delegate screenshot capture to a `swarm` worker on `gemini-4-neon-low` (no edits to tracked repo files).
2. Capture **Before** from a temporary detached git worktree at the base commit (e.g., `audit-output/tmp-before-<sha>` with a junction to `frontend/node_modules`, cleaned up via `cmd /c rmdir` + `git worktree remove --force`), and **After** from the current tree.
3. Inside Windows sandbox, start Vite and run Playwright inside the **same** Node command so `127.0.0.1` is reachable.
4. Capture **Desktop 1920** (`1920x947` or `1280x800` for modals) and **iPhone 393** (`393x852`, `deviceScaleFactor: 2`), in **light and dark mode** (using the app's theme toggle) whenever styling/colors change. Log exact bounding-box pixel measurements for any overlap/clipping fix.
5. Have the `gemini-4-neon-low` demo worker open every captured PNG via `read_file` to verify none are blank, broken, clipped, or misaligned; coordinator opens only the 4–6 highest-risk PNGs (iPhone 393, modals, primary After screens) before showing the Owner.

## 3. Artifact labelling (matching Owner's Claude artifact types)
Copy final PNGs into `<artifactDir>/screenshots/` and present them in a markdown artifact using `carousel` slides, titled with the matching label:
- **`Stage 1 Options Demo`** — when proposing 2+ visual approaches before keeping code.
- **`Stage 2 Final Demo`** — full Before vs. After of the approved change across Desktop + iPhone 393 + dark mode.
- **`Route C Small Change`** — short path for small wording, color, or spacing fixes (Before vs. After on affected viewports).
- **`Design Review`** — self-audit checklist against `docs/frontend.md` Page patterns, role palette & button cohesion, mobile vertical chrome, overflow (`scrollWidth <= innerWidth`), dark mode contrast, and casing (`Verdict: pass` only with zero Blocker/High findings).

## 4. Commit trailer
For commits touching `frontend/src/**/*.tsx` or `.css` outside tests, include:
`Demo: none - Antigravity artifact (<label>: <artifact-filename.md>)`
