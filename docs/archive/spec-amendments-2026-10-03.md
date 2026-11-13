# Specification amendment (2026-10-03)

The Owner explicitly approved the exact UI-003 addition during the fresh
`lighthal7` transfer after discussing the source branch's 80% rule:

The Student midterm advisory uses the existing server-calculated Faculty Midterm Watchlist risk projection. High and At Risk results show an informational advisory; Low does not. Missing or insufficient assessment data remains Pending/Unavailable. A manual watchlist unlock changes visibility only. This advisory never assigns remediation or changes the final-grade 2.50 trigger.

## NTF-001 - Class enrollment notifications

The Owner approved the source-versus-current enrollment-notification comparison,
additional Secretary coverage and this exact specification addition by replying
`Proceed` to the approval request on 2026-10-03:

When authorized Faculty creates or reactivates a class enrollment, DentiSys creates a persisted in-app notice for each active Student/Secretary account canonically linked to that Student. An email match does not establish a recipient. Enrollment, audit and notification commit or roll back together. An already-active enrollment creates no new notice. Each class/account pair receives at most one enrollment notice, including subsequent reactivations. A Student without an active linked account receives no notice, and account activation does not replay missed notices.
