# Dean and Superadmin split contract (backlog 13.9)

Status: **Current** (built 2026-11-18). Approved by the Owner 2026-11-18, including the wording (section 8) and the spec amendment (section 11, applied to `spec.md`). Product questions closed in `/grill-me` (2026-11-18, run inline). Behaviour demo: [Dean and Superadmin Split](https://claude.ai/artifact/CZpFMRPReiXgE4Tkze8how). Reverses the Owner's 12.1 ruling of 2026-11-15 (`roles.md` section 1: one account) and replaces ADM-001 "Superadmin mode". No code yet. Rules are numbered DS1.. so code and tests can cite them.

## 1. Owner rulings

| # | Ruling |
|---|---|
| D1 | Superadmin is a **fifth role on its own account**, not a mode of the Dean account. The Dean / Superadmin switcher goes away. |
| D2 | The Superadmin is **non-teaching staff** (for example the college's own IT or development team). The account is never Faculty, Student or Dean, and has its own pages. |
| D3 | There is **exactly one** Superadmin account. It is created **only by the server script** (`backend/bin/account-admin.php`). |
| D4 | Only the Superadmin's **email** changes by the server script. Everything else the Superadmin changes itself, like the Dean. (Revised 2026-11-18.) |
| D5 | The Superadmin has a **Profile like the Dean's** (Change Name, Change Password, 2FA) and Settings. **Forgot Password and Google sign-in work as for the Dean.** (Revised 2026-11-18.) |
| D6 | Authenticator **2FA is required**: set up in the app at the first sign-in, before any page opens, and it cannot be turned off. (Revised 2026-11-18.) |
| D7 | **Faculty Invitations stay with the Dean**: the Dean's invitation is the Faculty approval (REG). |
| D8 | The Dean keeps **Dashboard, Reports & Analytics and Faculty Invitations**. |
| D9 | **Classes, Course Catalog, Academic Terms and Rooms move to the Superadmin.** The Dean does not set them. |
| D10 | The Dean's Audit Trail becomes **My Activity**: only rows the Dean's own account did, like Faculty and Secretaries (SEC-005). |
| D11 | The Superadmin has **People & Accounts, Face Enrolment Flags and the extended Audit Trail** (Activity overview and class work). |
| D18 | **Lockout**: a server-script command removes the Superadmin's 2FA when it has lost both the authenticator and the recovery codes; it sets 2FA up again at the next sign-in. |
| D19 | **First password**: the script that creates the Superadmin emails a set-password link, like the first Dean's invitation (REG-010). Nobody else types the password. |
| D12 | **Grade change requests** (Faculty request, Dean approves or denies) are a later Dean page, out of scope here: backlog 13.8. |
| D13 | The **Latest Audit Events widget and the term-dates reminder leave the Dean Dashboard** for the Superadmin Overview. The Dean Dashboard keeps the Invite Faculty card, the counts and the charts. |
| D14 | The **Superadmin manages the Dean's account in the app**: People & Accounts lists the Dean with sign out everywhere, reset 2FA, edit name, move to new email, and **hand the Dean role to a Faculty member**. The `transfer-dean` script command is removed. The Dean is never simply deactivated: there is always one Dean. |
| D15 | **Handover rules = today's script rules**: the target is an active Faculty member; refused while a term is in progress or while the new Dean has a class whose term has not ended; the Superadmin must choose whether the outgoing Dean becomes Faculty or is deactivated (no default); reason required; both are signed out and emailed; audited. |
| D16 | **Rollout**: `docs/release-guide.md` gets a step right after the deploy that runs the script to create the Superadmin (Claude on demo, the Owner on production). The Dean loses the moved pages at deploy; no transition code. |
| D17 | The Superadmin's **email is a `@bicol-u.edu.ph` address** (AUTH-004), not used by any other account, Student record or invitation. A script email change retires the old address like every other email move. |

## 2. Who has what after the split

| Page | Today | After |
|---|---|---|
| Dashboard | Dean | Dean, without Latest Audit Events and the term reminder (D13) |
| Reports & Analytics | Dean | Dean |
| Faculty Invitations | Dean | Dean |
| Audit Trail | Dean (activity overview) | Dean: **My Activity**, own rows only (D10) |
| Profile | Dean | Dean and Superadmin (D5); the Superadmin's email is read-only |
| Settings | Dean | Dean and Superadmin |
| Overview | Superadmin mode | Superadmin, plus Latest Audit Events and the term reminder (D13) |
| People & Accounts | Superadmin mode | Superadmin, now also lists the Dean (D14) |
| Classes (preview) | Dean | Superadmin, still sample data (CLS-003 amendment) |
| Course Catalog | Dean | Superadmin |
| Academic Terms | Dean | Superadmin |
| Rooms | Dean | Superadmin |
| Face Enrolment Flags | Superadmin mode | Superadmin |
| Audit Trail, Activity + Class work | Superadmin mode | Superadmin |

## 3. Data (migration `068_superadmin_role.sql`, additive)

| # | Rule |
|---|---|
| DS1 | `ck_user_accounts_role` and `ck_role_permissions_role` allow `'superadmin'` (drop and re-add, as migration 005 did). No row changes. |
| DS2 | `CREATE UNIQUE INDEX uq_user_accounts_one_superadmin ON user_accounts ((role)) WHERE role = 'superadmin'`: the database refuses a second Superadmin row (D3). A new person in the job is the same account with a new email, name, password and 2FA (section 6). |
| DS3 | The Superadmin row uses the existing columns: five-part name (identity trigger composes `display_name`), `login_email`, `password_hash`, `position` "Superadmin". It starts `Pending Activation` with a `faculty_invitation` token (the purpose the first Dean's invitation uses) and becomes `Active` when the person sets the password (D19). Its 2FA is the existing `mfa_credential` and `mfa_recovery` tokens. |
| DS4 | Identity (REG-008): `account_identity_email_role_conflict` treats `superadmin` as staff. Its email cannot be used for a Student record, Student or Secretary account, Faculty invitation or the Dean, and the script refuses an email that any account, Student record or invitation uses. The existing deferred trigger already refuses a canonical Student link for a non-Student role. |

## 4. API

### 4.1 Route ownership

URLs stay as they are (AGENTS.md: preserve routes); only the role check changes. A new `superadmin_verify_auth()` copies `admin_verify_auth()` with role `superadmin` and the message "Access denied. Superadmin privileges required." (403).

| Routes | Role after |
|---|---|
| `/api/admin/dashboard/kpis`, `/api/admin/reports/*`, `/api/admin/retention/criteria`, `/api/admin/faculty-invitations*`, `/api/admin/email-logs` | Dean (`admin`), unchanged |
| `/api/admin/profile`, `/api/admin/settings` | **Dean and Superadmin**, each for their own account. For the Superadmin the email stays read-only. |
| `/api/admin/academic-terms*`, `/api/admin/courses*`, `/api/admin/rooms*`, `/api/admin/room-categories*`, `/api/admin/overview`, `/api/admin/people*`, `/api/admin/face-flags*`, `/api/admin/biometrics/revoke` | **Superadmin only** |
| `/api/admin/audit-logs` | Both, different views (DS7, DS8) |
| `/api/rooms` (picker for Faculty and Secretaries) | Unchanged; the role list stays `admin, faculty, secretary` (the Dean may still read rooms for reports). |

Wrong role: 403 with the existing error shape. No token: 401.

### 4.2 Changed responses

| # | Rule |
|---|---|
| DS5 | `GET /api/admin/dashboard/kpis` drops `recentAuditEvents` and `academicTermReminder`. |
| DS6 | `GET /api/admin/overview` adds `recentAuditEvents` (the latest 10 rows, same entry shape the Dashboard had, from the Superadmin's audit view). The term reminder is the existing `attention.nextTermMissing` row (DS20); no new field. |
| DS7 | `GET /api/admin/audit-logs` as the **Dean**: own rows only, the same rule as Faculty and Secretaries (`actor_user_id` = the Dean, sign-ins behind the Sign-ins filter). `scope`, `role`, `card` and `lookup` are ignored, as they are for Faculty today. No attention cards. |
| DS8 | `GET /api/admin/audit-logs` as the **Superadmin**: today's Dean overview and class-work behaviour unchanged (`scope`, `role` filter now also accepts `superadmin`, `card`, `lookup=students`, attention cards). The overview's "own rows" part means the Superadmin's own rows. Rows the Dean did that are not overview codes (for example report exports) stay in the Dean's My Activity only. |
| DS9 | `GET /api/admin/people` never lists the Superadmin. It lists the Dean under Faculty with `kind:"faculty"`, `isDean:true`; filters and counts treat the Dean as Faculty, except that the Dean never counts as "without classes" (the `classes=none` filter and the Overview's Needs Attention row). |

### 4.3 People & Accounts on the Dean (D14)

| Action | Dean row |
|---|---|
| Sign out everywhere, Reset 2FA, Edit name | Allowed; same routes, rules and audit as for Faculty. |
| Move to new email | Allowed. `move_not_allowed` now covers only invited people and the Superadmin; message "Email moves are for accounts that have signed up." |
| Deactivate | Refused: 422 `dean_not_deactivatable` "The Dean cannot be deactivated. Hand the Dean role to a Faculty member instead." |
| Resend or revoke invitation | Not shown (the Dean is not invited). |
| **Hand over Dean role** | New, below. |

`POST /api/admin/people/transfer-dean` (Superadmin) `{toUserId, oldDean: "faculty"|"deactivate", reason}` → `{status:"ok", dean: person, formerDean: person}`. The logic moves out of `account-admin.php` into one shared function; rules unchanged (D15):

| Case | Result |
|---|---|
| `oldDean` missing or another value | 422 on `oldDean` "Choose what happens to the current Dean." |
| Reason missing, under 8 or over 240 characters | 422 on `reason` (existing required-reason message) |
| Target not an Active Faculty account | 422 `not_active_faculty` "Only an active Faculty member can become Dean." |
| A term is in progress | 409 `term_in_progress` "A term is in progress (2026-2027 1ST, 2026-08-10 to 2026-12-18). Hand over the Dean role between terms." |
| The new Dean has a class whose term has not ended | 409 `new_dean_has_classes`, with `classes[]` like `faculty_has_current_classes` |

In one transaction: the target becomes `admin`; the outgoing Dean becomes `faculty` or is deactivated (the SA19 steps); both are signed out everywhere; audit `dean_transferred` (actor the Superadmin, reason); after commit both are emailed with the existing handover template (`email_template.php`), recorded in the email outbox with the Superadmin as sender (Email History), like the other People actions.

### 4.4 Sign-in and self-service for the Superadmin (D5, D6, D19)

Everything works as for the Dean except these rows.

| # | Path | Superadmin result |
|---|---|---|
| DS10 | `POST /api/auth/faculty/invitation`, `/faculty/activate` | Accept the Superadmin's invitation like the first Dean's (D19); activation sets the password and makes the account Active. |
| DS11 | `POST /api/auth/login`, `/api/auth/google` | When the Superadmin has 2FA, the existing code step. When it has none (first sign-in, or after the D18 reset): no session yet; the response is 200 `{"type":"two_factor_setup_required","two_factor_required":true,"two_factor_enrolled":false,"two_factor_setup_token":"<jwt>","expires_in":300}` (same style and lifetime as the existing 2FA challenge) and the app opens the **Set Up 2FA** step at `/2fa/setup`. |
| DS12 | `/api/auth/mfa/enroll/start`, `/enroll/confirm` | Also accept the `two_factor_setup_token` as the Bearer token. Confirm with a valid code stores the authenticator, shows the recovery codes once (8, as for every account), and only then issues the session (audited as today's 2FA turned on plus `login_success`). The setup token opens nothing else: every other route answers 401. |
| DS13 | `POST /api/auth/mfa/settings/revoke` | 403 `two_factor_required` "2FA is required for the Superadmin and cannot be turned off." Regenerating recovery codes works as for the Dean. |
| DS14 | Profile email | Read-only, with "Your login email changes only on the server. Contact the server administrator if it is wrong." |

`jwt.php` accepts role `superadmin`.

## 5. Screens

| # | Rule |
|---|---|
| DS16 | Superadmin sidebar, in order: **Overview** (`/superadmin/overview`, home), **People & Accounts**, **Classes** (`/superadmin/classes`), **Course Catalog** (`/superadmin/course-catalog`), **Academic Terms** (`/superadmin/terms`), **Rooms** (`/superadmin/rooms`), **Face Enrolment Flags**, **Audit Trail**, then **Profile** (`/superadmin/profile`) and **Settings** (`/superadmin/settings`). |
| DS17 | Dean sidebar: **Dashboard**, **Reports & Analytics**, **Faculty Invitations**, **My Activity** (`/admin/audit-trail`), plus Profile and Settings. |
| DS18 | The Dean / Superadmin switcher and the "Superadmin" top-bar chip are removed (the role is the account now). |
| DS19 | Routes: `/superadmin/*` is `ProtectedRoute allowedRoles={['superadmin']}`; anyone else goes to their own home. Old `/admin/terms`, `/admin/rooms`, `/admin/course-catalog`, `/admin/classes`, `/admin/academic-terms` redirect to the matching `/superadmin/` page (a Dean then lands on their Dashboard). The earlier `/superadmin/terms` etc. → `/admin/` redirects are removed. Home `/` for the Superadmin is the Overview. |
| DS20 | Overview: the setup tiles (term, courses, rooms) and the "next term has no dates" row open the `/superadmin/` pages. The term reminder is the Needs Attention card's existing "The next term has no dates yet" row, not a new banner (look check 2026-11-18, approved by the Owner: it shows whenever the next term has no dates, not only in the last 14 days). Latest Audit Events is the Dean Dashboard section moved as is, capped at 10 rows, its link opening `/superadmin/audit-trail`. |
| DS21 | People & Accounts: the Dean row shows a "Dean" badge (copies the existing status badge) and the actions in 4.3. **Hand Over Dean Role** dialog: copies the Move to New Email dialog (`Modal.tsx`): the outgoing Dean's name, a select of active Faculty, the required radio "The current Dean becomes: Faculty (still teaches) / Deactivated (left the college)", Reason (required), and the refusal list of classes as links, like the deactivate refusal. |
| DS22 | My Activity for the Dean: `AuditTrailPage` with the Faculty settings (title "My Activity", no list switch, no role filter, no attention cards). |
| DS23 | Profile and Settings for the Superadmin: the Dean's `Profile.tsx` and `Settings.tsx` as they are, without the Turn off 2FA button (DS13) and with the DS14 email note. |
| DS24 | **Set Up 2FA** step (new screen at `/2fa/setup`, DS11-DS12): a full page in the sign-in layout (copies `MfaVerify.tsx`) holding the Profile's existing 2FA setup parts (QR code, Manual setup, code field), then a "Save Your Recovery Codes" step with "I saved these codes." and Continue. Title "Set Up 2FA", text "The Superadmin account needs 2FA. Scan the code with your authenticator app, then type the 6-digit code." After the recovery codes are confirmed saved, the app opens the Overview. |

Every part copies an existing one; the only new screen is DS24, built from existing parts. The look was approved from real screenshots on 2026-11-18 (demo link at the top; the reviewed patch is in `audit-output/dean-superadmin-split/shots/`), including the Role Capabilities lines on both Profiles: Dean "Analytics and reports / Faculty invitations", Superadmin "Accounts, classes, courses, terms and rooms / Audit trail with class work".

## 6. Server script (`account-admin.php`)

Same style as today: prints what it will do, `Type YES to continue`, one transaction, audits as System with the reason. No command takes or prints a password.

| Command | Does | Refuses when |
|---|---|---|
| `create-superadmin --email <e> --first <f> --last <l> [--prefix --middle --suffix] --reason "…"` | Creates the one Superadmin as Pending Activation and emails a set-password link (same template and 7-day expiry as the first Dean's invitation, worded for the Superadmin; recorded in the email outbox like Faculty invitations). Run again while the account is still pending: revokes the old link and sends a new one; a different email replaces a mistyped one (same email checks). The setup token is checked against the account on use (Active Superadmin, same token version), so signing out cancels it. | An Active Superadmin exists; email not `@bicol-u.edu.ph`, used or retired (D17). |
| `reset-superadmin-2fa --reason "…"` | Lockout only (D18): revokes the authenticator and recovery codes and signs the Superadmin out everywhere; the next sign-in opens Set up 2FA. | No Superadmin, or it has no 2FA. |
| `move-email --to <e> --reason "…"` | Now moves the **Superadmin's** email (the Dean's moves are in the app, D14), with the roles.md section 4 steps: old address retired, signed out, password and 2FA removed, set-password link to the new address only. | Same address checks as today. |
| `unretire-email <e> --reason "…"` | Unchanged. | |
| ~~`transfer-dean`~~ | Removed (D14). | |

A new person taking the job: `move-email` to their address. They set their own password, set up 2FA at the first sign-in and change the name in Profile.

## 7. Audit

| Code | Label | Area | Visible to |
|---|---|---|---|
| `superadmin_invited` | Superadmin invited | People & accounts | Superadmin |
| `superadmin_2fa_reset` | Superadmin 2FA reset on the server | Sign-in & security | Superadmin |

The Superadmin's own password, name and 2FA changes, and accepting the invitation, write the same codes as the Dean's.
| `dean_transferred` (existing) | Dean role handed over | People & accounts | Superadmin; also in each person's own My Activity |

Existing codes keep their stored names (rows never change). Labels that say "by the Dean" become neutral, because the Who column shows the actor: `mfa_reset_by_dean` "2FA reset", `sessions_ended_by_dean` "Signed out everywhere", `student_invitation_resent_by_dean` "Student invitation resent", `student_invitation_revoked_by_dean` "Student invitation revoked", `account_name_changed_by_dean` "Name corrected". New rows from these actions store actor role `superadmin`. The "Dean-visible" flag in `audit_catalogue.php` now means "in the Superadmin overview".

## 8. Wording seen by users (needs the Owner's OK)

Recommendation: call the role **"the Superadmin"** everywhere users read it, the same word as the paper and the sidebar.

| Where | Now | After |
|---|---|---|
| Deactivated sign-in (`auth_runtime.php`) | "… Contact the Dean." | "… Contact the Superadmin." |
| Course retired (Faculty class create) | "This course was retired by the Dean. Ask the Dean to restore it." | "This course was retired. Ask the Superadmin to restore it." |
| Retired room (class, session, auto-sessions, `RoomSelector`) | "{room} was retired by the Dean. Pick another room." | "{room} was retired. Pick another room." |
| Missing room location (auto-sessions) | "… Ask the Dean to set it in Rooms." | "… Ask the Superadmin to set it in Rooms." |
| No term (Faculty class create, `academic_year.php`) | "Ask the Dean to set its dates." / "Ask the Dean to add the term(s)…" | "Ask the Superadmin to …" |
| Session reasons and emails | "Signed out by the Dean", "Reset by the Dean", "2FA reset by the Dean", "Revoked by the Dean", the 2FA-reset email "the Dean reset your 2FA … contact the Dean" | "… by the Superadmin", "contact the Superadmin" |
| "Contact the Dean" for a wrong Student record or own login email (`account_identity.php`, controllers) | | "Contact the Superadmin." (the Superadmin fixes accounts now) |
| `apiClient.ts` 403 | "Access denied. Contact the Dean." | "Access denied." |

## 9. Tests

- **Database** (`tests/database`): migration 068 on existing data; a second `superadmin` row is refused; a Superadmin email cannot become a Student record (identity rules).
- **Backend** (`tests/backend`): every route in 4.1 refuses the wrong role (Dean 403 on Superadmin routes, Superadmin 403 on Dean routes, Faculty/Secretary/Student 403, no token 401); DS5-DS9; Dean row actions and `dean_not_deactivatable`; transfer-dean every case in 4.3 incl. rollback; DS10-DS14 for the Superadmin (invitation activation; no-2FA sign-in returns only a setup token, which opens nothing else; enroll with it issues the session; revoke refused; password, Google and reset work); script commands (create refuses a second Active one and reissues for a pending one, email checks, lockout reset revokes codes and signs out, move-email). Existing Dean tests for moved routes switch to a Superadmin token; tests asserting old behaviour are updated, never weakened.
- **Frontend** (`tsc -b`, unit): sidebars per role, `/superadmin/*` guard and the redirects in DS19.
- **E2E mocked** (`e2e/`): Superadmin navigates every page; Dean sees only its four pages; Hand Over Dean Role dialog; first sign-in lands on Set up 2FA. `e2e/fixtures.ts` gets the Superadmin session.
- **E2E live** (`e2e/live/`): Superadmin sign-in with password + TOTP from the dev seed; Dean My Activity shows only own rows.
- **Dev seed** (`database/seeds/generate_development_demo.py`): `superadmin@` with password `Superadmin123!` and a fixed development TOTP secret, listed with the other dev accounts.

## 10. Files in scope

Backend: `routes/api.php` (unchanged URLs), `controllers/AdminController.php` (`superadmin_verify_auth`, audit-logs, dashboard), `controllers/SuperadminController.php`, `controllers/RoomController.php`, `app/audit_catalogue.php`, `app/auth_runtime.php`, `app/jwt.php`, `app/account_identity.php`, `controllers/{GoogleAuth,Auth,Mfa,FacultyInvitation,Faculty}Controller.php`, `app/{academic_year,attendance_sessions,class_meetings,auto_sessions,email_template}.php`, `bin/account-admin.php`, `database/migrations/068_superadmin_role.sql`, dev seed. Frontend: `App.tsx`, `components/Layout.tsx`, `components/AuditTrailPage.tsx`, `pages/admin/{Dashboard,SuperadminOverview,PeopleAndAccounts,AuditTrail,Profile,Settings}.tsx`, a Set up 2FA page beside `pages/auth/MfaVerify.tsx`, `types/auth.ts`, `services/{authService,apiClient}.ts`, `components/{RoomSelector,AutoSessionsPanel}.tsx`, `pages/faculty/ClassesAndRosters.tsx`. Docs: `spec.md` (section 11), `docs/contracts/{superadmin,roles,audit-logging}.md`, `docs/frontend.md`, `docs/features.md`, README dev accounts, `docs/release-guide.md` (D16), `docs/PRODUCT_BACKLOG.md` 13.9.

## 11. Spec amendment (exact text, needs Owner approval)

**SYS-001**, replace the list and the two paragraphs after it with:

> DentiSYS has five application roles:
>
> * Superadmin
> * Admin (Dean)
> * Faculty
> * Secretary
> * Student
>
> There is exactly one Superadmin account and exactly one Dean account. The Superadmin is non-teaching staff and never holds another role. Permissions come from the roles; there is no per-person permission. The Superadmin account is created only by the system administrator's server script, which emails it a set-password link, and its email changes only by that script. The Superadmin hands the Dean role to a Faculty member in the app, never while a term is in progress (ADM-001).

**ADM-001**, retitle "ADM-001 - Superadmin" and replace the first two paragraphs with:

> Owner decision (2026-11-18): the Superadmin is its own role and account (SYS-001). The Dean views analytics and reports and invites Faculty; the Superadmin sets up the system and manages accounts.
>
> The Dean has Dashboard, Reports & Analytics, Faculty Invitations, My Activity (only the Dean's own actions, SEC-005), Profile and Settings.
>
> The Superadmin has Overview, People & Accounts, Classes, Course Catalog, Academic Terms, Rooms, Face Enrolment Flags (BIO-009), the Superadmin Audit Trail, Profile and Settings. Its Profile works like the Dean's, except that its email is read-only and its authenticator 2FA is required: it sets 2FA up at its first sign-in and cannot turn it off. The Overview shows the open face enrolment flags, the latest audit events and the reminder to add the next term's dates.

In the rest of ADM-001, "the Dean" becomes "the Superadmin" in the Class-work audit, Course Catalog and People & Accounts paragraphs; "The Dean cannot deactivate a Dean account." becomes "The Superadmin cannot deactivate the Dean; the Dean role moves only by a handover."; add: "The Superadmin may also sign the Dean out, reset the Dean's 2FA, move the Dean to a new email, correct the Dean's name, and hand the Dean role to an active Faculty member, choosing whether the outgoing Dean stays as Faculty or is deactivated; a handover is refused while a term is in progress or while the new Dean has a class whose term has not ended." The sentence "The Dean view's Audit Trail, the Activity view and the Dashboard never show class work." becomes "The Dean's My Activity and Dashboard never show class work." History adds "2026-11-18 Superadmin became its own role and account."

**SEC-005 Visibility**: "The Dean sees an overview: … except in Superadmin mode (ADM-001), where the Audit Trail lists class work read-only" becomes "Faculty, Secretaries and the Dean see only rows their own account did (My Activity). The Superadmin sees an overview: people and accounts, roles, settings and terms, security events (…), biometric consent and deletions, and everything the Superadmin's own account did, and lists class work read-only (ADM-001)." The rest of the sentence keeps its wording with "Dean" → "Superadmin".

**REG-009**: "the Dean moves a Faculty or Student account, and the system administrator moves the Dean's account with the server script" → "the Superadmin moves a Faculty, Student or Dean account, and the system administrator moves the Superadmin's account with the server script".

**REG-008**: "a staff member (Faculty, or the Dean/Admin)" → "a staff member (Faculty, the Dean/Admin, or the Superadmin)"; the two "Dean" email rules add "or Superadmin".

**AUTH-006**: "The Dean may reset a Faculty or Student account's 2FA" → "The Superadmin may reset a Faculty, Student or Dean account's 2FA"; add "2FA is required for the Superadmin: it is set up at the first sign-in before any page opens and cannot be turned off. Only the system administrator's server script resets it, when the Superadmin has lost both its authenticator and its recovery codes."

**ACA-002**: title "ACA-002 - Defined academic terms"; "The Dean (Admin) defines academic terms." → "The Superadmin defines academic terms."; the other "the Dean" → "the Superadmin"; "the Dean dashboard shows an in-app reminder" → "the Superadmin Overview shows an in-app reminder". "Dean-defined term" becomes "defined term" here and in BIO-005, CLS-002 and IMP-001.

**ROOM-001**: title "ROOM-001 - Managed rooms"; "The Dean manages" → "The Superadmin manages"; "The Dean may create" → "The Superadmin may create". **ATT-001**: "one from the Dean's list" → "one from the room list (ROOM-001)".

**BIO-009**: "flags … for the Dean" and "The Dean may dismiss" → "the Superadmin"; "the Dean sees consent changes" → "the Superadmin sees consent changes". **BIO-008**: unchanged (invitations still come from the Dean or Faculty).

**CLS-003 amendment**: "The Dean/Admin class-section screen is a non-authoritative UI preview built with sample data; the course-catalog and people/accounts screens are real in Superadmin mode (ADM-001)." → "The Superadmin's class-section screen is a non-authoritative UI preview built with sample data; the course-catalog and people/accounts screens are real (ADM-001)."

**UI-001**: role names list adds "Superadmin".

**ID-002**: "Each role (Dean, Faculty, Secretary, Student)" → "Each role (Superadmin, Dean, Faculty, Secretary, Student)".

Not changed: REG-010 (the first Dean still comes from deployment configuration), GRD-002 and UI-003 (Dean reports and the Dean's official layouts stay the Dean's).
