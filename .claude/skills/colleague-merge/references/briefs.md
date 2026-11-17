# Briefs and templates

Copy these and fill the `<…>` parts. They are the texts that worked in the Owhie layout merge (2026-10-26). Keep the rules as written. Subagents over-reach when a rule is softened.

## A. Review report (step 1, to the Owner)

```
**Verdict: <don't merge as is | merge with fixes | merge as is>.** <one sentence: tests on theirs vs base, e.g. "43 of 241 browser tests fail on theirs; all 43 pass on base">.

**Not in their changelog:** <commits/files the message never mentions>.

**Findings, worst first**
R1 <regression>: <what the user sees>. <file:line>
F1 <good idea with a defect>: … 
N1 <needs your OK: product choice or spec/contract edit; quote any claimed approval date>: …
K1 <keep>: …

**Checked:** type check <result>, unit tests <n/n>, browser tests <n fail on theirs / all pass on base>.
**Not checked:** <e.g. live tests, visual design of X>.
```

## B. Merge resolution (step 3, sonnet, background)

```
You are resolving merge conflicts in <repo path>. A merge is in progress: `git merge --no-commit --no-ff <theirs>` into `<ours>`. Do NOT commit, do NOT run `git merge --abort`, do NOT switch branches, do NOT push.

Context
- "Ours" (HEAD) = <what our commits since base did, e.g. class-only UI polish: labels on one line (whitespace-nowrap, shrink-0), whole-group wrapping (flex-wrap, flex-1 basis-64, min-w-0), readable small grey text (text-slate-500 dark:text-slate-400), dead Tailwind shades removed>. See `git log -p <base>..HEAD -- frontend/src`.
- "Theirs" = <colleague>'s changes the Owner APPROVED: <list>.

Resolution rule (every conflict: `git diff --name-only --diff-filter=U`)
1. Their structure/layout/JSX wins. If they deleted an element, accept the deletion even if ours edited it.
2. Where an element survives in their version and ours changed its classes, re-apply our class change to their element.
3. Do not change behaviour, logic, wording, props or handlers. Their logic wins where it differs (known defects are fixed in a later step; leave them).
4. In lines they added or changed: small grey text text-slate-400 → text-slate-500 dark:text-slate-400 (not placeholders, disabled text, icons, separators); classes Tailwind 3.4 lacks (h-7.5, shadow-2xs, shades 150/202/205/350/450/550/650/750/850) → the nearest real class that renders today's look.
5. No conflict markers; imports consistent.

Checks before you finish: `npx tsc -b` and `npm test` from frontend/; `git diff --check`; `git grep -n '^<<<<<<<\|^>>>>>>>' -- frontend` empty; `git add` each resolved file (no commit).

Report: per file, how each conflict was resolved, every rule-2/rule-4 change (file:line, old → new), and anything you were unsure about.
```

## C. Defect fixes (step 4, SendMessage to the same subagent)

```
Resolution reviewed and accepted. Same working tree (merge still uncommitted; do NOT commit, abort, switch or push). Fix these defects. Keep <colleague>'s layout; change only what each item says. Old behaviour reference: `git show <base>:<file>`.

<id>. `<file>` — <what is wrong, as the user sees it>. <exact new behaviour, including labels/wording verbatim and which cases map to what>.
…

Checks: `npx tsc -b`, `npm test`, `git diff --check`. Stage (git add), no commit. Report each item with file:line, and anything you could not do exactly as written.
```

## D. Tests (step 5, sonnet, background)

```
Repo <path>. A merge is staged but NOT committed. Do NOT commit, abort, switch branches or push. Only edit files under e2e/. If a test fails because of a real product bug, report it instead of changing the test.

Approved UI changes (tests must follow these and keep what each test really checks):
- <change: old selector/text → new>
…

Task
1. Run the mocked suite in the background: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-e2e.ps1 --reporter=line *> <log>` (PowerShell tool), and wait.
2. Per failure: (a) follows an approved change → update the test so it proves the same behaviour (same API payload, data, permission and safety-wording assertions; replace, never delete); (b) product bug → leave it, report file:line and why.
3. After your LAST edit, run the FULL mocked suite once more and report that run's counts. A spec-only re-run does not count.

Report: final full-run counts, every test changed (file:line, old assertion → new), every failure classed as a product bug.
```

Then grep `e2e/live/*.ts` yourself for every removed string (the subagent cannot run live specs).

## E. rows.json entry (step 6)

```json
{"id": "C2", "area": "Standing chip",
 "theirs": "Missing standing shown as \"Good Standing\".",
 "merged": "Missing stays \"Unavailable\"; \"active\" shown as Good Standing (Needs your OK).",
 "status": "replaced", "keys": ["d4-standing", "stu-logic"]}
```

Logic-case target (mock copied whole from the real response, one field changed):

```json
{"id": "stu-logic", "device": "Desktop 1440", "role": "student", "route": "/student/classes", "full": true,
 "mock": [{"url": "**/api/student/classes", "json": {"status": "ok", "classes": ["<real objects, edited>"]}}]}
```
