// Regression tests for the commit-message rules (.githooks/check-commit-msg.mjs) and the
// Claude guard against skipping hooks (.claude/hooks/guard-no-verify.mjs).
// Run: node --test tests/workflow/   (./scripts/check.ps1 runs it)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, appendFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const commitMsg = join(root, '.githooks', 'check-commit-msg.mjs');
const guard = join(root, '.claude', 'hooks', 'guard-no-verify.mjs');
// Never inherit GIT_DIR / GIT_INDEX_FILE etc.: run from inside a hook, they would point git at the real repo.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

// A throwaway repo with one empty commit, so `git reset` clears the stage between cases.
function tempRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'dentisys-hooks-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe', env });
  git('init', '-q');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', 'init');
  const check = (message) => {
    writeFileSync(join(repo, 'msg.txt'), message);
    return spawnSync(process.execPath, [commitMsg, 'msg.txt'], { cwd: repo, encoding: 'utf8', env });
  };
  return { repo, git, check };
}

test('commit-msg rules', () => {
  const { repo, git, check } = tempRepo();
  try {
    for (const d of ['backend', 'tests/backend', 'frontend/src/pages', 'frontend/src/tests', 'e2e']) mkdirSync(join(repo, d), { recursive: true });
    const cases = [
      // [expected exit, staged files, message]
      [0, ['backend/a.php'], 'fix(api): x\n\nTest: none - deploy config'],
      [1, ['backend/a.php'], 'fix(api): x'],
      [0, ['backend/a.php', 'tests/backend/a_test.php'], 'fix(api): x'],
      [0, ['frontend/src/tests/x.test.ts'], 'fix: x'],
      [0, ['e2e/a.spec.ts'], 'fix(e2e): x'],
      [1, ['backend/a.php'], 'feat(x): add thing'],
      [0, ['backend/a.php'], 'feat(x): add thing (13.3)'],
      [0, ['backend/a.php'], 'feat(x): add thing (backlog 12.3, 12.4)'],
      [0, ['backend/a.php'], 'feat(grading): add thing (GRA-03)'],
      [0, ['backend/a.php'], 'feat(x): add thing\n\nContract: docs/contracts/superadmin.md'],
      [1, ['backend/a.php'], 'feat(x): React 18.3 upgrade'],
      [1, ['backend/a.php'], 'feat: x (ticket batch 1C)'],
      [1, ['frontend/src/pages/A.tsx'], 'ui: x'],
      [0, ['frontend/src/pages/A.tsx'], 'ui: x\n\nDemo: https://claude.ai/artifact/abc'],
      [0, ['frontend/src/pages/A.tsx'], 'ui: x\n\nDemo: none - logic only'],
      [1, ['README'], 'docs: x\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>'],
      [1, ['README'], 'docs: x\n\nClaude-Session: abc'],
      [1, ['README'], 'docs: x\n\nGenerated with [Claude Code](https://claude.com/claude-code)'],
      [1, ['README'], 'Merge branch x\n\nCo-Authored-By: Claude <x>'],
      [0, ['backend/a.php'], "Merge branch 'owhie' into lighthal9"],
      [0, ['backend/a.php'], "merge: Owhie's work into the line"],
      [0, ['backend/a.php'], 'About page help line links to Contact'],
      [0, ['backend/a.php'], 'chore(workflow): x'],
      [0, ['spec.md'], 'docs(spec): x'],
      [0, ['README'], 'docs: explain the rule\n\nWe refuse lines like Generated with Claude Code in messages.'],
      [1, ['README'], 'docs: x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'],
      [0, [], 'fix(api): better wording'], // message-only amend: nothing staged
      [1, ['backend/a.php'], '﻿fix: z'], // a BOM does not hide the subject
      [0, ['README'], 'docs: x\n# ------------------------ >8 ------------------------\n+ Generated with Claude Code is refused'], // git commit -v diff
      [0, ['frontend/src/tests/x.test.tsx'], 'test: x'], // test files are not UI files
    ];
    for (const [expected, files, message] of cases) {
      git('reset', '-q');
      for (const f of files) { appendFileSync(join(repo, f), `${Math.random()}\n`); git('add', f); }
      const run = check(message);
      assert.equal(run.status, expected, `${JSON.stringify(message)} with ${files.join(', ')}\n${run.stderr}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a merge in progress skips all but the trailer rule', () => {
  const { repo, git, check } = tempRepo();
  try {
    mkdirSync(join(repo, 'frontend/src/pages'), { recursive: true });
    writeFileSync(join(repo, 'frontend/src/pages/A.tsx'), 'x\n');
    git('add', 'frontend/src/pages/A.tsx');
    writeFileSync(join(repo, '.git', 'MERGE_HEAD'), `${git('rev-parse', 'HEAD').toString().trim()}\n`);
    assert.equal(check('fix: resolve conflicts').status, 0);
    assert.equal(check('fix: resolve conflicts\n\nCo-Authored-By: Claude <x>').status, 1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('spec.md without Spec-approved prints a reminder only', () => {
  const { repo, git, check } = tempRepo();
  try {
    writeFileSync(join(repo, 'spec.md'), 'x\n');
    git('add', 'spec.md');
    let run = check('docs(spec): x');
    assert.equal(run.status, 0);
    assert.match(run.stderr, /reminder/);
    run = check('docs(spec): x\n\nSpec-approved: 2026-11-18');
    assert.equal(run.status, 0);
    assert.doesNotMatch(run.stderr, /reminder/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('guard-no-verify', () => {
  const cases = [
    // [expected exit, command]
    [2, 'git commit --no-verify -m "x"'],
    [2, 'git commit -n -m x'],
    [2, 'git commit -anm "wip"'],
    [2, 'git commit --no-veri -m x'],
    [2, 'git push --no-verif origin main'],
    [0, 'git commit --no-verbose -m x'],
    [2, 'git config unset core.hooksPath'],
    [2, 'cd repo && git commit -qn -F msg.txt'],
    [2, 'git status; git commit -n -m x'],
    [2, 'git push --no-verify origin main'],
    [2, 'git merge --no-verify theirs'],
    [2, 'git -c core.hooksPath=/dev/null commit -m x'],
    [2, 'git config core.hooksPath ""'],
    [2, 'git config --unset core.hooksPath'],
    [2, 'git.exe commit --no-verify'],
    [2, "git commit -q -F - <<'EOF'\nx\nEOF\ngit push --no-verify"],
    [2, "git commit --no-verify -m @'\nx\n'@"],
    [0, 'git commit -m "fix -n flag handling"'],
    [0, 'git commit -m "a; git commit -n && b"'],
    [0, 'git commit -m note'],
    [0, 'git commit -mnote'],
    [0, 'git commit -q -F - <<EOF\nfix: x\n\nTest: none - git commit -n in prose\nEOF'],
    [0, "git commit -m @'\nfix: x; git commit -n in prose\n'@"],
    [0, 'git commit -uno -m x'],
    [2, 'git commit -nuno -m x'],
    [0, 'git push -n origin main'],
    [0, 'git config core.hooksPath'],
    [0, 'git config --get core.hooksPath'],
    [0, 'git log --oneline -n 5 | cat'],
    [0, 'echo --no-verify'],
    [0, 'npm run test -- --no-verify'],
  ];
  for (const [expected, command] of cases) {
    const run = spawnSync(process.execPath, [guard], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
    assert.equal(run.status, expected, `${JSON.stringify(command)}\n${run.stderr}`);
  }
  for (const input of ['{}', 'not json']) {
    assert.equal(spawnSync(process.execPath, [guard], { input, encoding: 'utf8' }).status, 0, `fails open on ${input}`);
  }
});
