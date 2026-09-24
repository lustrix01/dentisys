# Local biometric attendance demo contract

This is the backend contract for the one-day local demo. It describes the
implemented PHP and private sidecar behavior; it does not claim that a camera,
calibrated model, or institutional privacy review has passed. Real completion
requires one genuine enrollment and one genuine attendance record in
PostgreSQL. A missing sidecar prerequisite stays a truthful manual-attendance
fallback.

## Authoritative profile states

`GET /api/student/biometric/profile` returns the authenticated Student's
profile. The authoritative `enrollmentStatus` values are:

- `not_enrolled`: no usable protected reference is active;
- `enrolling`: an enrollment operation is in progress;
- `active`: consent, term expiry, protected reference, and usable sample count
  all passed server checks;
- `expired`: the academic term ended and the protected reference was revoked;
- `revoked`: consent or enrollment was revoked and the protected reference was
  deleted.

The response includes `consentGranted`, `enrolledAt`, `expiresAt`,
`usableSampleCount`, `requiredUsableSamples` (20), and
`manualFallbackAvailable`. It never returns a protected object reference,
template, raw frame, model, or similarity score.

Only one enrollment operation may be in flight for a Student. A second
challenge request while the profile is `enrolling` returns
`biometric_enrollment_in_progress`; this prevents a browser timeout from
starting a second sidecar operation while the first request may still finish.

## Consent and challenge

`PUT /api/student/biometric/consent` accepts JSON:

```json
{"granted":true,"disclosureVersion":"v1.0-2026"}
```

Consent is required before enrollment or attendance capture. `DELETE
/api/student/biometric/profile` revokes consent and enrollment. The server
revokes the sidecar reference before clearing the database metadata.

`POST /api/student/biometric/liveness/challenge` accepts JSON:

```json
{"purpose":"enrollment"}
```

For attendance, `purpose` is `attendance` and
`attendanceSessionId` is required. The server checks the Student's session
ownership and current Asia/Manila attendance window before issuing a challenge.
The response contains an opaque `challengeId`, a one-time `challengeToken`,
exactly two distinct actions in randomized order from `blink`, `turn_left`,
and `turn_right`, and `expiresAt`. The browser may display those actions but
cannot decide pass or fail.

The submission must send both `challengeId` and `challengeToken`. The PHP
server verifies that the numeric challenge id identifies the row matched by the
token, Student, purpose, and attendance session. A mismatch is
`challenge_invalid`.

During capture the browser may send one temporary `frames[]` image at a time to
`POST /api/student/biometric/liveness/guidance`, together with the same
challenge fields and `purpose` (and `attendanceSessionId` for attendance). PHP
validates the authenticated Student's unconsumed challenge and the private
sidecar returns only `detectedAction` and `faceDetected`. This endpoint does not
consume or advance the challenge, retain the image, or decide liveness; it only
paces the browser's prompts. Enrollment and attendance uploads still perform
the authoritative ordered liveness check over their candidate frames.

## Enrollment

`POST /api/student/biometric/enrollment` is multipart form data:

| Field | Meaning |
|---|---|
| `challengeId` | The server-issued challenge id. `challenge_id` is accepted as an alias; if both are sent they must match. |
| `challengeToken` | The opaque one-time challenge token. `challenge_token` is accepted as an alias. |
| `idempotencyKey` | One opaque key for this capture operation. `idempotency_key` or the `Idempotency-Key` header is accepted; duplicate aliases must match. |
| `frames[]` | Candidate image frames. The request must contain at least 20 and at most 30 frames. |

Twenty usable samples are required. Failed quality or liveness samples do not
count; the sidecar may accept no more than 30 usable samples. The sidecar
performs exactly-one-face Haar detection, temporary liveness action matching in
the server-issued order, and encrypted LBPH model generation. Raw frames exist
only in request memory and are not stored.

On success the response is the profile response with `enrollmentStatus:
"active"`, the server-selected usable count, and the term-derived expiry.
Client timestamps are not accepted or trusted. Enrollment time and expiry are
server values.

## Attendance

`POST /api/student/attendance/biometric` is multipart form data:

| Field | Meaning |
|---|---|
| `attendanceSessionId` | The active session to which this authenticated Student belongs. `sessionId` is an accepted alias. |
| `challengeId` / `challengeToken` | The matching attendance challenge pair. |
| `idempotencyKey` | One opaque key for the capture operation, with the same alias/header rules as enrollment. |
| `frames[]` | Candidate verification frames; the sidecar limit is 30. |
| `latitude`, `longitude` | Optional temporary coordinates when the session geofence is enabled. |

The server evaluates the session status, configured opening/Present/Late
windows, consent, enrollment expiry, geofence, challenge, liveness, and strict
authenticated-Student 1:1 LBPH verification. It assigns `present` or `late`
using server time in `Asia/Manila`, writes one persisted attendance row, and
records an audit event. Client timestamps, client attendance status, and local
face flags are never accepted as authority. Exact Student coordinates are not
persisted.

A later request for a session that already has a record returns HTTP 200 with
`status: "already_recorded"` and the existing record summary; it does not add
a duplicate row. Successful new records return HTTP 201 with `status:
"present"` or `"late"`, `verificationMethod: "biometric"`, and
`recordedAt` from the server.

## Retry and cancellation semantics

The client generates one idempotency key per logical enrollment or attendance
capture and reuses that exact key if the request is retried. A different key
for the same consumed challenge is rejected with `idempotency_conflict`.
After a committed enrollment, retrying the same key and challenge returns the
active profile without creating another reference. Attendance persistence is
protected by the unique enrollment/session constraint and returns
`already_recorded` on a later attempt.

If sidecar processing fails, PHP resets the in-flight challenge to a retryable
state and the same key may be retried with the same challenge while it remains
valid. A retry must resend the frames; raw frames are never retained by PHP for
later replay. An expired challenge or a challenge used with another key
requires a new challenge and a new key.

An actual quality, liveness, or face-verification rejection consumes that
challenge as a failed attempt; request a fresh challenge for the next capture.
Transport/provider-unavailable failures remain retryable with the same key so
an in-flight server operation cannot be duplicated by a browser timeout.

The PHP-to-sidecar timeout is configured by
`BIOMETRIC_SIDECAR_TIMEOUT_SECONDS` (the local default is 20 seconds). A
browser abort does not cancel work already running in PHP. The biometric
enrollment and attendance requests use an explicit 30-second browser deadline,
which leaves transport margin above the local sidecar timeout; the generic
client default remains 15 seconds for ordinary requests. The client preserves
the idempotency key when it retries. This timeout alignment does not claim that
real camera enrollment or attendance has passed.

## Stable errors

The backend uses the normal error envelope with these biometric codes:

`AUTHENTICATION_REQUIRED`, `ACCESS_DENIED`, `consent_required`,
`biometric_not_enrolled`, `enrollment_expired`, `session_not_active`,
`biometric_enrollment_in_progress`,
`attendance_not_open`, `attendance_capture_closed`, `challenge_invalid`,
`challenge_expired`, `idempotency_key_required`, `idempotency_conflict`,
`liveness_failed`, `biometric_verification_failed`, `quality_failed`,
`geofence_failed`, `already_recorded`, and
`biometric_service_unavailable`.

Quality, liveness, camera, timeout, geolocation, repeated failure, and provider
unavailability direct the Student to the authorized Secretary/Faculty manual
attendance path. They do not lock the account or create `absent`.

## Sidecar readiness gate

The sidecar is private to the Compose network. Health requires the configured
calibration values, a non-empty shared secret, a 32-byte AES-GCM storage key,
and the mounted MediaPipe Face Landmarker model whose SHA-256 matches the
deployment value. Protected LBPH references are encrypted in the dedicated
biometric volume. Missing calibration, model, checksum, key, or secret keeps
real capture unavailable; a simulated camera or localStorage flag is not
evidence of biometric completion.
