import type { LivenessAction } from '../types';

export type GuidedCapturePhase =
  | 'idle'
  | 'phase1_neutral'
  | 'phase2_action1'
  | 'phase3_action2'
  | 'complete'
  | 'uploading';

export interface GuidedFrameGuidance {
  detectedAction: LivenessAction | null;
  faceDetected: boolean;
}

export interface GuidedCaptureOptions {
  actions: [LivenessAction, LivenessAction];
  targetFrames: number;
  maxAttempts?: number;
  captureFrame: () => Promise<Blob | null>;
  analyzeFrame: (frame: Blob) => Promise<GuidedFrameGuidance>;
  isCancelled: () => boolean;
  onPhase: (phase: GuidedCapturePhase, instruction: string) => void;
  onFrameCount: (count: number) => void;
  onActionSuccess?: (index: 0 | 1, action: LivenessAction) => void | Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
  samplingIntervalMs?: number;
  successPauseMs?: number;
  baselineFrames?: number;
  maxConsecutiveAnalyzeFailures?: number;
}

export type GuidedCaptureResult =
  | { status: 'complete'; frames: Blob[] }
  | { status: 'cancelled'; frames: Blob[] }
  | {
      status: 'timeout';
      frames: Blob[];
      expectedAction: LivenessAction;
      reason: 'face_not_detected' | 'action_not_observed' | 'camera_frame_unavailable';
    };

interface CapturedFrame {
  order: number;
  frame: Blob;
}

const defaultWait = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

function actionPhase(index: 0 | 1): GuidedCapturePhase {
  return index === 0 ? 'phase2_action1' : 'phase3_action2';
}

function actionInstruction(action: LivenessAction): string {
  switch (action) {
    case 'blink':
      return 'Blink naturally while looking at the camera.';
    case 'turn_left':
      return 'Slowly turn your head left, then return to center.';
    case 'turn_right':
      return 'Slowly turn your head right, then return to center.';
  }
}

/**
 * Pace capture from measured sidecar guidance. The guidance result only
 * controls prompts; the final upload remains the server liveness authority.
 *
 * Only useful frames are kept: frames showing one neutral face, plus the two
 * frames in which the required actions were observed. Unusable frames are
 * discarded instead of consuming the upload budget, so a slower student is not
 * timed out just because the frame counter filled up during the baseline.
 * Returned frames stay in capture order so the server sees the actions in the
 * challenge order.
 */
export async function runGuidedCapture(options: GuidedCaptureOptions): Promise<GuidedCaptureResult> {
  const wait = options.wait ?? defaultWait;
  const samplingIntervalMs = options.samplingIntervalMs ?? 140;
  const successPauseMs = options.successPauseMs ?? 1000;
  const baselineFrames = options.baselineFrames ?? 3;
  const targetFrames = Math.min(30, Math.max(20, options.targetFrames));
  const maxAttempts = options.maxAttempts ?? targetFrames * 8;
  const maxConsecutiveAnalyzeFailures = options.maxConsecutiveAnalyzeFailures ?? 3;
  const neutralTarget = targetFrames - 2;

  const neutralFrames: CapturedFrame[] = [];
  const actionFrames: CapturedFrame[] = [];
  let nextOrder = 0;
  let attempts = 0;
  let phase: 'baseline' | 'action' | 'complete' = 'baseline';
  let actionIndex: 0 | 1 = 0;
  let neutralStreak = 0;
  let sawFace = false;
  let capturedAny = false;
  let consecutiveAnalyzeFailures = 0;

  const selectedFrames = (): Blob[] =>
    [...actionFrames, ...neutralFrames.slice(-neutralTarget)]
      .sort((a, b) => a.order - b.order)
      .map(item => item.frame);

  const reportCount = (): void => {
    options.onFrameCount(Math.min(neutralFrames.length, neutralTarget) + actionFrames.length);
  };

  options.onPhase('phase1_neutral', 'Look directly into the camera and hold still.');

  while (attempts < maxAttempts) {
    if (phase === 'complete' && neutralFrames.length >= neutralTarget) break;
    if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };
    attempts += 1;
    const frame = await options.captureFrame();
    if (!frame) {
      await wait(samplingIntervalMs);
      continue;
    }
    capturedAny = true;
    if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };

    let guidance: GuidedFrameGuidance;
    try {
      guidance = await options.analyzeFrame(frame);
      consecutiveAnalyzeFailures = 0;
    } catch (error) {
      if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };
      consecutiveAnalyzeFailures += 1;
      if (consecutiveAnalyzeFailures >= maxConsecutiveAnalyzeFailures) throw error;
      await wait(samplingIntervalMs);
      continue;
    }
    if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };
    sawFace ||= guidance.faceDetected;

    const frameOrder = nextOrder;
    nextOrder += 1;
    const isNeutral = guidance.faceDetected && guidance.detectedAction === null;

    if (phase === 'action' && guidance.faceDetected && guidance.detectedAction === options.actions[actionIndex]) {
      actionFrames.push({ order: frameOrder, frame });
      reportCount();
      const completedAction = options.actions[actionIndex];
      await options.onActionSuccess?.(actionIndex, completedAction);
      if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };
      await wait(successPauseMs);
      if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };

      if (actionIndex === 1) {
        phase = 'complete';
        options.onPhase('complete', 'Liveness actions complete. Hold still while we finish capture.');
      } else {
        actionIndex = 1;
        phase = 'baseline';
        neutralStreak = 0;
        options.onPhase('phase1_neutral', 'Return to a neutral forward position, then hold still.');
      }
      await wait(samplingIntervalMs);
      continue;
    }

    if (isNeutral) {
      neutralFrames.push({ order: frameOrder, frame });
      // Keep memory bounded; only the most recent neutral frames are uploaded.
      if (neutralFrames.length > targetFrames) neutralFrames.shift();
      reportCount();
    }

    if (phase === 'baseline') {
      neutralStreak = isNeutral ? neutralStreak + 1 : 0;
      if (neutralStreak >= baselineFrames) {
        phase = 'action';
        neutralStreak = 0;
        options.onPhase(actionPhase(actionIndex), actionInstruction(options.actions[actionIndex]));
      }
    }

    await wait(samplingIntervalMs);
  }

  if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };
  if (phase === 'complete' && neutralFrames.length >= neutralTarget) {
    return { status: 'complete', frames: selectedFrames() };
  }
  return {
    status: 'timeout',
    frames: selectedFrames(),
    expectedAction: options.actions[actionIndex],
    reason: !capturedAny
      ? 'camera_frame_unavailable'
      : sawFace
        ? 'action_not_observed'
        : 'face_not_detected',
  };
}
