---
name: user-walkthrough-audit
description: Run a full audit of a web app as its real users, one role at a time — walk every flow a new and an experienced user would take on phone and desktop, find what is missing, confusing, unpolished or broken (including spec gaps), then fix in approved batches with Before/After demos, deploy to the demo site, and leave a report, changelog and backlog. Use whenever the user asks for a "full rundown/run-through of the system as a user", a "walkthrough per user type", a "user audit", "find what's missing or confusing", or to "audit the whole app like a user", even if they don't say "skill". In DentiSys this is the route for whole-system user audits; single UI bugs go to ui-fix-demo instead.
---

# User walkthrough audit

The Owner wants to know how the system feels to each kind of user, not how the code looks. This workflow walks every role like a real person, ranks what it finds, and turns the findings into approved, demoed, deployed fixes — without ever deciding product questions for the Owner.

Project specifics (roles, accounts, routes, checks, traps) are in `references/<project>.md`; for DentiSys read `references/dentisys.md` first. `CLAUDE.local.md`, `AGENTS.md` and `spec.md` win over this file.

## 0. Ask first, assume nothing

Before touching anything, ask with `AskUserQuestion` (recommended option first). One or two rounds:
- **Where:** local stack, demo site, or both. May the demo's data be changed? May it send email (usually **no**: demo accounts may be real people)?
- **Who:** which roles, and in what order (default: the real-life order, e.g. Dean → Faculty → Secretary → Student).
- **Output:** report only, report + demos, or report + fix small items (and how small: presentation only, or small logic bugs too).
- **Devices/themes:** desktop, phone, tablet, portrait/landscape, dark mode.
- **Yardstick:** spec gaps, common needs of this kind of system, usability/polish — and whether the spec itself may be wrong.
- **Audience:** e.g. non-technical staff, students on phones, local wording, an evaluation panel. This decides what counts as "confusing".
- **Pacing:** one role at a time with review after each (default), or everything then one review.
- **Report:** a shareable doc (default: Claude Doc), a repo markdown file, or an artifact page.

Record each answer as a ruling; never ask the same thing twice.

## 1. Set up

1. Create the report doc first (title, byline, one pending block per role, one for spec issues, one for fixes) and open it, so the Owner watches it fill.
2. Check the stack is up. **Check email safety before any flow that sends mail**: confirm the local mail mode really delivers to a catcher (Mailpit) and cannot reach a real server. If it can, stop and ask — never send "just one test" invite.
3. Start the project's device sweep for the role in the background (it runs every route × device × theme). Treat its output as leads, not findings: sticky-header overlaps, fade-in contrast and mid-transition shots are usually noise; confirm each on screen.

## 2. Walk one role like a person

Use the in-app browser (or a Playwright script for multi-step or data-changing states). For each role:
- **Start from zero:** the invitation email (read it in the mail catcher), accepting it, setting a password (try a mismatch), the first login. A new user's first screen matters more than a seasoned user's tenth.
- **Do every job the role exists for**, end to end, including the error paths: create, edit, delete, refuse (bad dates, clashes, over-limits, wrong email domains), and the hand-offs to other roles (requests, approvals, notifications).
- **Visit every page in the menu** and every tab; read the words as the audience would.
- **Phone and desktop** for the role's real device; spot-check dark mode.
- **Doubt every number and time:** compare a dashboard figure with the database (a capped query, a wrong count, a UTC time shown as local are common and high impact). When two screens disagree, find out which is right.
- **Check surprising behaviour against the spec** before calling it a bug; when the spec is silent or looks wrong, record a spec issue instead.
- Before reporting a layout bug, prove it (e.g. `scrollWidth` vs viewport) — preview panes crop and scale screenshots.

Write the role's section as soon as the role is done: one-sentence verdict, the flow walked, a findings table (`# | Severity | Where | What the user sees | Proposed fix`), and a "Works well" line. Severity: **Blocker** (task impossible or data wrong), **Major** (causes mistakes or support calls), **Minor** (polish), **Suggestion** (not in spec; needs the Owner). Mark anything beyond the agreed fix limit "needs your OK". Spot-check data bugs on the demo read-only (database counts), never by guessing.

## 3. Rulings, then fixes

- Ask the rulings the role raised in one round (each question's "yes" accepts your recommendation). Product decisions are the Owner's; facts are yours to look up.
- A change the spec forbids or does not cover: stop, propose the exact spec line, apply only after explicit approval.
- A new feature (new data, new workflow): write a contract (rule, per-role behaviour, data, API, conflicts, audit, examples), ask the Owner to run `/grill-me` on it, update it with every decision, and build nothing until they confirm.
- Build fixes as one batch per role via the **ui-fix-demo** skill: Before screenshots first (from the code about to change), subagents with **disjoint file lists** and a precise contract, review every diff (subagents over-reach and miss shared callers), both gates, After screenshots, contact sheets checked by eye, then a Before/After demo with a "What is changing" table. Fix in passing what the review finds; say so in the demo.
- Tests that assert old wording or old behaviour get updated to the agreed behaviour — never weakened. A test failing for an unrelated reason is a finding.

## 4. Approve → commit → deploy

- Commit only after the Owner approves the demo; one commit per batch with a message the Owner can read.
- Push and deploy only when told. Follow the project's deploy runbook exactly (migrations before the code that needs them), then run the demo smoke tests, the audit-chain check and read-only live API checks of what the release changed (`scripts/demo-live-check.mjs` is the DentiSys template).
- Production is the Owner's. After a tested deploy, **commit nothing** until they promote — promotion scripts usually require HEAD to equal the tested commit. If something must land, redeploy and retest the new head first.

## 5. Close the loop

When every role is done:
- Update the report: a status line under the title, the spec-issues table with outcomes, one releases table (commit · what · demo link) and one findings-outcome table, the Owner's rulings, and "Not verified".
- Items the Owner wants to discuss go to the product backlog with the open question, not into code.
- Write a changelog doc for the series as `docs/archive/<topic>-<yyyy-mm>.md` (commits, what users see now, rulings, how it was checked, not verified, lessons), link it from `docs/archive/README.md`, and update the product feature doc.
- Verify what the demos could not show: run the cross-role flows live, force the states that need data changes locally, and check the new screens in dark mode. A live run usually finds one more bug.
- Rewrite the project memory note: branch, last commits, what is on demo, the sha to promote, open Owner items.
- Finish with one list of what is left, split into "only the Owner can do" and "Claude can do now".

## Shape of the conversation
- Each message starts with the state: which role/batch, what is done, what is next.
- Each role or batch ends with exactly one question: approve, or answer these rulings.
- Lead with what the Owner can open or click; caveats in one line at the end.
