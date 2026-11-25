---
name: dentisys-handoff
description: Session handoff workflow for DentiSys in Antigravity. Use when wrapping up a session, switching chats after a context-nudge, or preparing state for a new Antigravity or Claude session.
---

# DentiSys Session Handoff (Antigravity)

Keep handoffs grounded in git and file facts rather than conversation memory.

## 1. Collect factual state
Run one read-only command to capture:
- Current branch, `HEAD` sha, `git log --oneline <base>..HEAD`
- `git status -s` (any uncommitted files)
- `.git/dentisys-pass/` stamps matching `HEAD^{tree}` (`.check` and `.pg`)

## 2. Route durable rulings to their owning files
- Product decisions belong in `spec.md` (only with explicit Owner approval).
- Workflow/UI rulings belong in their owning doc or rule file — do not leave durable rules only in a handoff note.

## 3. No rolling state note
Claude keeps the project state. Your report (section 4b) is the handoff; do not write a state file.

## 4. Optional archive handoff
Only write `docs/archive/HANDOFF_<YYYY-MM-DD>_<topic>.md` when the Owner asks for a committed handoff record (note: committing a doc changes `HEAD^{tree}`, so re-run `pwsh -File scripts/check.ps1` if publish stamps must stay valid on `HEAD`).

## 4b. Cross-agent handoff (for Claude/Opus or colleague review)
When writing a handoff for another agent that will review, merge, or fix the branch:
- Write a **factual report** of what was done — never imperative "Your Steps" telling the receiving agent how to review or merge.
- Include: worktree/branch/base/commit SHAs, exact files and behavior changed per item, tests added (with fail-before / pass-after evidence), exact gate commands and results (including stamp hashes or why a stamp was not written), file overlaps with peer branches, and known gaps or pre-existing issues left untouched.
- For a Claude hand-off run, also: **Path chosen** per item (direct / one worker / swarm) with its reason; **Worker models** (each worker's name and model id); **Doubts (not acted on)** with the exact question per item left untouched.

## 5. Report to Owner
1. Confirm the report is written and committed on the batch branch.
2. State in 1 line what a fresh chat might lose (if anything).
3. Give the exact 1-line starter prompt to paste into the new chat.
