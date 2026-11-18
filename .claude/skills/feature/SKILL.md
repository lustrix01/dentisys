---
name: feature
description: Build a DentiSys feature or behaviour change from an agreed contract to a validated commit - contract, Owner check, demo when visible, build, tests, real-app review, gates. Use for new data, a new workflow, an API change, a change to how a screen behaves (flows, dialogs, saving, permissions), or any backlog item that is more than a bug fix or a look change, even if the user doesn't say "skill" or "feature". Bugs follow "Fixing bugs" in CLAUDE.md; looks only follow ui-fix-demo.
---

# Feature or behaviour change

The Owner decides what DentiSys does; Claude makes it real without surprises. Every feature starts from a contract the Owner agreed, and nothing visible is committed before the Owner has seen the real built screens. `AGENTS.md`, `spec.md` and `CLAUDE.local.md` win over this file.

## 1. Contract

- Read only the `spec.md` sections the feature touches, and the nearest existing page or endpoint that does the same kind of job (`docs/frontend.md` "Page patterns" for screens).
- Write the contract in chat: the rule in one sentence; per-role behaviour; data and migration (additive); API fields, errors and examples; each screen part and the existing part it copies; what the audit log records; spec lines it conflicts with, with the exact amendment proposed.
- The Owner runs `/grill-me` on it when it touches `spec.md`, the data model, roles and permissions, or an API contract. Otherwise the Owner's OK on the contract in chat is enough. Settle every product question before code; facts are Claude's to look up.

## 2. Proposal demo (only when something is visible)

- How it looks: `ui-fix-demo` Stage 1 options.
- How it behaves: a behaviour demo (below). The Owner approves it before building.
- Several backlog items batched for one approval: one demo for all of them.

## 3. Build and test

- Who writes what: `CLAUDE.local.md` "Working with subagents". Subagents get disjoint file lists, the contract verbatim, and for UI the exact classes to copy.
- Tests at the layer that holds the logic: unit tests for frontend logic, `tests/backend` for server rules, `tests/database` for queries and migrations, the mocked `e2e/*.spec.ts` for screens, `e2e/live/` for flows that need the real backend. Tests that assert old behaviour are updated to the agreed behaviour, never weakened.
- Update the current-reference docs the change affects (`AGENTS.md` "Documentation") in the same commit, and `spec.md` only with the Owner's approval.
- Review every diff against the contract; look for shared callers and the second copy of student pages (`frontend/src/pages/student/RealStudentSurfaces.tsx`).

## 4. Real-app review

The proposal demo approved the idea; the Owner now approves the real built screens. Looks: `ui-fix-demo` Stage 2 at the same link. Behaviour: real screenshots of the running app (local stack) for each scenario, light and dark, phone and desktop, republished to the behaviour demo's link. Wait for explicit approval.

## 5. Gates and commit

- `./scripts/check.ps1`; add `./scripts/check-postgres.ps1` when backend, database, authentication, sidecar or Docker files changed.
- One commit per feature: `feat(<area>): <what users can now do> (<backlog id>)`, with the `Demo:` line when `frontend/src` .tsx/.css changed.
- Push and release only when the Owner says so: `docs/release-guide.md`.
- Rewrite the `dentisys-current-state` memory note.

## Behaviour demo

A private Artifact page that copies the real screen's look and logic with example data:
- a **Before / After** switch;
- scenario cards with short "Try it" steps and "what you will see";
- a "Saved on the server" panel and a "What happened" log where saving is involved;
- a table of what is changing, each item marked agreed / needs your OK / recommendation.

Start from a read of a 2026-10-12 demo, never a blank page: [Score Entry Demo](https://claude.ai/artifact/Jo4dByVrFJ6pLcMfpAr1H1) or [Full Matrix Save Demo](https://claude.ai/artifact/VR71yoVAmvXi1jL35HLAwP). Keep `<meta name="dentisys-demo" content="behaviour">` in its head (`.claude/hooks/guard-demo-page.mjs` refuses a page without it). One demo per screen, republished at the same link as the proposal changes.

## Shape of the conversation

- Each message starts with the state: which step, what is done, what is next.
- Each pause for the Owner ends with exactly one question.
