# Same-Host Single-Server Deployment Foundation

## Status: unfinished private-LAN prototype

This Compose configuration is within DentiSys deployment bounds, but it is not a supported production deployment process. It is an implementation foundation for controlled private-LAN testing on one host. DentiSys does not yet have the operational deployment workflow used by LearningFullStack.

It currently starts separate containers for Nginx frontend, PHP API, and PostgreSQL:

```text
Browser -> Nginx frontend -> PHP API -> PostgreSQL
```

Only the frontend HTTP port is published. PostgreSQL remains internal to Docker. Vite and pgAdmin are intentionally not included. Mailpit starts only when `EMAIL_PROVIDER=custom`; its UI is bound to the server's loopback address (`http://127.0.0.1:MAILPIT_UI_PORT`).

E-mail modes (`EMAIL_PROVIDER`):

- `smtp`: every e-mail is delivered through the configured SMTP server.
- `custom`: every e-mail is copied to Mailpit, and recipients on `EMAIL_TEST_ALLOWLIST` also receive it through SMTP. Faculty notices to anyone else are recorded as "Suppressed (test mode)". Mailpit holds copies of every message, including invitation links, so keep its UI private and switch to `smtp` at go-live.

## Setting it up

Follow [README Part B](../README.md#part-b-single-server-mode-future). It covers preparing the server, filling in `.env.single-server`, starting it with `scripts/start-single-server.ps1` (or `.sh`), inviting the first Dean, and stopping it. The stack runs under the Compose project name `dentisys-single-server`. The application and its API health check (`/api/health`) are served on `APP_HTTP_PORT` (default `8080`).

Do not run this prototype alongside the development stack unless one stack uses a different published application port.

P03 real Student authentication can be enabled in this private-LAN prototype with `STUDENT_AUTH_ENABLED=true`, provided production-grade SMTP and normal secret/TLS controls are configured. The development identity mock remains unavailable in production-like environments; browser-created Student credentials are never accepted. Admin-issued Faculty invitations and Faculty-issued, class-scoped Student invitations govern onboarding. Google Sign-In can be enabled with `GOOGLE_CLIENT_ID` and `ALLOWED_EMAIL_DOMAINS`; Google is optional identity verification during invitation acceptance, and password creation remains required.

## Why this is not deployment-ready

Before DentiSys can call this a supported single-server deployment, it needs:

- a defined deployment and operations runbook;
- TLS and reverse-proxy policy;
- firewall and private-network guidance;
- automated backups plus tested restore procedures;
- production secret storage and rotation;
- monitoring, alerts, and log-retention guidance;
- an upgrade, rollback, and database-migration procedure; and
- deployment automation.

Do not expose this prototype to the public internet. Its current Compose behavior is not a substitute for the missing operational controls.

## Future separate-server deployment

Running the application and PostgreSQL on different hosts remains unsupported and non-runnable. It will require explicit external PostgreSQL connectivity and credential rotation, restricted network rules, TLS/reverse-proxy handling, backups with restore verification, secret management, monitoring, and deployment automation. No deployment commands are supported for that model.
