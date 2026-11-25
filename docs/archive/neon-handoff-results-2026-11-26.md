# Neon hand-off: original vs now, with evidence (2026-11-26)

Written by Claude for the Owner after building and piloting
[the plan](agy-swarm-handoff-plan-2026-11.md). Every number below comes from a run or a transcript; the
"Source" column says which. Run logs are in Claude's scratchpad; agy transcripts are under
`~/.gemini/antigravity/brain/<conversation>/` (app) and `~/.gemini/antigravity-cli/brain/<conversation>/` (CLI).

## Bottom line

- **Demonstrated (pilot and probes):** Claude starts, follows and reviews a run with no Owner pasting; a
  readiness pass returns doubts before any edit; the worker-model limit and the safety boundaries are
  refused by a guard (live denials), not only written in prose; rules and learning live in git and the
  Owner picks the fixes; the report has fixed fields.
- **Not yet proven:** lower token cost and higher output quality on a real batch. The pilot was 13 test
  lines on a pre-settled brief, it used no swarm workers, and the original runs' outputs were never
  scored, so there is no quality baseline. The next real batch is the test: same cost table, plus the
  number of defects Claude finds at the merge (the original merges found 3: F1, F2, F3 in
  `polish-merge-2026-11.md`, and 0 code defects in `swarm1124-merge-2026-11.md`).
- **What removing the Owner's mid-run steps costs:** decision points the Owner used to see during a run
  (e.g. "go" before the gates) now happen at the readiness pass and the merge only.

## Original vs now

| Step | Original (Antigravity app, Nov 22-24) | Now (Claude-driven, `agy` CLI) | Source |
|---|---|---|---|
| Start a batch | Owner pastes a start prompt into the app | Claude runs `.agents/scripts/agy-handoff.ps1`; it creates the worktree, runs `npm ci`, refuses a dirty tree | pilot readiness run |
| Clarify | Questions in chat before the swarm (8 multiple-choice questions in the 12.12/12.13 run) or mid-run | Readiness pass (plan mode, no edits, schema-checked JSON) returns every doubt before the build | phMobile items A+B: an ad-hoc brief got 5 doubts and no edits; a template brief that answered them got 0. The pilot brief was pre-settled, so its 0 doubts prove nothing more |
| Owner steps during the build | swarm1124: 3 messages correcting the worker models, then starting Docker and "go" when the run stopped for it; polish2: none during the build (a handoff request was misread and corrected once, after it) | 0 in the pilot (headless; doubtful items are skipped and listed) | app transcripts a950d1da, 1e2de3be (Owner lines); pilot |
| Worker models | Prose rule; a worker still started on Neon high and took 5 board messages to switch | Guard refuses any worker model except Neon medium/low, and `invoke_subagent` (which cannot select them) | live probe: `gemini-4-neon-high` worker refused |
| Swarm vs subagent | Mixed; one default subagent ran on Neon high | `/swarm` only; path per item: direct / one worker / swarm, stated with its reason | readiness outputs, pilot report |
| Safety | Wide access, no guard | Wide access plus a fail-closed guard: push, branch moves, hook skipping, direct docker, 5.1 writes, secrets, protected paths | `node --test .agents/scripts/agy-handoff-guard.test.mjs`: 6/6 pass; live probe: `git push --dry-run` refused in the coordinator and inside a Neon-low worker's own worktree (commit 3b26b96 message) |
| Rules home | Global plugin outside git; the learn pass wrote to it after the Owner approved its proposal | `.agents/rules` and skills in git; plugin disabled | commits 3aeeda2, cd38dc2; `agy plugin list` shows `dentisys-emergency (disabled)`; a headless run reports only the Neon rule |
| Report | Factual-report section 4b in the plugin's handoff skill | Same, plus fixed fields: Path chosen, Worker models, Doubts | pilot report matches Claude's own gate run |
| Learn | Neon ran `/learn` and changed rules after Owner approval of its proposal | Only after the Owner is satisfied; Neon returns ranked proposals and changes nothing; the Owner picks; Claude commits | learn runs on the phMobile and pilot conversations |
| Merge | Owner pastes the report into Claude | Claude is woken when agy exits and reviews directly | pilot |

## Measured cost

| Run | Wall time | New input | Output (thinking) | Cache read | Source |
|---|---|---|---|---|---|
| Original polish2 (2 items), coordinator | 198 min | 1,531,629 | 91,622 | 27.9M | app transcript 1e2de3be |
| Original polish2, 4 workers (Hydrogen high) | | 1,245,602 | 115,446 | 15.3M | worker transcripts |
| Original swarm1124 (5 items), coordinator | 153 min | 730,427 | 65,051 | 13.4M | app transcript a950d1da |
| Original swarm1124, 5 workers | | 1,368,528 | 112,698 | 14.3M | worker transcripts |
| Pilot readiness (2 items, tests only) | 103 s | 42,463 | 10,657 (9,866) | 174k | driver output |
| Pilot build (direct, 3 commits + report) | 222 s | 86,235 | 10,087 | 827k | driver output, minus readiness |
| Pilot learn | 92 s | 68,819 | 8,737 | 62k | driver output, minus build |

Wall time for the pilot is the driver's own timer per call (`wall_seconds`); agy's `duration_seconds` adds up
across a resumed conversation, so it is not used. Token columns for the pilot are differences between the
cumulative `usage` of consecutive phases. The original rows sum each step's `input_tokens` in the app
transcripts; whether the app and the CLI count input the same way is not verified, which is one more
reason the rows are not compared. Claude's side is outside these numbers.

## Quality evidence from the pilot

- Neon's diff matched the contract exactly (1 line for A; an 11-line test and one `package.json` list entry
  for C), authored as Light505, no AI trailers.
- Claude's independent gates on the pilot worktree: `tsc -b` exit 0, `npm --prefix frontend test` 389/389,
  `git diff --check` clean; these equal the numbers in Neon's report.
- Claude's merge finding Neon missed: the test pins `normalizeNameAffix('  dr  ', 'prefix')` returning
  `'  Dr.  '` (spaces kept) and the report says "Known gaps: none". It is not proven to be a bug, but a
  surprising result should have been flagged (proposed fix 1 below).

## Proposed learn fixes (Owner picks; none applied)

| # | From | Fix | File |
|---|---|---|---|
| 1 | Claude | A test that pins a surprising current result (e.g. kept whitespace) lists it under "Known gaps" with the input and output | `.agents/rules/dentisys-neon.md` |
| 2 | Neon | Swarm only when items do not fit `direct` together; today the rule says "2+ items → swarm" and "small → direct" at once | `.agents/rules/dentisys-neon.md` |
| 3 | Neon | Gates once on the final tree; drop the focused test command when the full unit suite runs in the same pass | `.agents/templates/brief.md` |
| 4 | Neon | `write_file` writes LF for new files; normalise new files before staging (Claude to verify against the repo's line-ending setup first) | `.agents/rules/dentisys-neon.md` |
| 5 | Neon | Never run `git config` to check the author (the guard denies it); pass `--author` directly | `.agents/rules/dentisys-neon.md` |
| 6 | Neon | Do not run `check-staged-encoding.mjs` by hand before a normal commit; the pre-commit hook runs it | `.agents/rules/dentisys-neon.md` |
| 7 | Neon | Handoff skill: "pass on current code" for tests-only items instead of fail-before | `.agents/skills/dentisys-handoff/SKILL.md` |

## Not proven or left open

- A real build that uses a swarm: the pilot chose `direct` (correct for 13 lines). Swarm mechanics are proven
  only by probes: worker on `gemini-4-neon-low`, own worktree, guard active in the worker, cleanup.
- Docker gates inside a Neon run (`check.ps1`, `check-postgres.ps1`): not run in the pilot.
- The guard's hook uses this checkout's absolute path; it only works from this folder on this machine.
- Remaining risk accepted by the Owner: code Neon writes can still push or read secrets; the rule forbids it.
- The pilot worktree `C:\Users\decha\Desktop\Github\dentisys-pilot` (detached, 3 commits) is kept for the
  Owner to look at; nothing is merged.
