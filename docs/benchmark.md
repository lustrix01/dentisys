# Benchmark

One fixed, repeatable benchmark for the **demo server or a throwaway local stack**, so a server upgrade or an optimization can be compared with the previous run. **Never production.** Contract agreed with the Owner on 2026-11-04 (grill-me, rounds 1–3).

## Commands

```powershell
./scripts/benchmark.ps1 -Target demo                 # ~12 min
./scripts/benchmark.ps1 -Target local                # builds the current code first
./scripts/benchmark.ps1 -Target demo -Repeat 3       # for big decisions; stores every repeat + the median
./scripts/benchmark.ps1 -Target demo -Compare benchmarks/results/<earlier-run>.json
./scripts/benchmark.ps1 -CaptureFace <selfie-video.mp4>   # one-time face frames
```

- Runs only on request (no automatic runs after deploys; there is no CI).
- **demo**: `DEMO_BASE_URL` (e.g. `https://demo.bu-dentisys.com`) of the server in `~/.dentisys/demo.env`, SSH from the same file. Load comes from this PC. The script talks to the server in four SSH sessions per run (upload, start, face phase, finish) because the server's firewall blocks a sixth connection within 30 seconds.
- **local**: a separate production-like stack (`docker-compose.web.yml` images **built from the current code**) under its own Docker project with its own empty database, loaded with `database/seeds/development-demo.sql`, removed after the run. The development stack and its database are never touched; the development stack is never benchmarked.
- **Local resource cap: 1 CPU, 1 GB RAM in total, only on the throwaway benchmark stack and only while it runs.** Your development stack, its containers and Docker Desktop's own settings are never limited or changed. The cap makes local numbers behave like the demo server: every container of the throwaway stack is pinned to the same single CPU core (`cpuset`), so they share one core the way they share the VPS's one vCPU, and per-container memory limits add up to 1 GB, sized from the demo's measured usage. Swap is allowed as on the VPS. The cap is recorded in the fingerprint; change it (a new profile) when the demo server is resized. Even capped, a laptop core is faster than the VPS's: compare local with local only, and confirm a local improvement once on the demo.
- **Refuses** any other address, and refuses outright if the address equals `PROD_BASE_URL` (in `~/.dentisys/prod.env` or `prod-test.env`) or if `DEMO_SSH_HOST` equals the production server. Local uses `http://localhost:18080` only (the throwaway stack's port).
- **Demo activity check**: refuses to start if the demo's audit log shows sign-ins or activity from anyone else in the last 15 minutes, unless `-Force`.
- Logins: `DEMO_FACULTY_*` / `DEMO_STUDENT_*` in `demo.env` (demo); seed accounts (local). Never printed.

## Fixed profile `v1`

Every run does exactly this. Changing any number makes a new profile (`v2`); runs are compared only within the same profile.

| Phase | What | Load | Length |
|---|---|---|---|
| 0. Fingerprint | git sha, image IDs, restart counts, vCPU, CPU model, RAM, swap, disk, container replicas, local resource cap, row counts of the main tables, PC-to-server round-trip, profile | – | – |
| 1. Warm-up | the read mix, not measured | 5 users | 30 s |
| 2. Read load | read mix, closed loop | 1, 5, 10, 25, 50 users | 60 s each |
| 3. Sign-in | password sign-ins, paced under the 100/min/IP limit (~60 audit entries per run) | 1 per second | 60 s |
| 4. Face check-ins | recorded frames sent straight to the face service, as real check-ins | 1, 2, 4 students at once | 60 s each |
| 5. Idle | server metrics only | 0 | 30 s |

**Read mix** (fixed weights, fixed random seed `20261104`; all numbers live in `scripts/benchmark/profile.json`): landing page `/` 10, `/api/health` 10, student attendance logs 15, upcoming sessions 15, active sessions 15, faculty dashboard KPIs 15, faculty students 10, faculty retention 10. Each virtual user has its own seeded random stream, so the request sequence is the same on every run. Before the first stage every endpoint must answer 200, otherwise the run stops (a bad setup, not load). All requests carry the user agent `DentiSys-Benchmark/v1`, which is how the activity check tells them from other people's.

A stage with more than 20% errors is recorded and the rest of that phase is skipped; other phases still run.

**Valid run**: image IDs and restart counts are read at start and end; if anything changed (a Watchtower deploy, a restart) the run is kept but marked **INVALID** and excluded from `-Compare`.

## Face check-ins without the camera

- The app's development biometric mock is blocked outside local development (`backend/app/config.php`, spec BIO), so the camera is replaced, not the face service.
- One-time: the Owner records a ~5 s selfie video (face the camera, blink, turn left and right). `-CaptureFace` turns it into frames exactly like the app's (640×480, JPEG quality 0.85) and stores them in `~/.dentisys/benchmark-face/`. **Never in the repo.**
- One simulated check-in = 26 single-frame guidance calls, then one 9-frame verify: measured from one real check-in in the demo access log (2026-11-04: 2 liveness challenge requests handled by PHP only, 26 guidance calls about 0.6 s apart, one verify). Each simulated student is paced like the phone: send a call, wait for it, sleep the rest of 600 ms (a slower call is followed at once). Numbers: `guidanceCallsPerCheckin` and `guidanceIntervalMs` in `profile.json`.
- The frames are chosen from the video with the face service's own guidance, then validated: one enrolment, one verify and a revoke must succeed, or `-CaptureFace` fails and saves nothing.
- Each run enrolls a temporary reference from the frames, runs the phase over the server's internal network with the face service's shared secret, then revokes the reference. No database rows are written.
- Reported per check-in: total time (p50/p95), the server time added beyond the client pacing (total minus 26 x 0.6 s), guidance-call and verify-call p50/p95, and how many verify calls exceed 20 s (the PHP sidecar timeout per call, `BIOMETRIC_SIDECAR_TIMEOUT_SECONDS`; the student would fall back to manual attendance).

## Server metrics

Sampled every 5 s (on the server for demo, Docker for local): CPU busy %, CPU steal %, memory used/available, swap used, load average, per-container CPU and memory. Reported per phase/stage as average and peak. On the demo the sampler reads `/proc` and the containers' cgroup files (no `docker stats`, which is slow on one vCPU); container memory includes page cache. Locally only per-container CPU and memory exist (`docker stats`); system CPU, steal, swap and load are not visible and read `-`. Server and PC clocks are matched once per run, so stage windows can be off by about a second.

## Results

- `benchmarks/results/<UTC date-time>-<target>-<git sha>.json`: every number above. The script writes it; Claude commits it with the run report.
- A short table in the terminal. With `-Repeat N` the file's stage numbers are the median and every repeat is kept under `repeats`. `dirty` means tracked files differ from the commit. The face phase also runs locally when `~/.dentisys/benchmark-face/` exists. The local images (`dentisys-bench-*:local`) stay in Docker as a build cache; the stack, its volumes and its temporary secrets are removed.
- `-Compare` prints old vs new per stage (requests/s, p50/p95/p99, errors, check-in times, CPU, memory) with the % change. Changes within ±10% read "no clear change". It warns when the round-trip differs by more than 30% (network changed) or table row counts by more than 10% (data grew).

## What it does not cover

- Many different people at once: all traffic comes from one PC and one IP.
- The full attendance flow (location, session, saving the record): it writes data and cannot be repeated identically.
- Network distance: compare demo with demo and local with local only.

## Writes to the demo

Sign-in audit events (phase 3) and a temporary face reference that is revoked at the end. No attendance, grades or accounts are changed.
