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
- Use: MediaPipe Face Landmarker is limited to landmark, transformation, and blendshape analysis for active liveness. Haar remains the face detector and LBPH remains the strict 1:1 verifier.

## Provisional development configuration

The local `.env` uses the following non-secret values. The shared secret and
32-byte storage key are generated locally and intentionally omitted from this
report.

| Parameter | Provisional value | Technical rationale | Safety implication and limitation |
| --- | ---: | --- | --- |
| `BIOMETRIC_HAAR_SCALE_FACTOR` | `1.1` | Standard OpenCV multi-scale step that balances scan cost and sensitivity. | May miss faces or increase false detections under unusual scale, lighting, or camera distance; must be validated on the target camera. |
| `BIOMETRIC_HAAR_MIN_NEIGHBORS` | `5` | Moderate confirmation requirement for a frontal Haar detection. | More conservative than very low values, but it is not a measured false-acceptance control. |
| `BIOMETRIC_HAAR_MIN_FACE_PX` | `120` | Requires enough face detail for the provisional laptop/phone-camera pipeline. | Rejects smaller or distant faces and is not a universal device threshold. |
| `BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE` | `100.0` | Conservative blur-screening starting point using Laplacian variance. | The measure changes with exposure, compression, and camera sharpening; it requires target-camera calibration. |
| `BIOMETRIC_LBPH_RADIUS` | `1` | OpenCV LBPH default-style local-neighborhood radius. | A technology parameter, not a production match-quality guarantee. |
| `BIOMETRIC_LBPH_NEIGHBORS` | `8` | Standard local binary pattern neighborhood size. | Can be sensitive to illumination and pose; must be evaluated with genuine and impostor samples. |
| `BIOMETRIC_LBPH_GRID_X` | `8` | Standard spatial subdivision that preserves local face structure. | More grid detail can increase sensitivity to alignment and device differences. |
| `BIOMETRIC_LBPH_GRID_Y` | `8` | Paired with `GRID_X` for square face crops. | Same alignment and device limitations as the horizontal grid. |
| `BIOMETRIC_LBPH_THRESHOLD` | `70.0` | Conservative provisional upper bound for OpenCV LBPH's lower-is-better confidence output. | This is explicitly not a production threshold; the value may cause false rejects or false accepts outside the local test conditions. |
| `BIOMETRIC_MATCH_COUNT` | `3` | Requires repeated consistent matches so one frame cannot authorize attendance. | It does not define a production decision window or statistically validated operating point. |
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

1. Keep the model at the external path above, or set
   `MEDIAPIPE_FACE_LANDMARKER_MODEL_HOST_PATH` to another external path.
2. Copy `.env.example` to `.env` if the local file does not exist.
3. Set the model SHA-256 to the checksum in this report.
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

The sidecar has no host-published port. It is reachable only through the
private Compose network. The model mount is read-only, and the biometric
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
- the selected LBPH threshold and repeated-match rule are justified by a
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
