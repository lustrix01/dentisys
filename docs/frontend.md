# Frontend Overview

The frontend is a React 19, TypeScript, Vite, React Router and Tailwind app in `frontend/`. Client state lives in React context (`context/`), and every API call goes through Vite's `/api` proxy to the PHP backend. Approved product behaviour is in `spec.md`; this page only maps the code.

## Layout and breakpoints

`components/Layout.tsx` wraps every signed-in page: sidebar navigation, the top bar (page title, notifications, theme, profile menu) and the main scroll area.

| Width | Sidebar |
|---|---|
| Phones, below 768 px | Hidden. The top-bar menu button opens it as a drawer over the page; it closes with its X, the backdrop, Escape or a link. |
| Upright tablets, 768–1023 px | Starts as a collapsed icon rail when the user has not chosen (spec UI-001); a saved open or collapsed choice wins. |
| 1024 px and wider | Full sidebar with names; the user can collapse it to the rail. |

Below 1280 px every control, card and text must stay inside its box, and columns and data formats match desktop (never merged, reordered or dropped), except for the phone blocks below (UI-001). Desktop (1280 px and wider) keeps its layout.

The phone and desktop top bars share one `ProfileMenu` (inside `Layout.tsx`), so both show the same menu items for each role.

## Shared components

- `components/Modal.tsx`: every dialog. Renders in a portal with `role="dialog"`, a labelled title, a 44 px close button, Escape to close and focus returned to the opener; `fullScreenOnMobile` fills the screen on phones.
- `components/Card.tsx`: the rounded panel used for page sections, with optional hover and glow colours.
- `components/SchoolYearFilter.tsx`: the "School year" dropdown on dashboards (current year by default, a past year, or all years).

## Page patterns

The standard look for each part of a signed-in page ([AGENTS.md](../AGENTS.md) "Interface consistency"). Copy the named example as it is; a different look needs Owner approval first.

| Part | Standard | Copy from |
|---|---|---|
| Page wrapper | `space-y-6 animate-fade-in max-w-7xl mx-auto` around the whole page | `pages/faculty/RetentionMonitoring.tsx` (the outer `div` of the page) |
| Page section tabs (switch between the main sections of a page, such as Grades / Retention / Attendance) | White card bar: bordered white card, the selected tab filled with the role colour | `<Tabs variant="section">` in `components/Tabs.tsx`; never hand-build a tab bar |
| List switch (two or three views of one list, such as Assigned / Archived) | Grey segmented bar: grey track, the selected tab a white pill with role-colour text and a role-colour outline, count badge tinted in the role colour | `<Tabs variant="switch">` in `components/Tabs.tsx` |
| Account view switch (Secretary / Student, Dean / Superadmin) | Two-segment grey control at the top of the sidebar, `aria-pressed` on each segment; the view is the route, never stored | "Role Switcher" blocks in `components/Layout.tsx` |
| Tab names on phones | When the full names would wrap to extra rows below `sm`, give each tab a `shortLabel` (for example "Scores" for "Student Scores Entry"). The full name stays the accessible name at every width; the short form is visual only | `components/Tabs.tsx` (`shortLabel` and `aria-label`) |
| Selected colour | The role's colour, as in the sidebar (`getRoleColors` in `components/Layout.tsx`): Dean purple (`accent`), Faculty green (`clinical`; Classes uses `emerald`), Student and Secretary blue | `components/Layout.tsx` |
| Attendance session status and actions | A read-only "Session status" panel with one pill (Live session + code + start time, Scheduled session, No session running, View only, Checking) separated from an actions row of buttons (Sessions, Start session when idle, Schedule session while live); the hide-while-live rule stays | `pages/faculty/AttendanceMonitoring.tsx`, `pages/secretary/AttendanceList.tsx` |
| Session time entry | Clock-style picker for all four times (typed field plus a flyout of hour, minute and AM/PM wheels); cutoffs, face and geofence under a collapsible "More settings" (same bordered header as the class picker in Start session) | `components/TimePicker.tsx`, `components/SessionTimeFields.tsx`, `components/StartSessionModal.tsx` |
| Table header cells | Small capitals: `text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400` on the `<thead>` (or its `<tr>`), with the label text kept in Title Case in code (CSS does the capitals; `spec.md` UI-001). Keep column widths, alignment, sticky and `max-md:` classes on the cells themselves. Printed and exported report tables follow their own print stylesheet and are exempt. `tests/tableHeaderContract.test.ts` enforces it | `<thead>` in `components/GradebookMatrix.tsx` (Full Matrix) and `pages/admin/PeopleAndAccounts.tsx` |
| Table sorting | A sortable column's label is a button with an arrow inside the existing `<th>` (`components/SortableHeader.tsx`); the `<th>` carries `aria-sort`, and clicking the active column flips the order. Paged lists sort on the server. Default order is the list's usual order. Grade sheets (Full Matrix), printed and exported tables and short lists are not sortable; the Audit Trail keeps its Newest / Oldest button | `pages/admin/PeopleAndAccounts.tsx` |
| Pinned table columns | Every screen table's scroll wrapper carries `table-pin table-pin-first` (plus `table-pin-blocks` when its rows turn into phone blocks): the table scrolls inside a box at most one screen tall, the header row stays on top and the first column stays on the left. The classes are in `index.css`. Tables that pin more than one column (the Full Matrix) or pin by hand (the Audit Trail) keep their own rules; printed and exported tables are exempt | `pages/admin/PeopleAndAccounts.tsx` |
| Dialogs, panels, school-year filter | The shared components above | `Modal.tsx`, `Card.tsx`, `SchoolYearFilter.tsx` |
| Page header | No title inside the page: the top bar shows the page title and breadcrumb. A page may open with one short intro sentence and one summary line ("Showing 3 of 5 …" or "4 active · 1 retired"), `px-1.5 text-xs text-slate-500 dark:text-slate-400`, above its toolbar. Dashboards keep their welcome heading | `pages/admin/Rooms.tsx`, `pages/admin/CourseCatalog.tsx` |
| Notice banner | `rounded-xl border p-3 text-xs` in the message's tone (amber warning, emerald success, rose error, white with a role-colour icon for information). With an icon: `flex items-start gap-3`, icon `mt-0.5 h-4 w-4 shrink-0` | Term reminder in `pages/admin/Dashboard.tsx`, revoke notice in `pages/admin/SystemAudit.tsx` |
| Empty state | White card `rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center` (dark: `dark:border-slate-800 dark:bg-slate-900`), a grey icon `mx-auto h-8 w-8 text-slate-300 dark:text-slate-600`, a short heading (sentence case) and one hint line; "Clear filters" when filters hide everything. Inside a table or an existing card the same content sits in the cell or card without a second card. Small dashboard side panels (such as Pending Remedials) keep a one-line grey message instead | `pages/admin/CourseCatalog.tsx` |
| Loading state | Same white card with `p-12 text-center text-sm font-semibold text-slate-500` and `role="status"` text "Loading …" | `pages/admin/CourseCatalog.tsx` |

Not settled yet: table bodies. Until it has a standard here, copy the nearest page that does the same job.

### Filters, search and list actions

Today's pages are the reference: a page's filter row stays where it is, and changes happen inside it. A new page copies the filter row of the nearest existing page that does the same job.

1. **Improve inside the current layout.** Never add a separate bar or card for one or two controls.
2. **School Year sits inside the page's existing filter row** (or at the right of a dashboard header), never in a bar of its own.
3. **Do not split a compact row.** A title with its filters or actions on one line stays one line.
4. **Keep the positions people know.** Do not swap sides or push controls to the right that were on the left. Within an action group, the main action goes last and filled (rule 6).
5. **Keep icons placed on purpose**, such as the filter and calendar icons inside selects.
6. **A list switch with search and actions shares one row** with them: `ListToolbar` in `components/FilterBars.tsx`, switch and search on the left, actions on the right, main action last and filled. Copy `pages/admin/Rooms.tsx` or `pages/faculty/ClassesAndRosters.tsx`. The toolbar row is flat: do not wrap it in a card. Normal page spacing separates it from the header and the list; inside an existing card it keeps that card's spacing.
7. **Roll calls and other busy screens get simpler:** fewer bars, not more.

Show only one search box per view. On phones a filter row wraps onto the next line; it never scrolls sideways.

Every tab bar uses `Tabs`, which also gives screen readers the tab roles and lets arrow keys, Home and End move between tabs. A count that is a warning (Retention remedials and midterm risk) keeps its amber or rose badge with `countTone`, including when its tab is selected.

## Phone blocks

On phones (below 768 px), every Student and Secretary data table shows stacked row cards instead of horizontal scrolling; each card preserves every field and action. The same phone-block pattern applies to the Faculty and Reports lists named in `spec.md` UI-001. Fields without a visible label get a screen-reader label. Tablet and desktop layouts keep their tables. Other tables scroll sideways inside their card on phones, never the whole page.

## Authentication routes

`/login` is the only login page (`/login/dev` and `/dev-login` redirect to it). Authenticator 2FA is verified at `/2fa/verify`; there is no email-code 2FA. Faculty, Secretary and Student accounts are activated from invitations (`/activate-faculty`, `/activate-secretary`, `/activate-student`); public signup URLs redirect to login. When `GOOGLE_CLIENT_ID` is configured, Google's sign-in button is shown on login, linking and invitation pages.

Preserve existing routes, localStorage keys and role checks unless a task explicitly changes behaviour.
