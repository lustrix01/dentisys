# Frontend Overview

The frontend is a React 19, TypeScript, Vite, React Router and Tailwind app in `frontend/`. Client state lives in React context (`context/`), and every API call goes through Vite's `/api` proxy to the PHP backend. Approved product behaviour is in `spec.md`; this page only maps the code.

## Layout and breakpoints

`components/Layout.tsx` wraps every signed-in page: sidebar navigation, the top bar (page title, notifications, theme, profile menu) and the main scroll area.

| Width | Sidebar |
|---|---|
| Phones, below 768 px | Hidden. The top-bar menu button opens it as a drawer over the page; it closes with its X, the backdrop, Escape or a link. |
| Upright tablets, 768–1023 px | Starts as a collapsed icon rail when the user has not chosen (Owner decision, spec UI-001); a saved open or collapsed choice wins. |
| 1024 px and wider | Full sidebar with names; the user can collapse it to the rail. |

Below 1280 px every control, card and text must stay inside its box, and columns and data formats match desktop (never merged, reordered or dropped), except for the phone blocks below (UI-001, 2026-11-03). Desktop (1280 px and wider) keeps its layout.

The phone and desktop top bars share one `ProfileMenu` (inside `Layout.tsx`), so both show the same menu items for each role.

## Shared components

- `components/Modal.tsx`: every dialog. Renders in a portal with `role="dialog"`, a labelled title, a 44 px close button, Escape to close and focus returned to the opener; `fullScreenOnMobile` fills the screen on phones.
- `components/Card.tsx`: the rounded panel used for page sections, with optional hover and glow colours.
- `components/SchoolYearFilter.tsx`: the "School year" dropdown on dashboards (current year by default, a past year, or all years).

## Page patterns

The standard look for each part of a signed-in page ([AGENTS.md](../AGENTS.md) "Interface consistency"). Copy the named example as it is; a different look needs Owner approval first.

| Part | Standard | Copy from |
|---|---|---|
| Page wrapper | `space-y-6 animate-fade-in max-w-7xl mx-auto` around the whole page | `pages/faculty/RetentionMonitoring.tsx:789` |
| Page section tabs (switch between the main sections of a page, such as Grades / Retention / Attendance) | White card bar: bordered white card, the selected tab filled with the role colour | `<Tabs variant="section">` in `components/Tabs.tsx`; never hand-build a tab bar |
| List switch (two or three views of one list, such as Assigned / Archived) | Grey segmented bar: grey track, the selected tab a white pill with role-colour text and a role-colour outline, count badge tinted in the role colour | `<Tabs variant="switch">` in `components/Tabs.tsx` |
| Tab names on phones | When the full names would wrap to extra rows below `sm`, give each tab a `shortLabel` (for example "Scores" for "Student Scores Entry"). The full name stays the accessible name at every width; the short form is visual only | `components/Tabs.tsx` (`shortLabel` and `aria-label`) |
| Selected colour | The role's colour, as in the sidebar (`getRoleColors` in `components/Layout.tsx`): Dean purple (`accent`), Faculty green (`clinical`; Classes and Attendance use `emerald`), Student and Secretary blue | `components/Layout.tsx` |
| Dialogs, panels, school-year filter | The shared components above | `Modal.tsx`, `Card.tsx`, `SchoolYearFilter.tsx` |

Not settled yet: the page header, notice banners (three looks today), tables and empty states. Until each has a standard here, copy the nearest page that does the same job.

### Filters, search and list actions

Today's pages are the reference: a page's filter row stays where it is, and changes happen inside it (Owner review of 2026-11-07, [Filter Bar Standard demo](https://claude.ai/artifact/1CP17gGHrRwuEA33J7hVGK)). A new page copies the filter row of the nearest existing page that does the same job.

1. **Improve inside the current layout.** Never add a separate bar or card for one or two controls.
2. **School Year sits inside the page's existing filter row** (or at the right of a dashboard header), never in a bar of its own.
3. **Do not split a compact row.** A title with its filters or actions on one line stays one line.
4. **Keep the positions people know.** Do not swap sides or push controls to the right that were on the left. Within an action group, the main action goes last and filled (rule 6).
5. **Keep icons placed on purpose**, such as the filter and calendar icons inside selects.
6. **A list switch with search and actions shares one row** with them: `ListToolbar` in `components/FilterBars.tsx`, switch and search on the left, actions on the right, main action last and filled. Copy `pages/admin/Rooms.tsx` or `pages/faculty/ClassesAndRosters.tsx`. Use the toolbar's `flat` variant only when it sits inside an existing card, such as the class roster; keep the card when the toolbar is its own page section (Rooms, Classes list).
7. **Roll calls and other busy screens get simpler:** fewer bars, not more.

Show only one search box per view. On phones a filter row wraps onto the next line; it never scrolls sideways.

Every tab bar uses `Tabs`, which also gives screen readers the tab roles and lets arrow keys, Home and End move between tabs. A count that is a warning (Retention remedials and midterm risk) keeps its amber or rose badge with `countTone`, including when its tab is selected (Owner decisions of 2026-11-06, [Tab Bar Standard demo](https://claude.ai/artifact/EBfuzdD5bdrWAdxVw3S1fL)).

## Phone blocks

On phones (below 768 px) these lists show each row as a stacked block instead of a table that scrolls sideways: Student Dashboard enrolled subjects, Student Attendance Logs, the Faculty and Secretary roll calls, the Faculty roster, the Reports grade summary, Email Management invitation lists, Faculty Invitations and the Audit Trail. A block shows every field of the desktop row in the same data format; it may put the name or date first, join two related fields on one line and leave out a field that is empty for that row. Fields without a visible label get a screen-reader label. Tablets and desktop keep the table. Other tables scroll sideways inside their card on phones, never the whole page. The rule is recorded in `spec.md` UI-001 ([amendment of 2026-11-03](spec-amendments-2026-11-03-responsive-audit.md)).

## Authentication routes

`/login` is the only login page (`/login/dev` and `/dev-login` redirect to it). Authenticator 2FA is verified at `/2fa/verify`; there is no email-code 2FA. Faculty, Secretary and Student accounts are activated from invitations (`/activate-faculty`, `/activate-secretary`, `/activate-student`); public signup URLs redirect to login. When `GOOGLE_CLIENT_ID` is configured, Google's sign-in button is shown on login, linking and invitation pages.

Preserve existing routes, localStorage keys and role checks unless a task explicitly changes behaviour.
