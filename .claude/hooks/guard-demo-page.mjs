#!/usr/bin/env node
/**
 * guard-demo-page.mjs - Claude Code PreToolUse hook for the Artifact tool.
 *
 * A page publish (.html, not an asset upload) must carry
 *   <meta name="dentisys-demo" content="look|behaviour|not-a-ui-demo">
 * so a hand-written look demo cannot reach the Owner. build-demo.py writes
 * content="look". Exit 2 blocks the call; the script fails open on any error.
 */
import { readFileSync } from 'node:fs';

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

let payload;
try { payload = JSON.parse(readStdin()); } catch { process.exit(0); }
const input = payload?.tool_input;
if (!input || typeof input !== 'object') process.exit(0);

const action = input.action;
if (action !== undefined && action !== 'publish') process.exit(0);
if (input.asset === true) process.exit(0);
const filePath = input.file_path;
if (typeof filePath !== 'string' || !/\.html$/i.test(filePath)) process.exit(0);

let html;
try { html = readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

const marker = /<meta\s+name=["']dentisys-demo["']\s+content=["'](look|behaviour|not-a-ui-demo)["']\s*\/?>/i;
if (marker.test(html)) process.exit(0);

console.error(
  'Refused: this page has no dentisys-demo marker. Look demos (any visible change) are built only by ' +
  '.claude/skills/ui-fix-demo/scripts/build-demo.py, after the design-review agent passes the shots. ' +
  'Behaviour demos (flows, dialogs, saving) follow "Behaviour demo" in .claude/skills/feature/SKILL.md and carry ' +
  '<meta name="dentisys-demo" content="behaviour">. A page that is not a UI demo at all carries ' +
  'content="not-a-ui-demo".'
);
process.exit(2);
