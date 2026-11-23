# Roadmap

What's next, in order (Owner, 2026-11-20). Each item is one feature or fix: agree the contract, implement, run the gates, then start the next. Details and status are in the [product backlog](PRODUCT_BACKLOG.md); behaviour is defined by [spec.md](../spec.md); what already works is in [features.md](features.md).

Two people work at once, in two lanes that never edit the same screen or backend file at the same time. Each lane goes in order.

## Owner lane (system changes)

1. Wrong recovery code returns a server error (9.23): on production (2026-11-21).
2. Remember this device (9.24): on production (2026-11-21).
3. Remember me (9.26): on production (2026-11-21).
4. Superadmin sign-in page (12.8): on production (2026-11-21).
5. Grade submission and Dean approval (13.8): on production (2026-11-21).
6. Attendance review (13.6, review part, Past Sessions tab): on production (2026-11-21). Moving past sessions to their own page is 13.11, not yet scheduled.
7. Emergency branch (9.29, 9.30, 12.9, 12.10, 12.12, 12.13): on production (2026-11-23).
8. User reports 14.1 to 14.10 (polish branch): on production (2026-11-24).
9. Face enrolment and check-in speed (13.4), after the Owner's real-phone timing session.
10. UI formality pass (12.6), after both lanes are done.

## Colleague lane (screens only, no new system rules)

How to work, files, tests and "done when" per item: [colleague plan](archive/colleague-plan-2026-11.md).

1. Secretary change-request reason minimum (9.25): Secretary part on production (2026-11-21); the other reason fields on production (2026-11-23).
2. Retention Monitoring grades first and batch send (13.5): on production (2026-11-21).
3. Start session hint (13.6, hint part only): on production (2026-11-21).
4. Layout batch (9.22 with 13.3's 320 px column), after 13.5 because both touch Retention Monitoring: on production (2026-11-21).
5. Confirmation pop-ups (13.7): on production (2026-11-21).
6. Flaky Email Management test (9.21).

## Rules between the lanes

- Database migration numbers are reserved: `069` for 9.24, `070` for 9.26, `071` for 13.8.
- The colleague works on `owhie-responsive`, first brought up to `lighthal9-responsive`, one commit set per item, while the Owner is away; the Owner merges the branch in one go afterwards (`colleague-merge` skill) and reviews the screenshots then.
- Small shared files (`App.tsx` routes, `apiClient.ts`, types, the sidebar list, `e2e/fixtures.ts`, `spec.md`) may be touched by both; each lane adds its own lines.
- Only the Owner edits `docs/PRODUCT_BACKLOG.md` and this file, except the status updates Claude makes at each push and promote ([release guide](release-guide.md) step 2); the colleague reports progress.
- Every visible change is approved by the Owner (a demo in the Owner's lane, screenshots at merge for the colleague's), and every spec change needs the Owner's OK.

Owner actions, any time: production `devops` password (9.19), real-phone check on production (9.20), paper wording (13.10).
