# Biometric Attendance Backend Decisions

This document records implementation decisions for the approved Student
biometric-attendance backend lane. It does not select deferred calibration
values.

## Approved implementation boundary

- OpenCV Haar Cascade performs face detection and rejects zero or multiple-face captures.
- OpenCV LBPH performs strict authenticated-Student 1:1 verification only.
- MediaPipe Face Landmarker is used only for the two-action active-liveness analysis.
- PHP remains authoritative for identity, authorization, consent, session timing, Asia/Manila calendar interpretation, geofencing, attendance status, persistence, idempotency, and audit.
- Raw frames and Student GPS coordinates are temporary request data only.
- Protected LBPH references are AES-256-GCM encrypted in the private sidecar storage volume.
- The sidecar has no published host port and is reachable only by the PHP container over the Compose network.

## Configuration boundary

The sidecar requires environment-provided calibration values for Haar quality,
LBPH matching, repeated-match count, blink, and head-turn decisions. No
production calibration values are committed here. The sidecar remains
unavailable for real biometric capture until those values are validated for the
actual camera and pipeline. The MediaPipe Face Landmarker model is likewise
provided through a deployment-mounted path and is not committed as application
data.

The application challenge lifetime is configured by
`BIOMETRIC_CHALLENGE_TTL_SECONDS`; the default development value is short-lived
and is not an identity or attendance decision threshold.

## Storage and backup boundary

PostgreSQL stores only biometric consent/profile metadata and an opaque sidecar
reference. The dedicated `dentisys_biometric_data` volume is separate from the
PostgreSQL volume and is not included by ordinary database backups. Its
encryption key is supplied only through the sidecar environment and is never
stored in PostgreSQL, Git, or browser data.

## Attendance lifecycle

Sessions store opening, Present-cutoff, and Late-cutoff times. PHP interprets
those values in the configured application timezone (`Asia/Manila` by default)
using authoritative server time. Normal session conclusion resolves eligible
unresolved enrollments to `absent`; session revocation preserves unresolved
attendance and recorded rows.
