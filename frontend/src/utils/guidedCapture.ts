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
 */
export async function runGuidedCapture(options: GuidedCaptureOptions): Promise<GuidedCaptureResult> {
  const wait = options.wait ?? defaultWait;
  const samplingIntervalMs = options.samplingIntervalMs ?? 140;
  const successPauseMs = options.successPauseMs ?? 1000;
  const baselineFrames = options.baselineFrames ?? 3;
  const targetFrames = Math.min(30, Math.max(20, options.targetFrames));
  const maxAttempts = options.maxAttempts ?? targetFrames * 8;
  const frames: Blob[] = [];
  let attempts = 0;
  let phase: 'baseline' | 'action' | 'complete' = 'baseline';
  let actionIndex: 0 | 1 = 0;
  let neutralStreak = 0;
  let sawFace = false;

  options.onPhase('phase1_neutral', 'Look directly into the camera and hold still.');

  while (frames.length < targetFrames && attempts < maxAttempts) {
    if (options.isCancelled()) return { status: 'cancelled', frames };
    attempts += 1;
    const frame = await options.captureFrame();
    if (!frame) {
      await wait(samplingIntervalMs);
      continue;
    }

    frames.push(frame);
    options.onFrameCount(frames.length);
    if (options.isCancelled()) return { status: 'cancelled', frames };

    const guidance = await options.analyzeFrame(frame);
    if (options.isCancelled()) return { status: 'cancelled', frames };
    sawFace ||= guidance.faceDetected;

    if (phase === 'complete') {
      await wait(samplingIntervalMs);
      continue;
    }

    if (phase === 'baseline') {
      if (guidance.faceDetected && guidance.detectedAction === null) {
        neutralStreak += 1;
      } else {
        neutralStreak = 0;
      }
      if (neutralStreak >= baselineFrames) {
        phase = 'action';
        neutralStreak = 0;
        options.onPhase(actionPhase(actionIndex), actionInstruction(options.actions[actionIndex]));
      }
    } else if (guidance.detectedAction === options.actions[actionIndex]) {
      const completedAction = options.actions[actionIndex];
      await options.onActionSuccess?.(actionIndex, completedAction);
      if (options.isCancelled()) return { status: 'cancelled', frames };
      await wait(successPauseMs);
      if (options.isCancelled()) return { status: 'cancelled', frames };

      if (actionIndex === 1) {
        phase = 'complete';
        options.onPhase('complete', 'Liveness actions complete. Hold still while we finish capture.');
      } else {
        actionIndex = 1;
        phase = 'baseline';
        options.onPhase('phase1_neutral', 'Return to a neutral forward position, then hold still.');
      }
    }

    await wait(samplingIntervalMs);
  }

  if (options.isCancelled()) return { status: 'cancelled', frames };
  if (phase === 'complete' && frames.length >= targetFrames) {
    return { status: 'complete', frames };
  }
  return {
    status: 'timeout',
    frames,
    expectedAction: options.actions[actionIndex],
    reason: frames.length === 0
      ? 'camera_frame_unavailable'
      : sawFace
        ? 'action_not_observed'
        : 'face_not_detected',
  };
}
