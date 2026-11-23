#!/usr/bin/env node
/**
 * context-nudge.mjs - Claude Code UserPromptSubmit hook.
 *
 * Every turn re-reads the whole conversation, so a long session costs more per step.
 * This hook measures how far the context has grown above where the session started
 * (the start already holds ~80k of tools and instructions, so an absolute number would
 * fire too early) and, twice per session, adds a short note asking Claude to SUGGEST a
 * fresh session at the next natural boundary. It never blocks or forces anything: the
 * Owner can decline and keep working in the same session.
 *
 * Thresholds (growth above the first call): 120k, then 200k. Override with
 * CONTEXT_NUDGE_K1 / CONTEXT_NUDGE_K2 (thousands of tokens). Fails open on any error.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const K1 = Number(process.env.CONTEXT_NUDGE_K1) || 120;
const K2 = Number(process.env.CONTEXT_NUDGE_K2) || 200;

function readChunk(path, start, length) {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(length);
    const n = readSync(fd, buf, 0, length, start);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function contextOf(entry) {
  if (entry.type !== 'assistant' || entry.isSidechain || !entry.message?.usage) return null;
  const u = entry.message.usage;
  const total = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  return total > 0 ? total : null;
}

function firstContext(path) {
  const head = readChunk(path, 0, 2_000_000).split('\n');
  for (const line of head) {
    if (!line.includes('"assistant"')) continue;
    try { const c = contextOf(JSON.parse(line)); if (c) return c; } catch { /* partial line */ }
  }
  return null;
}

function lastContext(path, size) {
  const span = Math.min(size, 800_000);
  const lines = readChunk(path, size - span, span).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"assistant"')) continue;
    try { const c = contextOf(JSON.parse(lines[i])); if (c) return c; } catch { /* partial line */ }
  }
  return null;
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const path = input.transcript_path;
  if (!path || !existsSync(path)) process.exit(0);
  const size = statSync(path).size;
  const first = firstContext(path);
  const last = lastContext(path, size);
  if (!first || !last) process.exit(0);

  const grown = Math.round((last - first) / 1000);
  const level = grown >= K2 ? 2 : grown >= K1 ? 1 : 0;
  if (level === 0) process.exit(0);

  const dir = join(tmpdir(), 'claude-context-nudge');
  mkdirSync(dir, { recursive: true });
  const stateFile = join(dir, `${String(input.session_id || 'unknown').replace(/[^\w-]/g, '')}.json`);
  let warned = 0;
  try { warned = JSON.parse(readFileSync(stateFile, 'utf8')).level || 0; } catch { /* first time */ }
  if (level <= warned) process.exit(0);
  writeFileSync(stateFile, JSON.stringify({ level }));

  const now = Math.round(last / 1000);
  const text = level === 1
    ? `Context check (optional, from a hook): this session is at about ${now}k tokens, ${grown}k above where it started. Every step re-reads all of it. Do not stop what you are doing. When the current step is finished and a natural boundary is close (contract approved, backend built, demo approved, before a release), end your reply with ONE short line suggesting a fresh session with the \`handoff\` skill, and say what a handoff might lose. If the Owner declines, keep working here and do not suggest it again.`
    : `Context check (optional, from a hook): this session is now about ${now}k tokens, ${grown}k above where it started, and each step pays to re-read it. Suggest a fresh session with a handoff at the next natural boundary, with one line on what it might lose. The Owner decides; if they decline, keep working here and do not raise it again.`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }));
} catch {
  process.exit(0);
}
