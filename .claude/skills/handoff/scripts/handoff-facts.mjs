#!/usr/bin/env node
/**
 * handoff-facts.mjs - collects the parts of a session handoff that must not depend on memory.
 *
 * Usage (from the repo root): node .claude/skills/handoff/scripts/handoff-facts.mjs <marker> [slug]
 *  - <marker>: a unique string the caller put in this very command (e.g. HFMARK-7Q4X). The script finds
 *    the transcript that contains it, so it picks THIS session even when others are active.
 *  - [slug]: folder name under .claude/handoffs/ (default: the current date and time).
 *
 * Writes, under .claude/handoffs/<slug>/:
 *  - owner-messages.md: every message the Owner typed in this session, verbatim (long pastes cut at 4000 chars);
 *  - facts.md: branch, HEAD, uncommitted files, recent commits, recorded gate passes.
 * Prints a short summary, including the old session's CLI id (the transcript file name) for later lookup.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [marker = '', slugArg] = process.argv.slice(2);
const slug = slugArg || new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const cwd = process.cwd();
const projectDir = join(homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
const outDir = join(cwd, '.claude', 'handoffs', slug);

function tailHas(path, text) {
  const size = statSync(path).size;
  const span = Math.min(size, 3_000_000);
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(span);
    readSync(fd, buf, 0, span, size - span);
    return buf.toString('utf8').includes(text);
  } finally {
    closeSync(fd);
  }
}

function git(...args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return '(git command failed)'; }
}

if (!existsSync(projectDir)) {
  console.error(`No transcript folder at ${projectDir}`);
  process.exit(1);
}
const files = readdirSync(projectDir)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => ({ f, path: join(projectDir, f), t: statSync(join(projectDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

let chosen = marker ? files.slice(0, 12).find((x) => tailHas(x.path, marker)) : null;
let verified = Boolean(chosen);
if (!chosen) chosen = files[0];
if (!chosen) { console.error('No transcripts found.'); process.exit(1); }

const SKIP = /^(<system-reminder|<task-notification|<side-sessions-event|<command-|Another Claude session sent a message|Base directory for this skill|\[Request interrupted)/;
const messages = [];
const questionIds = new Set();
const cut = (t) => (t.length > 4000 ? `${t.slice(0, 4000)}\n[... cut, ${t.length} chars in the transcript]` : t);
for (const line of readFileSync(chosen.path, 'utf8').split('\n')) {
  if (!line) continue;
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (e.isSidechain || !e.message) continue;
  const c = e.message.content;
  if (e.type === 'assistant' && Array.isArray(c)) {
    for (const b of c) if (b?.type === 'tool_use' && b.name === 'AskUserQuestion') questionIds.add(b.id);
    continue;
  }
  if (e.type !== 'user') continue;
  // The Owner's typed text: keep every text block that is not injected by the app (a system reminder can sit in the same message).
  const blocks = typeof c === 'string' ? [c] : (c || []).filter((b) => b?.type === 'text').map((b) => b.text);
  const text = blocks.map((b) => b.trim()).filter((b) => b && !SKIP.test(b)).join('\n');
  if (text) messages.push({ at: e.timestamp, text: cut(text) });
  // The Owner's answers to AskUserQuestion arrive as tool results.
  if (Array.isArray(c)) {
    for (const b of c) {
      if (b?.type !== 'tool_result' || !questionIds.has(b.tool_use_id)) continue;
      const answer = typeof b.content === 'string' ? b.content : (b.content || []).map((x) => x.text || '').join('\n');
      if (answer.trim()) messages.push({ at: e.timestamp, text: cut(`[answer to a question card] ${answer.trim()}`) });
    }
  }
}

mkdirSync(outDir, { recursive: true });
const cliId = chosen.f.replace('.jsonl', '');
writeFileSync(join(outDir, 'owner-messages.md'),
  `# Owner messages, verbatim (old session ${cliId})\n\n` +
  messages.map((m, i) => `## ${i + 1} - ${m.at}\n\n${m.text}\n`).join('\n'));

const stampDir = join(cwd, '.git', 'dentisys-pass');
const stamps = existsSync(stampDir)
  ? readdirSync(stampDir).map((f) => `${f}: ${new Date(statSync(join(stampDir, f)).mtimeMs).toISOString()}`).join('\n')
  : '(none)';
writeFileSync(join(outDir, 'facts.md'),
  `# Facts at handoff (collected by script, not from memory)\n\n` +
  `- Branch: ${git('branch', '--show-current')}\n- HEAD: ${git('rev-parse', '--short', 'HEAD')}\n\n` +
  `## Uncommitted files\n\n\`\`\`\n${git('status', '--short') || '(clean)'}\n\`\`\`\n\n` +
  `## Diff size\n\n\`\`\`\n${git('diff', '--stat').split('\n').slice(-1)[0] || '(no tracked changes)'}\n\`\`\`\n\n` +
  `## Recent commits\n\n\`\`\`\n${git('log', '--oneline', '-5')}\n\`\`\`\n\n` +
  `## Recorded gate passes (.git/dentisys-pass)\n\n\`\`\`\n${stamps}\n\`\`\`\n`);

console.log(`Old session CLI id: ${cliId}${verified ? '' : '  WARNING: marker not found, picked the newest transcript; confirm it is this session'}`);
console.log(`Owner messages kept: ${messages.length}`);
console.log(`Written: ${outDir}`);
console.log(`Branch ${git('branch', '--show-current')} @ ${git('rev-parse', '--short', 'HEAD')}; uncommitted files: ${git('status', '--short').split('\n').filter(Boolean).length}`);
