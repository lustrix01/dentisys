# Brief: pilot (Neon hand-off), 2026-11-26

Written by Claude for Gemini 4 Neon high, run headless by Claude, to prove the hand-off routine
([plan](agy-swarm-handoff-plan-2026-11.md)). Items: A and C, tests only. Every question in this brief is
settled: it is the agreed contract. Claude reviews the result; nothing is merged without the Owner.

## Setup (done by Claude's driver; do not redo)

- Worktree `C:\Users\decha\Desktop\Github\dentisys-pilot`, detached at the `lighthal9-responsive` commit
  that adds this brief (no branch: the Owner names branches). `npm ci` has run in the root and in
  `frontend/`. It is your workspace root. Commit on the detached HEAD.
- Docker: not needed (no Docker gates in this batch).
- Parallel Claude work: none.

## Rules

1. `.agents/rules/dentisys-neon.md` applies in full, with `AGENTS.md` and `CLAUDE.md`.
2. Choose the path per item (direct / one worker / swarm) as that rule says. Start workers only with
   `/swarm` and `gemini-4-neon-medium` or `gemini-4-neon-low`; never `invoke_subagent`.
3. Every command runs from the workspace root with repo-relative paths. Never `cd` first.
4. Visible changes: none. Product code: none. Edit only the files each item lists.
5. Never ask mid-run. A doubt during the build: leave that item untouched, list the exact question, go on.

## Items

### A Test for a dashed mobile number
- **Contract:** add `assert.equal(normalizePhMobile('0917-123-4567'), '09171234567');` to the existing
  test "Philippine mobile numbers normalise to 09XXXXXXXXX" in `frontend/src/tests/fieldNormalization.test.ts`.
- **Files:** `frontend/src/tests/fieldNormalization.test.ts`.
- **Proof:** the focused test passes on current code.
- **Done when:** committed as `test: dashed Philippine mobile number normalises (pilot A)`.

### C Tests for name affix edge cases
- **Contract:** create `frontend/src/tests/nameAffixEdgeCases.test.ts` with one `test(...)` named
  "name affix edge cases" that asserts what `normalizeNameAffix` in `frontend/src/utils/nameNormalization.ts`
  returns TODAY for exactly these inputs: `('  dr  ', 'prefix')`, `('JR', 'suffix')`, `('iii', 'suffix')`,
  `('', 'suffix')`, `('unknownword', 'prefix')`. Read the function to get each expected value; do not change it.
  Add the new file to the `test` script list in `frontend/package.json` (that is the only non-test edit allowed).
- **Files:** `frontend/src/tests/nameAffixEdgeCases.test.ts`, `frontend/package.json` (test list only).
- **Proof:** the new test passes on current code and `npm --prefix frontend test` runs it.
- **Done when:** committed as `test: name affix edge cases (pilot C)`.

## Gates (once, after every worker is merged back, `--no-ff`)

1. `node frontend/node_modules/typescript/bin/tsc -b frontend`.
2. `node --experimental-strip-types --test frontend/src/tests/fieldNormalization.test.ts frontend/src/tests/nameAffixEdgeCases.test.ts`.
3. `npm --prefix frontend test`.

## Report (the only handoff)

Write `docs/archive/report-pilot-2026-11-26.md` with the `dentisys-handoff` skill, section 4b (with Path
chosen, Worker models, Doubts), and commit it on the detached HEAD.
