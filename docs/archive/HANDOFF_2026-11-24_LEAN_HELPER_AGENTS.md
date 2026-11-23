# Handoff: merge `chore/lean-helper-agents` (2026-11-24)

Order (Owner, 2026-11-24): polish1 first, then this branch, then polish2.

## Where things are

- `chore/lean-helper-agents` @ 5112ef3, local only, branched from c17ad94 (the old prod sha). 2 commits:
  - ae77e1b chore(workflow): add lean `dentisys-builder` and `dentisys-test-writer` agents
  - 5112ef3 chore(workflow): add context-nudge hook and handoff skill
- Files (all new, 322 lines): `.claude/agents/dentisys-builder.md`, `.claude/agents/dentisys-test-writer.md`,
  `.claude/hooks/context-nudge.mjs`, `.claude/skills/handoff/SKILL.md`, `.claude/skills/handoff/scripts/handoff-facts.mjs`.
- No file overlap with polish1 (polish1 only touched `.claude/skills/feature/SKILL.md` and
  `.claude/skills/ui-fix-demo/references/dentisys.md` under `.claude/`), so the merge should be conflict-free.
- `lighthal9-responsive-polish1`: 4a2a225 (14.6 test fix), the live.spec.ts:455 flake fix and this handoff; see `git log` for the gate results.
- `lighthal9-responsive-polish` (the merge target for polish1 + polish2) does not exist yet.
- `lighthal9-responsive-polish2` (Antigravity/Gemini, 14.4 + 14.9 backend) is not to be touched in this session.

## Steps

1. Ask the Owner which base to merge into: `lighthal9-responsive-polish` (once polish1 is merged there) or polish1 directly. Never switch or merge branches without asking (CLAUDE.md "Git").
2. Read the 5 files in full before merging (subagent-written workflow files; trust the diff).
3. Check the hook is registered: `context-nudge.mjs` is not referenced in `.claude/settings.json` on the branch or on polish1.
   Either register it in the merge (with the Owner's OK) or leave it unregistered and say so.
4. Merge (no squash, no fast-forward needed); commit message `chore(workflow): merge lean helper agents`.
5. Test once on a real case (CLAUDE.md "Workflow" row): run the `handoff` skill's `handoff-facts.mjs`, and start one
   `dentisys-builder` or `dentisys-test-writer` agent on a tiny task to confirm they load.
6. Open item from memory: "Item 1" of the Section 3 adoption still has to be copied into `dentisys-test-writer.md`
   after this merge; ask the Owner what Item 1 is if the memory note does not say.
7. Checks: `git diff --check`, then `git add` + `node .githooks/check-staged-encoding.mjs`. Workflow-only, so
   `check.ps1` is enough before any push; ask before every push.
8. After the merge: drop "No `handoff` skill exists" and "Unmerged: chore/lean-helper-agents" from the
   `dentisys-current-state` memory note, then continue with polish2 via the `colleague-merge` skill.
