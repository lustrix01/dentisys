# Implemented Features and Boundaries

## Current platform

- Password authentication, role-based access control, sessions, refresh rotation, audit events, rate limiting, and password reset.
- Optional authenticator-app 2FA with enrollment QR code, six-digit verification, revocation, and recovery codes.
- Admin-authorized Faculty invitations (the invitation is Faculty approval), Faculty-authorized Student invitations with canonical roster eligibility, secretary invitation and activation, academic workflows, attendance, reporting, email history, and notification delivery.
- Docker-first local runtime with PostgreSQL 18, Mailpit, and loopback-only pgAdmin.

## Deliberate boundaries

- Email-code verification is retired. System email remains available for non-authentication features.
- Google Sign-In is implemented for existing eligible accounts with explicit password/MFA linking, backend claim policy, and `google` session provenance. During Faculty or Student invitation acceptance, Google is optional identity verification only; it does not create invitation authority, select a role, or replace the required DentiSys password. Institutional access supports normalized multi-domain allowlists with a legacy singular fallback.
- Facial biometrics are not yet a complete production flow.
- Image publishing, deployment automation, cloud infrastructure, TLS, and CI/CD are not part of this repository today.
