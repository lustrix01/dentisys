#!/usr/bin/env node
/**
 * check-commit-msg.mjs - commit message rules (CLAUDE.md "Kinds of work" and "Git").
 *  - No AI trailers (Co-Authored-By: Claude, Claude-Session:, "Generated with Claude Code"); every commit.
 *  - Merge, revert, fixup and squash commits skip the rules below.
 *  - fix: stages a test file, or carries "Test: none - <reason>".
 *  - feat: names its backlog id in the subject, e.g. "(13.3)", "(backlog 12.3, 12.4)" or a spec id "(GRA-03)", or carries "Contract: <link or id>".
 *  - Staged frontend/src .tsx/.css files (outside frontend/src/tests/) need a "Demo:" line.
 *  - Staged spec.md without a "Spec-approved: <date>" line prints a reminder (does not block).
 * usage: node check-commit-msg.mjs <message-file>
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const msgFile = process.argv[2];
if (!msgFile) process.exit(0);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lines = readFileSync(msgFile, 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('#'));
const first = (lines.find((l) => l.trim() !== '') ?? '');
const has = (re) => lines.some((l) => re.test(l));
const errors = [];

if (has(/^co-authored-by:.*claude/i) || has(/^claude-session:/i) || has(/generated with \[?claude code/i)) {
  errors.push('It carries an AI trailer (Co-Authored-By: Claude, Claude-Session: or "Generated with Claude Code"). ' +
    'Commits are authored as the Owner and carry none: remove the line.');
}

const merging = existsSync(git('rev-parse', '--git-path', 'MERGE_HEAD'));
const exempt = merging || /^(Merge |merge:|Revert "|fixup!|squash!)/.test(first);

if (!exempt) {
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split(/\r?\n/).filter(Boolean);

  if (/^fix(\([^)]*\))?!?:/.test(first)) {
    const tests = staged.filter((p) => /(^|\/)(tests?|e2e)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p));
    if (tests.length === 0 && !has(/^Test: none - \S/)) {
      errors.push('It is a fix: but stages no test file. A bug is fixed when a test proves it (CLAUDE.md "Fixing bugs"): ' +
        'stage the reproducing test, or add a line\n  Test: none - <reason, e.g. wording only / CSS only / deploy config>');
    }
  }

  if (/^feat(\([^)]*\))?!?:/.test(first) && !/\((backlog\s+)?\d+\.\d+[^)]*\)|\([A-Z]{2,5}-\d+[^)]*\)/i.test(first) && !has(/^Contract: \S/)) {
    errors.push('It is a feat: without a backlog id. Name it in the subject, e.g. "(13.3)" or "(GRA-03)", or add a line\n' +
      '  Contract: <link or where the agreed contract is>');
  }

  const ui = staged.filter((p) => /^frontend\/src\/.+\.(tsx|css)$/.test(p) && !p.startsWith('frontend/src/tests/'));
  if (ui.length > 0 && !has(/^Demo: https:\/\/claude\.ai\/(code\/)?artifact\/\S+/) && !has(/^Demo: none - \S+.*/)) {
    errors.push('It changes UI files but has no Demo line. UI files staged:\n  - ' + ui.join('\n  - ') + '\n' +
      'Add one of these lines:\n  Demo: https://claude.ai/artifact/<id>\n' +
      '  Demo: none - <reason, for logic-only changes with nothing visible>\n' +
      'Any change the Owner can see is shown to them as a demo and approved before it is committed.');
  }

  if (staged.includes('spec.md') && !has(/^Spec-approved: \S/)) {
    console.error('commit-msg reminder: spec.md changes only with the Owner\'s explicit approval. ' +
      'Add "Spec-approved: <date the Owner approved>" to record it.');
  }
}

if (errors.length === 0) process.exit(0);
console.error('commit-msg: refused.\n\n- ' + errors.join('\n\n- ') +
  '\n\nBypass only with git commit --no-verify and only with the Owner\'s OK.');
process.exit(1);
