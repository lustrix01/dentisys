# Academic and role backend contract

This packet describes the backend work delivered for the local demo. The shared route registry contains the handlers listed below; the snippets are also the stable contract for frontend integration.

## Faculty roster and persistence

Existing routes remain:

| Method | Path | Handler | Purpose |
|---|---|---|---|
| GET | `/api/faculty/students` | `handle_faculty_students` | Returns active enrollments in the authenticated Faculty member's assigned classes. |
| POST | `/api/faculty/students` | `handle_faculty_student_create` | Creates a canonical Student and an active enrollment in one owned class. |
| GET | `/api/faculty/classes/available-students` | `handle_faculty_class_available_students` | Returns Students without an active enrollment in the selected owned class. |
| POST | `/api/faculty/classes/enroll` | `handle_faculty_class_enroll_students` | Inserts or revives active enrollment rows in an owned class. |
| POST | `/api/faculty/classes/unenroll` | `handle_faculty_class_unenroll_student` | Archives the active enrollment and preserves grade/attendance history. |

The profile-edit route is registered as:

```php
[
    'method' => 'PUT',
    'path' => '/api/faculty/students/{student_id}',
    'handler' => 'handle_faculty_student_update',
    'has_params' => true,
],
```

The update body may contain `firstName`, `middleName`, `lastName`, `email`, `contact`, `sex`, `yearLevel`, `status`, `admissionDate`, and `birthdate`. `studentNumber`, enrollment membership, course identity, and class ownership are protected. A Faculty request is accepted only when the Student has an enrollment in one of the caller's class sections. Email validation uses the configured `ALLOWED_EMAIL_DOMAINS` policy. Invalid fields return `422` with `code: VALIDATION_ERROR`; an unowned Student returns `403`.

Unenroll returns `enrollmentStatus: "Archived"`; re-enrolling the same Student/class revives that enrollment row. Historical assessment scores, attendance records, and enrollment-linked audit history remain addressable.

## Secretary class and attendance reads

The existing `GET /api/secretary/dashboard/kpis` accepts optional `csId` and returns `assignedClasses`, the selected `assignedClass`, and counts computed from active enrollments and persisted attendance. Empty attendance is represented by `attendanceRate: null`.

The existing `GET /api/secretary/attendance` accepts optional `date`, `csId`, and `sessionId` query parameters and returns both `sessions` and `records`. A selected session must belong to an assigned class; otherwise the endpoint returns `404`. A selected class outside the Secretary assignment returns `403` when a date/session selection is made. Records are filtered from PostgreSQL by the selected date/session, not by a local list.

The Secretary activity route is registered as:

```php
[
    'method' => 'GET',
    'path' => '/api/secretary/activity',
    'handler' => 'handle_secretary_activity_get',
    'has_params' => false,
],
```

It returns `{status: "ok", activity: [...]}` scoped to audit events performed by the authenticated Secretary account.

When a manual override body includes `sessionId`, the selected attendance record must belong to that session or the request returns `422`. Existing `recordId` callers remain supported while the frontend adopts the date → session → record flow.

## Student academic reads

The following routes require a valid access token whose canonical role is `student`. The Student identity is resolved from the token subject through `students.student_account_user_id`; no Student id query parameter is accepted.

```php
[
    ['method' => 'GET', 'path' => '/api/student/profile', 'handler' => 'handle_student_profile_get', 'has_params' => false],
    ['method' => 'GET', 'path' => '/api/student/classes', 'handler' => 'handle_student_classes_get', 'has_params' => false],
    ['method' => 'GET', 'path' => '/api/student/retention', 'handler' => 'handle_student_retention_get', 'has_params' => false],
    ['method' => 'GET', 'path' => '/api/student/dashboard', 'handler' => 'handle_student_dashboard_get', 'has_params' => false],
]
```

Classes and retention include active class enrollments, persisted grades and percentages, `null` for pending grade values, retention state, remedial JSON, and clinical hours. Dashboard GWA and attendance rate are `null` when there are no authoritative values. No fixed academic value is emitted.

## Notifications

Migration `016_academic_notifications.sql` adds `notifications`, with a recipient foreign key, unread state, and a recipient-scoped unique deduplication key. Retention/remedial updates insert a notification in the same transaction as the enrollment update. Repeating the same enrollment/status emission returns `created: false` and creates no duplicate row.

The notification routes are registered as:

```php
[
    ['method' => 'GET', 'path' => '/api/notifications', 'handler' => 'handle_notifications_list', 'has_params' => false],
    ['method' => 'POST', 'path' => '/api/notifications/{notification_id}/read', 'handler' => 'handle_notification_mark_read', 'has_params' => true],
    ['method' => 'POST', 'path' => '/api/notifications/read-all', 'handler' => 'handle_notifications_mark_all_read', 'has_params' => false],
]
```

`GET /api/notifications` supports `unreadOnly=true` and `limit` (1–100). The response includes `notifications` and `unreadCount`. Mark-read only updates a notification whose `recipient_user_id` matches the token subject; another recipient receives `404`.

## Faculty invitation lifecycle

The existing Admin invitation create/list/reissue routes remain authoritative. The lifecycle routes are registered as:

```php
[
    ['method' => 'POST', 'path' => '/api/admin/faculty-invitations/update', 'handler' => 'handle_admin_faculty_invitation_update', 'has_params' => false],
    ['method' => 'POST', 'path' => '/api/admin/faculty-invitations/revoke', 'handler' => 'handle_admin_faculty_invitation_revoke', 'has_params' => false],
]
```

Update accepts `id`, `email`, and either the compatibility `name` or structured `prefix`, `firstName`, `middleName`, `lastName`, `suffix`. It applies the configured institutional email allowlist, requires a pending Faculty account, revokes all previous live invitation tokens, increments the account token version, issues a fresh seven-day token, and records an audit event. Revoke invalidates all live invitation tokens for a pending Faculty account and leaves the account available for a later explicit reissue. Non-pending or unowned records return a truthful `409`/`404` error.

## Integration notes

`StudentAcademicController.php` and `NotificationController.php` are required by `backend/routes/api.php`. `NotificationController.php` loads `backend/app/notifications.php`; `FacultyController.php` loads the same helper for remedial emission. No biometric route or schema is changed here; migration `017` remains available for the biometric owner.
