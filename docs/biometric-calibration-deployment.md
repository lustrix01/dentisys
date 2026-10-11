# DentiSys Biometric Calibration and Deployment Report

## Scope and approval status

This report documents the local development configuration for the approved
attendance-only, authenticated-Student 1:1 biometric lane. The values below
are provisional development-only starting points. They are not production
approval, institutional privacy approval, or evidence of ISO certification or
formal ISO/IEC 24745:2022 conformance.

Production and single-server deployments remain fail-closed in the backend
until the deferred technical selections, target-camera validation, privacy
review, and explicit Owner approval are complete.

## Model artifact

- Source: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
- Local path: `C:\Users\decha\Desktop\Github\dentisys-biometric-assets\face_landmarker.task`
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- Deployment: mounted into the biometric sidecar at `/app/models/face_landmarker.task` read-only; the model binary is outside Git.
- Use: MediaPipe Face Landmarker is limited to landmark, transformation, and blendshape analysis for active liveness. YuNet is the face detector and SFace is the strict 1:1 verifier.
- YuNet face detector `face_detection_yunet_2023mar.onnx`: SHA-256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`. Local folder `C:\Users\decha\Desktop\Github\dentisys-biometric-assets\` (VPS: `/opt/dentisys/assets/`), mounted read-only into the sidecar and checksum-checked at startup. Environment keys: `BIOMETRIC_YUNET_MODEL_HOST_PATH`, `BIOMETRIC_YUNET_SHA256`.
- SFace recognizer `face_recognition_sface_2021dec.onnx`: SHA-256 `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`. Same folder, mount, and startup check. Environment keys: `BIOMETRIC_SFACE_MODEL_HOST_PATH`, `BIOMETRIC_SFACE_SHA256`.

## Provisional development configuration

The local `.env` uses the following non-secret values. The shared secret and
32-byte storage key are generated locally and intentionally omitted from this
report. The detector and verifier were originally Haar Cascade and LBPH; they
were replaced on 2026-10-11 after offline calibration showed LBPH accepted
45.6% of impostor attempts at its provisional rule (any 3 of 30 frames at
distance 70).

| Parameter | Provisional value | Technical rationale | Safety implication and limitation |
| --- | ---: | --- | --- |
| `BIOMETRIC_YUNET_SCORE_THRESHOLD` | `0.9` | YuNet detection confidence a face must reach; a frame is usable only if exactly one face meets it. | Weak or multiple detections are rejected as quality failures; must be validated on the target camera. |
| `BIOMETRIC_MIN_FACE_PX` | `120` | Requires enough face detail for the provisional laptop/phone-camera pipeline, measured on the YuNet face box. | Rejects smaller or distant faces and is not a universal device threshold. |
| `BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE` | `60.0` | Blur/low-light screening using Laplacian variance on the aligned 112×112 crop. Lowered from the provisional `100.0` (Owner decision, 2026-09-28) after ordinary 640×480 laptop webcams failed most frames as "blurry or too dark". | Only affects which frames are usable; identity matching (`SFACE_COSINE_THRESHOLD`, `MATCH_COUNT`) and liveness (`BLINK_THRESHOLD`, `HEAD_TURN_RATIO`) are unchanged. The measure still changes with exposure, compression, and camera sharpening. |
| `BIOMETRIC_SFACE_COSINE_THRESHOLD` | `0.44` | Minimum cosine similarity between a usable frame's L2-normalized SFace embedding and the enrolled template. Chosen from offline LFW calibration through the sidecar's own pipeline (200 people, 3 impostors each, 24 enrollment samples, 30 frames per attempt, simulated good-camera and older-phone profiles): 0 impostor attempts accepted (about 555 per profile) and about 95% of genuine attempts passed on every profile (retries counted as not passing). | Approved by the Owner on 2026-10-11 with the YuNet score, minimum face, sharpness and match count (spec BIO-007). LFW cannot show error rates below about 1 in 1,000; team re-enrollment and live genuine/impostor tests on the demo server follow. Raw calibration files are in the git-ignored `calibration.local/` folder. |
| `BIOMETRIC_MATCH_COUNT` | `3` | Requires repeated consistent matches so one frame cannot authorize attendance. | Any 3 matching frames in one attempt of up to 30 frames; calibrated together with the SFace threshold above. |
| `BIOMETRIC_BLINK_THRESHOLD` | `0.21` | Common eye-aspect-ratio starting point for a blink signal. | Glasses, pose, eyelid shape, landmark noise, and camera frame rate can change the result. |
| `BIOMETRIC_HEAD_TURN_RATIO` | `0.15` | Moderate normalized nose displacement from the eye midpoint for a turn signal. | It is camera- and face-pose-dependent and is not a proven presentation-attack detector. |
| `BIOMETRIC_CHALLENGE_TTL_SECONDS` | `120` | Short-lived local challenge window that accommodates ordinary camera interaction. | Challenges remain single-use and server-generated; TTL is not a liveness or identity threshold. |
| `BIOMETRIC_SIDECAR_TIMEOUT_SECONDS` | `20` | Bounds a private local request while allowing image processing on a development laptop. | A slow or unavailable sidecar fails to manual attendance; it is not a production latency target. |
| `BIOMETRIC_MAX_REQUEST_BYTES` | `52428800` default | Caps multipart input to limit accidental oversized uploads. | This is a transport guard, not a quality or security assurance. |
| Enrollment usable samples | `20` required, `30` maximum | Matches the approved product invariant; failed samples do not count. | Raw frames are temporary and discarded after processing; the count is not a production accuracy guarantee. |

The sidecar also requires a non-empty 32-byte AES-GCM storage key, a shared
secret of at least 32 non-whitespace characters, and the exact model checksum.
Missing or malformed values make health fail and biometric requests return a
generic unavailable response. Protected references are encrypted in the
dedicated biometric volume; raw frames are not retained.

## Local setup procedure

1. Keep the three models at the external paths above, or set
   `MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH`, `BIOMETRIC_YUNET_MODEL_HOST_PATH`,
   and `BIOMETRIC_SFACE_MODEL_HOST_PATH` to other external paths.
2. Copy `.env.example` to `.env` if the local file does not exist.
3. Set each model SHA-256 (`BIOMETRIC_YUNET_SHA256`, `BIOMETRIC_SFACE_SHA256`,
   and the MediaPipe checksum) to the checksum in this report.
4. Generate a development-only random sidecar shared secret and a random
   32-byte storage key. Store them only in `.env`; never commit or print them.
5. Set the provisional calibration values in `.env`, keeping
   `DEV_MOCK_BIOMETRIC_ENABLED=false`.
6. Build and start the local Compose services. The sidecar must report healthy
   only after the model, checksum, calibration, shared secret, and storage key
   all validate.
7. Use the local development Student account and a local camera for manual
   testing. If biometric processing is unavailable or rejected, use the
   authorized manual attendance path.

Existing LBPH enrollments (`lbph/` references made before 2026-10-11) never
verify and return 503, so each environment must expire them once at deploy.
Run `php /var/www/html/backend/bin/expire-lbph-biometrics.php --dry-run` inside
the web container (same as `docker compose exec web php ...`), review the
output, then run it again without `--dry-run`. The script deletes the encrypted
LBPH file through the sidecar, marks the profile expired, writes an audit entry,
and keeps consent; enrolled Students re-enroll. Revoking a `lbph/` reference
still works.

The sidecar has no host-published port. It is reachable only through the
private Compose network. The model mounts are read-only, and the biometric
storage volume is separate from PostgreSQL. Do not delete, reset, or replace
either persisted volume during this lane.

## Target-camera validation procedure

For each target desktop, Android, and iOS browser/camera class, record the
camera model, browser, operating system, lighting, distance, pose, and frame
conditions. Run separate enrollment and verification sets using different
captures from the same person. Include genuine variations (glasses, ordinary
expression, lighting, distance, and modest pose changes) and impostor pairs.

Measure at least false rejection rate, false acceptance rate, completion rate,
median and tail processing time, quality-rejection reasons, liveness challenge
completion, and manual-fallback rate. Repeat with printed photographs,
displayed photographs, prerecorded/displayed video, and straightforward replay
attempts. Do not retain raw images after processing; retain only aggregate
results and approved test metadata.

## Production acceptance criteria

Production acceptance requires all of the following, with thresholds approved
separately by the Owner and the research, adviser, University, and Data
Protection Officer review named in the product specification:

- target-camera validation covers the supported desktop, Android, and iOS
  device classes and the intended operating conditions;
- the selected SFace cosine threshold and repeated-match rule are justified by a
  documented false-acceptance/false-rejection trade-off, not copied from this
  provisional configuration;
- active liveness resists the tested photo, display, video, and replay cases
  without requiring depth or Face ID-equivalent hardware;
- consent wording and the manual alternative receive the required institutional
  review;
- transport protection, access control, backup exclusion, key handling,
  revocation, deletion, expiry, and re-enrollment procedures are verified;
- audit output contains lifecycle events without raw images, templates,
  vectors, secrets, precise GPS coordinates, or persistent similarity scores;
- failure, timeout, revocation, and unavailable-infrastructure paths preserve
  historical attendance and direct the Student to manual attendance; and
- the exact approved model artifact, checksum, calibration, deployment layout,
  monitoring, rollback, and incident procedures are recorded before enabling
  any production-like deployment.

Until those criteria are met and separately approved, the values in this report
must remain development-only.
