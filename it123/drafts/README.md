# Hand-written first versions (2026-11-23)

These are the group's original hand-written versions of the toolkit, kept here as the
starting point for the timeline. The versions we actually submitted (`../scripts/`,
`../man/`, `../files/`) came later: they were drafted from these files with Claude Code,
then reviewed line by line and partly rewritten by the group. `../../README.md` section 7
(AI Use Disclosure) describes that process.

What is in here is honest work in progress:

- **Rough by design.** Short comments, blunt error messages (`die "cant find $bundle"`),
  TODOs where we were unsure (`# TODO: check that it actually answers 503`).
- **Missing the safety pieces that came later.** No `SHA256SUMS` check on install or update,
  no database migrations, no lock file, no log files, no restore commands for a failed update.
  Everything exits `1`; the separated exit codes (`2` root, `3` missing command, `4` lock,
  `5` wrong state, `6` status unhealthy, `7` failed update check) came later.
- **Fewer options.** No `--dean-email`, `--watch`, `--count`, `--save`, `--broken`,
  `--assets` or `--output`.
- **Simpler behaviour.** `dentisys-update.sh` does `compose down` then `up`, so there is
  downtime; `dentisys-service.sh` was smarter about starting one container at a time.
  The maintenance page is a static HTML file with no message or return time.
- **Not in the submission archive.** The archive holds only the reviewed versions.

Files: the eight scripts (`dentisys-bundle.sh`, `-install`, `-service`, `-status`,
`-pause`, `-maintenance`, `-update`, `dentisys-lib.sh`), the maintenance page
(`maintenance.conf`, `index.html`), the manual page (`dentisys-toolkit.8`) and
`NOTES.txt`, our working notes from that session.
