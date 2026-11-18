#!/usr/bin/env node
/**
 * guard-no-verify.mjs - Claude Code PreToolUse hook for the Bash and PowerShell tools.
 *
 * Refuses commands that skip this repo's git hooks (.githooks/):
 *  - git commit with --no-verify or -n (also inside a short-flag cluster such as -an);
 *  - git push / merge / rebase / cherry-pick / revert / am with --no-verify (or a prefix git accepts, --no-veri);
 *  - git -c core.hooksPath=... (a one-off hooks path);
 *  - git config that sets or unsets core.hooksPath.
 * The Owner can still run these in their own terminal. Exit 2 blocks the call; the
 * script fails open on any error so a parser bug never blocks unrelated work.
 */
import { readFileSync } from 'node:fs';

function tokenize(segment) {
  const tokens = [];
  let cur = '', quote = null, started = false;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null; else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch; started = true;
    } else if (/\s/.test(ch)) {
      if (started || cur) tokens.push(cur);
      cur = ''; started = false;
    } else {
      cur += ch; started = true;
    }
  }
  if (started || cur) tokens.push(cur);
  return tokens;
}

const COMMIT_ARG_FLAGS = 'mFcCt'; // short commit options that take a value
const COMMIT_OPTIONAL_ARG_FLAGS = 'u'; // -u takes an optional value attached to it (-uno)
const NO_VERIFY_SUBCOMMANDS = new Set(['commit', 'push', 'merge', 'rebase', 'cherry-pick', 'revert', 'am']);

function check(tokens) {
  for (let g = 0; g < tokens.length; g++) {
    if (!/(^|[\\/])git(\.exe)?$/i.test(tokens[g])) continue;
    let i = g + 1;
    // global options before the subcommand
    while (i < tokens.length && tokens[i].startsWith('-')) {
      const t = tokens[i];
      if (t === '-c') {
        if (/^core\.hookspath=/i.test(tokens[i + 1] ?? '')) return 'a one-off core.hooksPath';
        i += 2; continue;
      }
      if (/^-c/.test(t) && /^-ccore\.hookspath=/i.test(t)) return 'a one-off core.hooksPath';
      if (t === '-C' || t === '--git-dir' || t === '--work-tree' || t === '--namespace') { i += 2; continue; }
      i += 1;
    }
    const sub = tokens[i];
    const rest = tokens.slice(i + 1);
    if (sub === 'config') {
      const k = rest.findIndex((t) => /^core\.hookspath$/i.test(t));
      // --unset/--unset-all, or the newer `git config unset`, or any value after the key
      if (k >= 0 && (rest.some((t) => /^(--)?unset(-all)?$/.test(t)) || rest.length > k + 1)) return 'a change to core.hooksPath';
      continue;
    }
    if (!NO_VERIFY_SUBCOMMANDS.has(sub)) continue;
    // git accepts unambiguous prefixes: --no-veri, --no-verif (--no-ver is ambiguous with --no-verbose)
    if (rest.some((t) => /^--no-veri(f(y)?)?$/.test(t))) return `git ${sub} --no-verify`;
    if (sub !== 'commit') continue;
    for (let j = 0; j < rest.length; j++) {
      const t = rest[j];
      if (t === '--') break;
      if (!/^-[A-Za-z]+$/.test(t)) continue;
      for (const ch of t.slice(1)) {
        if (ch === 'n') return 'git commit -n (--no-verify)';
        if (COMMIT_ARG_FLAGS.includes(ch)) { if (t.length === 2) j += 1; break; }
        if (COMMIT_OPTIONAL_ARG_FLAGS.includes(ch)) break;
      }
    }
  }
  return null;
}

// Heredoc and PowerShell here-string bodies are data (often a commit message), not commands.
function stripBodies(command) {
  const lines = command.split('\n');
  const out = [];
  let end = null;
  for (const line of lines) {
    if (end !== null) {
      if (end.test(line)) end = null;
      continue;
    }
    out.push(line);
    const here = line.match(/<<-?\s*['"]?([A-Za-z_][\w]*)['"]?/);
    if (here) end = new RegExp(`^\\s*${here[1]}\\s*$`);
    else if (/@['"]\s*$/.test(line)) end = /^['"]@/;
  }
  return out.join('\n');
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = stripBodies(String(input?.tool_input?.command ?? ''));
  // split into simple commands at ; | & and newlines outside quotes
  const segments = [];
  let cur = '', quote = null;
  for (const ch of command) {
    if (quote) { if (ch === quote) quote = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (';|&\n'.includes(ch)) { segments.push(cur); cur = ''; continue; }
    cur += ch;
  }
  segments.push(cur);
  for (const segment of segments) {
    const hit = check(tokenize(segment));
    if (hit) {
      console.error(`Refused: ${hit} skips this repo's git hooks (.githooks/: encoding, Demo line, fix/feat rules, no AI trailers). ` +
        'Fix what the hook reports instead. Only the Owner may bypass a hook, from their own terminal.');
      process.exit(2);
    }
  }
} catch {
  // fail open
}
process.exit(0);
