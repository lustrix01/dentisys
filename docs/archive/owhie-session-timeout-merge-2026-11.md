# Owhie's session-timeout and Phone-views merge, November 2026

Merge of `origin/owhie-responsive` (`d6aace9`, 3 commits) into our line (approved merge `086cc51`), landed on `lighthal9-responsive` together with the encoding-hardening commits.

The Owner approved the merge on 2026-11-11 with these rulings: land on `lighthal9-responsive`; take the new card look and icon-only action buttons and update the affected tests; hide the three Dean preview pages and their sidebar entries until a backend exists, and reword the Dean-powers spec line to say they are previews; restore the Secretary hide-while-live Start session rule; fix the defects the review found. The three-way review compared our branch (`086cc51`), her branch (`d6aace9`) and the merged tree.

## Taken as-is

- The new card layouts for Academic Terms, Rooms, Faculty Invitations rows and the Audit Trail details button (icon-only actions with per-element screen-reader labels).
- The shared `Tabs` component in the Secretary session dialog, the new "Schedule session" action and the new empty state.
- Student dashboard (640–767 px now cards), Student retention and prototype attendance-log phone cards; the iOS text-size and momentum-scroll fixes.
- The 30-minute idle session timeout: server side in the shared token verifier and refresh flow (session + refresh tokens revoked on idle-expired refresh, audit row), client side activity tracking across tabs, heartbeat, idle sign-out and a single access-token retry while active. The 7-day absolute lifetime, refresh-reuse detection and the existing schema are unchanged.
- All 635 tracked text files are plain UTF-8 without BOM; `npm run test:e2e` runs under pwsh 7.

## Changed or replaced

| Item | Their change | Merge |
|---|---|---|
| Dean management pages | `People & Accounts`, `Classes`, `Course Catalog` previews wired into the real sidebar, hardcoded sample data, no backend. | Kept visible as delivered (Owner ruling): the Dean UI deliverable, clearly labelled preview data; sidebar entries and routes kept so the Dean can review it; the functional owner still has to wire data, routes and permissions. Spec paragraph reworded to say they are previews, not implemented. |
| Dean-powers spec line | Claimed "Owner-approved amendment (2026-11-10)" for real Dean class management. | Reworded (Owner-approved) to a preview note; the rest of CLS-003 is unchanged. |
| Idle-timeout audit row | Idle expiry written as an ordinary sign-out. | Idle reason kept distinct where the audit contract allows it. |
| Refresh rate limiter | Per-session refresh rate limit moved after several checks. | Restored to its previous position (before the user-status checks). |
| Secretary Start session | Button shown while a session is live. | Hidden again while live (the backend refuses a second live session for the same class); the new dialog action and empty state stay. |
| Course Catalog | Clinical checkbox removed while the Clinical column stayed. | Checkbox restored and bound to `isClinical`. |
| Prototype attendance cards | Missing time/room/verification filled with invented values. | Real value or an em dash; verification method comes from the record. |
| Rooms list switch and toolbar | Rooms/Retired switch moved out of the flat toolbar; category hint dropped. | Switch and actions share one flat `ListToolbar` row again; category hint restored in the new card layout. |
| Rooms and Academic Terms rules text | Page descriptions removed with the title cards. | Restored as compact paragraphs in the new flat header. |
| Idle-timeout client 401 handling | A blanket 401 auto-refresh could sign a user out on a wrong authenticator code; "clear on rejected session" partial. | Authentication endpoints never trigger refresh/sign-out; a dead session clears immediately. |
| Tests | Icon-only labels and hidden phone cards broke 8 mocked tests; live suite 2 locators. | Locators updated to the new accessible names/roles/visible filtering; no assertion deleted. |
| Idle-timeout coverage | None. | New `tests/backend/auth_idle_timeout_test.php` exercises the pure idle-window helper (boundary, null last-seen, absolute lifetime untouched). |

## Owner rulings

- Keep the colleague's functional changes; fix what breaks behaviour or information.
- The card look and icon-only action buttons are the new standard for these pages; existing pages keep their labels until changed in their own approved work.
- Keep the colleague's Dean UI as delivered (pages and sidebar visible) while the functional owner wires it; the spec says they are previews.
- Confirm the 30-minute idle timeout and the Student/Secretary phone-card extension.
- Restore hide-while-live for Start session.
- Three-way review approved on 2026-11-11.

## How it was checked

- Review: 3-commit diff read hunk by hunk; backend routes/controllers/auth/audit/migrations; spec AUTH-007, CLS-001..003, ACA-001/002, ROOM-001, ID-001/002, UI-001, ATT-001; docs/frontend.md and PRODUCT_BACKLOG; every test selecting the changed screens.
- Gate evidence: `npx tsc -b` passes on base and theirs; frontend unit tests 223/223 on both; `php -l` on changed backend files; mocked UI suite on base 281/281, on theirs 273/281 (8 failures, all caused by her changes and fixed here).
- Full gates after fixes: `./scripts/check.ps1` and `./scripts/check-postgres.ps1`.
- Three-way page from real screenshots: our branch, her branch and the merged tree (`audit-output/merge-2026-11-11/`, not committed).

## Dean UI acceptance (the brief's definition of done)

The Owner's ruling: the colleague's job was the Dean/superadmin UI (the three preview pages); keep it as delivered and make sure it works. Acceptance against `dean-superadmin-ui-agent-brief.md` (evidence in `audit-output/dean-ui/`, not committed):

- Build: `npm run build` passes (tsc + Vite; only pre-existing bundle-size warnings). `npm run lint` cannot complete in this environment — Node fatal heap OOM (host Node 26 and the container's Node 24, default and 8 GB heap); the three delivered pages are lint-clean (`npx eslint` on them exits 0) and the repo-wide OOM is pre-existing (lint config/dependencies untouched by this merge). Recorded as a tooling issue, not a branch failure.
- Screenshots: 70 page shots (3 pages × 7 tab views × 375/768/1024/1280/1440 × light/dark) and 27 dialog shots; horizontal page overflow 0 px in all 70 combinations.
- Keyboard: tab bars reached and arrow/Home/End work on all three pages; dialogs trap focus, close on Escape and return focus; every field labelled; icon-only buttons have screen-reader labels.
- Fixed from the acceptance pass: duplicate account-options dialog in the accessibility tree (one shared dialog instead of two), and filter-row control overlap at 375 px and 1024 px on Classes and Course Catalog.
- Still to wire (listed in the handoff wiring notes, handed back to the functional owner): typed props and callbacks, loading/error data states, real account/class/catalog data and permissions, and the brief features the delivered UI does not include yet (invite/edit/reissue/revoke and person details, change faculty, import class and roster, units/meetings/enrolled counts, catalog "Classes using" and restore). Mutations on the preview pages are local to the view and are lost on reload, as their banners say.


## Not changed (pre-existing, outside this merge)

- The MFA page treats any 401 as an expired session, so a wrong authenticator code returns the user to the login screen instead of showing the invalid-code message. Present before the colleague's commits; recorded for the product backlog.
- The pre-existing desktop prototype attendance table (not the new phone cards) still hardcodes a demo time, room and verification method. Present at `086cc51`; recorded for the product backlog.

## Demo

The demo deployment is performed from the merge commit after the gates. Production is untouched until the Owner promotes.
