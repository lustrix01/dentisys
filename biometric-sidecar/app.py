from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import secrets
import threading
import uuid
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import Flask, jsonify, request


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("BIOMETRIC_MAX_REQUEST_BYTES", "52428800"))
STORAGE_DIR = Path(os.getenv("BIOMETRIC_STORAGE_DIR", "/var/lib/dentisys-biometric"))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class BiometricError(RuntimeError):
    def __init__(self, message: str, code: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class Calibration:
    yunet_score_threshold: float
    min_face_px: int
    quality_laplacian_variance: float
    sface_cosine_threshold: float
    match_count: int
    blink_threshold: float
    head_turn_ratio: float


def required_float(name: str, *, minimum: float = 0.0, maximum: float | None = None) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        raise BiometricError("Biometric calibration is not configured.", "biometric_service_unavailable", 503)
    try:
        value = float(raw)
    except ValueError as exc:
        raise BiometricError("Biometric calibration is invalid.", "biometric_service_unavailable", 503) from exc
    if not np.isfinite(value) or value <= minimum or (maximum is not None and value >= maximum):
        raise BiometricError("Biometric calibration is invalid.", "biometric_service_unavailable", 503)
    return value


def required_int(name: str) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        raise BiometricError("Biometric calibration is not configured.", "biometric_service_unavailable", 503)
    try:
        value = int(raw)
    except ValueError as exc:
        raise BiometricError("Biometric calibration is invalid.", "biometric_service_unavailable", 503) from exc
    if value <= 0:
        raise BiometricError("Biometric calibration is invalid.", "biometric_service_unavailable", 503)
    return value


def required_sha256(name: str) -> str:
    raw = os.getenv(name, "").strip().lower()
    if len(raw) != 64 or any(character not in "0123456789abcdef" for character in raw):
        raise BiometricError("Biometric model checksum is invalid.", "biometric_service_unavailable", 503)
    return raw


def shared_secret() -> str:
    value = os.getenv("BIOMETRIC_SIDECAR_SHARED_SECRET", "").strip()
    if len(value) < 32 or any(character.isspace() for character in value):
        raise BiometricError("Biometric service is unavailable.", "biometric_service_unavailable", 503)
    return value


@lru_cache(maxsize=1)
def calibration() -> Calibration:
    return validate_calibration(Calibration(
        yunet_score_threshold=required_float("BIOMETRIC_YUNET_SCORE_THRESHOLD", maximum=1.0),
        min_face_px=required_int("BIOMETRIC_MIN_FACE_PX"),
        quality_laplacian_variance=required_float("BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE"),
        sface_cosine_threshold=required_float("BIOMETRIC_SFACE_COSINE_THRESHOLD", maximum=1.0),
        match_count=required_int("BIOMETRIC_MATCH_COUNT"),
        blink_threshold=required_float("BIOMETRIC_BLINK_THRESHOLD", maximum=1.0),
        head_turn_ratio=required_float("BIOMETRIC_HEAD_TURN_RATIO", maximum=1.0),
    ))


def validate_calibration(config: Calibration) -> Calibration:
    if (
        not np.isfinite(config.yunet_score_threshold)
        or config.yunet_score_threshold <= 0
        or config.yunet_score_threshold >= 1
        or config.min_face_px <= 0
        or not np.isfinite(config.sface_cosine_threshold)
        or config.sface_cosine_threshold <= 0
        or config.sface_cosine_threshold >= 1
    ):
        raise BiometricError("Biometric calibration is invalid.", "biometric_service_unavailable", 503)
    if config.match_count <= 1 or config.match_count > 30:
        raise BiometricError("Biometric calibration is invalid.", "biometric_service_unavailable", 503)
    return config


def storage_key() -> bytes:
    raw = os.getenv("BIOMETRIC_STORAGE_KEY_B64", "")
    try:
        key = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise BiometricError("Biometric protected storage is not configured.", "biometric_service_unavailable", 503) from exc
    if len(key) != 32:
        raise BiometricError("Biometric protected storage key must be 32 bytes.", "biometric_service_unavailable", 503)
    return key


def sidecar_auth() -> None:
    expected = shared_secret()
    provided = request.headers.get("X-DentiSys-Sidecar-Secret", "")
    if not secrets.compare_digest(provided, expected):
        raise BiometricError("Biometric service is unavailable.", "biometric_service_unavailable", 503)


@app.before_request
def authenticate_private_route():
    if request.path != "/health":
        sidecar_auth()


def decode_frame(data: bytes) -> np.ndarray:
    if not data:
        raise BiometricError("Biometric frame is empty.", "quality_failed")
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise BiometricError("Biometric frame could not be decoded.", "quality_failed")
    return image


FACE_ISSUE_MESSAGES = {
    "no_face": "Capture must contain exactly one visible face.",
    "multiple_faces": "Capture must contain exactly one visible face.",
    "low_quality": "Capture quality is insufficient.",
}


_YUNET_LOCK = threading.Lock()
_SFACE_LOCK = threading.Lock()


def assess_face(image: np.ndarray, config: Calibration) -> tuple[np.ndarray | None, str | None]:
    """Return an aligned face crop for a usable frame, or its quality issue."""
    height, width = image.shape[:2]
    detector = yunet_detector()
    with _YUNET_LOCK:
        detector.setInputSize((width, height))
        _, faces = detector.detect(image)
    if faces is None or len(faces) == 0:
        return None, "no_face"
    faces = [
        face for face in faces
        if float(face[2]) >= config.min_face_px and float(face[3]) >= config.min_face_px
    ]
    if len(faces) == 0:
        return None, "no_face"
    if len(faces) > 1:
        return None, "multiple_faces"
    face = faces[0]
    with _SFACE_LOCK:
        crop = face_recognizer().alignCrop(image, face)
    if crop is None or crop.size == 0:
        return None, "low_quality"
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    if float(cv2.Laplacian(gray, cv2.CV_64F).var()) < config.quality_laplacian_variance:
        return None, "low_quality"
    return crop, None


def face_crop(image: np.ndarray, config: Calibration) -> np.ndarray:
    crop, issue = assess_face(image, config)
    if issue is not None or crop is None:
        raise BiometricError(
            FACE_ISSUE_MESSAGES.get(issue or "low_quality", "Capture quality is insufficient."),
            "quality_failed",
        )
    return crop


@lru_cache(maxsize=1)
def face_landmarker():
    model_path = os.getenv("MEDIAPIPE_FACE_LANDMARKER_MODEL_PATH", "").strip()
    if not model_path or not Path(model_path).is_file():
        raise BiometricError("MediaPipe Face Landmarker is not configured.", "biometric_service_unavailable", 503)
    expected_checksum = required_sha256("MEDIAPIPE_FACE_LANDMARKER_SHA256")
    digest = hashlib.sha256()
    try:
        with Path(model_path).open("rb") as model_file:
            for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise BiometricError("MediaPipe Face Landmarker is not configured.", "biometric_service_unavailable", 503) from exc
    if not secrets.compare_digest(digest.hexdigest(), expected_checksum):
        raise BiometricError("MediaPipe Face Landmarker checksum does not match.", "biometric_service_unavailable", 503)
    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.IMAGE,
        num_faces=1,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
    )
    return vision.FaceLandmarker.create_from_options(options)


def checked_model_path(path_name: str, checksum_name: str, label: str) -> str:
    model_path = os.getenv(path_name, "").strip()
    if not model_path or not Path(model_path).is_file():
        raise BiometricError(f"{label} is not configured.", "biometric_service_unavailable", 503)
    expected_checksum = required_sha256(checksum_name)
    digest = hashlib.sha256()
    try:
        with Path(model_path).open("rb") as model_file:
            for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise BiometricError(f"{label} is not configured.", "biometric_service_unavailable", 503) from exc
    if not secrets.compare_digest(digest.hexdigest(), expected_checksum):
        raise BiometricError(f"{label} checksum does not match.", "biometric_service_unavailable", 503)
    return model_path


@lru_cache(maxsize=1)
def yunet_detector():
    model_path = checked_model_path(
        "BIOMETRIC_YUNET_MODEL_PATH", "BIOMETRIC_YUNET_SHA256", "YuNet model"
    )
    return cv2.FaceDetectorYN.create(
        model_path, "", (320, 320), calibration().yunet_score_threshold
    )


@lru_cache(maxsize=1)
def face_recognizer():
    model_path = checked_model_path(
        "BIOMETRIC_SFACE_MODEL_PATH", "BIOMETRIC_SFACE_SHA256", "SFace model"
    )
    return cv2.FaceRecognizerSF.create(model_path, "")


def landmark_points(image: np.ndarray) -> list[tuple[float, float]]:
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = face_landmarker().detect(mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=rgb,
    ))
    if not result.face_landmarks:
        raise BiometricError("Liveness face landmarks could not be detected.", "liveness_failed")
    height, width = image.shape[:2]
    return [(point.x * width, point.y * height) for point in result.face_landmarks[0]]


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return float(np.linalg.norm(np.asarray(a) - np.asarray(b)))


def liveness_action(image: np.ndarray, config: Calibration) -> str | None:
    points = landmark_points(image)
    return liveness_action_from_points(points, config)


def liveness_action_from_points(points: list[tuple[float, float]], config: Calibration) -> str | None:
    left_eye = [33, 160, 158, 133, 153, 144]
    right_eye = [362, 385, 387, 263, 373, 380]

    def ear(indices: list[int]) -> float:
        p = [points[index] for index in indices]
        return (distance(p[1], p[5]) + distance(p[2], p[4])) / max(2 * distance(p[0], p[3]), 1e-9)

    if min(ear(left_eye), ear(right_eye)) < config.blink_threshold:
        return "blink"
    nose_x = points[1][0]
    eye_center = (points[33][0] + points[263][0]) / 2
    eye_width = max(distance(points[33], points[263]), 1e-9)
    yaw_ratio = (nose_x - eye_center) / eye_width
    # Uploaded frames are unmirrored camera images while the student sees a
    # mirrored preview. When the student turns toward their own left, the
    # nose moves toward the right edge of the unmirrored image.
    if yaw_ratio > config.head_turn_ratio:
        return "turn_left"
    if yaw_ratio < -config.head_turn_ratio:
        return "turn_right"
    return None


def guidance_action(image: np.ndarray, config: Calibration) -> tuple[str | None, bool]:
    """Return transient display guidance without changing challenge state.

    The browser uses this only to pace its prompts. The final enrollment or
    verification request still runs the authoritative ordered liveness check.
    """
    try:
        points = landmark_points(image)
    except BiometricError as error:
        if error.code == "liveness_failed":
            return None, False
        raise
    return liveness_action_from_points(points, config), True


def validate_actions(raw: str | None) -> list[str]:
    try:
        actions = json.loads(raw or "[]")
    except json.JSONDecodeError as exc:
        raise BiometricError("Liveness challenge is invalid.", "liveness_failed") from exc
    if not isinstance(actions, list) or len(actions) != 2 or len(set(actions)) != 2:
        raise BiometricError("Liveness challenge is invalid.", "liveness_failed")
    if any(action not in {"blink", "turn_left", "turn_right"} for action in actions):
        raise BiometricError("Liveness challenge is invalid.", "liveness_failed")
    return actions


def verify_liveness(images: Iterable[np.ndarray], actions: list[str], config: Calibration) -> None:
    required_index = 0
    for image in images:
        detected = liveness_action(image, config)
        if detected is not None and detected == actions[required_index]:
            required_index += 1
            if required_index == len(actions):
                return
    raise BiometricError("Liveness challenge was not completed.", "liveness_failed")


def reference_token(reference: str, kind: str) -> str:
    prefix = kind + "/"
    if not reference.startswith(prefix):
        raise BiometricError("Biometric reference is invalid.", "biometric_service_unavailable", 503)
    token = reference[len(prefix):]
    if len(token) != 32 or any(character not in "0123456789abcdef" for character in token):
        raise BiometricError("Biometric reference is invalid.", "biometric_service_unavailable", 503)
    return token


def model_reference_path(reference: str) -> Path:
    return STORAGE_DIR / (reference_token(reference, "sface") + ".sface")


def revoke_reference_path(reference: str) -> Path:
    if reference.startswith("sface/"):
        return STORAGE_DIR / (reference_token(reference, "sface") + ".sface")
    if reference.startswith("lbph/"):
        return STORAGE_DIR / (reference_token(reference, "lbph") + ".lbph")
    raise BiometricError("Biometric reference is invalid.", "biometric_service_unavailable", 503)


def encrypt_model(model: bytes, reference: str) -> bytes:
    nonce = os.urandom(12)
    ciphertext = AESGCM(storage_key()).encrypt(nonce, model, reference.encode("utf-8"))
    return b"DSBIO1" + nonce + ciphertext


def decrypt_model(blob: bytes, reference: str) -> bytes:
    if not blob.startswith(b"DSBIO1") or len(blob) <= 18:
        raise BiometricError("Biometric reference is invalid.", "biometric_service_unavailable", 503)
    try:
        return AESGCM(storage_key()).decrypt(blob[6:18], blob[18:], reference.encode("utf-8"))
    except Exception as exc:
        raise BiometricError("Biometric reference could not be opened.", "biometric_service_unavailable", 503) from exc


def face_embedding(crop: np.ndarray) -> np.ndarray:
    with _SFACE_LOCK:
        vector = np.asarray(face_recognizer().feature(crop), dtype=np.float32).reshape(-1)
    norm = float(np.linalg.norm(vector))
    if vector.size != 128 or not np.isfinite(vector).all() or not np.isfinite(norm) or norm <= 0:
        raise BiometricError("Biometric service is unavailable.", "biometric_service_unavailable", 503)
    return np.asarray(vector / norm, dtype=np.float32)


def template_from_bytes(template: bytes) -> np.ndarray:
    if len(template) != 128 * 4:
        raise BiometricError("Biometric reference is invalid.", "biometric_service_unavailable", 503)
    vector = np.frombuffer(template, dtype="<f4")
    norm = float(np.linalg.norm(vector))
    if not np.isfinite(vector).all() or not np.isfinite(norm) or norm <= 0:
        raise BiometricError("Biometric reference is invalid.", "biometric_service_unavailable", 503)
    return np.asarray(vector / norm, dtype=np.float32)


def uploaded_images() -> list[np.ndarray]:
    files = request.files.getlist("frames")
    if not files or len(files) > 30:
        raise BiometricError("An operation accepts between one and thirty frames.", "quality_failed")
    return [decode_frame(file.read()) for file in files]


def guidance_image() -> np.ndarray:
    files = request.files.getlist("frame") or request.files.getlist("frames")
    if len(files) != 1:
        raise BiometricError("Exactly one guidance frame is required.", "quality_failed")
    return decode_frame(files[0].read())


@app.errorhandler(BiometricError)
def handle_biometric_error(error: BiometricError):
    return jsonify({"ok": False, "code": error.code, "message": str(error)}), error.status


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception):
    app.logger.exception("biometric sidecar failure", exc_info=error)
    return jsonify({"ok": False, "code": "biometric_service_unavailable", "message": "Biometric service is unavailable."}), 503


@app.get("/health")
def health():
    validate_calibration(calibration())
    shared_secret()
    storage_key()
    face_landmarker()
    yunet_detector()
    face_recognizer()
    return jsonify({"status": "ok", "service": "biometric"})


@app.post("/v1/enrollment")
def enrollment():
    config = calibration()
    actions = validate_actions(request.form.get("challengeActions"))
    images = uploaded_images()
    crops: list[np.ndarray] = []
    for image in images:
        try:
            crop = face_crop(image, config)
        except BiometricError as error:
            if error.code != "quality_failed":
                raise
            continue
        crops.append(crop)
    if len(crops) < 20:
        raise BiometricError("At least twenty usable enrollment samples are required.", "quality_failed")
    # Head-turn frames often fail the frontal detector, so liveness is checked
    # on every uploaded frame, in upload order.
    verify_liveness(images, actions, config)
    usable = min(len(crops), 30)
    embeddings = [face_embedding(crop) for crop in crops[:usable]]
    template = np.mean(np.stack(embeddings).astype(np.float64), axis=0)
    norm = float(np.linalg.norm(template))
    if not np.isfinite(template).all() or not np.isfinite(norm) or norm <= 0:
        raise BiometricError("Biometric service is unavailable.", "biometric_service_unavailable", 503)
    template_bytes = np.asarray(template / norm, dtype="<f4").tobytes()
    reference = "sface/" + uuid.uuid4().hex
    path = model_reference_path(reference)
    encrypted = encrypt_model(template_bytes, reference)
    temporary = path.with_suffix(".tmp-" + secrets.token_hex(8))
    try:
        temporary.write_bytes(encrypted)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return jsonify({"ok": True, "protectedObjectReference": reference, "usableSampleCount": usable})


@app.post("/v1/verify")
def verify():
    config = calibration()
    reference = request.form.get("protectedObjectReference", "")
    if not reference:
        raise BiometricError("Biometric reference is invalid.", "biometric_service_unavailable", 503)
    actions = validate_actions(request.form.get("challengeActions"))
    images = uploaded_images()
    verify_liveness(images, actions, config)
    if not reference.startswith("sface/"):
        raise BiometricError("Biometric reference is invalid.", "biometric_service_unavailable", 503)
    model = decrypt_model(model_reference_path(reference).read_bytes(), reference)
    template = template_from_bytes(model)
    matches = 0
    usable = 0
    for image in images:
        try:
            crop = face_crop(image, config)
        except BiometricError as error:
            if error.code != "quality_failed":
                raise
            continue
        usable += 1
        similarity = float(np.dot(face_embedding(crop), template))
        if similarity >= config.sface_cosine_threshold:
            matches += 1
    if usable < config.match_count:
        raise BiometricError("Not enough clear face frames were captured. Face the camera in good light and retry.", "quality_failed")
    if matches < config.match_count:
        raise BiometricError("Face could not be verified.", "biometric_verification_failed")
    return jsonify({"ok": True, "verified": True})


@app.post("/v1/guidance")
def guidance():
    config = calibration()
    image = guidance_image()
    detected_action, face_detected = guidance_action(image, config)
    _, issue = assess_face(image, config)
    return jsonify({
        "ok": True,
        "detectedAction": detected_action,
        "faceDetected": face_detected,
        "usable": issue is None,
        "issue": issue,
    })


@app.post("/v1/reference/revoke")
def revoke_reference():
    payload = request.get_json(silent=True) or {}
    reference = str(payload.get("protectedObjectReference", ""))
    if reference:
        path = revoke_reference_path(reference)
        if path.exists():
            path.unlink()
    return jsonify({"ok": True})
