# Release guide: from approved change to production

The checklist for shipping a change. It covers who does each step, the exact commands, and what to do when something fails.
Server setup itself is in [deploy-from-scratch.md](deploy-from-scratch.md). The rules behind this guide are in `spec.md` DEL-001. Server requirements are in [hosting-requirements.md](hosting-requirements.md).

## Where work happens: localhost → demo → production

| Place | Address | Used for |
|---|---|---|
| Localhost | `http://localhost:5173` (Docker stack on the PC) | Building new features and changing existing ones. Code changes show up here immediately. |
| Demo | `https://demo.bu-dentisys.com` (`DEMO_BASE_URL` in `~\.dentisys\demo.env`) | Testing the finished, pushed version live in the cloud, with fictional data, to catch defects before production. The Owner and Claude approve it here. |
| Production | `https://bu-dentisys.com` | A public test site: invited users try DentiSys there, but it is not used for real attendance, grades or retention. It only receives versions approved on the demo. |

Nothing is edited directly on the demo or production. They only receive versions that came through localhost. Colleagues work up to pushing their own branch; only the Owner's PC merges, publishes images and operates the demo.

## Who does what

| | Demo | Production |
|---|---|---|
| Server | Demo VPS, operated by Claude | Production VPS, Owner only |
| Images | `ghcr.io/light505/dentisys-{web,frontend,biometric}:demo`, built by Claude | `dentisys-*-prod:prod`, copied by the Owner from the tested demo images, never rebuilt |
| Registry login on the PC | Bot account `lighthal-dev` (writes demo images only) | Owner's token, typed at a prompt, never stored |
| Settings file (outside the repo) | `~\.dentisys\demo.env` | `~\.dentisys\prod.env` |

Claude never runs `promote-prod.ps1` and never touches the production server, its keys or the `-prod` images.

## Running these scripts on Windows

A plain PowerShell window can refuse an unsigned `.ps1` with "... is not digitally signed". Run repository scripts with the execution policy bypassed for that one process:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\<script>.ps1 <arguments>
```

`pwsh` is PowerShell 7; `powershell` (Windows PowerShell 5.1) accepts the same switches. Claude Code's own PowerShell tool already adds this bypass, so Claude-run steps need no change — only a command you type in your own terminal does.

## The release, step by step

| # | Step | Who | Command or action |
|---|---|---|---|
| 1 | Agree the change, build it, run the checks | Claude, Owner approves | `.\scripts\check.ps1` |
| 2 | Push the commit | Claude, when the Owner says "push" | `git push` |
| 3 | Publish the demo images | Claude | `.\scripts\publish-images.ps1 -Tag demo`. It prints the 12-character sha. |
| 4 | Database migrations (only if the release adds them) | Claude | `.\scripts\demo-vps.ps1 migrate`. It backs up the database first. Watchtower alone is not enough. |
| 5 | Wait until the demo runs the new version | Claude | `.\scripts\demo-vps.ps1 wait-deploy <sha>`. It waits up to 15 minutes for every container to run that sha and be healthy. |
| 6 | Test the demo | Claude | `.\scripts\demo-test.ps1` signs in as each role through the tunnel on the `DEMO_LOCAL_PORT` port of `demo.env` (`http://localhost:<DEMO_LOCAL_PORT>`), plus any checks specific to the feature. |
| 7 | Report | Claude → Owner | Pass/fail in chat, ending with the approved sha and the exact command: `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\promote-prod.ps1 -Sha <sha>`. The change doc is updated only when the Owner asks. |
| 8 | Approve the demo | Owner, then Claude | Both say "approved". Open the demo yourself at its address. |
| 9 | Promote to production | **Owner** | See below. |
| 10 | Check production | **Owner** | `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo-test.ps1 -Prod`, about 2 minutes. See below. |

### Step 9: promote to production (Owner)

Use the sha from Claude's demo report (the version tested on the demo), not simply the newest commit. To look one up: `git rev-parse --short=12 HEAD`. A sha with no published demo images is refused before anything changes.

```powershell
git checkout <approved sha>
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\promote-prod.ps1 -Sha <approved sha> -DryRun
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\promote-prod.ps1 -Sha <approved sha>
git checkout -   # back to the branch you were on
```

- `promote-prod.ps1` needs HEAD to equal the sha you promote, so commit nothing after the tested commit before promoting. If a commit lands anyway, ask Claude to test the new head on the demo, or promote from a detached worktree at the tested sha.
- `-DryRun` changes nothing. It checks that the commit, a clean working tree and the three demo images exist, then prints the plan.
- The real run asks for:
  - your GitHub token (`write:packages`);
  - the production SSH key passphrase;
  - the production sudo password.
  
  These prompts are expected.
- Order:
  1. Database backup and migrations on production.
  2. Copy of the exact demo images to `-prod:prod`, with no rebuild.
  3. Fingerprint (digest) check.
  4. Wait until production runs the new version.

  Promotion never recalculates saved grades (spec UI-003). Grades update when Faculty next save scores or weights.
  
  The last line reads `Production now runs sha-<sha>`.
- A failure before step 2 leaves production untouched. Fix the cause the message names and rerun.

### Step 10: check production (Owner)

The local demo-test cannot see production, so the Owner runs the same read-only sign-in check against it after each promote:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo-test.ps1 -Prod
```

It reads `~\.dentisys\prod-test.env` (yours only: `PROD_BASE_URL` and an email and password for each role's test account), signs in as each role, and checks the audit chain over SSH with your `prod.env` settings. Claude has no access to either file.

### Rolling back

To go back to the previous version, promote the previous approved sha the same way (step 9). Database migrations only ever add, so older code runs on the newer database. Keep the sha of the last good release from Claude's report.

## Things the Owner renews or keeps safe

| Item | Where | When |
|---|---|---|
| `lighthal-dev` publishing token (`write:packages`) | Docker on this PC: `docker login ghcr.io -u lighthal-dev` | Before it expires. Symptom: step 3 fails with "Push failed". |
| `lighthal-dev` read token used by the demo server | Demo VPS: rerun `provision-vps.ps1` with the same `-User` (it asks only for the sudo password and the GHCR token) | Before it expires. Symptom: step 5 fails with "cannot pull". |
| Owner read token used by the production server | Production VPS: rerun `provision-vps.ps1 -Production` the same way | Before it expires. Symptom: step 9 fails with "cannot pull". |
| Production SSH key | Has a passphrase; keep it off this PC between releases if you can | Always |

## Emails not arriving

Both servers send through a dedicated Gmail account with 2-Step Verification and an App Password (about 500 emails a day). If invitations stop arriving:
1. Faculty → **Email Management** shows each email as sent or failed.
2. Failed: the App Password was revoked, or the Gmail password or 2-Step Verification changed. Create a new App Password, put it in the `SMTP_PASS=` line of `/opt/dentisys/.env` on the server (`sudo nano /opt/dentisys/.env`; a rerun of `provision-vps.ps1` keeps the old value), then restart the stack: `cd /opt/dentisys && sudo docker compose --env-file .env -p dentisys -f docker-compose.web.yml -f docker-compose.database.yml -f docker-compose.vps.yml up -d`. Claude does this on the demo; the Owner on production.
3. Sent but not received: ask the person to check spam.

## A new release PC

What lives outside Git on this PC, and what to do if the PC is replaced (about an hour):

| Item | Where | On a new PC |
|---|---|---|
| Docker login of the bot `lighthal-dev` | Docker Desktop | `docker login ghcr.io -u lighthal-dev` with the publishing token |
| Demo settings and test passwords | `~\.dentisys\demo.env` (keys: `DEMO_SSH_HOST`, `DEMO_SSH_USER`, `DEMO_SSH_KEY`, `DEMO_SSH_PORT`, `DEMO_LOCAL_PORT`, `DEMO_REMOTE_PORT`, `DEMO_BASE_URL`, and one `DEMO_ROLE_EMAIL` / `DEMO_ROLE_PASSWORD` pair per role, ROLE = ADMIN, FACULTY, SECRETARY, STUDENT) | Copy it over, or recreate it as in *Setting up a new server* |
| Demo SSH key | `~\.ssh\` | Copy it over, or add a new key to the demo server's `devops` account |
| Production settings, key and test logins | `~\.dentisys\prod.env`, `prod-test.env`, the production key | Owner only: keep them backed up somewhere safe |

Then install Docker Desktop, Node.js and Git, clone the repository, and run `npm ci` in the repository and in `frontend/`.

## Setting up a new server

- **Production:** see "Production VPS" in [deploy-from-scratch.md](deploy-from-scratch.md). Promote the images first, then run `provision-vps.ps1 -Production`, then create `~\.dentisys\prod.env`.
- **Demo:** `provision-vps.ps1` as in [deploy-from-scratch.md](deploy-from-scratch.md), using the bot's read token at the GHCR prompt (GHCR username stays `Light505`). Then:
  1. Fill in `DEMO_SSH_*` in `~\.dentisys\demo.env`. Leave the `DEMO_*_EMAIL` and `DEMO_*_PASSWORD` lines empty.
  2. The Owner runs this once and types the sudo password. It gives `devops` password-free sudo on the **demo VPS only**:
     ```powershell
     ssh -t -i <demo key> -o IdentitiesOnly=yes -p 2202 devops@<demo ip> "printf '%s\n' 'devops ALL=(ALL:ALL) NOPASSWD: ALL' > /tmp/90-devops && sudo visudo -cf /tmp/90-devops && sudo install -m 0440 -o root -g root /tmp/90-devops /etc/sudoers.d/90-devops; rm -f /tmp/90-devops"
     ```
  3. Claude:
     - loads the fictional demo seed (`database/seeds/development-demo.sql`);
     - sets random passwords per role, saved in `demo.env`;
     - starts the test entrance (`docker-compose.demo-tunnel.yml`);
     - runs `.\scripts\demo-test.ps1`.
