# Approved specification amendment: VPS demonstration deployment

Owner approval: 2026-10-09. The Owner chose one cloud VPS (AWS, Vultr,
DigitalOcean or similar), a free DuckDNS hostname, Traefik with Let's Encrypt
as in the Owner's learningfullstack project, GHCR images with Watchtower, and
real SMTP with the Owner's own sender account. Users are the team plus some
volunteer Faculty and Students, for testing only. Facial biometrics stay with
the team "for now, but can change in the future when the team decides to move
to testing with actual participants". The Owner approved the exact text below
with "Yes".

## DEL-001 — DEFERRED changed to APPROVED (demonstration scope)

> Owner decision (2026-10-09): A demonstration deployment on one cloud VPS is
> approved for testing by the DentiSys team and invited volunteer Faculty and
> Students. It is not a production deployment and not the BIO-002 real Student
> deployment.
>
> Approved infrastructure, and nothing beyond it:
>
> - Traefik as the only public entry point (ports 80 and 443), with HTTP
>   redirected to HTTPS and Let's Encrypt certificates for one hostname
>   (initially a DuckDNS name; changing the hostname needs no amendment).
> - Application images (web, frontend, biometric) published to GitHub Container
>   Registry under the Owner's account, built and pushed by the Owner from a
>   tested commit. No CI/CD pipeline.
> - Watchtower updating only the labeled DentiSys application containers. A
>   release that adds database migrations MUST be deployed with the deploy
>   script, which backs up the database before migrating; Watchtower alone MUST
>   NOT be relied on for such a release.
> - A deploy script, a nightly PostgreSQL backup that the Owner can copy off
>   the server, host firewall guidance (SSH, 80, 443 only), and a runbook.
>
> PostgreSQL, Mailpit and the biometric component stay internal to Docker.
> pgAdmin is not deployed. Secrets live only in the server's environment file,
> never in Git or in images. Separate application/database servers, Kubernetes,
> other cloud services and public database access remain out of scope.

The previous sentence "Image publishing and demonstration deployment remain
future work." was removed. The rule against adding unapproved infrastructure
now reads "Do not add other cloud infrastructure, …".

## RUN-002 — added

> The approved VPS demonstration deployment (DEL-001) is the only supported
> non-local deployment. The private-LAN single-server prototype remains
> available and unchanged.

## BIO-002 — added (no rule change)

> For the DEL-001 demonstration deployment, only DentiSys team members enroll
> facial biometrics. Enrolling volunteer Students requires the BIO-002
> institutional review, or a later Owner-approved amendment.

## Consequences recorded for the Owner

- Team-only enrollment is an operating rule, not enforced by the application:
  a signed-in volunteer Student still sees the enrollment option.
- Watchtower does not run migrations. Releases with new files in
  `database/migrations/` go through the deploy script.
- Gmail SMTP needs an App Password and is limited to roughly 500 messages a
  day.

## Follow-up, same day: database sync script

The Owner approved changing the Watchtower sentence in DEL-001 to: "A release
that adds database migrations MUST be deployed with the deploy script or the
database sync script, each of which backs up the database before migrating;
Watchtower alone MUST NOT be relied on for such a release." The Owner chose a
sync for schema migrations only (no data copy), run before publishing images so
Watchtower rolls the new application out against the migrated schema.

## Follow-up, same day: pgAdmin and Mailpit through SSH tunnels

The Owner asked to reach the VPS database and Mailpit from localhost through
SSH tunnels, as in learningfullstack, with pgAdmin running "always on the VPS,
for demo purposes and verification", optional to boot. "pgAdmin is not
deployed." in DEL-001 was replaced with the approved text:

> pgAdmin runs on the VPS by default for demonstration and verification, and
> can be switched off in the server environment (`PGADMIN_ENABLED=false`). It
> is bound to the server's loopback address and reached only through an SSH
> tunnel. The Mailpit UI, which runs only when `EMAIL_PROVIDER=custom`, is
> reached the same way. Neither is exposed through Traefik or any public port.

Consequence: hardening step 3 (`AllowTcpForwarding no`) gets a per-user
exception limited to the pgAdmin and Mailpit loopback ports.

## Follow-up, same day: real biometrics on the demo VPS

The Owner asked to enable face attendance on the VPS so it "must work like what
it did back on my local environment", and approved this text, added to BIO-007
after the paragraph on availability after the institutional review:

> Owner decision (2026-10-09): For the DEL-001 VPS demonstration deployment
> only, real biometrics MAY be enabled before the BIO-002 review by explicit
> server configuration (`BIOMETRIC_SIDECAR_ENABLED=true`), so the DentiSys team
> can test it. It then behaves as in local development. Only DentiSys team
> members enroll (BIO-002 note). Without that setting, production-like
> environments keep real biometrics disabled.

Same session, no spec change needed: three web and three frontend replicas behind
Traefik for rolling Watchtower updates (one biometric sidecar), Google Sign-In
configured with the existing client ID, and the instance upgraded to 4 GB.
