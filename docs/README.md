# DentiSys Documentation

Start with the [README](../README.md) to set up DentiSys. [spec.md](../spec.md) is the authoritative source for approved product behavior; where any document disagrees with it, the specification wins.

## Setup and operation

- [Development environment details](development-environment.md): pgAdmin, demo data, Google Sign-In, real e-mail, phone testing, and the disposable test stack.
- [Single-server mode](single-server.md): the unfinished private-network deployment prototype.
- [Demo accounts](demo-accounts.md): development-only credentials.
- [Manual demo readiness checklist](manual-demo-readiness.md)

## Current work

- [Current handoff](HANDOFF_2026-10-01.md): current state, remaining work, and working rules.
- [Product backlog](PRODUCT_BACKLOG.md)
- [UI migration plan](ui-migration-plan.md): the Owner-approved delivery order.
- [Roadmap](roadmap.md) and [implemented features](features.md): older snapshots; the handoff is more current.

## Architecture and design

- [Architecture](architecture.md)
- [Frontend overview](frontend.md)
- [Backend contracts](contracts/): [academics and roles](contracts/demo-academics.md), [password change](contracts/demo-auth.md).
- [BUCDM interview policy proposal](bucdm-policy-proposal.md)

## Database

- [PostgreSQL layout and migrations](../database/README.md)
- [Integrated target ERD](database/erd-target-integrated.md)
- [Normalization assessment](database/normalization-relation-assessment.md)
- [UI field normalization audit](database/ui-field-normalization-audit.md)
- [Security data dictionary](database/security-data-dictionary.md)
- [Phase 2 migration mapping](database/phase-2-migration-mapping.md)

## Biometrics

- [Biometric attendance decisions](biometric-attendance-decisions.md)
- [Model, calibration, and deployment](biometric-calibration-deployment.md)
- [Local biometric demo contract](demo-biometrics.md)

## Security (IAS)

- [Module A: identity and access](ias/module-a-identity-access.md)
- [Module C: API and perimeter defense](ias/module-c-perimeter-defense.md)

## Archive

[Finished plans, old handoffs, and past audit evidence](archive/README.md). They are kept for history and do not describe the current system.
