# Biometric Attendance Decisions

This log records the rationale for durable biometric-attendance decisions. The normative product rules remain in [`spec.md`](../spec.md).

## ATT-003 — Per-session timing and final absence resolution

**Owner approval:** 2026-09-22

DentiSys uses per-session attendance timing rather than one universal timing policy. Authorized Faculty or Secretary configure the session's opening time, Present cutoff, and Late cutoff. A session may therefore be created earlier than it opens; for example, a session created at 06:00 may open at 08:00, accept Present attendance until 09:00, accept Late attendance from 09:00 until 12:00, and close biometric capture at 12:00.

The application timezone is Philippines time, represented as the IANA timezone `Asia/Manila` (UTC+08:00). Server time is authoritative. The browser or device clock must not determine attendance status.

Capture closure does not itself create Absent. Unresolved eligible attendance is resolved through the existing final attendance-resolution lifecycle when the applicable class/session concludes. If that conclusion occurs at the configured Late cutoff, the unresolved attendance becomes Absent at that point. Absent may be corrected or appealed through the existing authorized Faculty/Secretary correction and Excused workflows; no new Student-facing dispute form is introduced.

Per-session timing was selected because class schedules and attendance practices can vary, while server-authoritative windows preserve consistent status decisions for each session without inventing a universal duration.

## Attendance-session revocation

Authorized Faculty or Secretary may revoke a session they are authorized to manage. Revocation closes biometric capture and prevents further submissions while preserving attendance already recorded. It does not automatically mark unresolved Students Absent and does not delete or rewrite attendance records. The revocation is recorded in the audit trail with the actor and timestamp, with an optional reason.

This decision affects the research-paper sections covering attendance-session governance, biometric attendance timing, auditability, and manual correction or appeal handling.
