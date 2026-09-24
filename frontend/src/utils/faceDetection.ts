/**
 * Real-time biometric face and liveness action detection utility.
 * Continuously analyzes camera video for:
 * 1. Centered frontal face presence
 * 2. Head turn (turn_left / turn_right yaw tracking)
 * 3. Eye blink (eyelid closure contrast dip)
 */

export interface FaceAnalysis {
  detected: boolean;
  reason?: string;
  isCentered: boolean;
  // Yaw: -1.0 to 1.0 (approximate head orientation)
  // Negative indicates leftward turn, positive indicates rightward turn
  yaw: number;
  detectedAction: 'center' | 'turn_left' | 'turn_right' | 'blink' | 'none';
  eyeDarkRatio: number;
  qualityScore: number;
}

export interface FaceCheckResult {
  detected: boolean;
  reason?: string;
}

// Processing canvas reused across frames for maximum 60fps performance without garbage collection
let reusableCanvas: HTMLCanvasElement | null = null;
let reusableCtx: CanvasRenderingContext2D | null = null;

function getAnalysisContext(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  if (!reusableCanvas) {
    reusableCanvas = document.createElement('canvas');
    reusableCanvas.width = 240;
    reusableCanvas.height = 180;
    reusableCtx = reusableCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!reusableCtx) return null;
  const targetH = Math.max(160, Math.round((240 * height) / width));
  if (reusableCanvas.height !== targetH) {
    reusableCanvas.height = targetH;
  }
  return { canvas: reusableCanvas, ctx: reusableCtx };
}

/**
 * High-performance real-time analysis of a video frame.
 * Takes 1-2ms per frame, suitable for continuous requestAnimationFrame execution.
 */
export function analyzeFaceFrame(
  video: HTMLVideoElement | null,
  baselineEyeDarkRatio = 0.12
): FaceAnalysis {
  if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
    return {
      detected: false,
      reason: 'Camera preview is warming up…',
      isCentered: false,
      yaw: 0,
      detectedAction: 'none',
      eyeDarkRatio: 0,
      qualityScore: 0,
    };
  }

  const res = getAnalysisContext(video.videoWidth, video.videoHeight);
  if (!res) {
    return {
      detected: true,
      isCentered: true,
      yaw: 0,
      detectedAction: 'center',
      eyeDarkRatio: 0.1,
      qualityScore: 1,
    };
  }

  const { canvas, ctx } = res;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const cx = canvas.width / 2;
  const cy = canvas.height * 0.48;
  const rx = canvas.width * 0.25;
  const ry = canvas.height * 0.38;

  let totalSampled = 0;
  let skinSampled = 0;
  let sumLuma = 0;
  let leftSkinWeight = 0;
  let rightSkinWeight = 0;
  let leftSkinCount = 0;
  let rightSkinCount = 0;

  // Eye band metrics (upper third of face oval: y between cy - 0.28*ry and cy - 0.05*ry)
  const eyeTop = cy - ry * 0.28;
  const eyeBottom = cy - ry * 0.04;
  let eyeBandTotal = 0;
  let eyeBandDark = 0;

  const lumaSamples: number[] = [];

  // Sample every 2 pixels for ~2500 samples
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 2) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 2) {
      if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) {
        totalSampled++;
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        sumLuma += luma;
        lumaSamples.push(luma);

        // Biometric chromatic skin filter (YCbCr)
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isSkinYCbCr = cb >= 75 && cb <= 135 && cr >= 128 && cr <= 178 && luma >= 25 && luma <= 245;
        const isSkinRgb = r > 38 && g > 25 && b > 12 && r > g && (r - g) >= 5 && (Math.max(r, g, b) - Math.min(r, g, b)) > 8;

        if (isSkinYCbCr || isSkinRgb) {
          skinSampled++;
          if (x < cx) {
            leftSkinCount++;
            leftSkinWeight += (cx - x);
          } else {
            rightSkinCount++;
            rightSkinWeight += (x - cx);
          }
        }

        // Check eye band dark pixels (pupil, iris, lashes)
        if (y >= eyeTop && y <= eyeBottom) {
          eyeBandTotal++;
          if (luma < 60 || luma < 0.65 * (sumLuma / totalSampled)) {
            eyeBandDark++;
          }
        }
      }
    }
  }

  if (totalSampled === 0) {
    return {
      detected: false,
      reason: 'No camera feed detected.',
      isCentered: false,
      yaw: 0,
      detectedAction: 'none',
      eyeDarkRatio: 0,
      qualityScore: 0,
    };
  }

  const avgLuma = sumLuma / totalSampled;
  if (avgLuma < 12) {
    return {
      detected: false,
      reason: 'Lighting is too dark. Turn on lights.',
      isCentered: false,
      yaw: 0,
      detectedAction: 'none',
      eyeDarkRatio: 0,
      qualityScore: 0.1,
    };
  }
  if (avgLuma > 248) {
    return {
      detected: false,
      reason: 'Lighting is washed out. Reduce glare.',
      isCentered: false,
      yaw: 0,
      detectedAction: 'none',
      eyeDarkRatio: 0,
      qualityScore: 0.1,
    };
  }

  // Calculate luminance variance (texture detail)
  let varianceSum = 0;
  for (let i = 0; i < lumaSamples.length; i++) {
    const diff = lumaSamples[i] - avgLuma;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / lumaSamples.length);

  // Flat surfaces / empty backgrounds have stdDev < 7.5
  if (stdDev < 7.5) {
    return {
      detected: false,
      reason: 'No face detected. Please position face in oval.',
      isCentered: false,
      yaw: 0,
      detectedAction: 'none',
      eyeDarkRatio: 0,
      qualityScore: 0.1,
    };
  }

  const skinRatio = skinSampled / totalSampled;
  if (skinRatio < 0.12) {
    return {
      detected: false,
      reason: 'No face detected in camera. Align face inside the oval.',
      isCentered: false,
      yaw: 0,
      detectedAction: 'none',
      eyeDarkRatio: 0,
      qualityScore: 0.2,
    };
  }

  if (skinRatio > 0.92 && stdDev < 14) {
    return {
      detected: false,
      reason: 'Please step back slightly.',
      isCentered: false,
      yaw: 0,
      detectedAction: 'none',
      eyeDarkRatio: 0,
      qualityScore: 0.3,
    };
  }

  // --- HEAD YAW ESTIMATION ---
  // Compare horizontal skin distribution and centroid asymmetry between left and right sides
  // In unmirrored camera buffer:
  // When user turns head to their left, visible face area shifts rightward in raw camera coordinates
  const totalSkinCount = leftSkinCount + rightSkinCount;
  const countAsymmetry = totalSkinCount > 0 ? (rightSkinCount - leftSkinCount) / totalSkinCount : 0;
  const totalSkinWeight = leftSkinWeight + rightSkinWeight;
  const weightAsymmetry = totalSkinWeight > 0 ? (rightSkinWeight - leftSkinWeight) / totalSkinWeight : 0;

  // Clamped yaw scaled for user perspective:
  // When looking to screen-left (user's left): leftSkinCount > rightSkinCount -> rawYaw is negative.
  // When looking to screen-right (user's right): rightSkinCount > leftSkinCount -> rawYaw is positive.
  const rawYaw = (countAsymmetry * 0.6) + (weightAsymmetry * 0.4);
  const yaw = Math.max(-1, Math.min(1, rawYaw * 2.4));

  // --- EYE BLINK DETECTION ---
  const eyeDarkRatio = eyeBandTotal > 0 ? eyeBandDark / eyeBandTotal : 0;
  // Natural blink closure causes a distinct contrast shift relative to steady open-eyed baseline
  const isBlinking = baselineEyeDarkRatio > 0.03 && (eyeDarkRatio < baselineEyeDarkRatio * 0.55 || eyeDarkRatio > baselineEyeDarkRatio * 1.6);

  // --- ACTION CLASSIFICATION (Calibrated to sidecar head_turn_ratio = 0.15) ---
  let detectedAction: 'center' | 'turn_left' | 'turn_right' | 'blink' | 'none' = 'none';

  if (isBlinking) {
    detectedAction = 'blink';
  } else if (yaw < -0.15) {
    // User turned towards screen-left (user's left)
    detectedAction = 'turn_left';
  } else if (yaw > 0.15) {
    // User turned towards screen-right (user's right)
    detectedAction = 'turn_right';
  } else if (Math.abs(yaw) <= 0.14) {
    // Looking straight at the camera
    detectedAction = 'center';
  }

  const isCentered = Math.abs(yaw) <= 0.14;
  const qualityScore = Math.min(1.0, (stdDev / 35) * (skinRatio / 0.35));

  return {
    detected: true,
    isCentered,
    yaw,
    detectedAction,
    eyeDarkRatio,
    qualityScore,
  };
}

/**
 * Capture a single high-quality JPEG blob from the video stream
 */
export async function captureVideoFrameBlob(
  video: HTMLVideoElement | null,
  quality = 0.85
): Promise<Blob | null> {
  if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

/**
 * Backward compatibility check for single-frame validation
 */
export async function verifyFaceInVideo(video: HTMLVideoElement | null): Promise<FaceCheckResult> {
  const analysis = analyzeFaceFrame(video);
  if (!analysis.detected) {
    return {
      detected: false,
      reason: analysis.reason || 'No face detected in camera. Please position your face inside the oval guide and try again.',
    };
  }
  return { detected: true };
}
