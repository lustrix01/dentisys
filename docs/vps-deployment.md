# VPS demonstration deployment

This is the Owner-approved DEL-001 demonstration on one Ubuntu LTS VPS for the
team and invited volunteer Faculty and Students. It is not production or the
BIO-002 real Student deployment. Only team members may enroll facial biometrics.
This is an operating rule: volunteer Students can still see the enrollment UI.
Volunteer biometric enrollment requires the institutional review in BIO-002 or
a later Owner-approved amendment. Manual attendance remains available.

The private-LAN prototype is unchanged; use [single-server.md](single-server.md)
for that case. This VPS uses GHCR images built by hand from a tested commit,
Traefik with Let's Encrypt, Watchtower for web/frontend/biometric,
internal PostgreSQL, and pgAdmin on loopback. No source checkout or CI/CD runs on the VPS.

## Quick start

Do these AWS steps manually before starting the command:

1. Launch an **x86-64 Ubuntu 26.04 LTS EC2 instance**, for example
   **c7i-flex.large (4 GB RAM)**, with a **30 GB or larger disk** and your key pair.
2. Allocate and associate an **Elastic IP**. Keep the AWS .pem private on Windows.
3. Security Group: **22 from your IP for the first run only**, **2202 from your IP**,
   and **80/443 for the web server**. Do not expose database or UI ports.
4. Optionally point your own domain's A record to the Elastic IP (Cloudflare DNS-only).
   Without `-Domain`, the script uses `<ip-with-dashes>.sslip.io`.
5. Prepare Session Manager or configured EC2 Instance Connect recovery, publish the
   tested `:demo` images using the publishing section below, and commit a clean tree.
   Keep the face model at `..\dentisys-biometric-assets\face_landmarker.task` and
   team-tested calibration in your local `.env`. Docker is not needed on this PC
   for provisioning; image publishing remains a separate manual operation.

From the repository on Windows PowerShell 5.1:

```powershell
.\scripts\provision-vps.ps1 -Ip 203.0.113.10 -KeyFile 'C:\path\to\aws.pem'
# Optional: -Domain demo.example.com -NoDbTunnel
```

All answers and the AWS checklist confirmation come first. Passwords and the GHCR
read token are hidden, kept in memory, and sent only through SSH stdin; no secret
configuration is saved on the PC. The server applies the hardening guide steps
1–6, creates its private environment, deploys and prints PASS/FAIL checks. The
current SSH session continues through the port switch. `-SshPort` defaults to
2202; use the matching Security Group rule if you change it.

After a successful fresh run, test the printed devops login and **remove 22 from
the Security Group**. The launcher probes ubuntu on 22 or devops on the chosen
port. Reruns ask only for the sudo password and a fresh GHCR read token, then
preserve the server `.env` and its signing keys/database passwords. If hardening
finished but no environment was created, it collects the missing setup answers
at the start of the next run. `-NoDbTunnel` omits the pgAdmin/Mailpit exception.
The script changes only the VPS; AWS resources and DNS remain manual.

## Host, DNS and firewall

Start with an **x86-64 Ubuntu 26.04 LTS VPS, 2 vCPU**, **2 GB RAM minimum / 4 GB
recommended**, and **at least 30 GB disk** for images, PostgreSQL and 14 database
dumps. AWS's default 8 GB disk runs out while pulling the biometric image.
With real biometrics enabled, **4 GB RAM is recommended** (for example AWS
EC2 [t3.medium](https://aws.amazon.com/ec2/instance-types/t3/), 2 vCPU / 4 GB).
Measure memory, disk and biometric latency during team testing. AWS Lightsail/EC2,
Vultr and DigitalOcean are possible providers; select an equivalent Ubuntu VPS.
The publishing script builds `linux/amd64`; do not select an ARM instance.

Buy your domain and point an A record for `APP_DOMAIN` at the VPS public IPv4.
With Cloudflare keep it **DNS-only (grey cloud)**. Keep the record updated if
the IP changes; only set an IPv6 record if it also reaches this host.
Set `APP_DOMAIN` to the hostname without scheme, port or path.
DNS must resolve correctly and port 80 must be reachable for ACME HTTP-01.

## Before you start

The optional script applies [steps 1–6 of the Owner's Ubuntu 26.04 hardening guide](https://computingforgeeks.com/harden-ubuntu-2604-server/).

On a fresh EC2 host, first allow **TCP 2202 from your IP** and **80/443 for the
web server** in the AWS Security Group. Keep 22 available for the initial
`ubuntu` connection. Apply equivalent IPv6 rules if enabled. Prepare recovery
access through [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started.html)
or [EC2 Instance Connect](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-connect-prerequisites.html).
Session Manager needs its agent/IAM setup; Instance Connect still needs access
to the configured SSH listener and user. Its default port-22 browser connection
will not reach SSH after hardening.

From the repository on Windows, use the AWS `.pem`:

```powershell
.\scripts\harden-vps.ps1 -Server ubuntu@replace-with-vps-ip -KeyFile 'C:\path\to\aws.pem'
```

The wrapper checks the key ACL and prints repair commands if needed; it does
not change ACLs. The server first asks for the `devops` sudo password twice
through `passwd`, then one confirmation that the Security Group already
allows 2202/80/443. All input finishes before live host settings change, and
steps 1–6 then run unattended. A usable existing `devops` password is retained
on reruns. SSH switches directly to **2202, devops only**. Keep the current
session open until a second key login succeeds:

```powershell
ssh -i 'C:\path\to\aws.pem' -p 2202 devops@replace-with-vps-ip
```

After that test, remove 22 from the Security Group and continue with the
publishing, bundle/model and deployment sections below. Use `devops` for every
deployment/sync, adding `-i` with your `.pem` to the SCP/SSH commands below.
A required reboot is reported for you to perform after testing the new login. To rerun, connect as `devops` with `-Port 2202`.

By default, a separate commented SSH block permits only `devops` local
forwarding to `127.0.0.1:5050` (pgAdmin) and `127.0.0.1:8025` (Mailpit).
Pass `-NoDbTunnel` to omit it (`--no-db-tunnel` when running the Bash script
directly). Agent forwarding remains disabled. Do not open PostgreSQL (5432),
biometrics (8000), Mailpit or pgAdmin publicly. The script leaves `ip_forward`
unchanged and applies only steps 1–6.

Docker-published ports can bypass ufw, so the cloud firewall and Compose port
bindings matter: only Traefik publishes non-loopback ports. See
[Docker's Ubuntu installation and firewall guidance](https://docs.docker.com/engine/install/ubuntu/).

## Publish a tested commit on Windows

Use Docker Desktop in Linux-container mode. Run the repository checks for the
release, commit it, and log into GHCR with package write access. The publisher
refuses tracked changes and untracked files. It does not collect or save tokens.
Follow [GitHub's GHCR authentication guidance](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

```powershell
docker login ghcr.io
.\scripts\publish-images.ps1
# Optional: .\scripts\publish-images.ps1 -Namespace light505 -Tag demo
```

It builds all three images before pushing each commit tag (`sha-<12-character
SHA>`) and moving tag (`demo` by default):
`ghcr.io/light505/dentisys-web`, `dentisys-frontend`, and `dentisys-biometric`.
It builds a temporary archive of HEAD, with the existing ignore rules plus
exclusions for all `.env*`, keys, secrets, backups and face models. Those extra
ignore files exist only in the temporary build contexts. Record the SHA for
rollback. A failed push can leave some tags published; fix login/access and
rerun. Watchtower updates containers one at a time, so app-only releases must
remain compatible with the running schema and the other app images.

For a release with migrations, use the database sync procedure below before
publishing the moving tags.

## Bundle and model

From the same clean, tested commit, run the uploader in Windows PowerShell:

```powershell
.\scripts\upload-vps.ps1 -Server devops@replace-with-vps-ip -Port 2202 -Deploy
# Optional: -IdentityFile "$HOME\.ssh\id_ed25519"
# Optional: -ModelPath "C:\replace-with-model-path\face_landmarker.task"
```

It archives HEAD's configuration template, three Compose files, database
schema/migrations and pgAdmin definition, and deploy/backup/migration scripts.
It never uploads real environment files, tokens, application source or protected
biometric references. Images still come from `publish-images.ps1`.

The default model path is `..\dentisys-biometric-assets\face_landmarker.task`,
relative to the repository root. This is the generic Face Landmarker asset
described in [biometric calibration](biometric-calibration-deployment.md), not
an enrolled biometric reference. The script prints its local SHA-256 for
`MEDIAPIPE_FACE_LANDMARKER_SHA256` and checks the installed server model first;
an identical model is not uploaded. Use `-SkipModel` for bundle-only updates.

One SCP transfer uploads the bundle and, when needed, the model. One subsequent
SSH session replaces only `/tmp/dentisys-deploy`, extracts the bundle and installs
the model with mode 0644 when `/opt/dentisys/assets` already exists. `-Port`
defaults to 22; pass your hardened port. `-IdentityFile` adds
`IdentitiesOnly=yes`. OpenSSH handles authentication; the uploader collects
no passwords or tokens.

With `-Deploy`, SSH requests a TTY and runs
`bash /tmp/dentisys-deploy/scripts/deploy-vps.sh`, allowing its sudo and GHCR
prompts. Without `-Deploy`, the uploader prints the exact SSH deploy command.

On the first deployment, the model remains at `/tmp/face_landmarker.task`.
The first deploy invocation prepares `/opt/dentisys` (0750), copies runtime
files, creates `.env` (0600) and stops so you can fill it in. Rerun the uploader
after that first invocation to install the model, using its printed hash in the
server settings. Edit those settings directly on the VPS:

```bash
nano /opt/dentisys/.env
```

## Environment and first deployment

Replace every required `replace_with_...` value. Keep LF line endings and
one-line `KEY=VALUE` entries, with comments on separate lines. The scripts read
needed keys as literal text, trim surrounding whitespace and one matching quote
pair, and never source or evaluate this file. Compose reads it through
`--env-file` and applies its own interpolation and escaping rules.

Locally verified with `docker compose --env-file <temp file> ... config`:
`SMTP_PASS=abcd efgh ijkl mnop` preserves the spaces. Unquoted and double-quoted
`$VARIABLE` references expand (an unset variable becomes empty). Single-quote
`SMTP_PASS` and other secrets to preserve literal `$`, backticks and double
quotes; escape an apostrophe as `\'` inside single quotes. For example,
`SMTP_PASS='abcd efgh ijkl mnop'`. Literal dollars appear as `$$` in normalized
`config` output; `config --environment` shows the resolved single `$`. Keep
script-used settings such as database names, usernames and model paths literal,
without variable references. Do not put `GHCR_TOKEN` in this file. See
[Compose environment-file syntax](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/#env-file-syntax).

- Set `APP_DOMAIN`, a certificate contact in `TRAEFIK_ACME_EMAIL`, the three
  GHCR image URLs (usually `:demo`), and `GHCR_USERNAME`.
- Set distinct database application/admin passwords. Generate each JWT, MFA,
  audit and biometric storage key independently with `openssl rand -base64 32`;
  generate a separate sidecar shared secret with the same command.
- pgAdmin defaults to enabled. Set a separate `PGADMIN_DEFAULT_EMAIL` and
  `PGADMIN_DEFAULT_PASSWORD`; keep `PGADMIN_HTTP_PORT=5050` for the tunnel below.
  These are the initial GUI login, not PostgreSQL credentials.
- Set the absolute model path, SHA-256 and team-validated research calibration
  values. The script verifies the model hash; it invents no biometric thresholds.
- `BIOMETRIC_SIDECAR_ENABLED=true` opts this `single-server` demo into real
  enrollment and attendance verification, as in local development. Only team
  members enroll (BIO-002 note); consent and manual fallback still apply. To
  disable it, set `false` and rerun deployment. It defaults to false when absent;
  production and test environments cannot opt in. Keep the sidecar URL/secret
  configured and `BIOMETRIC_CHALLENGE_TTL_SECONDS=120` unless team testing
  requires another positive lifetime.
- Keep `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`, port `587`, encryption
  `starttls`, and peer verification `true`. Set sender/user and a Gmail App
  Password, with 2-Step Verification enabled. Use the sender address for
  `SMTP_FROM`. Personal Gmail is limited to roughly 500 messages/day; this is
  suitable only for modest demo traffic. See [App Passwords](https://support.google.com/accounts/answer/185833)
  and [Gmail sending limits](https://support.google.com/mail/answer/22839).
- Set `ALLOWED_EMAIL_DOMAINS` to the approved comma-separated domains. Fill
  `FIRST_DEAN_EMAIL`, `FIRST_DEAN_FIRST_NAME` and `FIRST_DEAN_LAST_NAME` for the
  initial invitation; other name fields are optional. The address must use an
  allowed domain. `GOOGLE_CLIENT_ID` is optional.
- Keep development mocks false. `STUDENT_AUTH_ENABLED=true` enables the existing
  Student invitation/sign-in workflow if needed for this demo.

`APP_BASE_URL` is derived from `APP_DOMAIN`; do not configure a second URL.
The overlay fixes `APP_IS_HTTPS=true`. The inherited web file needs the derived
URL present during interpolation before the overlay is merged.

Run as the same non-root sudo user, from the extracted bundle:

```bash
cd /tmp/dentisys-deploy
bash scripts/deploy-vps.sh
```

The script installs Docker Engine and its Compose plugin from Docker's Ubuntu
apt repository when missing. On an existing host, resolve conflicting distro
Docker packages using the official installation guide rather than deleting
data. Docker's [Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/)
supports Ubuntu 26.04 (Resolute); the script reads its codename from
`/etc/os-release` for the apt repository suite, rather than hardcoding 24.04.
Repository/update/install failures abort the script. Use a current Compose plugin supporting
[`!reset` overlays](https://docs.docker.com/reference/compose-file/merge/).
Traefik is pinned to `v3.6.2` and Watchtower to `1.7.1`, with API `1.44`.
Docker Engine **25 or newer** is required; the deploy script checks API 1.44
before starting services. See [Docker API compatibility](https://docs.docker.com/reference/api/engine/).
[Upstream Watchtower](https://github.com/containrrr/watchtower) was archived on
2025-12-17 and is no longer maintained.

Enter a GHCR token with package read access at the hidden prompt, or provide
`GHCR_TOKEN` through the shell. Blank skips login for public images or existing
credentials. The script passes it only through stdin and does not write it to
`.env`; **Docker login persists registry credentials** in
`/opt/dentisys/.docker/config.json` (0600). Watchtower mounts that file read-only.
Use this dedicated configuration, without an external credential helper.
After rotating credentials, rerun the deploy script so Watchtower is recreated
and sees the new config file inode. Protect the deployment account and Docker
socket; Watchtower needs write access to that socket to restart containers.

It pulls images, stops Watchtower, starts PostgreSQL, waits for initialization,
checks `_schema_migrations`, and saves a private dump before any pending
migrations. A backup/migration failure aborts; the app stays stopped after a
migration failure. A new database initializes all migrations on first creation.
Then it starts the full stack without building, waits for health, checks the
frontend root page, and runs grade-weight setup, the first-Dean invitation and
biometric expiry. Bootstrap failures warn so you can repair and rerun.

The Dean opens the invitation email, chooses a password and invites Faculty.
No development seed or demo credentials are loaded. If delivery fails, repair
SMTP and rerun; the bootstrap retries safely and does nothing once a Dean is
active. Do not enroll volunteers' biometrics.

### Failed first database initialization

An earlier deploy installed schema files with permissions unreadable by the
container's `postgres` user (uid 999). The log shows `Permission denied` for
`001-migrations.sh`, then `Skipping initialization` on restart; the database
exists but `_schema_migrations` does not. The migration check now stops with a
recovery message, and prints progress while waiting up to 180 seconds for db.

For this failed **first initialization on an empty database**, repair modes in
place, apply the schema once, then rerun the fixed deployment from its bundle:

```bash
sudo chmod 0755 /opt/dentisys/database /opt/dentisys/database/migrations
sudo chmod 0644 /opt/dentisys/database/init.sql /opt/dentisys/database/apply-migrations.sh /opt/dentisys/database/migrations/*.sql
sudo docker exec dentisys-db-1 sh /docker-entrypoint-initdb.d/001-migrations.sh
cd /tmp/dentisys-deploy
bash scripts/deploy-vps.sh
```

`chmod` keeps the inode, so the existing single-file bind mounts see the fix.
Schema files contain no secrets. Keep `.env`, backups, `.docker` and assets
private; do not remove the database volume or use `down -v`. This recovery is
for the empty failed installation; an instance with application data needs the
backup/restore procedure instead. If a check reports unavailable sudo
credentials, run `sudo -v` in the same terminal and retry; the check itself
never waits for password input.

## Replicas and routing

The overlay runs **three web and three frontend replicas, and one biometric
sidecar**. Traefik sends `/api`, `/api/...` and `/healthcheck.php` directly to
web with higher router priority; the remaining paths go to frontend. This avoids
Nginx's cached web IPs during Watchtower replacements. Paths, Authorization
headers and cookies pass through intact. `APP_IS_HTTPS=true` keeps secure cookies;
`TRUSTED_PROXY_CIDRS` trusts Traefik's private Docker network so the backend uses
the client IP from its forwarded header. Keep public clients outside those
trusted ranges and never enable insecure forwarded-header trust in Traefik.

Both services have Docker healthchecks and Traefik HTTP healthchecks (every
five seconds). With `allowemptyservices=false`, the
[Traefik v3.6.2 Docker provider](https://github.com/traefik/traefik/blob/v3.6.2/pkg/provider/docker/config.go)
excludes starting and unhealthy containers; a replacement joins routing only
after its Docker healthcheck succeeds. Watchtower lifecycle hooks are enabled:
each web/frontend post-update hook runs **inside the new container** and checks
its own HTTP endpoint for up to 150 seconds (each probe has a two-second timeout).
After success it waits 15 seconds for Docker health polling and Traefik discovery
before Watchtower replaces the next replica. The matching hook timeout labels
are **3 minutes**, not seconds. This synchronous sequence is confirmed in the
[Watchtower 1.7.1 update code](https://github.com/containrrr/watchtower/blob/v1.7.1/internal/actions/update.go)
and [hook documentation](https://github.com/containrrr/watchtower/blob/v1.7.1/docs/lifecycle-hooks.md).

Install these labels and the Watchtower environment change by uploading the
matching bundle and rerunning `deploy-vps.sh` **before** publishing an app-only
release. Publishing images alone does not change existing container labels.

Watchtower's stop-signal labels use Apache's `SIGWINCH` and Nginx's `SIGQUIT`
to finish in-flight requests, matching the images' graceful stop signals.
[Watchtower otherwise sends SIGTERM](https://containrrr.dev/watchtower/stop-signals/).
A sleep-only pre-update hook would leave the old container routable, so none is
used. Both routers use three transport attempts with 100 ms initial backoff.
[Traefik v3.6.2 retry](https://github.com/traefik/traefik/blob/v3.6.2/pkg/middlewares/retry/retry.go)
handles connection errors before a response and stops retrying once request
headers have been sent to the backend. It does not replay a submitted mutation,
retry an interrupted response, or retry application HTTP error statuses.

If readiness never succeeds, the hook exits nonzero and Watchtower logs the
failure. **Watchtower 1.7.1 then continues to the next replica**; it does not halt
the rollout or roll back the bad image. Traefik excludes unhealthy replacements,
but an entirely bad release can still exhaust the healthy replicas. Monitor
`compose logs -f watchtower` during publishing; on failure run
`compose stop watchtower` promptly and use the rollback procedure below.
The single biometric container still has an interruption when it updates;
manual attendance remains the fallback. Full deployment still stops all app
replicas for pending migrations;
`up --wait` waits for all replicas, while maintenance `exec` runs once on one.

The shared `dentisys_vps_ratelimit` volume holds file rate limits and MFA/Google
challenge attempt counters with `flock` across web replicas. A new volume inherits
`www-data:www-data` ownership and mode 0700 from the image. Sessions, refresh
and other security tokens, biometric challenges and attendance use PostgreSQL;
no PHP file sessions need affinity. Upload temp files are request-local, Google's
JWKS cache is safe per replica, and the per-replica email outbox log is diagnostic,
not a delivery queue. The unused legacy settings/assessment path helpers have
no callers; active settings and assessments use PostgreSQL. Protected biometric
references stay on the single sidecar's volume, excluded from ordinary backups.

The biometric gate audit found backend activation in `app/config.php` and
frontend runtime normalization discarding `sidecar`; both now honor the demo
opt-in. The sidecar client/controllers require the active provider, not a
development environment. Real camera, consent, enrollment and check-in screens
use Student/linked-Secretary authorization without an environment gate. The
remaining development-only checks belong to mocks and remain unchanged.

## Google Sign-In setup

Create a Web application OAuth client using Google's
[setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
Add the exact site origin `https://<APP_DOMAIN>` to **Authorized JavaScript
origins**, without a path. In Google Auth Platform's Audience settings, add the
team accounts as test users while the app is in
[Testing mode](https://support.google.com/cloud/answer/15549945).
Set `GOOGLE_CLIENT_ID` in the server `.env` and rerun deployment; an empty value
disables Google Sign-In. Invitation acceptance and activation remain
password-only. After activation, users link the matching institutional Google
account from their profile, confirming password and MFA when enabled (REG-003).
Google sign-in never replaces the DentiSys password or authorizes public signup.

## Verify and operate

In each new VPS shell, define this helper (using the dedicated GHCR config):

```bash
cd /opt/dentisys
env_file=/opt/dentisys/.env
env_value() {
  local key="$1" line value=''
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue
    [[ "${BASH_REMATCH[1]}" == "$key" ]] || continue
    value="${BASH_REMATCH[2]}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    case "$value" in \"*\"|\'*\') value="${value:1:${#value}-2}" ;; esac
  done < "$env_file"
  printf '%s' "$value"
}
compose() {
  local profile=() compose_env=(COMPOSE_PROFILES=)
  [[ "$(env_value EMAIL_PROVIDER)" != custom ]] || profile=(--profile mailpit)
  case "$(env_value PGADMIN_ENABLED)" in
    ''|true) profile+=(--profile tools) ;;
    false) compose_env+=(PGADMIN_DEFAULT_EMAIL=disabled@example.invalid PGADMIN_DEFAULT_PASSWORD=unused) ;;
    *) echo 'Set PGADMIN_ENABLED to true or false before continuing.' >&2; return 1 ;;
  esac
  sudo env "${compose_env[@]}" docker --config /opt/dentisys/.docker compose --env-file "$env_file" -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml "${profile[@]}" "$@"
}
compose ps
compose logs --tail 100 traefik watchtower web biometric db
curl -I http://dentisys.example.com
curl -I https://dentisys.example.com
curl --fail https://dentisys.example.com/api/health
```

Expect HTTP to redirect to HTTPS, HTTPS to show the application with a trusted
certificate, API health to report `"status":"ok"`, and web/db/biometric to be
healthy; `compose ps` must show three healthy web and three healthy frontend
replicas, and one healthy biometric container. Check `/api/runtime-config` reports
`biometrics.active: sidecar` when opted in. Confirm invitation delivery, sign-in,
team-only enrollment/check-in and manual attendance in a
browser. Replace `dentisys.example.com` above with `APP_DOMAIN`.
Inspect Watchtower logs for registry/API errors and Traefik logs for
DNS/ACME errors. Do not use `curl -k` to hide certificate problems.

## Database and Mailpit access

pgAdmin is enabled by default and binds only to `127.0.0.1:5050`. Mailpit is off
with `EMAIL_PROVIDER=smtp`; custom mode starts it with its UI only at
`127.0.0.1:8025`. Neither UI uses Traefik or a public port. PostgreSQL and
Mailpit SMTP remain unpublished. To use Mailpit, set `EMAIL_PROVIDER=custom`
and rerun deployment.

The hardening script enables the loopback exception by default. If you applied
the guide manually, or omitted the exception and now need these tunnels, add
the following block for devops in `/etc/ssh/sshd_config.d/99-z-dentisys-tunnels.conf`, which sorts after
`99-hardening.conf` (or put it at the end of that hardening file):

```text
Match User devops
    AllowTcpForwarding local
    PermitOpen 127.0.0.1:5050 127.0.0.1:8025
Match all
```

Keep agent forwarding disabled and forwarding denied globally. If you change either UI's server port,
change `PermitOpen` and the tunnel destination to match. **Keep the current SSH
session open while testing a second session.** Validate before reloading:

```bash
sudo sshd -t
sudo sshd -T -C user=devops,host=localhost,addr=127.0.0.1 | grep -E 'allowtcpforwarding|permitopen|allowagentforwarding'
sudo systemctl reload ssh
```

Expect `allowtcpforwarding local`, only the two loopback destinations, and
`allowagentforwarding no`. If validation fails, repair the configuration before
reloading. See [OpenSSH server configuration](https://man.openbsd.org/sshd_config).

From Windows, replace `<APP_DOMAIN>` with the server hostname:

```powershell
ssh -p 2202 -L 15050:127.0.0.1:5050 -L 18025:127.0.0.1:8025 devops@<APP_DOMAIN>
```

Keep that session open, then visit <http://localhost:15050> for pgAdmin and
<http://localhost:18025> for Mailpit (custom mode only). The local ports differ
from the development stack's 5050/8025. Do not use `-g` or a public local bind.
Use `-i` for your key if needed, as with database sync.

Log into pgAdmin with the server `.env` values `PGADMIN_DEFAULT_EMAIL` and
`PGADMIN_DEFAULT_PASSWORD`. The imported connection points to `db:5432`,
database `DB_NAME` and user `DB_USER` (both default to `dentisys`); enter
**`DB_PASS`** from the server `.env`. For an administrator connection, use
`DB_ADMIN_USER` with `DB_ADMIN_PASS`. The default server definition is reused
from local dev; deploy writes a VPS copy when the database name or user differs.
No database password is stored in that JSON. The login account lives in the
pgAdmin volume: changing the initial-login environment values does not reset
an existing account; change its password through pgAdmin and keep `.env` aligned.

To switch pgAdmin off, set `PGADMIN_ENABLED=false` and rerun `deploy-vps.sh` from
the matching bundle. Only its container is stopped/removed; the pgAdmin volume
is kept. Re-enabling it restores the saved account. For SQL without a GUI,
using the shell helper above:

```bash
compose exec db psql -U dentisys -d dentisys
```

Replace those defaults with `DB_USER`/`DB_NAME` from the server `.env`, or use
`DB_ADMIN_USER` for administrative SQL.

## Backups and maintenance

The idempotent `/etc/cron.d/dentisys-backup` entry runs at **02:17 in the server
timezone**. It dumps PostgreSQL with `pg_dump -Fc` into private `backups/`
(0700), files/log (0600), and retains the newest 14 completed dumps, including
pre-migration snapshots. Check `sudo tail /opt/dentisys/backups/backup.log` and
run `sudo bash /opt/dentisys/scripts/backup-vps.sh` once to verify scheduling's
command. Watch disk usage and copy backups off the server regularly.
The biometric volume is excluded (BIO-003/BIO-005); loss requires re-enrollment.
Store the server `.env` securely and separately so the matching keys remain
available for a database restore; do not put it in the bundle or database dump.

The existing semester-expiry maintenance should also run daily on a long-lived
demo; use the command below in the operator's root crontab (`sudo crontab -e`):

```cron
0 2 * * * cd /opt/dentisys && docker compose --env-file .env -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml exec -T web php /var/www/html/backend/bin/expire-biometrics.php
```

## Updates

For app-only releases with **no new migration files and no configuration or
bundle changes**, test/commit and publish the moving tags. Watchtower polls
every `WATCHTOWER_POLL_INTERVAL` seconds (default 300), updates only web,
frontend and biometric, and cleans old images. Verify after the update.
Database, Traefik and Watchtower are never auto-updated.

For a release adding schema migrations, test and commit the release, then run
from Windows using OpenSSH and the same sudo account that deployed the server:

```powershell
.\scripts\sync-vps-db.ps1 -Server devops@replace-with-vps-ip -Port 2202
.\scripts\sync-vps-db.ps1 -Server devops@replace-with-vps-ip -Port 2202 -Apply -Publish
# Optional: -IdentityFile "$HOME\.ssh\id_ed25519" -Tag demo -Namespace light505
```

The first command uploads committed schema files and prints pending migrations;
it changes no database data. The second backs up with `pg_dump -Fc`, applies
pending migrations, then publishes images only on success. No local database
data is copied. The app and Watchtower stay running during sync, so migrations
**must be additive and compatible with the currently running app**. Do not
publish the new images separately before the migrations succeed. Verify after
Watchtower rolls out within `WATCHTOWER_POLL_INTERVAL` (default 300 seconds),
plus image pull/start time. Use `-Apply` alone to migrate without publishing.

Sync uses one SCP transfer and one SSH session. `-Port` defaults to 22; always
pass your hardened port. `-IdentityFile` adds `IdentitiesOnly=yes` to limit key
attempts; without it, configure your SSH agent/config to offer the correct key.
OpenSSH handles key authentication and the remote sudo prompt; the script does
not collect passwords or tokens. An interrupted transfer can leave a disposable
`/tmp/dentisys-sync-*` staging directory.

Windows PowerShell 5.1 scripts judge native SSH/SCP/Docker commands by exit code.
Informational stderr (including SSH's connection-closed message) is preserved
without aborting a successful command, also when logging with `*> file` or
`2>&1`. A nonzero SSH exit still prevents publishing.

The server refuses a sync if any existing migration is missing locally or has
different contents; update your local branch instead of deleting server files.
Comparison ignores CRLF/LF differences, and existing server migrations are kept.
`migrate-vps.sh` and full deploy share a lock, so deployments and syncs cannot
overlap. With no pending migrations it prints `Nothing to apply`. Backup or
migration failure returns an error and prevents publishing; the error names the
backup file (a failed/empty dump is removed). The app stays up, so inspect the
failure promptly, retry after repair, or follow the restore procedure below.

For bundle, Compose, deployment-script, `init.sql` or `apply-migrations.sh`
changes, test/commit and run `upload-vps.ps1` from the matching commit:

```powershell
.\scripts\upload-vps.ps1 -Server devops@replace-with-vps-ip -Port 2202 -SkipModel -Deploy
```

Omit `-SkipModel` when updating the model. Publish application images with
`publish-images.ps1`; use `sync-vps-db.ps1` for migrations as described above.
Compare `.env.vps.example` against the server `.env` and fill new settings
without replacing secrets. Sync warns if either database entrypoint file changed:
replacing a host file does not refresh its existing container bind mount; a
full deploy recreates db when needed. Sync never recreates db. Full deploy
still stops the app around pending migrations and restarts it on success.
Watchtower cannot supply schema files or apply migrations itself.

## Rollback and database restore

For an app-only rollback that is compatible with the current schema, on the
Owner's Windows machine retag all three known-good commit images as the moving
tag and push them. Use your namespace and recorded SHA:

```powershell
$knownGoodSha = 'replace_with_12_character_sha'
foreach ($name in @('web', 'frontend', 'biometric')) {
    $repo = "ghcr.io/light505/dentisys-$name"
    docker pull "${repo}:sha-$knownGoodSha"
    if ($LASTEXITCODE -ne 0) { throw 'Pull failed' }
    docker tag "${repo}:sha-$knownGoodSha" "${repo}:demo"
    if ($LASTEXITCODE -ne 0) { throw 'Tag failed' }
    docker push "${repo}:demo"
    if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
}
```

Watchtower will pull those tags. If a migration made the old app incompatible,
stop Watchtower and the application first. Restore into a **new, empty database**
to preserve the failed database and avoid leaving upgraded objects behind.
Restoring discards changes since the dump for the restored application; agree
the recovery point with the Owner. From the VPS shell with `compose` defined:

```bash
set -euo pipefail
DB_NAME="$(compose exec -T db printenv POSTGRES_DB)"
DB_ADMIN_USER="$(compose exec -T db printenv POSTGRES_USER)"
DB_USER="$(compose exec -T db printenv DB_USER)"
compose stop watchtower frontend web biometric
restore_db="${DB_NAME}_restore_$(date -u +%Y%m%d_%H%M%S)"
compose exec -T db createdb -U "$DB_ADMIN_USER" --template=template0 --owner="$DB_USER" "$restore_db"
compose exec -T db pg_restore -U "$DB_ADMIN_USER" -d "$restore_db" --exit-on-error --single-transaction < /opt/dentisys/backups/replace_with_backup_filename.dump
printf 'Restore completed. Set DB_NAME=%s in /opt/dentisys/.env.\n' "$restore_db"
```

After a successful restore, set that `DB_NAME`, select the matching known-good
images, and run the deploy script from the **matching old release bundle**.
Do not apply newer migration files to the restored database: the server retains
copied migration files, so move the current server `database/migrations/`
directory aside to a private sibling before rerunning the old bundle; preserve
it for investigation. Verify API health, sign-in and historical records before
resuming Watchtower. Keep the previous database and keys; do not drop databases
or remove volumes without explicit Owner approval. A failed restore stays
stopped. Biometric references are not restored; never copy that volume as a
backup or restore expired/revoked references.

## Copy backups off the server

Cron's root-owned dumps must first be copied to a private operator-readable
directory. Replace the filename with a completed dump, on the VPS:

```bash
install -d -m 0700 "$HOME/dentisys-backup-export"
sudo install -m 0600 -o "$(id -un)" -g "$(id -gn)" /opt/dentisys/backups/replace_with_backup_filename.dump "$HOME/dentisys-backup-export/"
```

Then on Windows:

```powershell
scp -P 2202 devops@replace-with-vps-ip:~/dentisys-backup-export/replace_with_backup_filename.dump "C:\replace-with-private-backup-folder\"
```

Restrict local backup access and verify restores periodically. Remove only the
extra export copy after confirming the transfer. To stop this demo use
`compose stop`. **Never run `docker compose down -v`**: it deletes persistent
database, biometric and certificate volumes.
