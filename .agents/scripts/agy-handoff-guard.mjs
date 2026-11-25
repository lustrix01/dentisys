// PreToolUse guard for Neon runs started by Claude (docs/archive/agy-swarm-handoff-plan-2026-11.md).
// Active when DENTISYS_AGY_GUARD=1 or when the workspace is an agy CLI worktree (a swarm worker).
// Second layer only: agy's own allow rules (.agents/agy-settings.json) decide what may run at all.
// Fail-closed: unreadable input or any error is a deny.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKER_MODELS = new Set(['gemini-4-neon-medium', 'gemini-4-neon-low']);

const COMMAND_DENY = [
  [/\bgit\b[^\n]*\s(-C|--git-dir|--work-tree|-c)\b/i, 'git with -C/--git-dir/--work-tree/-c'],
  [/\bgit\s+(push|config|remote|update-ref|symbolic-ref|filter-branch|filter-repo|checkout|switch|clean|fetch|pull|rebase|gc|prune)\b/i, 'this git command'],
  [/\bgit\s+branch\b[^\n]*\s(-f|-D|-M|--force|--delete|-d|-m)\b/i, 'git branch -f/-d/-D/-m'],
  [/\bgit\s+reset\b[^\n]*--hard\b/i, 'git reset --hard'],
  [/\bgit\s+worktree\s+(remove|prune|move)\b/i, 'git worktree remove/prune/move'],
  [/--no-verify\b|\bgit\s+commit\b[^\n]*\s-n\b|core\.hooksPath/i, 'skipping git hooks'],
  [/\bdocker\b(?!\s+(info|ps)\b)/i, 'docker outside the check scripts'],
  [/(^|[\s;&|(])(powershell|powershell\.exe|cmd|cmd\.exe)(\s|$)/i, 'Windows PowerShell 5.1 / cmd'],
  [/\bnode\s+(-e|--eval|-p|--print)\b/i, 'node -e'],
  [/\b(curl|curl\.exe|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|ssh|scp|sftp)\b/i, 'network or remote-shell tools'],
  [/promote-prod|publish-images|demo\.env|deploy-demo/i, 'release scripts'],
  [/(^|[\\/\s'"])\.env\b(?!\.example)|[\\/]\.dentisys\b|[\\/]\.ssh\b|\bid_(rsa|ed25519)\b/i, 'secrets (.env, ~/.dentisys, ~/.ssh)'],
  [/\brm\s+-[a-z]*r|\bRemove-Item\b[^\n]*-Recurse|\brmdir\s+\/s\b|\brd\s+\/s\b/i, 'recursive delete'],
];

const WRITE_PROTECTED = /(^|[\\/])(\.agents|\.githooks|\.claude|\.git)([\\/]|$)|(^|[\\/])(spec\.md|AGENTS\.md|CLAUDE(\.local)?\.md|GEMINI\.md)$|(^|[\\/])\.env(?!\.example)[^\\/]*$/i;
const READ_PROTECTED = /(^|[\\/])\.env(?!\.example)[^\\/]*$|[\\/]\.dentisys([\\/]|$)|[\\/]\.ssh([\\/]|$)/i;
const PATH_KEYS = /^(path|targetfile|absolutepath|file|filepath|directorypath|searchpath)$/i;

export function decide(input, env = process.env) {
  const ws = (input.workspacePaths ?? []).concat(input.cwd ?? []).map((p) => String(p).replace(/\\/g, '/'));
  const active = env.DENTISYS_AGY_GUARD === '1' || ws.some((p) => /\/antigravity-cli\/worktrees\//i.test(p));
  if (!active) return { decision: 'allow' };

  const tool = String(input.toolCall?.name ?? '');
  const args = input.toolCall?.args ?? {};
  const deny = (why) => ({ decision: 'deny', reason: `guard: ${why} is not allowed in a Claude hand-off run (.agents/rules/dentisys-neon.md "Boundaries").` });

  if (tool === 'invoke_subagent') return deny('invoke_subagent (start workers with /swarm and a Neon medium/low model id)');
  if (tool === 'swarm' && ['add', 'model'].includes(String(args.action))) {
    return WORKER_MODELS.has(String(args.model)) ? { decision: 'allow' } : deny(`worker model "${args.model}" (only gemini-4-neon-medium or gemini-4-neon-low)`);
  }
  if (tool === 'run_command') {
    // Commit message text is prose, not a command: drop it before matching.
    const cmd = String(args.CommandLine ?? '').replace(/(\s(-m|--message)\s*)("([^"\\]|\\.)*"|'[^']*')/g, '$1""');
    for (const [re, why] of COMMAND_DENY) if (re.test(cmd)) return deny(why);
    return { decision: 'allow' };
  }
  const paths = Object.entries(args).filter(([k, v]) => PATH_KEYS.test(k) && typeof v === 'string').map(([, v]) => v);
  if (/write|edit|replace|sed|notebook|delete|move|rename|create/i.test(tool)) {
    const hit = paths.find((p) => WRITE_PROTECTED.test(p));
    if (hit) return deny(`writing ${hit}`);
  } else if (/read|view|grep|find|list|search/i.test(tool)) {
    const hit = paths.find((p) => READ_PROTECTED.test(p));
    if (hit) return deny(`reading ${hit}`);
  }
  return { decision: 'allow' };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  let out;
  try { out = decide(JSON.parse(readFileSync(0, 'utf8'))); } catch (e) { out = { decision: 'deny', reason: `guard: failed closed (${e.message})` }; }
  process.stdout.write(JSON.stringify(out));
}
