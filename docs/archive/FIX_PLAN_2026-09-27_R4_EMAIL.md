# DentiSys Fix Plan — Round 4a (2026-09-27): send real email in development

Branch `lumbanglighthal`. Same ground rules as the earlier plans: Docker only, never edit `spec.md`, **never read, print or commit `.env`**, one commit, do not push, do not merge. If any text to find is missing or any output differs from "Expected", stop and report it verbatim. Files mix CRLF/LF line endings: match "Find" text ignoring line endings and keep each file's existing endings.

## Why

The mailer already supports a real SMTP server (`EMAIL_PROVIDER=smtp`), and the single-server stack already uses it. The **development** stack cannot, because `docker-compose.yml` never passes `SMTP_USER`, `SMTP_PASS` or `SMTP_CA_FILE` to the `web` container, so it cannot log in to a real mail server. This plan adds those three settings, and makes sure the automated test stack keeps using Mailpit even when `.env` is set up for real email (otherwise `check-postgres.ps1` would send test emails to real addresses).

Reviewer check: with these settings, the existing mailer was tested against an SMTP server that requires STARTTLS, a verified certificate and a login. It delivered the message, and it correctly refused a server whose certificate it could not verify.

## Phase 1 — Compose settings

Commit message: `fix(email): pass SMTP credentials to the development web container; keep tests on Mailpit`

### Task 1.1 — `docker-compose.yml`

Find (in the `web` service `environment`):
```yaml
      SMTP_FROM: ${SMTP_FROM:-noreply@dentisys.local}
```
Replace with:
```yaml
      SMTP_FROM: ${SMTP_FROM:-noreply@dentisys.local}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
      SMTP_CA_FILE: ${SMTP_CA_FILE:-}
```

### Task 1.2 — `docker-compose.test.yml`

Find (in the `web` service `environment`):
```yaml
      EMAIL_PROVIDER: mailpit
```
Replace with:
```yaml
      EMAIL_PROVIDER: mailpit
      # Tests always use Mailpit, even when .env is set up for real email.
      SMTP_HOST: mailpit
      SMTP_PORT: "1025"
      SMTP_USER: ""
      SMTP_PASS: ""
      SMTP_ENCRYPTION: none
      SMTP_VERIFY_PEER: "false"
      SMTP_CA_FILE: ""
```

### Task 1.3 — `.env.example`

Find:
```
# SMTP Mailer Settings
```
Replace with:
```
# SMTP Mailer Settings
# Default: all development email goes to Mailpit (http://localhost:8025).
# To send REAL email in development, set EMAIL_PROVIDER=smtp and fill in a real
# SMTP account, for example a Google account with an App Password:
#   EMAIL_PROVIDER=smtp
#   SMTP_HOST=smtp.gmail.com
#   SMTP_PORT=587
#   SMTP_ENCRYPTION=starttls
#   SMTP_VERIFY_PEER=true
#   SMTP_USER=your.sender@gmail.com
#   SMTP_PASS=<16-character App Password>
#   SMTP_FROM=your.sender@gmail.com
# Real email is delivered to whatever address a user has, including demo accounts.
```

### Task 1.4 — `docs/development-environment.md`

At the end of the file, add:
```markdown
## Sending real email in development

By default every email (invitations, password resets, notifications) is caught by Mailpit at http://localhost:8025 and never leaves your computer. To deliver real email, set these in your own `.env` (never commit it): `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_ENCRYPTION=starttls` (or `tls`), `SMTP_VERIFY_PEER=true`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` — see the commented example in `.env.example`. Then run `docker compose up -d web` so the container picks up the change. Encrypted SMTP with certificate checking is required whenever `EMAIL_PROVIDER=smtp`.

Warnings:
- Real email goes to the recipient's real address. Demo accounts use `@bicol-u.edu.ph` addresses that may belong to real people, so do not send invitations or password resets to demo accounts while real email is on. Test with your own address instead.
- Links inside emails use `APP_BASE_URL` (`http://localhost:5173` by default), so they only open on the computer that runs DentiSys.
- `check-postgres.ps1` and the automated tests always use Mailpit, whatever `.env` says.
- Switch back to Mailpit by setting `EMAIL_PROVIDER=mailpit` and `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_ENCRYPTION=none`, `SMTP_VERIFY_PEER=false`, then `docker compose up -d web`.
```

### Task 1.5 — Check and commit

```powershell
docker compose config --quiet
docker compose -f docker-compose.yml -f docker-compose.test.yml config --quiet
docker compose run --rm --no-deps -v "${PWD}:/workspace:ro" web php /workspace/tests/documentation/doc_contract_test.php
```
Expected: both `config` commands print nothing and exit 0; the doc test prints PASS. Commit.

## Phase 2 — Owner turns on real email (Owner only; the agent does not touch `.env`)

1. Choose the sending account. For a Google account: turn on 2-Step Verification, then create an App Password (Google Account → Security → App passwords). A Workspace (`@bicol-u.edu.ph`) account works the same way if the university allows App Passwords; otherwise ask ICTO for their SMTP host and login.
2. In your own `.env`, set the values from the `.env.example` comment (Task 1.3). `SMTP_FROM` must be the same address as `SMTP_USER` for Gmail.
3. Apply: `docker compose up -d web`, then `docker compose ps` (web healthy).

## Phase 3 — Verify (Owner, or agent with the Owner watching)

1. Sign in as `dr.delrosario@bicol-u.edu.ph` / `Faculty123!`, open **My Classes & Rosters → DENT-1B → Add Student**, and register a test student whose email is **your own** institutional address. Then click **Invite** on that student.
2. Expected: the page reports the invitation was sent, and the email arrives in your real inbox (check spam) within a minute. Nothing new appears in Mailpit.
3. If it fails, the page shows "delivery failed". Collect `docker compose logs web --since 5m` and report it verbatim. Common causes: wrong App Password, `SMTP_FROM` different from `SMTP_USER`, or the university blocking outgoing SMTP on port 587.
4. Run the gates to confirm tests still use Mailpit: `.\scripts\check.ps1` and `.\scripts\check-postgres.ps1` — same results as after Round 3 (107/17; integration passes; live 5/3 with the three known failures).
