---
name: handoff
description: Hand a DentiSys session over to a fresh one without losing context. Use when the Owner asks for a handoff or a fresh session, or accepts the context-check suggestion. Optional: the Owner may always stay in the same session.
---

# Handoff

A handoff loses context when it relies on what the old session remembers. This one does not: decisions go into the files that own them, facts and the Owner's own words are collected by a script, the old transcript stays searchable, and a cold reader checks the result. Never hand off mid-step; finish the step first.

## 1. Persist what only lives in chat

List every Owner ruling, decision or preference from this session that is not yet in a file. Write each one to the file that owns it (`CLAUDE.md` / `CLAUDE.local.md` routines, the feature contract, `spec.md` only with the Owner's OK, `.claude/skills/ui-fix-demo/references/dentisys.md` for UI rulings). Then rewrite the `dentisys-current-state` memory note (at most 15 lines). A decision that stays only in the handoff file is a loss waiting to happen.

## 2. Collect the facts with the script

Pick a unique marker (for example `HFMARK-` plus 4 random letters) and put it in this exact command, from the repo root:

```
node .claude/skills/handoff/scripts/handoff-facts.mjs HFMARK-XXXX <short-slug>
```

It writes `.claude/handoffs/<slug>/owner-messages.md` (everything the Owner typed, verbatim) and `facts.md` (branch, HEAD, uncommitted files, recent commits, recorded gate passes), and prints the old session's CLI id. If it warns that the marker was not found, stop and check the id with the Owner. `.claude/handoffs/` is git-ignored.

## 3. Write `.claude/handoffs/<slug>/handoff.md`

Use these sections, in this order. Keep it under 80 lines; point to files instead of copying them.

1. **Goal**: one paragraph, in the Owner's words where they matter.
2. **Where the truth lives**: paths of the contract, spec lines, memory note. The new session reads these, it does not re-derive them.
3. **Decisions**: each as decision, reason, rejected alternatives, and the file where it is recorded.
4. **Rulings given in chat**: each with the file it was written to in step 1.
5. **Done, with evidence**: what works and how you know (test counts, log paths). Mark what you did NOT verify.
6. **Not done / in flight**: background tasks, helpers still running, half-finished edits.
7. **Gotchas**: things that cost time this session (rate limits, path mangling, files that must not be touched).
8. **Open questions for the Owner**.
9. **Next step**: the exact first action, and the constraints (for example: nothing is committed, do not stash, reset or switch branches).
10. **Lookup**: the old session's `local_` id (`get_session` with `self`), its CLI id from the script, and `facts.md` and `owner-messages.md` beside this file. Say: if something is unclear, search the old transcript (`search_session_transcripts`, or read `owner-messages.md`) before asking the Owner.

## 4. Cold-read check

Spawn one `general-purpose` agent on `haiku` with only this instruction: read `.claude/handoffs/<slug>/handoff.md` and answer five questions in two lines each: what is the goal, what is done, what is the next step, what must not be done, what is unresolved. Compare its answers with yours. Any wrong or missing answer is a gap in the handoff: fix the handoff, not the agent. Skip only if the Owner says to.

## 5. Resume

Give the Owner a resume prompt of at most 10 lines: "Read `.claude/handoffs/<slug>/handoff.md` first, then the files it names. Next step: ...". Offer to start the new session yourself with `start_session` (fresh) so nothing is copied by hand. If the Owner declines the handoff at any point, say nothing more about it and keep working here.
