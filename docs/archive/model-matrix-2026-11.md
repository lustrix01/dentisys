# Subagent model comparison, 2026-11-25 to 2026-11-26

Dated record (copied from the git-ignored `audit-output/model-matrix.md`). Decision: `ui-review` on Claude Sonnet 5.5 high (commit cb1079c), `responsive-check` stays on Claude Haiku 5.5 high, Gemini 4 Neon via `agy` not adopted. The rule for choosing a model is in `CLAUDE.local.md` "Lean agents"; the defects these runs found are in [review-findings.md](../review-findings.md).

## Subagent model matrix: faculty /reports, 2026-11-25

Same page, same screenshots, same brief for every run; capture time is excluded from all times.
Claude cost = API list prices from the transcript `usage` (Opus 5.5 $4/$20, cache read $0.20, write $5; Sonnet 5.5 $2/$10/$0.10/$2.50; Haiku 5.5 $0.10/$0.50/$0.01/$0.125 per M tokens).
Neon cost = tokens only: `agy` reports no price.

### ui-review (blind Opus judge, judge3/verdict.md; 9 verified High defects)

| Model, effort | Judge score | Highs found | Errors (false + partly + citations) | Time | Cost / tokens |
|---|---|---|---|---|---|
| Gemini 4 Neon high | **45** (1st) | **9/9** | 4 | 7.6 min | 236k tokens + 1.7M cache reads (32k thinking) |
| Claude Sonnet 5.5 high | 40 | 6/9 | 4 | 4.3 min | **$1.33** |
| Claude Opus 5.5 high | 39 | 6/9 | 3 | 7.1 min | $4.01 |
| Claude Opus 5.5 medium | 36 | 7/9 | 3 | 5.2 min | $3.38 |
| Gemini 4 Neon medium | 33 | 5/9 | 2 | 4.9 min | 213k tokens + 1.0M cache reads |
| Gemini 4 Neon low | 27 | 5/9 | 3 | 3.2 min | 163k tokens + 0.8M cache reads |
| Claude Sonnet 5.5 medium | 24 | 6/9 | 9 | 3.1 min | $1.07 |

No report passed the good-enough test against Neon high: each missed at least one High it found (two from reading the code: a 5.0 grade shows the green PASS pill, and load errors are never shown). Judge cost: $2.24.

### responsive-check (5 known defects in its reach: 9.33, 9.34, phone date wrap, Export PDF at 320, phone chart labels)

| Model, effort | Found | Required shots opened | Time | Cost / tokens |
|---|---|---|---|---|
| Gemini 4 Neon low | **5/5** | not stated | 2.2 min | 103k tokens + 326k cache reads |
| Gemini 4 Neon medium | 5/5 | not stated | 3.0 min | 163k tokens + 590k cache reads |
| Gemini 4 Neon high | 5/5 | not stated | 5.2 min | 203k tokens + 1.0M cache reads |
| Claude Haiku 5.5 high | 4/5 (no chart labels) | 26/26 | 3.0 min | $0.061 |
| Claude Haiku 5.5 medium | 4/5 (no chart labels) | 14/24 | 1.3 min | $0.029 |

### Limits
- One page, one judge run; an earlier judge pair disagreed on one citation, so close scores (40 vs 39) are ties.
- Neon in `agy` headless mode cannot run shell commands without allow rules (`--mode auto` is not on this account), so its capture and device audit were run separately by script.
- Neon's self-reported "42/42 shots opened" cannot be checked from `agy`'s output.

## Clean test: faculty /dashboard, 2026-11-26

Same capture (2 states per device, 8 shots), same brief, ui-review.md with the new code-only-states step; no shell, no earlier reports or notes. Blind Opus judge ranked quality first (judge/verdict.md, 5 verified Highs, 2 seen in shots); time and cost were added after the ranking. Pass test: loosened rule (a) against baseline Neon high.

### Quality ranking (blind)

| Rank | Model, effort | Total | Weighted true | Highs | False | Partly | Wrong citations | Enh. | Honesty | Pass vs Neon high |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Claude Sonnet 5.5 high | **36** | 37 | **5/5** | 0 | 9 | 1 | 4 | 5 | fail (c): 10 > 5 |
| 2 | Gemini 4 Neon high (baseline) | 27 | 23 | 4/5 | 0 | 4 | 0 | 4 | 4 | - |
| 3 | Claude Sonnet 5.5 medium | 25 | 31 | 4/5 | 1 | 8 | 2 | 3 | 3 | fail (c): 11 > 5 |
| 4 | Gemini 4 Neon medium | 20 | 14 | 3/5 | 0 | 0 | 0 | 4 | 2 | fail (a), (b) 61% |

Partly is mostly severity: Sonnet high rated 3 of its 5 Highs as Medium. Judge cost: $1.47.

### Time and cost (after ranking)

| Model, effort | Time | Cost / tokens |
|---|---|---|
| Claude Sonnet 5.5 high | 2.8 min | $0.49 (21k out, 483k cache read, 92k cache write) |
| Gemini 4 Neon high | 6.2 min | 208k tokens (37k out, 30k thinking) + 840k cache reads |
| Claude Sonnet 5.5 medium | 1.4 min | $0.34 (10k out, 352k cache read, 81k cache write) |
| Gemini 4 Neon medium | 3.2 min | 154k tokens (19k out, 14k thinking) + 453k cache reads |

### Both pages together (judge totals)

| Model, effort | /reports | /dashboard |
|---|---|---|
| Sonnet high | 40 (2nd of 7) | 36 (1st of 4) |
| Neon high | 45 (1st) | 27 (2nd) |
| Neon medium | 33 | 20 (4th) |
| Sonnet medium | 24 (7th) | 25 (3rd) |
