# Roadmap

What's next, in order (Owner, 2026-11-20). Each item is one feature or fix: agree the contract, implement, run the gates, then start the next. Details and status are in the [product backlog](PRODUCT_BACKLOG.md); behaviour is defined by [spec.md](../spec.md); what already works is in [features.md](features.md).

Two people work at once, in two lanes that never edit the same screen or backend file at the same time. Each lane goes in order.

## Owner lane (system changes)

1. Wrong recovery code returns a server error (9.23).
2. Remember this device (9.24).
3. Remember me (9.26).
4. Superadmin sign-in page (12.8).
5. Grade submission and Dean approval (13.8). Starts after the colleague's 13.5 and 13.6 are merged, since it changes the same Retention and Attendance screens.
6. Face enrolment and check-in speed (13.4), after the Owner's real-phone timing session.
7. UI formality pass (12.6), after both lanes are done.

## Colleague lane (screens only, no new system rules)

1. Secretary change-request reason minimum (9.25).
2. Retention Monitoring grades first and batch send (13.5).
3. Attendance review and the Start session hint (13.6). If it needs more than one new read-only data request, it goes back to the Owner.
4. Layout batch (9.22 with 13.3's 320 px column), after 13.5 because both touch Retention Monitoring.
5. Confirmation pop-ups (13.7).
6. Flaky Email Management test (9.21).

## Rules between the lanes

- Database migration numbers are reserved: `069` for 9.24, `070` for 9.26, `071` for 13.8.
- The colleague works on their own branch from `lighthal9-responsive`; the Owner merges it after each item (`colleague-merge` skill), not at the end.
- Small shared files (`App.tsx` routes, `apiClient.ts`, types, the sidebar list, `e2e/fixtures.ts`, `spec.md`) may be touched by both; each lane adds its own lines.
- Only the Owner edits `docs/PRODUCT_BACKLOG.md` and this file; the colleague reports progress.
- Every visible change goes through a demo the Owner approves, and every spec change needs the Owner's OK.

Owner actions, any time: production `devops` password (9.19), real-phone check on production (9.20), paper wording (13.10).
