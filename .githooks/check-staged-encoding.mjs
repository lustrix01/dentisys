#!/usr/bin/env node
/**
 * check-staged-encoding.mjs — pre-commit guard.
 *
 * Blocks a commit when a staged text file is not plain UTF-8 without BOM.
 * Root cause it defends against: Windows PowerShell 5.1 writes UTF-8 with a BOM
 * (`Set-Content -Encoding utf8`), ANSI by default, and UTF-16 for `>` redirects.
 *
 * Reads the staged blobs from git's object store (not the working tree), so what
 * gets checked is exactly what gets committed. Child-process capture is done
 * through file descriptors rather than pipes so the guard also works under
 * restricted sandboxes.
 *
 * Exit 0 = clean, exit 1 = blocked with reasons printed to stderr.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, basename } from 'node:path';

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf',
  '.otf', '.eot', '.zip', '.gz', '.tgz', '.zstd', '.br', '.7z', '.rar', '.pdf',
  '.exe', '.dll', '.so', '.dylib', '.node', '.wasm', '.class', '.jar', '.asar',
  '.mp3', '.mp4', '.mov', '.avi', '.webm', '.wav', '.ogg', '.psd', '.sqlite',
  '.db', '.lockb', '.bin', '.dat', '.pack', '.idx', '.woff2', '.map',
]);
const NO_EXT_TEXT = new Set([
  '.env', '.gitignore', '.gitattributes', '.gitmodules', '.editorconfig',
  '.npmrc', '.nvmrc', '.prettierrc', '.eslintrc', '.dockerignore', '.babelrc',
  '.env.example', '.env.local', '.env.production', '.env.vps.example',
  'dockerfile', 'makefile', 'license', 'procfile', '.mcp.json',
]);

const BOMS = [
  { bytes: [0xef, 0xbb, 0xbf], name: 'UTF-8 BOM' },
  { bytes: [0x00, 0x00, 0xfe, 0xff], name: 'UTF-32 BE BOM' },
  { bytes: [0xff, 0xfe, 0x00, 0x00], name: 'UTF-32 LE BOM' },
  { bytes: [0xfe, 0xff], name: 'UTF-16 BE BOM' },
  { bytes: [0xff, 0xfe], name: 'UTF-16 LE BOM' },
];
const MOJIBAKE = /\u00E2\u20AC|\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\uFFFD/;

function isTextName(name) {
  const ext = extname(name).toLowerCase();
  if (SKIP_EXT.has(ext)) return false;
  if (NO_EXT_TEXT.has(basename(name).toLowerCase())) return true;
  if (basename(name) === 'Dockerfile') return true;
  return ext.length > 0;
}

const tmp = mkdtempSync(join(tmpdir(), 'enc-guard-'));
let tmpSeq = 0;

/** Run git with stdout captured through a temp file (no pipes). */
function gitBytes(args) {
  const out = join(tmp, `out-${++tmpSeq}.bin`);
  const fd = openSync(out, 'w');
  try {
    execFileSync('git', args, { stdio: ['ignore', fd, 'inherit'] });
  } finally {
    closeSync(fd);
  }
  try {
    return readFileSync(out);
  } finally {
    rmSync(out, { force: true });
  }
}

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const problems = [];
try {
  const names = gitBytes(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACM'])
    .toString('utf8')
    .split('\0')
    .filter((n) => n.length > 0 && isTextName(n));

  for (const name of names) {
    let buf;
    try {
      buf = gitBytes(['cat-file', 'blob', `:${name}`]);
    } catch (err) {
      problems.push({ name, reason: `cannot read staged blob (${err.message})` });
      continue;
    }
    if (buf.length === 0) continue;
    for (const bom of BOMS) {
      if (bom.bytes.every((b, i) => buf[i] === b)) {
        problems.push({ name, reason: bom.name });
        break;
      }
    }
    if (problems.some((p) => p.name === name)) continue;
    if (buf.subarray(0, 4096).includes(0)) {
      problems.push({ name, reason: 'NUL bytes — UTF-16 without BOM?' });
      continue;
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      problems.push({ name, reason: 'invalid UTF-8 byte sequence' });
      continue;
    }
    const m = text.match(MOJIBAKE);
    if (m) problems.push({ name, reason: `mojibake (${JSON.stringify(m[0])})` });
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (problems.length === 0) process.exit(0);

console.error('\nencoding-guard: commit blocked — staged text file(s) are not plain UTF-8:\n');
for (const p of problems) console.error(`  ${p.name}: ${p.reason}`);
console.error(`
Windows PowerShell 5.1 causes this:
  Set-Content / Out-File / Add-Content -Encoding utf8  -> writes UTF-8 BOM
  no -Encoding                                          -> writes ANSI (mojibake)
  > or *> redirection                                    -> writes UTF-16

Fix the file, then re-stage and commit:
  node ${join(process.cwd(), '.githooks', 'check-staged-encoding.mjs')}  (re-run after editing)
  Rewrite without BOM from Node:   fs.writeFileSync(path, text, 'utf8')
  Rewrite without BOM from PowerShell:
    [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
Bypass once only if you are certain: git commit --no-verify
`);
process.exit(1);
