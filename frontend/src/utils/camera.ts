export type CameraDevice = Pick<MediaDeviceInfo, 'deviceId' | 'label' | 'groupId'>;

function mediaDeviceErrorName(error: unknown): string {
  if (error instanceof DOMException) {
    return error.name;
  }
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name?: unknown }).name || '');
  }
  return '';
}

export function describeCameraError(error: unknown): string {
  switch (mediaDeviceErrorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow camera access for this local DentiSys site, then choose Retry Camera Access.';
    case 'NotReadableError':
      return 'The camera could not be opened. Close other apps or browser tabs using the camera, then choose Retry Camera Access or select another camera.';
    case 'OverconstrainedError':
      return 'The selected camera does not support the requested preview mode. Choose another camera or retry with the default camera.';
    case 'NotFoundError':
      return 'No camera was detected. Connect or enable a camera, then choose Retry Camera Access.';
    case 'AbortError':
      return 'The camera start was interrupted. Choose Retry Camera Access.';
    default:
      return error instanceof Error && error.message
        ? `Unable to start the camera: ${error.message}`
        : 'Unable to start the camera. Check camera access and choose Retry Camera Access.';
  }
}

export async function listCameraDevices(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(device => device.kind === 'videoinput')
    .map(device => ({
      deviceId: device.deviceId,
      label: device.label || 'Available camera',
      groupId: device.groupId,
    }));
}

function cameraConstraints(deviceId?: string): MediaStreamConstraints[] {
  if (deviceId) {
    return [
      {
        audio: false,
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      },
      {
        audio: false,
        video: { deviceId: { exact: deviceId } },
      },
    ];
  }

  return [
    {
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    },
    {
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
    },
    { audio: false, video: true },
  ];
}

function abortError(): DOMException {
  return new DOMException('Camera start was interrupted.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

async function waitForVideoReady(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const playPromise = video.play();
  await (signal
    ? Promise.race([
      playPromise,
      new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
      }),
    ])
    : playPromise);
  throwIfAborted(signal);
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timeout = window.setTimeout(() => {
      video.removeEventListener('loadedmetadata', handleMetadata);
      signal?.removeEventListener('abort', handleAbort);
      reject(new Error('The camera opened but did not provide a video frame.'));
    }, 2500);

    function handleAbort(): void {
      window.clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', handleMetadata);
      reject(abortError());
    }

    function handleMetadata(): void {
      window.clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', handleMetadata);
      signal?.removeEventListener('abort', handleAbort);
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        resolve();
      } else {
        reject(new Error('The camera opened but did not provide a video frame.'));
      }
    }

    video.addEventListener('loadedmetadata', handleMetadata, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function getUserMediaWithTimeout(
  constraints: MediaStreamConstraints,
  signal?: AbortSignal,
  timeoutMs = 10000,
): Promise<MediaStream> {
  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      settleReject(new Error('The camera did not respond. Check browser permissions and whether another app is using the camera.'));
    }, timeoutMs);

    const cleanup = (): void => {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', handleAbort);
    };

    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleAbort = (): void => {
      settleReject(abortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }

    void navigator.mediaDevices.getUserMedia(constraints).then(
      stream => {
        if (settled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        settled = true;
        cleanup();
        resolve(stream);
      },
      error => {
        settleReject(error);
      },
    );
  });
}

export async function startCameraStream(
  video: HTMLVideoElement,
  deviceId?: string,
  signal?: AbortSignal,
): Promise<MediaStream> {
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    throw new Error('Camera access requires HTTPS or localhost.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not provide camera access.');
  }

  let lastError: unknown = null;
  const availableDeviceIds = deviceId
    ? [deviceId]
    : (await listCameraDevices()).map(device => device.deviceId).filter(Boolean);
  const candidateDeviceIds = deviceId ? availableDeviceIds : [undefined, ...availableDeviceIds];

  for (const candidateDeviceId of candidateDeviceIds) {
    for (const constraints of cameraConstraints(candidateDeviceId)) {
      throwIfAborted(signal);
      let stream: MediaStream | null = null;
      try {
        stream = await getUserMediaWithTimeout(constraints, signal);
        video.srcObject = stream;
        await waitForVideoReady(video, signal);
        return stream;
      } catch (error) {
        lastError = error;
        stream?.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('The camera could not be opened.');
}
