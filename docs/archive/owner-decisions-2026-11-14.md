# Owner decisions, 2026-11-14 (docs sync grill)

Answers given by the Owner while closing the docs-sync backlog work. Each is carried into spec.md or the backlog when it is built.

| # | Item | Decision |
|---|---|---|
| 1 | 9.9 Excel export | The Reports workbook's Assessment Scores sheet matches Full Matrix View with Show computation on: per assessment Score, % (raw score ÷ maximum × 100) and Transmuted (the effective value used in the grade); per category Average % and Weighted. The T1 rule "Reports show effective percentages" is now met by the Transmuted column. |
| 2 | 9.9 PDF print | The Reports PDF print of the same matrix matches the Excel columns and meaning. |
| 3 | 9.1 class counts | The Faculty Dashboard counts, for the current school year, only classes still running (no archive reason), matching the Classes & Rosters Assigned tab; student and at-risk counts follow the same classes. Past-year views are unchanged. |
| 4 | 9.3 bundle size | Leave it; close 9.3. Reopen if first load on phones feels slow. |
| 5 | 11.5 zero-length session | Reject with its own rule and message: "Class end must be after the opening time." The 24-hour wording goes. |
| 6 | Attendance category transmutation | A new assessment in a category named Attendance starts with transmutation off; Faculty may switch it on. |
| 6b | Automatic Attendance category | Keep supporting saved automatic (attendance-record) categories; nothing new creates one. |
| 7 | Docs rule | Apply the AGENTS.md documentation rule to everyone; on a colleague merge, missing doc updates are a merge finding fixed in the merge commit. |
| 8 | 9.7 product name | "DentiSYS" in everything users see: screens, emails, PDF and Excel exports, landing page. Developer docs, spec.md, code and the repository keep "DentiSys". |
| 8b | 9.7 student number | "Student No." in table column headers and phone cards; "Student Number" in forms, dialogs, detail views and messages. "Student ID" is not used for this field. |
| 9 | 4.3 invitation View | A read-only View dialog: name, email, status, sent and expiry dates, and that invitation's email history (send, reissue, correction). No token or link. View is the primary row action. |
| 10 | Step 8 order | 9.7 + 10.6 wording first, then 4.3, 5.2, 5.4, 5.6, 5.7, 10.7, 10.8; one demo, approval and commit each. |
| 11 | 8.2 audit | Regenerating recovery codes writes an audit event "Regenerated recovery codes" (no codes stored), like the other MFA events. |
