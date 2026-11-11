# Project instructions

## Encoding safety (Windows)

This machine has **PowerShell 7** (`pwsh`, 7.6.9) and **Windows PowerShell 5.1**
(`powershell.exe`). They behave differently; use the right one:

- `pwsh` 7 is safe: `Set-Content`/`Out-File -Encoding utf8`, default encodings and
  `>` redirection all write UTF-8 **without BOM**.
- `powershell` / `powershell.exe` (5.1) is unsafe for file writes: `-Encoding utf8`
  adds a UTF-8 BOM, no `-Encoding` means ANSI (mojibake for `ñ`, `é`, `—`, `·`), and
  `>` / `*>` writes UTF-16LE.
- Do not invoke `powershell.exe` for writes. Use `pwsh`, the `Write`/`Edit` tools
  (UTF-8 no BOM), or `.NET`/Node:
  - `[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))`
  - `fs.writeFileSync(path, text, 'utf8')`
- Never `-Encoding utf8BOM`. Never write project text files through a 5.1 `>` redirect.

Existing BOMs are committed in this repo (source files and `.env`); do not add more.
`.env`/JSON/YAML are highest risk because parsers may not strip a BOM.

Guards: a `pre-commit` hook in `.githooks/` blocks commits that introduce BOM /
UTF-16 / mojibake / invalid UTF-8 text, and a `PreToolUse` hook in
`.claude/settings.json` refuses the 5.1 write commands above before they run.
After editing config files, `node .githooks/check-staged-encoding.mjs` verifies the
staged content (run `git add` first).
