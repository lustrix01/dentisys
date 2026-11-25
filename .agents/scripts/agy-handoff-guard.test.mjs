// Run: node --test .agents/scripts/agy-handoff-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from './agy-handoff-guard.mjs';

const ON = { DENTISYS_AGY_GUARD: '1' };
const cmd = (CommandLine, env = ON) => decide({ toolCall: { name: 'run_command', args: { CommandLine } } }, env).decision;
const tool = (name, args, env = ON) => decide({ toolCall: { name, args } }, env).decision;

test('off unless the env var is set or the workspace is an agy worktree', () => {
  assert.equal(cmd('git push', {}), 'allow');
  const worker = { workspacePaths: ['C:\\Users\\x\\.gemini\\antigravity-cli\\worktrees\\abc\\swarm-w1'], toolCall: { name: 'run_command', args: { CommandLine: 'git push' } } };
  assert.equal(decide(worker, {}).decision, 'deny');
});

test('allowed commands', () => {
  for (const c of [
    'npm ci --prefer-offline --no-audit --no-fund',
    'npx --no-install tsc -b',
    'node --experimental-strip-types --test src/tests/fieldNormalization.test.ts',
    'pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1',
    'git status --short', 'git diff --stat', 'git add frontend/src/a.ts', 'git merge --no-ff swarm-w1-1234',
    'git commit -m "fix: docker, .env and powershell are only words here"',
    'git restore --staged x.ts', 'git branch --list', 'git log --oneline -5', 'docker info',
    'Get-Content .env.example',
  ]) assert.equal(cmd(c), 'allow', c);
});

test('denied commands', () => {
  for (const c of [
    'git push', 'git push origin HEAD', 'git -C ../dentisys checkout lighthal9-responsive', 'git -c alias.x=push x',
    'git checkout lighthal9-responsive', 'git switch main', 'git branch -f lighthal9-responsive HEAD',
    'git branch -D old', 'git update-ref refs/heads/main HEAD', 'git reset --hard HEAD~1', 'git config user.name x',
    'git commit --no-verify -m x', 'git commit -n -m x', 'git worktree remove ../x', 'git fetch . a:b',
    'docker compose down -v', 'docker volume rm x', 'docker run -v C:\\:/x alpine',
    'powershell -Command Set-Content a.txt x', 'cmd /c del x', 'node -e "require(1)"',
    'curl https://example.com', 'ssh demo', 'pwsh -File scripts/promote-prod.ps1 -Sha x',
    'Get-Content .env', 'type C:\\Users\\x\\.dentisys\\demo.env', 'cat ~/.ssh/id_ed25519',
    'rm -rf node_modules', 'Remove-Item dist -Recurse -Force', 'npm test; git push',
  ]) assert.equal(cmd(c), 'deny', c);
});

test('file tools: protected writes and secret reads', () => {
  for (const p of ['.githooks/commit-msg', 'C:\\r\\.agents\\hooks.json', '.claude/settings.json', '.git/config', 'spec.md', 'AGENTS.md', 'CLAUDE.md', '.env'])
    assert.equal(tool('write_file', { Path: p, Content: 'x' }), 'deny', p);
  assert.equal(tool('edit_file', { Path: 'docs\\spec.md' }), 'deny');
  assert.equal(tool('write_file', { Path: 'frontend/src/pages/x.tsx' }), 'allow');
  assert.equal(tool('write_file', { Path: '.env.example' }), 'allow');
  assert.equal(tool('read_file', { Path: 'C:\\r\\.env' }), 'deny');
  assert.equal(tool('read_file', { Path: 'C:\\Users\\x\\.ssh\\id_ed25519' }), 'deny');
  assert.equal(tool('read_file', { Path: 'spec.md' }), 'allow');
});

test('workers: Neon medium/low via swarm only', () => {
  assert.equal(tool('swarm', { action: 'add', model: 'gemini-4-neon-low', name: 'a' }), 'allow');
  assert.equal(tool('swarm', { action: 'model', model: 'gemini-4-neon-medium', name: 'a' }), 'allow');
  assert.equal(tool('swarm', { action: 'add', model: 'gemini-4-neon-high', name: 'a' }), 'deny');
  assert.equal(tool('swarm', { action: 'add', name: 'a' }), 'deny');
  assert.equal(tool('swarm', { action: 'kill', name: 'a' }), 'allow');
  assert.equal(tool('invoke_subagent', { Model: 'inherit' }), 'deny');
});

test('fails closed on unreadable input (run as a hook)', () => {
  const script = fileURLToPath(new URL('./agy-handoff-guard.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script], { input: 'not json', env: { ...process.env, DENTISYS_AGY_GUARD: '1' } });
  assert.equal(JSON.parse(r.stdout.toString()).decision, 'deny');
  const ok = spawnSync(process.execPath, [script], { input: JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: 'git status' } } }), env: { ...process.env, DENTISYS_AGY_GUARD: '1' } });
  assert.equal(JSON.parse(ok.stdout.toString()).decision, 'allow');
});
