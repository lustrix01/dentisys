# Production changelog: 2026-11-24 (second release)

Promoted sha `87d4e08c54c0` (branch `lighthal9-responsive`). Previous production sha `1bb190c1f32d`.
Built by the Owner's Gemini swarm and merged after review: [swarm1124-merge-2026-11.md](swarm1124-merge-2026-11.md). Full backlog text: [backlog-built-2026-11-24-swarm1124.md](backlog-built-2026-11-24-swarm1124.md). No database migrations.

## Every role

- **9.27 Breadcrumb** (commit 78b33bb). In the desktop header, the page you are on is plain text, not a link to itself. Every crumb above it still links to its page; Home goes to the Dashboard.

## Faculty

- **9.31 Leaving Grade Computation** (commit 1b21689). After switching class in Grade Computation without editing anything, a sidebar link now leaves the page at once, and closing the tab no longer asks "Leave page?".
  - When a course became Lecture only, or gained Laboratory units, after its grade weights were saved, the adjusted weights open as the starting point. The green notice still asks Faculty to Save them; nothing is saved until they do.
  - Real unsaved edits still ask "Discard unsaved changes?" before leaving.

## Behind the scenes

- **9.21 Flaky tests** (commits f193cf8, 6fb61fe). Three automated tests that sometimes failed under load now wait for what the user sees. Tests only; no change on screen.
