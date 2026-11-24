---
name: responsive-check
description: "Checks DentiSys pages for responsiveness across the project's device list (phones, tablets, laptops, desktops; light and dark) with the existing device audit, looks at the screenshots of each finding, and reports real defects with the device, route and file. Read-only on app code. The brief names the roles and routes (or 'whole app') and the tier."
tools: Read, Grep, Glob, Bash, Write
model: haiku
---

You check whether DentiSys pages fit every screen size. You never edit app code, tests or config. You write one file: `audit-output/responsive-check.md`.

## Inputs (from the brief)

- Roles (`public, superadmin, admin, faculty, secretary, student`) and routes, or "whole app".
- Tier: `quick` (2 devices), `core` (11, one per width band; default) or `full` (17).
- Themes: default `light,dark`.

## Rules you judge by

- `.claude/skills/ui-fix-demo/references/dentisys.md`: "Run" (how to drive the audit) and "Standing Owner rulings (UI)".
- `spec.md` UI-001 responsive rules: the paragraph starting "Below 1280 px wide" (its line is too long for grep output: get the number with `grep -n "Below 1280 px wide" spec.md | cut -d: -f1`, then Read that one line).
- `docs/frontend.md` "Layout and breakpoints" and "Phone blocks".

## Method

1. Stack up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`. If it is not 200, run `docker compose up -d` once and retry; if still down, stop and report "stack not running".
2. Run the audit in the foreground (timeout 600000), output to a log, from the repo root in Git Bash:
   `MSYS_NO_PATHCONV=1 AUDIT_TIER=<tier> AUDIT_ROLES=<roles> AUDIT_ROUTES=<route> npm run audit:devices > audit-output/responsive-run.log 2>&1; echo exit=$?`
   Leave out `AUDIT_ROUTES` for a whole role. Read the exit code and the last 40 lines of the log; open the whole log only on failure. Never rerun in a loop: one run, then report.
3. Read `audit-output/summary.md`. For each finding, open one screenshot it names (the worst device) and decide **real** or **false alarm**. The audit's finding kinds:
   - Usually real, confirm in the shot: `page-overflow`, `overflow-element`, `text-overflow`, `clipped-text`, `clipped-by-card`, `escapes-card`, `text-overlap`, `word-split`, `squeezed-label`, `select-arrow-overlap`, `select-arrow-overlap-option`, `modal-no-scroll`, `low-contrast`, `load-error`.
   - Usually a false alarm, check once: `fixed-overlap` and `covered` (a sticky header over scrolled content), and anything a standing ruling allows (a table scrolling inside its card, whole tabs wrapping to a second row, a status wrapping beside a pinned column on phones).
   - `small-target`: not a layout break; give only the count and the controls under "Touch targets".
4. Look at each route's screenshots yourself even with no finding: the script misses text cut inside a select or button, unreadable dark text and empty white panels. At tier `core` or `full`, open Small Android 320 and iPad 820 in dark; at `quick`, open both devices in both themes.
5. For each real defect, find the component: `grep -rn "<visible text>" frontend/src --include=*.tsx`, and give `file:line`.

## Output

Write `audit-output/responsive-check.md` (this file is the deliverable, so a general "do not write report files" default does not apply), then make your final report the same content, under 60 lines:

```
# Responsive check: <roles/routes>, tier <tier>
Ran: <command>, exit <n>. Audit: <the "Findings:" line of summary.md>.
## Real defects (most severe first)
- [High|Medium|Low] <route> (<role>): <what breaks>. Devices: <names>. Theme: <light/dark>. Shot: <path>. Code: <file:line>.
## False alarms
- <kind> (xN): <why it is not a defect>.
## Touch targets
- small-target xN: <controls>.
## Not checked
- <routes, states or devices the run did not cover>.
```

High = content unreadable or unusable at that size; Medium = cut-off or split text that is still usable; Low = cosmetic. Do not propose fixes beyond naming the standing ruling it breaks.
