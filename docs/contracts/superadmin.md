# Superadmin mode contract

Status: **Current** (built; the Owner answered the open questions on 2026-11-14, section 10). The `spec.md` section ADM-001 (section 9) is proposed and waits for Owner approval. Decisions 14-18 of `docs/archive/owner-decisions-2026-11-14-second.md`; backlog items 4.5, 4.6, 4.7. Rules are numbered SA1..SA25 so code and tests can cite them.

## 1. Purpose and scope

Every Dean account can switch into **Superadmin mode**, a second view like the Secretary's Student view. In it the Dean gets three things the normal Dean view does not have:

| Part | What | Backlog |
|---|---|---|
| A. Class-work audit | The Audit Trail also lists grades, attendance and retention rows, read-only, with before/after values. | 4.5 |
| B. Course Catalog | The preview page becomes real: edit and retire courses. | 4.6 |
| C. People & Accounts | The preview page becomes real: list Faculty and Students, deactivate and reactivate accounts. | 4.7 |

Class Sections stays a preview. No new role, no new flag, no new account (decision 14). Responses are flat like the Rooms routes (`status`, `people[]`, `courses[]`), not wrapped in `data`; error `message` and `code` as in the examples.

## 2. The mode (SA1-SA5)

**How the Secretary toggle works today** (`frontend/src/components/Layout.tsx`): there is no stored state. The view is **the route**. A Secretary with a linked Student record is "in Student view" when `location.pathname.startsWith('/student/')`; the sidebar switcher (`aria-label="Account view"`, two segments, `aria-pressed`) just navigates between `/secretary/attendance` and `/student/dashboard`. The server knows nothing about the view; every `/api/student/*` call is authorised by the account's real role.

| # | Rule |
|---|---|
| SA1 | Superadmin mode is **route-based, UI-only**: it is on when the path starts with `/superadmin/`. No localStorage key, no session field, no request header, no server flag. A refresh or a bookmark keeps the mode. |
| SA2 | Every account with role `admin` (Dean) sees the switcher; nobody else does. It copies the Secretary switcher markup (`Layout.tsx`, "Secretary / Student Role Switcher"): segments **Dean** and **Superadmin** (icon `ShieldCheck`, tooltip "Superadmin view" when the sidebar is collapsed). Dean goes to `/admin/dashboard`, Superadmin to `/superadmin/audit-trail`. |
| SA3 | Superadmin sidebar: **Audit Trail** (`/superadmin/audit-trail`), **Course Catalog** (`/superadmin/course-catalog`), **People & Accounts** (`/superadmin/people`), plus the Dean's Profile and Settings links. Class Sections is not listed in this mode; it stays where it is in the Dean view as a preview (decision 18). |
| SA4 | The Dean view loses the Course Catalog and People & Accounts entries (decision 18). Old paths `/admin/course-catalog` and `/admin/people` redirect to the dashboard; `/superadmin/*` for a non-Dean redirects to their own home (`ProtectedRoute allowedRoles={['admin']}`). Top bar shows a "Superadmin" chip so the mode is visible on every page. |
| SA5 | **The server does not know the mode.** Justification: the Dean role already authorises every `/api/admin/*` call, and decision 14 says every Dean is a superadmin, so the mode adds no authority. A header or flag the client sends would be fake security (any Dean could send it) and extra code. The server's job is the same as today: verify the access token, require role `admin`, return 403 otherwise. The only mode-like server input is the explicit `scope=class_work` request parameter on the audit endpoint (SA8), which is a filter, not a permission. Accepted trade-off: a Dean calling the API by hand can read class work without the toggle; they could always do so as a Dean with an admin token. Class-work rows stay out of the **normal** Dean screens and the Dashboard widget (`audit-logging.md` section 3 changes, see section 9). |

## 3. Part A - Class-work audit (decision 16)

Reverses `audit-logging.md` O1 for the Dean in this mode only. Rows are written already; no writing change.

### Route

| Method | Path | Auth |
|---|---|---|
| GET | `/api/admin/audit-logs` (existing, `handle_admin_audit_logs`) | Dean role. New parameter `scope`. |

Parameters (all existing ones keep working: `q`, `area`, `status`, `from`, `to`, `preset`, `role`, `sort`, `page`, `signins`):

| Param | Meaning |
|---|---|
| `scope` | `overview` (default, today's behaviour) or `class_work`. `class_work` returns **only** class-work rows: codes whose area is Grading, Attendance or Retention and are not Dean-visible today (scores, assessments, weights, recompute, attendance records and sessions, Excused requests, retention entries). Anything else: 422 `invalid_scope`. |
| `facultyId` | Rows whose actor is that Faculty member or Secretary of that Faculty's classes (see SA9). |
| `classId` | `class_sections.cs_id`; matches `audit_events.scope_cs_id`. |
| `studentId` | `students.student_id`; matches the row's student target or the student keys inside the batch members and before/after state. |

Response: the existing entry shape (When, Who, What, Record, Change, status, `changes[]` Field/Before/After, batch members) plus `scope` and, for each entry, `classLabel` (e.g. "DENT 101-A"). Example:

```json
{"status":"ok","data":{"scope":"class_work","total":2,"page":1,"entries":[
 {"id":"a1","when":"2026-10-17T10:16:00+08:00","who":{"name":"Dr. Ana Reyes","role":"faculty"},
  "what":"Changed scores","record":"Quiz 2 (Midterm) · DENT 101-A","classLabel":"DENT 101-A",
  "change":"3 scores changed","status":"Success",
  "changes":[{"field":"Reyes, Ben · Quiz 2","before":"8","after":"9"}]}]}}
```

### Rules

| # | Rule |
|---|---|
| SA6 | The Superadmin Audit Trail is the existing page (`pages/admin/AuditTrail.tsx` -> `SystemAudit.tsx` Audit view) rendered with `scope` = `class_work` or `overview` chosen by a **list switch** at the top ("Activity" / "Class work"), copied from the Assigned / Archived list switch standard. In the Dean view the page is unchanged and its note "Class work ... is not shown here" stays. |
| SA7 | Class-work view is **read-only**: no edit, undo, export of changed data back. Display standard, details panel, 50 per page, server-side paging and Asia/Manila times follow `audit-logging.md` section 4. CSV/print export uses the same filters (decision: allowed, read-only). |
| SA8 | Filters in Class work: Search, **Faculty** (select of Faculty with at least one class-work row), **Class** (select; "DENT 101-A · SY 2026-2027"), **Student** (search-select by name or student number), Date (presets + custom range), Status, Sort, Clear filters. Area chips: Grading, Attendance, Retention. Filters combine with AND. |
| SA9 | `facultyId` means "work in that Faculty member's classes": rows whose `scope_cs_id` is a class they teach, so a Secretary's attendance change is found under the Faculty member too. The row's Who still shows the real actor. |
| SA10 | Before/after values are shown in the Changes table as stored (R4). Redaction rules R5 still hold; no new data is stored. Old rows (R13) show what they stored. |
| SA11 | Opening class-work rows is **not itself audited** (same as R11 spirit: reads are not events). Accepted (answer 4). |
| SA12 | The Dashboard "Latest audit events" widget and the normal Dean Audit Trail never include class work, in either mode. |

## 4. Part B - Course Catalog (decision 17)

### DB (additive migration `060_course_retire.sql`)

Copy the rooms pattern (`054_rooms.sql`): `courses.status VARCHAR(20) NOT NULL DEFAULT 'active'` (`active` | `retired`), `retired_at TIMESTAMP(6) NULL`, check `(status='retired') = (retired_at IS NOT NULL)`. Existing rows become `active`. Existing columns reused: `course_code` (unique), `name`, `units`, `lecture_units`, `lab_units`. Nothing is deleted; there is no delete route.

### Routes (all Dean role; same pattern as `/api/admin/rooms*`)

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/api/admin/courses` | `?status=active\|retired\|all&q=` | `data.courses[]` `{id, courseCode, name, units, lectureUnits, labUnits, status, retiredAt, classCount, currentClassCount}` |
| POST | `/api/admin/courses/update` | `{id, courseCode, name, lectureUnits, labUnits, reason?}` | updated course; `units` = lecture + lab |
| POST | `/api/admin/courses/retire` | `{id, reason?}` | course with `status:"retired"` |
| POST | `/api/admin/courses/restore` | `{id}` | course with `status:"active"` |

No create route: Faculty keep adding new codes when creating a class (existing `handle_faculty_*` class-create path).

Example update: `{"id":12,"courseCode":"DENT 101","name":"Dental Anatomy","lectureUnits":2,"labUnits":1}` -> `{"status":"ok","data":{"course":{"id":12,"courseCode":"DENT 101","units":3,"status":"active","classCount":4}}}`.

### Rules

| # | Rule |
|---|---|
| SA13 | Editable: code, title, lecture units, lab units (total units computed, same ≤ 99.9 rule as class create). Code is trimmed, unique case-insensitively (`LOWER(course_code)` as the Faculty path checks). |
| SA14 | An edit applies to the course everywhere, including existing classes (they join `courses`); grades and attendance are unaffected. The page shows "Used by N classes (M this school year)" in the edit dialog so the Dean sees the reach. |
| SA15 | **Retire** hides the course from every Faculty picker: `handle_faculty_courses_get` and the class-create suggestion list add `WHERE status='active'`. Existing classes keep their course (reads and reports still join it). Retiring changes nothing for current classes. |
| SA16 | A retired code **typed by Faculty** when creating a class (or changing a class's code) is refused: 409 `course_retired`, "This course was retired by the Dean. Ask the Dean to restore it." Choosing a retired course by id is refused the same way. Faculty adding a **new** code is unchanged. |
| SA17 | **Restore** puts the course back in the pickers. No other state changes. |
| SA18 | Retiring an already-retired or restoring an active course is a no-op that writes no audit row (R3) and returns 200 with the current state. |

### Errors

| Code | HTTP | Message |
|---|---|---|
| `validation_failed` | 422 | Field list, e.g. "Course code is required." / "Total units are too large." |
| `course_code_taken` | 409 | "Another course already uses this code." |
| `course_not_found` | 404 | "Course not found." |
| `course_retired` | 409 | Faculty class-create only (SA16). |
| (auth) | 401 / 403 | Existing messages. |

### Audit events (area Settings & terms, Dean-visible, like `room_*`)

`course_updated` ("Course changed", before/after of changed fields), `course_retired` ("Course retired", reason), `course_restored` ("Course restored"). Record = "DENT 101 · Dental Anatomy". Add to `audit_catalogue.php` beside `room_*`.

## 5. Part C - People & Accounts (decision 15)

### DB

**No migration needed.** `user_accounts.status` (default `'Active'`) and `disabled_at` already exist; `auth_runtime.php` already refuses sign-in and token refresh when `status !== 'Active'` (`InactiveAccountException`, 403) and password change/reset check it too. Deactivated = `status='Disabled'`, `disabled_at` set. Reactivate = `status='Active'`, `disabled_at` NULL. The `students` row and `class_sections.instructor_user_id` are untouched (records kept).

### Routes (Dean role)

| Method | Path | Body / query | Success |
|---|---|---|---|
| GET | `/api/admin/people` | `?kind=faculty\|student&status=active\|deactivated\|all&q=&page=` (50 per page) | `data.people[]` |
| POST | `/api/admin/people/deactivate` | `{userId, reason?}` | updated person |
| POST | `/api/admin/people/reactivate` | `{userId}` | updated person |

Person: `{userId, name, email, kind, status:"active"|"deactivated", disabledAt, twoFactor:boolean, lastActivityAt, classes:[{csId,label,schoolYear,current}] (Faculty), studentNo, enrolledClasses:[...] (Student)}`. Faculty list shows **each member's classes** (current school year first). Only people whose account role is Faculty or Student (not Dean, not Secretary-only accounts) are listed.

Refusal example (409):

```json
{"status":"error","code":"faculty_has_current_classes",
 "message":"Dr. Ana Reyes teaches 2 classes this school year. Reassign or archive them first.",
 "classes":[{"csId":41,"label":"DENT 101-A"},{"csId":57,"label":"DENT 204-B"}]}
```

### Rules

| # | Rule |
|---|---|
| SA19 | Deactivate runs in **one transaction** that locks the account row (`FOR UPDATE`, as `auth_runtime.php`), sets the status, calls `auth_invalidate_account` (`token_version + 1`, which kills every access token) and revokes all the account's `auth_sessions` and refresh `security_tokens` with reason "Account deactivated" (the loop used at logout, `auth.php`), then writes the audit row. Any failure cancels all of it (R2). |
| SA20 | **Sign-in blocked** on every path: password, Google, password reset, token refresh. Existing behaviour covers them; tests prove it. The sign-in screen shows the existing inactive-account message plus "Contact the Dean." (answer 4). Failed attempts keep logging `login_failed` with reason inactive. |
| SA21 | A Faculty account with **any class in the current school year** (`class_sections.instructor_user_id = userId`, `school_year = academic_current_school_year()`, not archived: `archived_at IS NULL`) is refused with 409 `faculty_has_current_classes` listing those classes (SA-example above). Past-year and archived classes do not block. |
| SA22 | A Student account has no such block (decision 15 names Faculty only). A Student who is a Class Secretary signs in with the Student's own account (REG-006; the database refuses a separate Secretary account for a Student with a canonical account), so one deactivation blocks both the Student and the Secretary sign-in and one reactivation restores both (answer 3). The People list shows such an account under Students. |
| SA23 | Targets other than an `active` Faculty or Student account are refused: Dean, Secretary-only, unknown id -> 404 `person_not_found`; already deactivated -> 200 no-op, no audit row (R3). A Dean can never deactivate a Dean (including themselves). |
| SA24 | **Reactivate** sets `Active`, clears `disabled_at`, bumps nothing, restores no session; the person signs in again with their existing password and 2FA. Records, enrolments and 2FA settings were never touched. |
| SA25 | `reason` optional, ≤ 500 chars, stored in the audit `reason` field. The UI asks for it in the confirm dialog but does not require it. |

### Errors

| Code | HTTP | Message |
|---|---|---|
| `person_not_found` | 404 | "Account not found." |
| `faculty_has_current_classes` | 409 | See example; includes `classes[]`. |
| `validation_failed` | 422 | "Reason is too long." etc. |
| (auth) | 401 / 403 | Existing. |

### Audit events (area People & accounts, Dean-visible, target_type `user`)

`account_deactivated` ("Account deactivated", before `status: Active`, after `status: Disabled`, reason), `account_reactivated` ("Account reactivated"). Record = "Dr. Ana Reyes · Faculty". Shown in the Dean's normal overview and in the person's own history is not needed (they cannot sign in).

## 6. UI (copy, do not invent; `docs/frontend.md` "Page patterns")

| Page part | Copies | Note |
|---|---|---|
| Page wrapper | `space-y-6 animate-fade-in max-w-7xl mx-auto` | all three pages |
| Mode switcher | Secretary / Student switcher in `Layout.tsx` | **new use, same markup** |
| List switch (Activity / Class work; Active / Retired; Faculty / Students) | Grey segmented bar, `ListToolbar` in `components/FilterBars.tsx` | search left, actions right |
| Filter row | Audit Trail filter card (`SystemAudit.tsx`); Rooms filter row for Course Catalog | Class-work filters added inside the same card |
| Tables | Existing `PeopleAndAccounts.tsx` / `CourseCatalog.tsx` preview tables (small-capital headers, decision 12) | already real layouts; sample data replaced |
| Edit / confirm dialogs | `Modal.tsx`; retire/restore confirm copies Rooms retire | |
| Notice banner | Remove the "Preview data" banner on these two pages; Class Sections keeps its banner | |
| Empty / error states | Nearest page's (Rooms) | |
| Deactivate dialog | Modal listing consequences ("signed out everywhere, records kept"); the blocked case shows the class list as links | |

Phones: same columns, table scrolls inside its box, 44 px tap targets, light and dark, checked at 375/768/1024/1280. A UI change needs the Before/After demo before commit (CLAUDE.local.md).

## 7. Tests to add

- **Backend (`tests/backend`)**: Dean-only on every new route (Faculty/Secretary/Student 403, no token 401); `scope=class_work` returns only class-work codes and the filters (faculty, class, student, date) narrow correctly; default scope still hides class work (regression); course edit/retire/restore incl. unique code, no-op writes no row, audit before/after; Faculty picker hides retired; existing class still shows retired course; retired code on class create -> 409; deactivate: status, `token_version`, sessions revoked, audit row, same transaction rollback if audit fails; refused with current-year classes listing them; past/archived classes do not block; reactivate then sign-in works; deactivated account refused on password, Google, refresh, reset.
- **Database (`tests/database/postgres_integration_test.php`)**: migration 060 applies on existing data, check constraint, `courses` rows default active; audit chain check still OK after new codes.
- **Frontend**: `tsc -b`; switcher shows only for Dean, route-based mode, `/admin/people` redirects.
- **E2E (`e2e/`)**: Dean toggles to Superadmin, class-work filter, retire a course and see it vanish from Faculty class-create, deactivate a Faculty with no classes, that user cannot sign in; blocked Faculty shows class list.

## 8. Files in scope (for the brief)

Backend: `routes/api.php`, new `controllers/SuperadminController.php` (or `AdminController.php` for audit scope), `app/audit_catalogue.php` (codes, `scope`, filters), `FacultyController.php` (`handle_faculty_courses_get`, course find at class create), `database/migrations/060_course_retire.sql`. Frontend: `components/Layout.tsx`, `App.tsx` (routes), `pages/admin/{AuditTrail,SystemAudit,CourseCatalog,PeopleAndAccounts}.tsx`, API client/types. Docs: `spec.md` (approved text below), `docs/frontend.md`, `docs/contracts/audit-logging.md`, README/API doc list of routes, PRODUCT_BACKLOG 4.5-4.7.

## 9. Proposed spec.md section (exact text, for Owner approval)

> ## ADM-001 - Superadmin mode
>
> **Status: CURRENT**
>
> Owner decisions (2026-11-14): Every Dean account may switch into Superadmin mode with a toggle like the Secretary's Student view. There is no separate role, flag or account. The mode is a view only: the Dean role authorises every administrative action, and the server does not track the mode.
>
> In Superadmin mode the Dean has three pages that the normal Dean view does not show: Audit Trail with class work, Course Catalog and People & Accounts.
>
> Class-work audit. The Audit Trail also lists class work (scores, assessments, grade weights, recomputes, attendance records and sessions, Excused requests, retention entries) with Faculty, class, Student and date filters and before/after values. It is read-only. The normal Dean overview and the Dashboard never show class work.
>
> Course Catalog. The Dean edits a course's code, title and units and may retire and restore a course. Retired courses leave Faculty's course pickers and cannot be typed again when creating a class; they stay on every existing class section. Faculty still add new course codes when creating a class. Courses are never deleted. Changes are audited.
>
> People & Accounts. The Dean sees Faculty (with each member's class sections) and Students and may deactivate or reactivate a Faculty or Student account. Deactivation blocks every sign-in, ends all sessions, keeps every record and is audited with a reason. A Faculty member who has a class section in the current school year cannot be deactivated; the Dean sees the classes that block it. Deactivating a Student who is a Class Secretary also blocks the Secretary sign-in, and reactivating restores both. Reactivation restores sign-in with the existing password and 2FA. The Dean cannot deactivate a Dean account.
>
> The Class Sections screen remains a non-authoritative preview. Details: `docs/contracts/superadmin.md`.

One-line edits to existing sections (each needs approval):

| Section | Edit |
|---|---|
| CLS-003, amendment of 2026-11-10 | Replace "The Dean/Admin class-section, course-catalog and people/accounts screens are non-authoritative UI previews built with sample data." with "The Dean/Admin class-section screen is a non-authoritative UI preview built with sample data; the course-catalog and people/accounts screens are real in Superadmin mode (ADM-001)." |
| SEC-005 Visibility | After "The Dean does not see class work (...)" add: "except in Superadmin mode (ADM-001), where the Audit Trail lists it read-only." |
| `audit-logging.md` section 3 and O1 | O1 becomes: "In Superadmin mode the Dean reads class-work rows on the Audit Trail (superadmin.md Part A)." Add the new codes `account_deactivated`, `account_reactivated`, `course_updated`, `course_retired`, `course_restored` to section 5 (People / Settings). |
| AUTH-007 Sessions | Add: "A deactivated account's sessions are ended and its sign-in refused until reactivation (ADM-001)." |
| SYS-001 Roles | Add: "Every Admin (Dean) account may use Superadmin mode (ADM-001); it is not a fifth role." |
| REG-005 / REG-006 | No change (deactivation does not alter invitations; a reactivated Faculty keeps their account). |

## 10. Owner answers (2026-11-14)

1. **Student in class-work rows: yes.** Class-work rows keep the student where the code carries one: score and grade rows hold `studentId` in the stored state, retention rows target the enrolment, attendance rows target the attendance record or request, which the Student filter resolves through the enrolment. No audited code needed a new payload field, so the filter also finds old rows; any new class-work code that involves a student must store the student the same way.
2. **A retired code typed by Faculty is refused** (SA16): "This course was retired by the Dean. Ask the Dean to restore it."
3. **A Student who is a Class Secretary:** deactivating the Student also blocks the Secretary sign-in; reactivating restores both (SA22). They share one account, so this needs no extra code.
4. **Defaults accepted:** opening class-work rows is not audited (SA11); a deactivated sign-in shows the existing message plus "Contact the Dean." (SA20); the Class Sections preview stays in the normal Dean view only (SA3); the superadmin can restore a retired course (SA17).

As built, the shapes differ from the examples above in these ways, none of them a change of rule: responses are flat; the person has no `program` (Students have no program field); `scope` outside `overview`/`class_work` is a 422 on field `scope` (code `VALIDATION_ERROR`); a Dean's `scope=class_work` also accepts `lookup=students&q=` (2+ characters, 20 results) for the Student filter.
