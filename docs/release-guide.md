# Release guide: from approved change to production

The checklist for shipping a change. It covers who does each step, the exact commands, and what to do when something fails.
Server setup itself is in [deploy-from-scratch.md](deploy-from-scratch.md). The rules behind this guide are in `spec.md` DEL-001 (Owner decision 2026-10-14).

## Where work happens: localhost → demo → production

| Place | Address | Used for |
|---|---|---|
| Localhost | `http://localhost:5173` (Docker stack on the PC) | Building new features and changing existing ones. Code changes show up here immediately. |
| Demo | `https://52-76-136-13.sslip.io` | Testing the finished, pushed version live in the cloud, with fictional data. The Owner and Claude approve it here. |
| Production | The production `sslip.io` address | Real use with real data. It only receives versions approved on the demo. |

Nothing is edited directly on the demo or production. They only receive versions that came through localhost.

## Who does what

| | Demo | Production |
|---|---|---|
| Server | Demo VPS, operated by Claude | Production VPS, Owner only |
| Images | `ghcr.io/light505/dentisys-{web,frontend,biometric}:demo`, built by Claude | `dentisys-*-prod:prod`, copied by the Owner from the tested demo images, never rebuilt |
| Registry login on the PC | Bot account `lighthal-dev` (writes demo images only) | Owner's token, typed at a prompt, never stored |
| Settings file (outside the repo) | `~\.dentisys\demo.env` | `~\.dentisys\prod.env` |

Claude never runs `promote-prod.ps1` and never touches the production server, its keys or the `-prod` images.

## The release, step by step

| # | Step | Who | Command or action |
|---|---|---|---|
| 1 | Agree the change, build it, run the checks | Claude, Owner approves | `.\scripts\check.ps1` |
| 2 | Push the commit | Claude, when the Owner says "push" | `git push` |
| 3 | Publish the demo images | Claude | `.\scripts\publish-images.ps1 -Tag demo`. It prints the 12-character sha. |
| 4 | Database migrations (only if the release adds them) | Claude | `.\scripts\demo-vps.ps1 migrate`. It backs up the database first. Watchtower alone is not enough. |
| 5 | Wait until the demo runs the new version | Claude | `.\scripts\demo-vps.ps1 wait-deploy <sha>`. It waits up to 15 minutes for every container to run that sha and be healthy. |
| 6 | Test the demo | Claude | `.\scripts\demo-test.ps1` signs in as each role through the tunnel at `http://localhost:15180`, plus any checks specific to the feature. For the grade-rules release, Claude first shows you the list of grades that change (`.\scripts\demo-vps.ps1 recompute-grades preview`, writes nothing), then applies it on the demo (`... recompute-grades apply`). |
| 7 | Report | Claude → Owner | Pass/fail in chat, ending with the approved sha and the exact command: `.\scripts\promote-prod.ps1 -Sha <sha>`. The change doc is updated only when the Owner asks. |
| 8 | Approve the demo | Owner, then Claude | Both say "approved". Open the demo yourself: `https://52-76-136-13.sslip.io`. |
| 9 | Promote to production | **Owner** | See below. |

### Step 9: promote to production (Owner)

Use the sha from Claude's demo report (the version tested on the demo), not simply the newest commit. To look one up: `git rev-parse --short=12 HEAD`. A sha with no published demo images is refused before anything changes.

```powershell
git checkout <approved sha>
.\scripts\promote-prod.ps1 -Sha <approved sha> -DryRun
.\scripts\promote-prod.ps1 -Sha <approved sha>
git checkout lighthal9-responsive
```

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
  5. Recalculate current-term grades once with the new grading rules (one audited batch, actor System). Safe to repeat: a second run changes nothing. If it fails, the message says the deploy itself succeeded; tell Claude.
  
  The last line reads `Production now runs sha-<sha>`.
- A failure before step 2 leaves production untouched. Fix the cause the message names and rerun.

## Things the Owner renews or keeps safe

| Item | Where | When |
|---|---|---|
| `lighthal-dev` publishing token (`write:packages`) | Docker on this PC: `docker login ghcr.io -u lighthal-dev` | Before it expires. Symptom: step 3 fails with "Push failed". |
| `lighthal-dev` read token used by the demo server | Demo VPS: rerun `provision-vps.ps1` with the same `-User` (it asks only for the sudo password and the GHCR token) | Before it expires. Symptom: step 5 fails with "cannot pull". |
| Owner read token used by the production server | Production VPS: rerun `provision-vps.ps1 -Production` the same way | Before it expires. Symptom: step 9 fails with "cannot pull". |
| Production SSH key | Has a passphrase; keep it off this PC between releases if you can | Always |

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
