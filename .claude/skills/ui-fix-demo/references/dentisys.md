# DentiSys specifics

Repo `C:\Users\decha\Desktop\Github\dentisys`. Rules in `AGENTS.md` and `CLAUDE.local.md` win over this file. The last full series was `docs/archive/ui-polish-2026-10.md`: read it for the rulings and the lessons.

## Run
- Stack: Docker Desktop must be running (it can be stopped after a reboot). Start it with `docker compose up -d`. The app is at `http://localhost:5173` and the Vite dev server hot-reloads, so code edits show without a rebuild.
- App config for the scripts: `references/dentisys.app.json`. It uses the seeded dev accounts only. Never read `~/.dentisys/demo.env` passwords into chat.
- Device audit: `npm run audit:devices` from the repo root. The spec is `audit/device-audit.spec.ts`; the devices are in `audit/devices.json` (shared with `shots.mjs`). Output goes to `audit-output/`, which is gitignored; keep scratch scripts there too. Filter with env vars:
  - `AUDIT_TIER=quick|core|full` (2 / 11 / 17 devices; default full);
  - `AUDIT_DEVICES="iPhone 393,Desktop 1920"` (names from devices.json);
  - `AUDIT_ROLES=faculty` (public, superadmin, admin, faculty, secretary, student; the Superadmin signs in with a code from the seeded dev authenticator, one per 30 s, so its sign-ins are spaced out);
  - `AUDIT_ROUTES=/grades`;
  - `AUDIT_THEMES=light`;
  - `AUDIT_NO_TABS=1`.
- Devices: `audit/devices.json`. Core is one device per app width band (320, 360, 375, 393, 480, 744, 820, 1032, 1366, 1470, 1920); iPad mini 744 gets the phone layout (<768). When a `max-[Npx]` rule or the 768 phone check changes, update the bands there.
- Git Bash turns "/route" args into Windows paths. Prefix commands with `MSYS_NO_PATHCONV=1`.
- Capture against the real backend (`shots.mjs`). The access token lives only in memory and survives a reload thanks to the backend's refresh cookie. In a fully mocked capture (no backend), `page.goto()` after login therefore shows a blank page: navigate client-side instead (`history.pushState` + `popstate`). Use mocked capture only when Docker truly cannot run.
- Second-copy pages: real student accounts use `frontend/src/pages/student/RealStudentSurfaces.tsx`, not the prototype `pages/student/*.tsx`. A change to one copy usually needs the other.

## Gates
- While iterating: `npx tsc -b` from `frontend/`.
- Before a commit: run `./scripts/check.ps1` with the PowerShell tool in the background. Never pipe or redirect it.

## Standing Owner rulings (UI)
- Keep items on their old line by tightening padding or gaps. Never split a label. Move a whole group down only when it cannot fit.
- Tabs that don't fit wrap whole tabs to a second row. Exceptions: Student My Classes tabs and the Scores view toggle stay side by side.
- Codes, IDs and chips never break. Tables scroll sideways inside their card.
- Stat-tile labels wrap only between words, and values never wrap.
- Casing: follow spec.md UI-001 "Owner decision (2026-11-06): Interface casing". Short form: names of places/fields (page, card, section and dialog titles, tabs, sidebar items, column headers, form labels) are Title Case; everything else (buttons, links, chips, status values, hints, tooltips, toasts, errors, message headings like "No scores yet") is sentence case. Roles, Midterm/Finals/Lecture/Laboratory, DentiSys/BU/Google, ID/PDF/CSV and 1st/2nd Semester are always capitalised; a page, tab or button name quoted in other text keeps its own casing ("Open in Retention Monitoring"). Never type ALL CAPS (CSS does it); only the printed class list header is in capitals.
- Desktop 1920 stays pixel-identical unless it is broken there.
- No hand-made imitation demos of DentiSys screens (2026-11-18): every demo uses real screenshots of the running app, because a copy does not prove how screens look.
- New features fit into the page as if they were always there (2026-11-16): a toolbar button that opens a dialog (with a count badge when something waits), settings inside the existing Edit dialog, a side card that copies the neighbouring side card exactly. Never a new full-width card or bar stacked above a page's main table or list.
- Improve inside today's layout (2026-11-07). Restructuring pages for consistency's sake was rejected ("before was easier on the eyes").
- One control per job on a toolbar (2026-11-17): Reports keep one Excel and one PDF control; a tab with several reports turns each into a ▾ menu instead of adding buttons.
- Open menus and popovers never print: their panel carries `no-print` (2026-11-18).
- A status in a table with a pinned first column may wrap on phones when one line cannot fit beside the pinned column even after swiping (2026-11-19, Faculty Retention "Remedial exam scheduled": one line from 480 px up, phones wrap). Readable beats one line; measure the room before forcing `nowrap`.
- Time entry is the clock-style wheel (`components/TimePicker.tsx`), never a grid of tap buttons.
- Demo shots keep the page's existing toolbar in frame, or the Owner reads the toolbar as removed.
- Proposed controls stay as close to today's look as possible: no extra information folded into a control's text (a picker showing "CLINIC-4B · Section #22" was rejected as clutter); add a minimal affordance such as a ▾ instead.
- When the Owner reviews only some pages, their verdict covers only those: show each other page instead of reverting or changing it on their behalf.
- Justify each change honestly, and say when a page needs no change.
- Colours:
  - Dead Tailwind classes become whatever renders today's look.
  - Small grey text is `text-slate-500 dark:text-slate-400`, except placeholders, disabled text and icons.
  - Tailwind 3.4 has no 150/202/205/350/450/550/650/750/850 shades.
- Look demos come only from `assets/template.html` via `build-demo.py`. Reuse one link per series (Stage 1 options and Stage 2 final share it).

## Ship (only when the Owner says push/deploy)
Follow `docs/release-guide.md` steps 2–7, with live checks of the changed spots in step 6.
