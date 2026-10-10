# Deploying DentiSys from scratch

This guide takes a developer from an empty AWS account to a running, verified
DentiSys demonstration server with **one command**. It follows the run that was
proven end to end on 2026-10-10 (fresh Ubuntu 26.04 instance, every check PASS).

Scope: this is the approved DEL-001 **demonstration** deployment (see
`spec.md` DEL-001), not production. Only DentiSys team members enroll faces
(BIO-002). Reference details for every step are in
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

The script changes only the server. AWS (instance, Elastic IP, Security Group,
DNS) is always done by hand.

## 1. One-time prerequisites

| Item | Where | Notes |
|---|---|---|
| Windows PC with Windows PowerShell 5.1, Git, OpenSSH client | your PC | All standard on Windows 10/11. Docker Desktop is needed only to publish images. |
| This repository on the deployment branch, with a **clean working tree** | your PC | The scripts refuse uncommitted changes. |
| Working local setup with calibrated `BIOMETRIC_*` values in the local `.env` | your PC | See [README](../README.md) Part A and [biometric calibration](biometric-calibration-deployment.md). The launcher copies only these values and `ALLOWED_EMAIL_DOMAINS` / `GOOGLE_CLIENT_ID` as defaults. |
| Face model at `..\dentisys-biometric-assets\face_landmarker.task` (next to the repo folder) | your PC | Same file the local stack uses. |
| Gmail account with **2-Step Verification** and an **App Password** | Google account | Sends invitations and notices (~500 emails/day limit). |
| GitHub account and the published images `ghcr.io/<owner>/dentisys-{web,frontend,biometric}:demo` | GitHub | To use your own namespace: `docker login ghcr.io`, then `.\scripts\publish-images.ps1 -Namespace <your-github-user>`. Then create a **classic token with `read:packages`** for the server. |
| Google OAuth client ID (optional, for Google Sign-In) | Google Cloud Console | Add the site URL to *Authorized JavaScript origins* after step 2. |
| AWS account and an EC2 **key pair** (`.pem`) | AWS | Store the `.pem` in `%USERPROFILE%\.ssh\` (see troubleshooting for permissions). |

## 2. AWS (manual)

1. **Launch an instance:** Ubuntu Server **26.04 LTS**, x86-64,
   **c7i-flex.large** (2 vCPU, 4 GB) or larger, **30 GB** gp3 disk (the
   default 8 GB is too small), your key pair.
2. **Elastic IP:** EC2 → Elastic IPs → *Allocate* → *Associate* with the
   instance. Without it the IP (and the site name) changes on every stop/start.
3. **Security Group inbound:** `22` from your IP (first run only), `2202` from
   your IP, `80` and `443` from anywhere. Nothing else.
4. Wait for **Running** and status checks **2/2**.
5. Optional: your own domain — add an **A record** to the Elastic IP (with
   Cloudflare keep it DNS-only) and pass `-Domain` below. Without a domain the
   site is `https://<ip-with-dashes>.sslip.io` (e.g. `3-1-177-69.sslip.io`).

## 3. Run the command

In Windows PowerShell, from the repository folder:

```powershell
.\scripts\provision-vps.ps1 -Ip <elastic-ip> -KeyFile $HOME\.ssh\<key>.pem -User <name>
```

- `-User` is the sudo/SSH account to create (`devops` if omitted). Use the
  **same** value on every later run.
- Add `-Domain <name>` for your own domain, `-NewInstance` when you rebuilt the
  instance on the **same Elastic IP** (it replaces the old SSH host key after
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

1. **Remove port 22** from the Security Group.
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
| Rolling update | `.\scripts\publish-images.ps1` | Watchtower updates one copy at a time, no downtime |

## 6. Releasing changes later

| Change | Command (from your PC) |
|---|---|
| Application code only | `.\scripts\publish-images.ps1` — Watchtower rolls it out within ~5 minutes with zero downtime |
| Database migration | `.\scripts\sync-vps-db.ps1 -Server <user>@<ip> -Port 2202 -IdentityFile <pem>` (preview), then add `-Apply -Publish` |
| Compose files or server scripts | Rerun `provision-vps.ps1` with the same `-User`; it asks only for the sudo password and GHCR token, keeps `.env` and data |
| Backups | Nightly at 02:17 into `/opt/dentisys/backups`; copy them off with the commands in [vps-deployment.md](vps-deployment.md#copy-backups-off-the-server) |

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `UNPROTECTED PRIVATE KEY FILE` / `bad permissions` | Other Windows accounts can read the `.pem` | Copy it to `%USERPROFILE%\.ssh\`, then `icacls <pem> /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):R"`; the launcher prints the exact commands |
| "host key changed" / rebuilt instance on the same IP | Your PC remembers the old instance's key | Rerun with `-NewInstance` and compare the fingerprint with EC2 → *Get system log* |
| SSH timeout | Security Group blocks the port, or the instance is down | Check the inbound rules for 22 (first run) / 2202 |
| `no space left on device` while pulling images | 8 GB default disk | Resize the EBS volume to 30 GB, run `sudo growpart /dev/nvme0n1 1` and `sudo resize2fs /dev/nvme0n1p1`, rerun |
| `Server provisioning failed` | See the `ERROR:` lines printed above it | Full log: `ssh ... 'sudo tail -n 80 /var/log/dentisys-provision.log'` (as `ubuntu` on 22 before the SSH switch, as `<user>` on 2202 after) |
| Account mismatch at the probe | The server was set up with a different `-User` | Rerun with the original `-User` |
| Face enrollment: "requires an active academic term" | The Student's class term has no dates | Dean → Settings → Academic terms → set the dates |
| Certificate not issued | Port 80 closed or DNS not pointing at the IP | Open 80 in the Security Group; check the A record; rerun |
