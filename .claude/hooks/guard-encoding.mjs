#!/usr/bin/env node
/**
 * guard-encoding.mjs — Claude Code PreToolUse hook (PS7-aware).
 *
 * This machine now has PowerShell 7 (`pwsh`, clean UTF-8 defaults) and Windows
 * PowerShell 5.1 (`powershell.exe`, writes UTF-8 BOM / ANSI / UTF-16LE).
 *
 * Rules:
 *  - Commands explicitly using pwsh 7 are allowed for `-Encoding utf8`, default
 *    encodings, and > redirection (all UTF-8 without BOM in PS 7).
 *  - Commands using powershell/powershell.exe (5.1), and the PowerShell tool when
 *    it does not name pwsh (host version not visible in the command), are checked
 *    against 5.1's broken encodings and blocked.
 *  - `-Encoding utf8BOM` and lossy ascii/unicode encodings are always blocked for
 *    text files; they produce BOM / lossy output in both versions.
 *
 * Exit 2 blocks the tool call; stderr is shown to the model with the safe
 * alternatives. Anything not matching is allowed, and the script fails open.
 */
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

let payload;
try { payload = JSON.parse(readStdin()); } catch { process.exit(0); }
const command = payload?.tool_input?.command;
if (typeof command !== 'string' || command.trim() === '') process.exit(0);

const invokesPowerShell =
  payload?.tool_name === 'PowerShell' || /\b(powershell|pwsh)(\.exe)?\b/i.test(command);
if (!invokesPowerShell) process.exit(0);

/** Is PowerShell 7 discoverable? (informational; policy below does not depend on it) */
function ps7Available() {
  const candidates = [];
  if (process.env.ProgramFiles) candidates.push(join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'));
  if (process.env.LOCALAPPDATA) candidates.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe'));
  for (const entry of (process.env.PATH ?? '').split(';')) {
    const trimmed = entry.trim().replace(/^"|"$/g, '');
    if (trimmed) candidates.push(join(trimmed, 'pwsh.exe'));
  }
  return candidates.some((c) => existsSync(c));
}

const stripQuotes = (s) =>
  s.replace(/"(?:[^"`]|`.)*"/g, '""').replace(/'(?:[^']|'')*'/g, "''");

// The command itself, plus any PowerShell code hidden inside -Command "..."/-c "...".
const views = [stripQuotes(command)];
for (const m of command.matchAll(/-command\s+("(?:[^"`]|`.)*"|'(?:[^']|'')*')/gi)) {
  views.push(stripQuotes(m[1].slice(1, -1)));
}
for (const m of command.matchAll(/(?:^|\s)-c\s+("(?:[^"`]|`.)*"|'(?:[^']|'')*')/g)) {
  views.push(stripQuotes(m[1].slice(1, -1)));
}

const TEXT_RE = /\.(json|jsonc|ya?ml|toml|env|ini|cfg|conf|lock|md|txt|csv|ps1|psm1|tsx?|jsx?|css|html?|php|py|sql|sh|gitignore)\b/i;
const TEMP_RE = /(\$env:TEMP|\$env:TMP|\$env:LOCALAPPDATA\\Temp|%TEMP%|%TMP%|\/tmp\/|\\Temp\\)/i;
const mentionsTemp = TEMP_RE.test(command);
const looksTextual = TEXT_RE.test(command) || views.some((v) => TEXT_RE.test(v));

// Which PowerShell is this? Only an explicit `pwsh` invocation is known-safe (7+).
// powershell/powershell.exe is always 5.1. The PowerShell tool's host is not
// visible in the command, so it is treated as 5.1 until it names pwsh.
const explicitPowerShell = /\bpowershell(\.exe)?\b/i.test(command);
const explicitPwsh = !explicitPowerShell && /\bpwsh(\.exe)?\b/i.test(command);
const assumed5_1 = explicitPowerShell || (!explicitPwsh && payload?.tool_name === 'PowerShell');

const reasons = [];
for (const view of views) {
  const writeCmdlet = /\b(Set-Content|Add-Content|Out-File)\b/i.test(view);
  const bomExplicit = /\b(Set-Content|Add-Content|Out-File)\b[^|;\r\n]*-Encoding\s+utf8BOM\b/i.test(view);
  const otherEncoding = /\b(Set-Content|Add-Content|Out-File)\b[^|;\r\n]*-Encoding\s+(ascii|default|oem|unicode|bigendianunicode|utf16|utf-16)\b/i.test(view);
  const hasEncoding = /-Encoding\b/i.test(view);

  // Always broken, even under PowerShell 7.
  if (bomExplicit) {
    reasons.push('Set-Content/Out-File/Add-Content -Encoding utf8BOM (writes a UTF-8 BOM)');
    continue;
  }
  if (otherEncoding && writeCmdlet && looksTextual && !mentionsTemp) {
    reasons.push('Set-Content/Out-File/Add-Content with ascii/default/oem/unicode on a text file (lossy or not UTF-8)');
    continue;
  }

  if (!assumed5_1) continue; // explicit pwsh 7: utf8/default/redirect are clean

  // Windows PowerShell 5.1 rules below.
  if (/\b(Set-Content|Add-Content|Out-File)\b[^|;\r\n]*-Encoding\s+utf8(\s|$)/i.test(view)) {
    reasons.push('Set-Content/Out-File/Add-Content -Encoding utf8 under Windows PowerShell 5.1 (writes a UTF-8 BOM)');
    continue;
  }
  if (writeCmdlet && !hasEncoding && looksTextual && !mentionsTemp) {
    reasons.push('Set-Content/Out-File/Add-Content without -Encoding under Windows PowerShell 5.1 (defaults to ANSI)');
    continue;
  }
  let realRedirect = false;
  for (const m of view.matchAll(/\*?>>?\s*([^\s|;&)<>"']+)/g)) {
    const target = m[1];
    if (/^(\$null|null|nul)$/i.test(target) || /^&\d+$/.test(target)) continue;
    realRedirect = true;
  }
  if (realRedirect && looksTextual && !mentionsTemp) {
    reasons.push('> / *> redirection into a text file under Windows PowerShell 5.1 (writes UTF-16LE)');
  }
}

if (reasons.length === 0) process.exit(0);

console.error(
  'encoding-guard: blocked on this machine, because Windows PowerShell 5.1 writes ' +
  'BOM / ANSI / UTF-16 text:\n  - ' + reasons.join('\n  - ') + '\n\n' +
  'PowerShell 7 is installed and is safe, but only when invoked as `pwsh`.\n' +
  'Use one of these instead:\n' +
  '  * preferred: the Write / Edit tool (writes UTF-8 without BOM)\n' +
  '  * pwsh 7:     pwsh -NoProfile -Command "Set-Content -Encoding utf8 ..."\n' +
  '  * PowerShell: [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))\n' +
  '  * Node:        fs.writeFileSync(path, text, "utf8")\n' +
  '  * to inspect, keep the pattern quoted and use Get-Content / Select-String'
);
process.exit(2);
