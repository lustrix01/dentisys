#!/usr/bin/env node
/**
 * check-commit-msg.mjs - a commit that stages frontend/src .tsx/.css files
 * (outside frontend/src/tests/) must carry a "Demo:" line in its message.
 * usage: node check-commit-msg.mjs <message-file>
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const msgFile = process.argv[2];
if (!msgFile) process.exit(0);

const lines = readFileSync(msgFile, 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('#'));
const first = (lines.find((l) => l.trim() !== '') ?? '');
if (/^(Merge |Revert "|fixup!|squash!)/.test(first)) process.exit(0);

const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean);
const ui = staged.filter((p) => /^frontend\/src\/.+\.(tsx|css)$/.test(p) && !p.startsWith('frontend/src/tests/'));
if (ui.length === 0) process.exit(0);

const ok = lines.some((l) => /^Demo: https:\/\/claude\.ai\/(code\/)?artifact\/\S+/.test(l) || /^Demo: none - \S+.*/.test(l));
if (ok) process.exit(0);

console.error(
  'commit-msg: this commit changes UI files but its message has no Demo line.\n' +
  'UI files staged:\n  - ' + ui.join('\n  - ') + '\n\n' +
  'Add one of these lines to the message:\n' +
  '  Demo: https://claude.ai/artifact/<id>\n' +
  '  Demo: none - <reason, for logic-only changes with nothing visible>\n\n' +
  "This repo's rule: any change the Owner can see is shown to them as a demo and approved before it is committed; " +
  'bypass only with git commit --no-verify and only with the Owner\'s OK.'
);
process.exit(1);
