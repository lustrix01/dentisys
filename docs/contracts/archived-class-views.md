# Archived classes on Faculty screens — contract

Status: **Approved and built** (2026-10-27; Owner approved the demo, including keeping Finished-archived classes reachable view-only): [Archived Classes on Faculty Screens](https://claude.ai/artifact/3gzqD643RWZKFhNSWjDV5c). Validated in [session-default-times-2026-10.md](../session-default-times-2026-10.md). Also found and fixed during validation: Import Roster offered archived classes as targets; it now offers active classes only. No spec change: this makes the screens follow CLS-002 and CLS-003.

Found 2026-10-27 while running the live tests: a class archived **this school year** is still treated as a current, editable class outside Classes & Rosters. The class list API marks `isHistorical` by school year only; `archiveReason` / `archivedAt` are sent but only Classes & Rosters uses them (through `frontend/src/utils/classArchiving.ts`). Result: Grade Computation can open on an archived class by default and every load or save is refused ("Archived classes are view-only", 403); Attendance lists archived classes (Cancelled and Created-by-mistake included) under My Assigned Classes.

## Spec (unchanged, quoted rules)

- CLS-003: "Every archived class section is view-only under the same rules as historical classes (CLS-002)."
- CLS-003: "Cancelled and Created-by-mistake class sections are hidden from Students and Class Secretaries and are excluded from attendance, retention monitoring, and Dean reports."
- CLS-003: "A class archived as Finished is also shown as Completed."

## Rules

| # | Rule |
|---|---|
| A1 | One rule everywhere: a class is **view-only** when it is past-year or archived (`isViewOnlyClass` in `utils/classArchiving.ts`, already used by Classes & Rosters). Screens use that helper instead of their own year checks. |
| A2 | **Grade Computation.** The current-year class list holds active classes first; the default class is the first **active** one. Classes archived as Finished this year appear after them, labelled "(Archived · view only)", and open in the existing view-only mode used for past-year classes. Cancelled and Created-by-mistake classes are not listed (as the past-year view already does). |
| A3 | **Attendance (Faculty).** My Assigned Classes shows active classes as today. Classes archived as Finished show with an "Archived" badge and **no** Start Session or roll-call editing (View Attendance stays, read-only). Cancelled and Created-by-mistake classes are not shown. |
| A4 | **Faculty Settings and Dashboard** treat archived classes like past-year classes (Settings' current-class list and the Dashboard's course match use A1). |
| A5 | **Server unchanged.** It already refuses changes to archived classes and already leaves Cancelled/Created-by-mistake out of attendance, retention and reports queries. No migration, no API change. |
| A6 | **Unchanged:** Classes & Rosters (already correct), Students and Class Secretaries (server-side), past-year behaviour, restore. |

## Question for the Owner (in the demo)

- Finished-archived classes stay reachable read-only in Grade Computation and Attendance (A2, A3), as past-year classes are. Recommended: yes (CLS-002 "same rules as historical").

## Implementation impact

- Frontend only: `GradeComputation.tsx`, `AttendanceMonitoring.tsx`, `Settings.tsx`, `Dashboard.tsx` use `isViewOnlyClass` / `archiveGroup`.
- Tests: unit tests for the list/default selection; mocked e2e for Grade Computation default with an archived class first in the list and for Attendance hiding Cancelled classes; the live specs archive their test classes and the existing live tests pass again.
