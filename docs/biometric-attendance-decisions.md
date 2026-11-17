# Biometric Attendance Backend Decisions

This document records implementation decisions for the approved Student
biometric-attendance backend lane. It does not select deferred calibration
values.

## Approved implementation boundary

- OpenCV YuNet (`FaceDetectorYN`) performs face detection and rejects zero or multiple-face captures.
- OpenCV SFace (`FaceRecognizerSF`) performs strict authenticated-Student 1:1 verification only.
- MediaPipe Face Landmarker is used only for the active-liveness analysis: one random action for attendance, two for enrollment.
- PHP remains authoritative for identity, authorization, consent, session timing, Asia/Manila calendar interpretation, geofencing, attendance status, persistence, idempotency, and audit.
- Raw frames and Student GPS coordinates are temporary request data only.
- Protected SFace references are AES-256-GCM encrypted in the private sidecar storage volume.
- The sidecar has no published host port and is reachable only by the PHP container over the Compose network.

## Configuration boundary

The sidecar requires environment-provided calibration values for YuNet detection
and quality, SFace matching, repeated-match count, blink, and head-turn decisions. No
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

## Is face data hashed or encrypted?

Encrypted, not hashed. Hashing cannot work for faces: two scans of the same
face never produce identical numbers, and a hash only matches exact copies.
Matching compares two similar face references, so the stored reference has to
be readable by the face service, and it is protected in these ways instead:

- **Encrypted at rest.** The stored face reference (an SFace embedding, not a
  photo) is encrypted with AES-256-GCM before it is written
  (`biometric-sidecar/app.py`, `encrypt_model` and `decrypt_model`). The
  reference id is bound to the ciphertext, so a file copied onto another
  student's reference does not open.
- **Key kept on the server.** The 32-byte key comes only from the sidecar's
  environment, `BIOMETRIC_STORAGE_KEY_B64` (`storage_key()` in the same file).
  It is not in Git, the database, any API response or the browser (spec
  BIO-004).
- **No photos kept.** Raw photos and camera frames are discarded after
  processing. PostgreSQL holds only consent and profile details plus an opaque
  reference id (spec BIO-003).
- **Restricted access.** The face service has no published port; only the PHP
  container reaches it over the private Compose network.
- **Not in backups.** Nightly backups copy the database only, never the face
  storage volume (`scripts/backup-vps.sh`; [vps-deployment.md](vps-deployment.md)).
- **Revocable.** A reference is deleted when the term ends, consent is
  withdrawn, the Admin revokes it or the student re-enrolls (spec BIO-005).

The design follows the protection goals of ISO/IEC 24745:2022 (Biometric
information protection): confidentiality, integrity, renewability and
revocability. This is a design reference only, not a claim of certification or
formal compliance.

## Attendance lifecycle

Sessions store opening, Present-cutoff, and Late-cutoff times. PHP interprets
those values in the configured application timezone (`Asia/Manila` by default)
using authoritative server time. Normal session conclusion resolves eligible
unresolved enrollments to `absent`; session revocation preserves unresolved
attendance and recorded rows.
