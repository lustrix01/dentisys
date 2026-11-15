# Account management contract (backlog 12.1): v4, agreed in /grill-me 2026-11-15

Status: decisions agreed with the Owner in `/grill-me` (2026-11-15). The spec amendment (section 9) still needs the Owner's approval of its exact text. No code yet.

## 1. Owner rulings

- The Dean and the Superadmin are one account. Superadmin mode stays a view of the Dean account (ADM-001), unchanged.
- There is exactly one Dean.
- Permissions come from the four fixed roles. There is no permission screen and no per-person switch.
- No role changes in the app. The Dean role changes hands only by a server script, about once every five years, and never while a term is in progress.
- Compromised college emails are a real, recurring case. The fix is to **move the account to a new email**, not to copy data to a new account.
- DentiSYS is separate from the college IT office. Confirmation is the Dean checking the person's university ID in person.

## 2. What exists now

| Fact | Where |
|---|---|
| Roles `admin` (Dean), `faculty`, `secretary`, `student`. The first Dean comes from `FIRST_DEAN_EMAIL` (REG-010). Nothing changes a role. | migrations `001`, `005`; `FacultyInvitationController.php:212` |
| Superadmin mode → People & Accounts has deactivate, reactivate, sign out everywhere, reset 2FA, resend or revoke invitation, revoke face enrollment, for Faculty and Students. | `SuperadminController.php` (`people_end_sessions`, `people_reset_2fa`, …) |
| "After activation, an account's email cannot be changed." A user cannot change their own login email. | spec line 357 |
| Names: each person changes only their own name (Change Name). Others' names "remain changeable only through the authorized role's own management tools". | spec line 1180, `account_identity_change_own_name` |
| A Student account's `login_email` must match its Student record's `bu_email` (deferred identity triggers, checked at commit). | migration `005` |
| Password reset uses one-time tokens with purpose `password_reset`. | `PasswordResetController.php` |
| `role_permissions` is seeded but no code reads it. | `002_seed_rbac.sql` |

## 3. What is added

1. **Move to new email**: an action in the app, for Faculty and Students (section 4).
2. **Edit name**: an action in the app, for Faculty and Students (section 5).
3. **Retired emails**: addresses moved away from can never be used again (section 6).
4. **Server script** `backend/bin/account-admin.php` with `transfer-dean`, `move-email` (Dean's own) and `unretire-email` (section 7).

Migration `062_retired_emails.sql` (additive): table `retired_emails (email citext/text unique lower, user_id, retired_at, reason)`. No change to roles.

## 4. Move to new email (in the app)

Where: Superadmin mode → People & Accounts → a Faculty or Student row → **Move to new email**. Dialog title **Move to New Email**. It is not on the Dean's own row and not on Invited rows.

Dialog fields: current email (read-only), **New Email** (local part, `@bicol-u.edu.ph` filled), **Reason** (required, 8 to 240 characters, like the other required reasons), checkbox **"I checked this person's university ID in person."** (required). The text under the title says: "Use this when the college has given this person a new email, for example because the old one was compromised. The old address will never work in DentiSYS again." The save button is "Move email".

`POST /api/admin/people/move-email` `{userId, newEmail, reason, idChecked: true}` → `{status:"ok", person}`. Dean role, same response and error style as the other People routes.

| Case | Result |
|---|---|
| `idChecked` not `true` | 422 on `idChecked` "Confirm that you checked this person's university ID in person." |
| Reason missing, under 8 or over 240 characters | 422 on `reason` (existing required-reason message) |
| Another domain | 422 on `newEmail` (AUTH-004 message) |
| Same as the current email | 422 `email_unchanged` "This is already the person's email." |
| Used by any account, Student record or pending invitation | 409 `email_taken` "That email address is already used by another account." |
| A retired address | 409 `email_retired` "That email address was retired and cannot be used again." |
| Dean account, own account, invited person | 422 `move_not_allowed` "Email moves are for Faculty and Student accounts that have signed up." |

In one transaction, all or nothing:
1. Add the old address to `retired_emails`.
2. Change the sign-in email. For a Student, their Student record email and Class Secretary sign-in change too.
3. Sign out everywhere, remove the password (the account cannot sign in with any old password), remove 2FA and recovery codes, remove the Google link, cancel unused password-reset tokens.
4. Issue a `password_reset` token and send it to the **new address only**: subject "Set your DentiSYS password", text "Your DentiSYS account now uses this address. Set a password to sign in." Same expiry as a password-reset link. Recorded in Email History with the Dean as sender.
5. Audit `account_email_moved` (People & accounts, Dean-visible): Email old → new, the reason, "University ID checked in person".

Deactivated accounts can be moved. The person can set the password, but cannot sign in until the Dean reactivates them.

Nothing is sent to the old address.

## 5. Edit name (in the app)

Where: People & Accounts → a Faculty or Student row → **Edit name**. Dialog title **Edit Name**: the five name fields (same fields, rules and messages as Change Name), plus **Reason** (required). Not on the Dean's own row (the Dean uses Change Name on their Profile). Invited people keep today's correction paths (Faculty Invitations for Faculty; Faculty for Student records).

`POST /api/admin/people/name` `{userId, name: {prefix, firstName, middleName, lastName, suffix}, reason}` → `{status:"ok", person}`. Nothing changed: 422 `name_unchanged`, no audit row. It recomposes `display_name` the same way Change Name does. Nobody is signed out.

Audit `account_name_changed_by_dean`: Field / Before / After per name part, with the reason.

## 6. Retired emails

A retired address is refused everywhere: password sign-in, Google sign-in, password reset (same neutral response as an unknown address), Faculty invitations, Student records and invitations, and Move to new email. Only `account-admin.php unretire-email` removes one, for example if the college gives the address back.

## 7. Server script (system administrator only)

Run on the server, for example `docker compose exec web php /var/www/html/backend/bin/account-admin.php <command>`. Every command prints what it will do, asks `Type YES to continue`, runs in one transaction, and audits as "System" with the reason.

| Command | Does | Refuses when |
|---|---|---|
| `transfer-dean --to <faculty email> --old-dean faculty\|deactivate --reason "…"` | The Faculty member becomes Dean. The outgoing Dean becomes Faculty (still teaches) or is deactivated (left). Both are signed out and emailed. | A term is in progress (today is between an academic term's start and end dates); the new Dean has a class whose term has not ended; the target is not an active Faculty member; `--old-dean` is missing (no default). |
| `move-email --to <new email> --reason "…"` | Section 4 steps for the Dean's own account. | Same address checks as section 4. |
| `unretire-email <email> --reason "…"` | Removes an address from `retired_emails`. | The address is not retired. |

The outgoing Dean keeps their records; their past actions stay in the Audit Trail under their name. Audit codes: `dean_transferred`, `account_email_moved` (actor System), `email_unretired`.

## 8. Worked example

1. Faculty member Dr. Lea Santos reports that her `lsantos@bicol-u.edu.ph` mailbox was compromised. The college gives her `lea.santos@bicol-u.edu.ph`.
2. She comes to the Dean's office with her university ID. The Dean opens Superadmin → People & Accounts → Faculty → Dr. Santos → Move to new email, types `lea.santos`, reason "Old mailbox compromised", checks the ID box, and saves.
3. Dr. Santos is signed out on every device. `lsantos@…` is retired. Only `lea.santos@…` receives "Set your DentiSYS password". She sets a password, signs in, sees her classes and grades unchanged, and sets up 2FA again.
4. Someone tries "Forgot password" with `lsantos@…`: the same neutral message as for an unknown address, and no email is sent.
5. Audit Trail: "Dean moved Dr. Lea Santos to a new email: lsantos@… → lea.santos@…, University ID checked in person".
6. Five years later, in the break between terms, the system administrator runs `transfer-dean --to bcruz@bicol-u.edu.ph --old-dean faculty --reason "New Dean appointed"`.

## 9. Spec amendment (exact text, needs Owner approval)

- **Line 357** (email): replace "After activation, an account's email cannot be changed." with "After activation, an account's email changes only by a move to a new email (ADM-001): the Dean moves a Faculty or Student account, and the system administrator moves the Dean's account with the server script. The old address is retired and can never be used again."
- **SYS-001** add: "There is exactly one Dean account. Permissions come from the four roles; there is no per-person permission. The Dean role changes hands only through the system administrator's server script, never while a term is in progress."
- **ADM-001 People & Accounts** add: "The Dean may also move a Faculty or Student account to a new email, after checking the person's university ID in person, and correct a Faculty or Student name; both are audited with a reason. Details: `docs/contracts/roles.md`."
- `audit-logging.md`: codes `account_email_moved`, `account_name_changed_by_dean`, `dean_transferred`, `email_unretired`.
- `docs/release-guide.md` or the README admin section: how to run `account-admin.php`.
