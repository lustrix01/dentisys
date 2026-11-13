# DentiSys Documentation

Start with the [README](../README.md) to set up DentiSys. [spec.md](../spec.md) is the authoritative source for approved product behavior; where any document disagrees with it, the specification wins.

Every file in this folder describes the system as it is now. Dated records (handoffs, merge notes, reviews, change notes, amendment records, built proposals) are in the [archive](archive/README.md) and do not describe the current system.

## Product

- [Implemented features](features.md): what works today, with spec IDs.
- [Product backlog](PRODUCT_BACKLOG.md): open work, standing rules and finished items.
- [Roadmap](roadmap.md): what's next, in order.
- [Lecture/Laboratory grading](lecture-laboratory-grading.md): how the grading editor and course grade work.

## Setup and operation

- [Development environment details](development-environment.md): pgAdmin, demo data, Google Sign-In, real e-mail, phone testing, and the disposable test stack.
- [Demo accounts](demo-accounts.md): development-only credentials.
- [Manual demo readiness checklist](manual-demo-readiness.md)
- [Single-server mode](single-server.md): the unfinished private-network deployment prototype.
- [Hosting requirements](hosting-requirements.md): what the demo and production servers need and the accepted risks.
- [Deploying DentiSys from scratch](deploy-from-scratch.md): the step-by-step VPS deployment guide.
- [VPS deployment](vps-deployment.md): the DEL-001 image registry, HTTPS, update and backup runbook.
- [Release guide](release-guide.md): from an approved change to the demo and production servers.
- [Benchmark](benchmark.md): the repeatable load and face-check benchmark.

## Architecture and design

- [Architecture](architecture.md)
- [Frontend overview and page patterns](frontend.md)
- Backend contracts: [academics and roles](contracts/demo-academics.md), [password change](contracts/demo-auth.md), [audit logging](contracts/audit-logging.md), [official imports](contracts/official-imports.md), [official exports](contracts/official-exports.md), [lecture-only courses](contracts/lecture-only-grading.md)

## Database

- [PostgreSQL layout and migrations](../database/README.md)
- [Security data dictionary](database/security-data-dictionary.md)

## Biometrics

- [Biometric attendance decisions](biometric-attendance-decisions.md)
- [Model, calibration, and deployment](biometric-calibration-deployment.md)
- [Local biometric demo contract](demo-biometrics.md)

## Security (IAS)

- [Module A: identity and access](ias/module-a-identity-access.md)

## Archive

[Handoffs, merge notes, reviews, change notes, amendment records and built proposals](archive/README.md), kept for history.
