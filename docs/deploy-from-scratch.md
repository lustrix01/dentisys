# Deploying DentiSys from scratch

This guide takes a developer from an empty VPS provider account to a running,
verified DentiSys server with **one command**. It follows the run that was
proven end to end on 2026-10-10 on AWS (fresh Ubuntu 26.04 instance, every
check PASS). Since 2026-11-02 both servers live on **Vultr** (spec DEL-001);
any provider that meets [hosting-requirements.md](hosting-requirements.md)
works. Sections 1–5 set up the **demo**; the production server is in
[Production VPS](#production-vps). Reference details for every step are in
[vps-deployment.md](vps-deployment.md).

## What the command does

`scripts/provision-vps.ps1` runs on your Windows PC. It asks every question up
front, uploads a bundle, and then runs unattended on the server:

1. **Hardening** — the team's Ubuntu 26.04 hardening guide, steps 1–6
   (updates, sudo account, SSH on port 2202 with keys only, UFW, fail2ban,
   sysctl), plus a tunnel-only exception for pgAdmin/Mailpit.
2. **Environment** — creates `/opt/dentisys/.env` with fresh random keys and
   database passwords (never overwritten on later runs).
3. **Deploy** — Docker, the GHCR images, PostgreSQL with all migrations,
   3 web + 3 frontend + 1 biometric containers behind Traefik with Let's
   Encrypt HTTPS, Watchtower, nightly backups, and the first Dean invitation.
4. **Verify** — PASS/FAIL checks; then, if Ubuntu needs it, one reboot and a
   second verification pass.

The script changes only the server. The provider side (server, IP, any cloud
firewall, DNS) is always done by hand.

## 1. One-time prerequisites

| Item | Where | Notes |
|---|---|---|
| Windows PC with Windows PowerShell 5.1, Git, OpenSSH client | your PC | All standard on Windows 10/11. Docker Desktop is needed only to publish images. |
| This repository on the deployment branch, with a **clean working tree** | your PC | The scripts refuse uncommitted changes. |
| Working local setup with calibrated `BIOMETRIC_*` values in the local `.env` | your PC | See [README](../README.md) Part A and [biometric calibration](biometric-calibration-deployment.md). The launcher copies only these values and `ALLOWED_EMAIL_DOMAINS` / `GOOGLE_CLIENT_ID` as defaults. |
| Face model at `..\dentisys-biometric-assets\face_landmarker.task` (next to the repo folder) | your PC | Same file the local stack uses. |
| Gmail account with **2-Step Verification** and an **App Password** | Google account | Sends invitations and notices (~500 emails/day limit). |
| GitHub account and the published images `ghcr.io/<owner>/dentisys-{web,frontend,biometric}:demo` | GitHub | To use your own namespace: `docker login ghcr.io`, then `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish-images.ps1 -Namespace <your-github-user>`. Then create a **classic token with `read:packages`** for the server. |
| Google OAuth client ID (optional, for Google Sign-In) | Google Cloud Console | Add the site URL to *Authorized JavaScript origins* after step 2. |
| VPS provider account and **two SSH key pairs, made before creating any server** | Vultr (or AWS) | One key per server, never shared: a demo key (`ssh-keygen -t ed25519 -f $HOME\.ssh\dentisys-demo`, no passphrase, so Claude can run demo deploys and tests) and a production key with a passphrase (`ssh-keygen -t ed25519 -f $HOME\.ssh\dentisys-prod`; only the Owner uses it). Add both `.pub` files under *Account → SSH Keys* and select only the matching one when creating each server. AWS: one EC2 key pair (`.pem`) per server. Keep private keys in `%USERPROFILE%\.ssh\` (see troubleshooting for permissions). |

## 2. The server (manual)

**Vultr:**
1. *Deploy* → Cloud Compute, **High Frequency AMD, 1 vCPU / 2 GB** (the
   benchmarked size in [hosting-requirements.md](hosting-requirements.md)),
   region **Singapore**, image **Ubuntu 26.04 LTS x64** (check it is not
   26.10), only that server's SSH key selected. No Firewall Group is needed
   (the script sets up UFW); if you add one, allow `22` (first run only),
   `2202`, `80` and `443`.
2. Wait for **Running** and note the IPv4. The server keeps it for its
   lifetime; use a Reserved IP only to rebuild a server on the same address.
3. Check that *View Console* opens: it is the recovery route if SSH breaks.

**AWS:** an Ubuntu Server 26.04 LTS x86-64 instance (**c7i-flex.large** or
larger, **30 GB** gp3 disk), an **Elastic IP** associated with it, and a
Security Group with `22` (first run only), `2202`, `80` and `443`.

**Address:** point the server's record at its IP in Cloudflare (DNS-only):
`@` for production (`bu-dentisys.com`), `demo` for the demo
(`demo.bu-dentisys.com`), and pass `-Domain` below. Without `-Domain` the
site falls back to `https://<ip-with-dashes>.sslip.io` (e.g.
`3-1-177-69.sslip.io`), fine for a short-lived test server.

## 3. Run the command

In Windows PowerShell, from the repository folder. A plain window can refuse an unsigned `.ps1` ("... is not digitally signed"), so run scripts with the execution policy bypassed for that process — `pwsh` is PowerShell 7 and `powershell` accepts the same switches:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\provision-vps.ps1 -Ip <server-ip> -KeyFile $HOME\.ssh\<key> -InitialUser root -User <name>
```

- `-InitialUser` is the provider's first login on port 22: `root` on Vultr,
  `ubuntu` (the default) on AWS.
- `-User` is the sudo/SSH account to create (`devops` if omitted). Use the
  **same** value on every later run.
- Add `-Domain <name>` for your own domain, `-NewInstance` when you rebuilt the
  server on the **same IP** (it replaces the old SSH host key after
  showing you the new fingerprint), `-NoDbTunnel` to omit the pgAdmin tunnel.

Answer the questions (press Enter to accept a value in brackets):

| Prompt | Answer |
|---|---|
| `<user>` sudo password (twice) | A strong password; needed for `sudo` and later reruns |
| GHCR username / token | The image owner (e.g. `Light505`) and the `read:packages` token |
| Gmail address / App Password | The sender account; the App Password may contain spaces |
| First Dean name / email | Must use an allowed domain; receives the first invitation |
| pgAdmin email / password | Login for the tunnel-only pgAdmin |
| Allowed domains, Google client ID, Student sign-in, biometrics | Defaults come from your local `.env` |

Check the summary (secrets are masked) and press **Enter**. Expect about
10–15 minutes. A successful run ends like this:

```text
=== D. Verify containers, public HTTPS and backup scheduling ===
PASS: containers running; 3 healthy web, 3 healthy frontend, 1 healthy biometric
PASS: public HTTP redirects to HTTPS
PASS: trusted, current HTTPS certificate for APP_DOMAIN issued by Let's Encrypt
PASS: public /api/health reports ok
PASS: unauthenticated POST /api/auth/refresh returns 401
PASS: runtime-config matches the biometrics switch
PASS: nightly backup cron installed and cron active
Reboot required; rebooting now.
=== Reboot (guide step 1) ===
SSH is back after the reboot. ...
Verify-only run: skipping phases A-C.
... (the same PASS lines)
PASS: public HTTPS and API health from the PC.
Login: ssh -i '...pem' -o IdentitiesOnly=yes -p 2202 <user>@<ip>
Site: https://<ip-with-dashes>.sslip.io
```

## 4. After the run (manual)

1. If a cloud firewall (Vultr Firewall Group, AWS Security Group) allows port
   22, remove it.
2. Test the printed login: `ssh -i <pem> -o IdentitiesOnly=yes -p 2202 <user>@<ip>`.
3. Google Sign-In (optional): add `https://<site>` to the OAuth client's
   *Authorized JavaScript origins*; in Testing mode add testers as *Test users*.

## 5. First use of the application

1. Open the **Dean invitation** email, set the password, sign in.
2. Profile → **Two-factor authentication** → scan the QR code, keep the recovery codes.
3. Settings → **Academic terms** → set the current semester's start and end
   dates. Faculty can create classes only in a defined term, and face
   enrollment uses the term end date as its expiry.
4. **Invite Faculty** (for testing, Gmail `+` addresses such as
   `you+faculty@gmail.com` all arrive in one inbox).

### Feature checklist

| Feature | Test | Expected |
|---|---|---|
| Faculty onboarding | Accept the invitation, sign in | Faculty dashboard |
| Class creation | Create a class, pick the term | Class shows the term dates |
| Student onboarding | Invite a Student to the class, accept | Student dashboard |
| Google Sign-In | Profile → link Google (asks the password once), sign out, sign in with Google | Same account |
| Grading | Set grade weights, enter scores | Grades compute; remedial flag at 2.50 or worse |
| Attendance session | Secretary/Faculty starts a session (map geofence) | Session is live |
| Face enrollment | Student → face registration on a phone | Profile active until the term end |
| Face attendance | Student checks in during the session | Marked present |
| Manual attendance | Secretary/Faculty marks a Student | Record and audit entry |
| Email | Invitations, remedial notices | Arrive in the inbox |
| Reports and audit | Dean → Reports, Audit Trail | Data loads; CSV/PDF export |
| Rolling update | See the [release guide](release-guide.md) | Watchtower updates one copy at a time, no downtime (with the default 3 copies; the demo runs 1, so an update there briefly interrupts the site) |

## 6. Releasing changes later

Follow the [release guide](release-guide.md). It covers who publishes the demo images, migrations, testing the demo, and promoting to production.

| Other change | What to do |
|---|---|
| Compose files or server scripts | Rerun `provision-vps.ps1` with the same `-User` (add `-Production` for production). It asks only for the sudo password and the GHCR token, and keeps `.env` and data. |
| Backups | Nightly at 02:17 into `/opt/dentisys/backups`. Copy them off with the commands in [vps-deployment.md](vps-deployment.md#copy-backups-off-the-server). |

## Production VPS

Production is a second server with its own images (`dentisys-*-prod`, tag `:prod`). Production images are never built: the Owner promotes the exact demo images of the approved commit. Claude has no access to the production server, its credentials or the `-prod` packages.

First setup, in this order:
1. Check out the approved commit and run `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\promote-prod.ps1 -Sha <approved> -DryRun`, then the same command without `-DryRun`. Without `~\.dentisys\prod.env` it promotes the images only.
2. Server steps as in section 2, with the production key (passphrase; never the demo key) selected when creating the server.
3. `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\provision-vps.ps1 -Ip <ip> -KeyFile <key> -InitialUser root -Production`. It writes the `-prod:prod` images, turns real biometrics on by default (production is a public test site, spec 2026-11-02), disables pgAdmin and skips the database tunnel. The GHCR token it asks for is your own classic token with `read:packages` (the bot cannot read `-prod` packages).
4. Create `$HOME\.dentisys\prod.env` with `PROD_SSH_HOST`, `PROD_SSH_PORT` (default 2202), `PROD_SSH_USER` (default devops) and `PROD_SSH_KEY`.

Later releases: `git checkout <approved sha>`, then `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\promote-prod.ps1 -Sha <sha>`. It syncs migrations (with a backup) first, copies the images, checks the digests and waits for Watchtower. A release with database migrations must go through this script (or `sync-vps-db.ps1 -Apply`; on the demo, `demo-vps.ps1 migrate`); never rely on Watchtower alone.

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `UNPROTECTED PRIVATE KEY FILE` / `bad permissions` | Other Windows accounts can read the `.pem` | Copy it to `%USERPROFILE%\.ssh\`, then `icacls <pem> /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):R"`; the launcher prints the exact commands |
| "host key changed" / rebuilt instance on the same IP | Your PC remembers the old instance's key | Rerun with `-NewInstance` and compare the fingerprint with the provider console (Vultr *View Console*: `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`; AWS: EC2 → *Get system log*) |
| SSH timeout | A cloud firewall blocks the port, the server is down, or your IP changed and a firewall rule limits SSH to your old IP | Check the server is running and any cloud firewall rule for 22 (first run) / 2202 |
| `exit 255` / `Connection timed out` right after `SSH is back after the reboot` | The firewall rate-limits new SSH connections (about 6 in 30 s); the post-reboot checks open several in a row. Seen on both the demo and production setups. | The install already passed before the reboot. Open `https://<site>/api/health`: if it shows `"status":"ok"`, the setup is done. |
| `no space left on device` while pulling images | Disk smaller than 30 GB | Pick a larger plan (Vultr) or resize the EBS volume to 30 GB and run `sudo growpart /dev/nvme0n1 1` and `sudo resize2fs /dev/nvme0n1p1` (AWS), rerun |
| `Server provisioning failed` | See the `ERROR:` lines printed above it | Full log: `ssh ... 'sudo tail -n 80 /var/log/dentisys-provision.log'` (as the `-InitialUser` account on 22 before the SSH switch, as `<user>` on 2202 after) |
| Account mismatch at the probe | The server was set up with a different `-User` | Rerun with the original `-User` |
| Face enrollment: "requires an active academic term" | The Student's class term has no dates | Dean → Settings → Academic terms → set the dates |
| Certificate not issued | Port 80 closed or DNS not pointing at the IP | Open 80 in any cloud firewall; check the A record; rerun |
