# Development Environment: Details

The step-by-step setup is in the [README](../README.md#part-a-development-environment). This page covers the topics that go beyond it.

## pgAdmin

1. Open http://127.0.0.1:5050 and sign in with `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` from `.env`.
2. The **DentiSys PostgreSQL (development)** server is already registered. Select it and enter `DB_PASS` from `.env` when prompted.
3. Browse data at **Databases → dentisys → Schemas → public → Tables**, or open **Tools → Query Tool** on `dentisys` to run SQL.

### Reset only pgAdmin

This removes saved pgAdmin preferences and sessions without touching PostgreSQL:

```powershell
docker compose stop pgadmin
docker compose rm -f pgadmin
docker volume rm dentisys_dentisys_pgadmin_data
docker compose up -d pgadmin
```

It removes only the pgAdmin volume, not the database volume `dentisys_dentisys_postgres_18_data`.

## Demo data details

The demo seed ([`database/seeds/development-demo.sql`](../database/seeds/development-demo.sql)) contains accounts, courses, classes, students, grades, remedial progressions, and attendance history for school years 2024-2025, 2025-2026, and 2026-2027 (current). It loads only when the `students` table is empty, so rerunning it is safe. It makes no schema changes and never drops, truncates, updates, or deletes data.

The seeded classes need grade weights before they can be graded. `start-dev.ps1` creates them, or run `docker compose exec web php /var/www/html/backend/bin/bootstrap-grade-weights.php` (add `--dry-run` to only list them). It creates a period configuration for each course offering that has none, using the course's stored ratios, and links existing assessments. Faculty can change the weights in Grade Computation afterwards.

No face (biometric) profiles are seeded; complete Face Registration before testing biometric attendance. All accounts are listed in [demo-accounts.md](demo-accounts.md).

## Google Sign-In testing

A seeded account is not automatically a real Google identity. `faculty@bicol-u.edu.ph` works with Google Sign-In only when that exact address is an allowed Google Workspace account controlled by the tester.

1. Use a real allowed institutional Google account that you control.
2. Make sure a DentiSys account has exactly that `login_email`, created through the normal DentiSys workflow when necessary.
3. Start Google Sign-In, confirm the existing DentiSys password, and complete MFA if enabled.
4. Log out, sign in with Google again, and confirm that e-mail and password sign-in still works.

Google never creates DentiSys accounts and does not replace the password. One Google identity cannot be linked to several DentiSys accounts, so do not reuse one Google account across the demo roles. Never write Google ID tokens, passwords, MFA codes, OAuth secrets, or real credentials into documentation or logs.

## Student authentication

The demo Student `student@bicol-u.edu.ph / Student123!` has a linked account and an active enrollment. An established Student account can sign in with e-mail and password, or with Google when it is configured; `STUDENT_AUTH_ENABLED` does not turn those off. The flag controls Student invitation activation and the server-issued development mock session. Student onboarding starts only from a Faculty-issued invitation tied to an active class enrollment.

Activation e-mail arrives in Mailpit. The activation link carries a one-time token; the browser removes it from the address bar immediately and never stores it.

## Sending real e-mail in development

E-mail modes are described in the [README](../README.md#a7-choose-how-e-mail-is-delivered). Before using `smtp` or `custom`:

- Real e-mail goes to real addresses. Demo accounts use `@bicol-u.edu.ph` addresses that may belong to real people, so prefer `custom` with your own address on `EMAIL_TEST_ALLOWLIST`.
- Links in e-mails use `APP_BASE_URL` (`http://localhost:5173` by default), so they open only on the computer running DentiSys.
- The automated tests always deliver to their own Mailpit, whatever `.env` says.
- To switch back, set `EMAIL_PROVIDER=mailpit`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_ENCRYPTION=none`, `SMTP_VERIFY_PEER=false`, then run `docker compose up -d web`.

## Testing on a phone (same Wi-Fi)

Phone browsers allow the camera only on HTTPS or `localhost`. For development only:

1. Run `.\scripts\dev-lan-https.ps1`. It creates a self-signed certificate for your PC's network address in `frontend/certs/` (ignored by Git, valid 30 days), sets `FRONTEND_BIND_ADDRESS=0.0.0.0` and `VITE_DEV_HTTPS=true` in `.env`, and restarts the frontend.
2. On the phone, open the `https://<your-PC-IP>:5173` address the script prints and accept the certificate warning (Advanced → Proceed).
3. If the phone cannot connect, allow the port once from an administrator PowerShell:
   `New-NetFirewallRule -DisplayName "DentiSys dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private`

While this is on, your PC also uses `https://localhost:5173`. Google Sign-In does not work from a network address unless that origin is added to the Google OAuth client. Anyone on the same network can reach the site; turn it off with `.\scripts\dev-lan-https.ps1 -Disable`.

## Disposable integration stack

`.\scripts\check-postgres.ps1` creates a separate Compose project (`dentisys-integration`). In that project it:

- applies the demo seed twice;
- checks migrations, roles, sequences, and logs;
- runs the PHP integration tests and the live browser tests.

It then removes that project; it never touches your development database. Add `-KeepStack` to inspect the test environment afterwards. With a running test stack configured through `E2E_BASE_URL`, the live browser tests also run with `npm run test:e2e:live`.
