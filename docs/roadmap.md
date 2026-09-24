# Roadmap

## Current priority - Owner reset, 2026-09-24

1. Copy the entire `owhie_backend` UI into `lighthal5`, incorporating UI Changes.pdf. Visual parity comes first; temporarily failing tests and missing wiring are recorded for later repair.
2. Normalize affected database data to 3NF, including five-part names and all UI-required fields, using additive data-preserving migrations.
3. Wire frontend/backend, repair regressions, and complete persistence, permissions, audit, and consolidated validation.
4. Resume remaining provider acceptance and external/policy blockers, then later deployment work.

See [UI migration plan](ui-migration-plan.md) and spec.md section 9B for frozen sources, page traceability, acceptance gates, and unresolved details. The older items below remain scope context, not the execution order. Temporary test deferral does not waive final functional validation.

## Identity work

- Google Sign-In Phase 1 is implemented for existing institutional accounts with explicit password/MFA linking and multi-domain allowlisting.
- Faculty onboarding is Admin-invitation only; the invitation is the approval and acceptance with a DentiSys password activates the account. Faculty invite Students from an owned class roster, and Student acceptance requires the canonical Student identity and active enrollment. Google is optional identity verification during either invitation acceptance.

## Planned product work

- Complete the facial-biometric feature, including consent, enrollment, storage, matching, attendance flow, auditability, and privacy controls.

## Planned delivery work

- Add image publishing and demonstration deployment handling modeled after `learningfullstack` when deployment authority and requirements are available.
- Continue measured frontend, backend, and container optimizations without adding unnecessary infrastructure.
