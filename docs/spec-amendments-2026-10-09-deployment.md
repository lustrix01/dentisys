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
