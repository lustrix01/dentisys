# Phase 1 ERD Source Archive

This directory contains immutable, binary-preserved source artifacts for DentiSys Phase 1 planning. It is documentation evidence, not executable schema or migration input.

## Source authority order

1. `phase-1a-original-paper-erd.png` is the Owner-designated structural authority for Phase 1A.
2. `phase-1b-present-20-entity-erd.png` is the Owner-designated structural authority for Phase 1B.
3. `dentisys-capstone-paper.pdf` is the workflow, policy, and provenance source.
4. The Gatekeeper-verified paper extract is the planning-time workflow and policy input because Codex could not parse the PDF in the planning environment.

The standalone original ERD image is not claimed to be pixel-identical to the paper appendix. The present ERD image is the Owner-designated Phase 1B structural authority.

| Original local file | Repository file | Type | Size | Dimensions | Original modified time | SHA-256 | Authority |
|---|---|---|---:|---|---|---|---|
| `DentiSys_CANDL&.docx (12).pdf` | `dentisys-capstone-paper.pdf` | PDF | 2,908,351 bytes | N/A | 2026-06-27 19:38:44 | `EF13E4231DBFF68A1F7D9548A97643A5D48BF41ED7A10586ABE015F433199CA8` | Workflow, policy, and provenance source |
| `Original ERD.png` | `phase-1a-original-paper-erd.png` | PNG | 339,014 bytes | 1835×1048 | 2026-07-20 03:16:45 | `61D722E3F9ACA06AE4E654D44AA8CB39AA2E8D7E71473C2E12218BF3FCD47B0D` | Owner-designated Phase 1A structural authority |
| `CAPSTONE_ERD - jazerdedit.png` | `phase-1b-present-20-entity-erd.png` | PNG | 899,694 bytes | 6682×5403 | 2026-07-19 01:29:00 | `5AA60260E59AD3C81DF20C52060D2E69F1CA6820D5DF96BE960973998A3716D0` | Owner-designated Phase 1B structural authority |

## Archive rules

- Source binaries must not be edited in place, resized, converted, recompressed, or rewritten.
- A new source version requires a new filename, a new SHA-256 hash, and a controlled decision-record update.
- The archived binaries are evidence for the source-fidelity stages; they do not approve a final ERD or authorize SQL.
