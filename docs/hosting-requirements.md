# Hosting requirements

What the demo and production servers need, in one place. Approved by the Owner on 2026-11-02 (spec DEL-001). How to set a server up: [deploy-from-scratch.md](deploy-from-scratch.md); how a release moves from demo to production: [release-guide.md](release-guide.md).

## Servers

| | Requirement |
|---|---|
| Environments | Two: **demo** (Claude deploys and tests) and **production** (Owner only). Same setup, separate images. |
| Provider | Any VPS provider; currently **Vultr**, one account, Singapore region. |
| Operating system | **Ubuntu Server 26.04 LTS** only (the hardening script refuses others). |
| CPU type | **x86-64 (amd64)**. Images are built for `linux/amd64`; ARM servers do not work. |
| Size, each | **Vultr High Frequency AMD, 1 vCPU / 2 GB RAM** (about 1.6 GB usable), 30 GB disk or more; both servers since 2026-11-05. Benchmarked 2026-11-04 (`benchmarks/results/`): about 34 requests/s, no errors at 25 simultaneous users, and 4 face check-ins at once add under 2 s each. A plain 1 vCPU / 1 GB plan works for the demo but swaps heavily and is roughly 2.5× slower. Move to 2 vCPU if many people browse heavily at once. 8 GB disks run out while pulling images. |
| App copies | `WEB_REPLICAS` / `FRONTEND_REPLICAS` in the server's `.env` (default 3 each, for updates without downtime). **Both servers run 1 and 1**: on 1 vCPU this removed the errors at 25 simultaneous users and cut face check-in delay (benchmark 2026-11-04); each update briefly interrupts the site. |
| IP address | One fixed public IPv4. A Vultr server keeps its IP for its lifetime; a Reserved IP is needed only to rebuild a server on the same IP. On AWS use an Elastic IP. |
| SSH keys | **A separate key per server, both made before the first server is created**: the demo key (no passphrase; Claude uses it for demo deploys and tests) and the production key (passphrase; Owner only). Never select the demo key for production, so a leaked demo key cannot open production and Claude has no way in. Owner decision 2026-11-05. |
| First login | The server's own SSH key, selected when the server is created. Vultr logs in as `root` (setup option `-InitialUser root`); AWS logs in as `ubuntu` (the default). |
| Recovery | The provider's web console (Vultr *View Console*; AWS Session Manager or EC2 Instance Connect). Keep it available before hardening. |

## Hardening

Applied by the setup script: the Owner's [Ubuntu 26.04 hardening guide](https://computingforgeeks.com/harden-ubuntu-2604-server/), steps 1–6.

- System updates, then one reboot if Ubuntu asks for it.
- A sudo account (`devops` by default; never `root` or `ubuntu`).
- SSH on **port 2202, keys only**; root and password logins off.
- **Before the first setup run**, check the provider's own SSH files: `grep -ri passwordauthentication /etc/ssh/sshd_config.d/`. If any says `yes` (Vultr's `50-cloud-init.conf` does), change it to `no` and run `systemctl reload ssh`; otherwise the setup script stops (“An existing SSH setting overrides the guide”) without changing anything.
- **UFW firewall**: only 2202 (rate-limited), 80 and 443 open.
- **fail2ban** against repeated login attempts.
- Production: no database tunnel; pgAdmin off by default and loopback-only when on. PostgreSQL, Mailpit and the face service stay inside Docker; Traefik is the only public entry point.
- A cloud firewall (Vultr Firewall Group, AWS Security Group) is optional; if one is used it must allow 2202, 80 and 443. Limiting 2202 to one IP locks you out when that IP changes.

## Software versions

Pinned in the repository; change them there, not on the server.

| Part | Version |
|---|---|
| Docker Engine and Compose plugin | Docker's official Ubuntu repository (installed by the script) |
| Web entry and HTTPS | Traefik v3.6.2, Let's Encrypt |
| Automatic updates | Watchtower 1.7.1 (the three DentiSys application containers only) |
| Database | PostgreSQL 18 |
| Application images | PHP 8.4 (Apache), Node 24 build served by nginx 1.27, Python 3.11 face service |
| pgAdmin | 9.16 (off in production by default) |

## Addresses and HTTPS

- **Domain:** `bu-dentisys.com`, registered at Namecheap with its DNS on Cloudflare (nameservers changed; the registration itself can move to Cloudflare later). **Production:** `https://bu-dentisys.com` (A record `@`). **Demo:** `https://demo.bu-dentisys.com` (A record `demo`). Keep both records **DNS-only** (grey cloud) so Let's Encrypt can issue certificates; update the record when a server's IP changes.
- Both addresses are in the Google Sign-In client's authorized JavaScript origins. A new server or hostname: point the record at it, run the setup with `-Domain <name>`, and add the origin. A hostname change needs no spec amendment.
- Without `-Domain`, the setup falls back to the free `<ip-with-dashes>.sslip.io` address (useful for a quick test server; some networks block it).
- **Port 80 must stay open** so Let's Encrypt can issue and renew certificates; HTTP redirects to HTTPS.

## Accounts and services

| Service | Requirement |
|---|---|
| Image registry | GitHub Container Registry under the Owner's account: `dentisys-*` (demo, written by the bot account) and separate `dentisys-*-prod` packages (production, Owner only). |
| Google Sign-In | **Required.** Add each server's `https://` address to the OAuth client's authorized JavaScript origins; the client ID is entered during setup. Keep the OAuth consent screen published (or list every tester). |
| Email | **Required.** A dedicated Gmail account (not a personal one) with 2-Step Verification and an App Password, entered during setup. About 500 emails a day. If invitations stop arriving, check Email Management for failed sends, then the App Password. |
| First Dean | Name and an email on an allowed domain; receives the first invitation. |
| Who can sign in | Unchanged: invitation by the Dean or Faculty, as Faculty, Student or Secretary, with an email on the allowed domain list. |
| Face recognition | **On by default in production** (public test site, spec BIO-002 amendment 2026-11-02). The demo keeps its 2026-10-09 rule: on only by explicit configuration, team members enroll. |

## Backups

- Each server takes a **nightly database backup** at 02:17 server time into `/opt/dentisys/backups` and keeps 14.
- Copying backups off the server is **deferred** until there is a place to keep them. Until then, losing a server loses its test data.
- Face references are never in the backup (BIO-003/BIO-005); after a server loss people enroll again.
- Keep a private copy of each server's `/opt/dentisys/.env`: a backup cannot be restored without its keys.

## Accepted risks (Owner, 2026-11-02)

- Both servers are on one provider account and one payment method: a billing or account problem takes both down together.
- There is no off-server backup, so test data can be lost.
- Temporary exception (Owner, 2026-11-05): the first production server was created with the demo key. Until it is replaced with a production key, one leaked key opens both servers, and Claude must still never connect to production.
