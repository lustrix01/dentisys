# DentiSys Architecture

The development stack is a Compose application: Vite serves the React frontend, Apache/PHP serves the API, PostgreSQL stores application data, Mailpit captures development email, and pgAdmin is available on loopback for database administration.

The browser calls `/api` through the Vite proxy. The PHP API owns authentication, sessions, RBAC, audit events, and domain endpoints. PostgreSQL migrations are ordered and recorded in `_schema_migrations`.

Authentication currently uses a password primary factor and optional authenticator-app 2FA. An enrolled account receives a five-minute challenge after password verification; access and refresh credentials are issued only after a valid authenticator or recovery code. Email-code verification is retired.

Docker image builds keep backend and frontend dependencies cached in layers, while development bind mounts provide live source changes. This is intentionally a development foundation, not deployment automation.
