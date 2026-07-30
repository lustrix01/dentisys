# Same-Host Single-Server Deployment Foundation

## Status: unfinished private-LAN prototype

This Compose configuration is within DentiSys deployment bounds, but it is not a supported production deployment process. It is an implementation foundation for controlled private-LAN testing on one host. DentiSys does not yet have the operational deployment workflow used by LearningFullStack.

It currently starts separate containers for Nginx frontend, PHP API, and PostgreSQL:

```text
Browser -> Nginx frontend -> PHP API -> PostgreSQL
```

Only the frontend HTTP port is published. PostgreSQL remains internal to Docker. Vite, Mailpit, and pgAdmin are intentionally not included.

## Controlled prototype startup

Use these commands only for implementation testing in a controlled private-LAN environment:

```powershell
Copy-Item .env.single-server.example .env.single-server
```

Before starting, replace every placeholder with deployment-specific values:

- `APP_BASE_URL` with the public absolute `http://` or `https://` URL used by browsers (for example, `https://dentisys.example.edu`)
- `DB_PASS` and `DB_ADMIN_PASS`
- `JWT_SIGNING_KEY_B64`, `MFA_ENCRYPTION_KEY_B64`, and `AUDIT_MAC_KEY_B64`
- SMTP host, sender, credentials, encryption, and certificate-verification settings
- `APP_HTTP_PORT` when port `8080` is unsuitable

Then run:

```powershell
.\scripts\start-single-server.ps1
```

The script validates the required configuration and starts `docker-compose.web.yml` with `docker-compose.database.yml` under the `dentisys-single-server` project name. Open `http://server-address:APP_HTTP_PORT`; the default is port `8080`. Check API health at `http://server-address:APP_HTTP_PORT/api/health`.

Do not run this prototype alongside the development stack unless one stack uses a different published application port.

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
