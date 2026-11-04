"""Benchmark face driver. Runs INSIDE the biometric container and talks to the sidecar on 127.0.0.1:8000.
Standard library only, except `capture`, which also uses cv2 and numpy (both are in the container).

  face.py run <dir> <seconds> <concurrency,csv> <guidanceCalls> <guidanceIntervalMs> <limitSeconds>
      enroll a temporary reference from <dir>, run simulated check-ins, ALWAYS revoke, print JSON
  face.py revoke-leftover <dir>   revoke the reference recorded in <dir>/ref.txt (cleanup after a crash)
  face.py capture <video> <outdir>  turn a selfie video into the app-style frame sets, validated against the service
"""
import base64, http.client, io, json, os, sys, tarfile, threading, time, uuid

HOST, PORT = "127.0.0.1", 8000
SECRET = os.environ.get("BIOMETRIC_SIDECAR_SHARED_SECRET", "")


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{n}"\r\n\r\n{v}\r\n'.encode() for n, v in fields]
    for n, name, data in files:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{n}"; filename="{name}"\r\nContent-Type: image/jpeg\r\n\r\n'.encode() + data + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def post(path, body, content_type, timeout=60):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    try:
        conn.request("POST", path, body, {"Content-Type": content_type, "X-DentiSys-Sidecar-Secret": SECRET})
        response = conn.getresponse()
        raw = response.read()
        try:
            data = json.loads(raw)
        except ValueError:
            data = {}
        return response.status, data
    finally:
        conn.close()


def enroll(frames, actions):
    body, ctype = multipart([("challengeActions", json.dumps(actions))], [("frames", f"f{i}.jpg", f) for i, f in enumerate(frames)])
    status, data = post("/v1/enrollment", body, ctype)
    if status != 200 or not data.get("ok"):
        raise RuntimeError(f"enrollment failed: HTTP {status} {data.get('code', '')}")
    return data["protectedObjectReference"]


def verify(reference, frames, action):
    body, ctype = multipart([("protectedObjectReference", reference), ("challengeActions", json.dumps([action]))],
                            [("frames", f"f{i}.jpg", f) for i, f in enumerate(frames)])
    return post("/v1/verify", body, ctype)


def guidance(frame):
    body, ctype = multipart([], [("frame", "f.jpg", frame)])
    return post("/v1/guidance", body, ctype)


def revoke(reference):
    post("/v1/reference/revoke", json.dumps({"protectedObjectReference": reference}).encode(), "application/json")


def read_set(directory, prefix):
    names = sorted(n for n in os.listdir(directory) if n.startswith(prefix) and n.endswith(".jpg"))
    return [open(os.path.join(directory, n), "rb").read() for n in names]


def percentile(sorted_values, p):
    return sorted_values[min(len(sorted_values) - 1, int(len(sorted_values) * p))] if sorted_values else None


def run(directory, seconds, concurrency, calls, interval_ms, limit):
    manifest = json.load(open(os.path.join(directory, "manifest.json")))
    enroll_frames, verify_frames = read_set(directory, "enroll-"), read_set(directory, "verify-")
    reference = enroll(enroll_frames, manifest["enrollActions"])
    open(os.path.join(directory, "ref.txt"), "w").write(reference)
    stages = {}
    try:
        for users in concurrency:
            results, lock = [], threading.Lock()
            start = time.time()
            deadline = start + seconds

            def student():
                while time.time() < deadline:
                    began, error, guide_times, verify_time = time.time(), None, [], None
                    try:
                        for i in range(calls):
                            call_start = time.time()
                            status, data = guidance(verify_frames[i % len(verify_frames)])
                            if status != 200:
                                raise RuntimeError(f"guidance HTTP {status}")
                            guide_times.append(time.time() - call_start)
                            # Paced like the phone: the rest of the interval, or the next call at once when the call was slower.
                            time.sleep(max(0.0, interval_ms / 1000 - (time.time() - call_start)))
                        call_start = time.time()
                        try:
                            status, data = verify(reference, verify_frames, manifest["verifyAction"])
                        finally:
                            verify_time = time.time() - call_start
                        if status != 200 or not data.get("verified"):
                            error = data.get("code") or f"verify HTTP {status}"
                    except Exception as exc:  # timeouts and refused connections count as failed check-ins
                        error = type(exc).__name__ if not isinstance(exc, RuntimeError) else str(exc)
                    with lock:
                        results.append((time.time() - began, error, guide_times, verify_time))

            threads = [threading.Thread(target=student) for _ in range(users)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            def stat(values, p):
                values = sorted(values)
                return round(percentile(values, p), 2) if values else None

            ok = [r for r in results if r[1] is None]
            errors = {}
            for r in results:
                if r[1]:
                    errors[r[1]] = errors.get(r[1], 0) + 1
            floor = calls * interval_ms / 1000   # the client pacing alone
            guides = [g for r in results for g in r[2]]
            verifies = [r[3] for r in results if r[3] is not None]
            stages[f"face-{users}"] = {
                "users": users, "start": int(start * 1000), "end": int(time.time() * 1000), "checkins": len(results),
                "checkinP50": stat([r[0] for r in ok], 0.5), "checkinP95": stat([r[0] for r in ok], 0.95),
                "addedP50": stat([r[0] - floor for r in ok], 0.5), "addedP95": stat([r[0] - floor for r in ok], 0.95),
                "guidanceP50": stat(guides, 0.5), "guidanceP95": stat(guides, 0.95),
                "verifyP50": stat(verifies, 0.5), "verifyP95": stat(verifies, 0.95),
                "over20s": sum(1 for v in verifies if v > limit), "errorCount": sum(errors.values()), "errors": errors,
            }
    finally:
        revoke(reference)
        os.remove(os.path.join(directory, "ref.txt"))
    print(json.dumps({"stages": stages}))


def revoke_leftover(directory):
    path = os.path.join(directory, "ref.txt")
    if os.path.exists(path):
        revoke(open(path).read().strip())
        os.remove(path)


def capture(video, outdir):
    import cv2  # container only

    def log(message):
        print(message, file=sys.stderr, flush=True)

    reader, frames = cv2.VideoCapture(video), []
    while True:
        ok, frame = reader.read()
        if not ok:
            break
        frames.append(frame)
    if len(frames) < 40:
        raise SystemExit(f"The video has only {len(frames)} readable frames; record about 5 seconds.")
    stride = max(1, len(frames) // 100)

    # Phones often store an upright video as landscape plus a rotation flag that the reader may ignore:
    # keep the rotation in which the face service finds a face in most of a few sample frames.
    rotations = {"none": None, "90cw": cv2.ROTATE_90_CLOCKWISE, "180": cv2.ROTATE_180, "90ccw": cv2.ROTATE_90_COUNTERCLOCKWISE}
    samples = frames[:: max(1, len(frames) // 8)][:8]
    scores = {}
    for name, code in rotations.items():
        found = 0
        for f in samples:
            g = f if code is None else cv2.rotate(f, code)
            found += int(bool(guidance(cv2.imencode(".jpg", g, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes())[1].get("usable")))
        scores[name] = found
    best = max(scores, key=scores.get)
    log(f"usable sample frames per rotation: {scores}; using {best}")
    if rotations[best] is not None:
        frames = [cv2.rotate(f, rotations[best]) for f in frames]

    # Same as the app's 640x480 camera request: landscape video -> 640x480, portrait (phone held upright) -> 480x640.
    h0, w0 = frames[0].shape[:2]
    out_w, out_h = (640, 480) if w0 >= h0 else (480, 640)

    def encode(frame):  # centre crop to the output aspect, resize, JPEG quality 0.85
        h, w = frame.shape[:2]
        cw = min(w, h * out_w // out_h)
        ch = cw * out_h // out_w
        x, y = (w - cw) // 2, (h - ch) // 2
        small = cv2.resize(frame[y:y + ch, x:x + cw], (out_w, out_h), interpolation=cv2.INTER_AREA)
        return cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()

    jpgs = [encode(f) for f in frames[::stride]]
    log(f"{len(frames)} video frames of {w0}x{h0} -> {out_w}x{out_h}, checking {len(jpgs)} with the face service ...")
    info = []
    for jpg in jpgs:
        status, data = guidance(jpg)
        if status != 200:
            raise SystemExit(f"Guidance failed: HTTP {status} {data.get('code', '')}")
        info.append(data)
    neutral = [i for i, d in enumerate(info) if d.get("faceDetected") and d.get("detectedAction") is None and d.get("usable")]
    seen = []
    for d in info:
        if d.get("faceDetected") and d.get("detectedAction") and d["detectedAction"] not in seen:
            seen.append(d["detectedAction"])
    issues = {}
    for d in info:
        key = "usable" if d.get("usable") else str(d.get("issue") or ("no face" if not d.get("faceDetected") else "not usable"))
        issues[key] = issues.get(key, 0) + 1
    log(f"usable neutral frames: {len(neutral)}; actions seen in order: {seen}; frame checks: {issues}")
    if len(neutral) < 8 or len(seen) < 2:
        raise SystemExit("The video needs a clear face (8+ good frames) and at least two of blink / turn left / turn right. Record it again.")
    first = {a: next(i for i, d in enumerate(info) if d.get("faceDetected") and d.get("detectedAction") == a) for a in seen}
    a1, a2 = seen[0], next(a for a in seen[1:] if first[a] > first[seen[0]])
    spread = [neutral[k * len(neutral) // 28 % len(neutral)] for k in range(28)]
    enroll_idx = spread[:10] + [first[a1]] + spread[10:19] + [first[a2]] + spread[19:28]
    reference = enroll([jpgs[i] for i in enroll_idx], [a1, a2])
    try:
        chosen = None
        for action in (a1, a2):
            idx = spread[:4] + [first[action]] + spread[4:8]
            status, data = verify(reference, [jpgs[i] for i in idx], action)
            log(f"verify with {action}: HTTP {status} {data.get('code', data.get('verified', ''))}")
            if status == 200 and data.get("verified"):
                chosen = (action, idx)
                break
    finally:
        revoke(reference)
    if not chosen:
        raise SystemExit("The recorded frames did not verify against their own enrollment (see lines above). Record again with good light, face centred.")
    os.makedirs(outdir, exist_ok=True)
    for n, i in enumerate(enroll_idx):
        open(os.path.join(outdir, f"enroll-{n:02d}.jpg"), "wb").write(jpgs[i])
    for n, i in enumerate(chosen[1]):
        open(os.path.join(outdir, f"verify-{n}.jpg"), "wb").write(jpgs[i])
    manifest = {"enrollActions": [a1, a2], "verifyAction": chosen[0], "size": [out_w, out_h], "jpegQuality": 0.85, "createdUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    json.dump(manifest, open(os.path.join(outdir, "manifest.json"), "w"))
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        tar.add(outdir, arcname=".")
    print("TGZB64:" + base64.b64encode(buffer.getvalue()).decode())


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "run":
        run(sys.argv[2], float(sys.argv[3]), [int(x) for x in sys.argv[4].split(",")], int(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7]))
    elif cmd == "revoke-leftover":
        revoke_leftover(sys.argv[2])
    elif cmd == "capture":
        capture(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
