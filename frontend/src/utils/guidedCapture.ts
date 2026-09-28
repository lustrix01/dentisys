import type { LivenessAction } from '../types';

export type GuidedCapturePhase =
  | 'idle'
  | 'phase1_neutral'
  | 'phase2_action1'
  | 'phase3_action2'
  | 'complete'
  | 'uploading';

/** Why the current camera frame cannot be used (from the sidecar guidance). */
export type GuidanceIssue = 'no_face' | 'multiple_faces' | 'low_quality';

export interface GuidedFrameGuidance {
  detectedAction: LivenessAction | null;
  faceDetected: boolean;
  /** True when the frame passes the same face/quality check the server uses. Undefined = not reported. */
  usable?: boolean | null;
  issue?: GuidanceIssue | null;
}

export interface GuidedCaptureOptions {
  actions: [LivenessAction, LivenessAction];
  targetFrames: number;
  maxAttempts?: number;
  /** Epoch milliseconds after which capture stops (set a few seconds before the challenge expires). */
  deadlineMs?: number;
  now?: () => number;
  captureFrame: () => Promise<Blob | null>;
  analyzeFrame: (frame: Blob) => Promise<GuidedFrameGuidance>;
  isCancelled: () => boolean;
  onPhase: (phase: GuidedCapturePhase, instruction: string) => void;
  onFrameCount: (count: number) => void;
  onActionSuccess?: (index: 0 | 1, action: LivenessAction) => void | Promise<void>;
  /** Called with a live problem (after a few consecutive bad frames) and with null once frames are usable again. */
  onIssue?: (issue: GuidanceIssue | null) => void;
  wait?: (milliseconds: number) => Promise<void>;
  samplingIntervalMs?: number;
  successPauseMs?: number;
  maxConsecutiveAnalyzeFailures?: number;
  issueAfterFrames?: number;
}

export type GuidedCaptureResult =
  | { status: 'complete'; frames: Blob[] }
  | { status: 'cancelled'; frames: Blob[] }
  | {
      status: 'timeout';
      frames: Blob[];
      expectedAction: LivenessAction;
      reason: 'face_not_detected' | 'action_not_observed' | 'frames_not_usable' | 'camera_frame_unavailable' | 'challenge_expired';
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

/** Split the neutral samples into the three neutral steps (before, between and after the actions). */
export function neutralSegments(neutralTarget: number): [number, number, number] {
  const base = Math.floor(neutralTarget / 3);
  const extra = neutralTarget - base * 3;
  return [base + (extra > 0 ? 1 : 0), base + (extra > 1 ? 1 : 0), base];
}

/**
 * Pace capture from measured sidecar guidance. The guidance result only
 * controls prompts; the final upload remains the server liveness authority.
 *
 * Capture runs in strict steps and never moves on by itself:
 *   neutral samples -> action 1 -> neutral samples -> action 2 -> neutral samples.
 * A neutral step only counts usable forward-facing frames that pass the
 * server's face and quality check. An action step captures nothing and waits
 * (until the challenge deadline) for the requested action to be observed;
 * other actions and neutral frames are ignored. Live problems (no face,
 * several faces, blur/dark) are reported through onIssue. Returned frames
 * stay in capture order so the server sees the actions in the challenge order.
 */
export async function runGuidedCapture(options: GuidedCaptureOptions): Promise<GuidedCaptureResult> {
  const wait = options.wait ?? defaultWait;
  const now = options.now ?? (() => Date.now());
  const samplingIntervalMs = options.samplingIntervalMs ?? 140;
  const successPauseMs = options.successPauseMs ?? 1000;
  const issueAfterFrames = options.issueAfterFrames ?? 3;
  const targetFrames = Math.min(30, Math.max(20, options.targetFrames));
  const maxAttempts = options.maxAttempts
    ?? (options.deadlineMs !== undefined ? Number.POSITIVE_INFINITY : targetFrames * 8);
  const maxConsecutiveAnalyzeFailures = options.maxConsecutiveAnalyzeFailures ?? 3;
  const segments = neutralSegments(targetFrames - 2);

  const frames: CapturedFrame[] = [];
  let nextOrder = 0;
  let attempts = 0;
  // Steps: 0 neutral, 1 action 1, 2 neutral, 3 action 2, 4 neutral, 5 done.
  let step = 0;
  let segmentCount = 0;
  let sawFace = false;
  let capturedAny = false;
  let consecutiveAnalyzeFailures = 0;
  let pendingIssue: GuidanceIssue | null = null;
  let pendingIssueCount = 0;
  let reportedIssue: GuidanceIssue | null = null;
  let deadlineReached = false;

  const isActionStep = (): boolean => step === 1 || step === 3;
  const actionIndex = (): 0 | 1 => (step >= 3 ? 1 : 0);
  const selectedFrames = (): Blob[] =>
    [...frames].sort((a, b) => a.order - b.order).map(item => item.frame);

  const trackIssue = (issue: GuidanceIssue | null): void => {
    if (issue === null) {
      pendingIssue = null;
      pendingIssueCount = 0;
      if (reportedIssue !== null) {
        reportedIssue = null;
        options.onIssue?.(null);
      }
      return;
    }
    if (issue === pendingIssue) {
      pendingIssueCount += 1;
    } else {
      pendingIssue = issue;
      pendingIssueCount = 1;
    }
    if (pendingIssueCount >= issueAfterFrames && reportedIssue !== issue) {
      reportedIssue = issue;
      options.onIssue?.(issue);
    }
  };

  options.onPhase('phase1_neutral', 'Look directly into the camera and hold still.');

  while (step < 5 && attempts < maxAttempts) {
    if (options.deadlineMs !== undefined && now() >= options.deadlineMs) {
      deadlineReached = true;
      break;
    }
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
    const usable = guidance.usable !== false;
    const isNeutral = guidance.faceDetected && guidance.detectedAction === null && usable;

    // Live issue reporting. During an action the head is turned or the eyes
    // are closed, so the frontal-quality check is expected to fail; only a
    // missing face is reported then.
    if (!guidance.faceDetected) {
      trackIssue(guidance.issue ?? 'no_face');
    } else if (!isActionStep() && !usable) {
      trackIssue(guidance.issue ?? 'low_quality');
    } else if (!isActionStep() || isNeutral) {
      trackIssue(null);
    }

    if (isActionStep()) {
      const index = actionIndex();
      const action = options.actions[index];
      if (guidance.faceDetected && guidance.detectedAction === action) {
        frames.push({ order: frameOrder, frame });
        options.onFrameCount(frames.length);
        trackIssue(null);
        await options.onActionSuccess?.(index, action);
        if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };
        await wait(successPauseMs);
        if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };
        step += 1;
        segmentCount = 0;
        if (step === 4) {
          options.onPhase('complete', 'Both actions done. Look forward and hold still while we finish.');
        } else {
          options.onPhase('phase1_neutral', 'Return to a neutral forward position, then hold still.');
        }
      }
      // Anything else (a neutral frame, a different action) is ignored: the
      // step only moves on once the requested action is seen.
      await wait(samplingIntervalMs);
      continue;
    }

    if (isNeutral) {
      frames.push({ order: frameOrder, frame });
      segmentCount += 1;
      options.onFrameCount(frames.length);
      const segmentTarget = segments[step / 2];
      if (segmentCount >= segmentTarget) {
        step += 1;
        segmentCount = 0;
        if (step < 5) {
          const index = actionIndex();
          options.onPhase(actionPhase(index), actionInstruction(options.actions[index]));
        }
      }
    }

    if (step < 5) await wait(samplingIntervalMs);
  }

  if (options.isCancelled()) return { status: 'cancelled', frames: selectedFrames() };
  if (step === 5) {
    return { status: 'complete', frames: selectedFrames() };
  }
  return {
    status: 'timeout',
    frames: selectedFrames(),
    expectedAction: options.actions[actionIndex()],
    reason: deadlineReached
      ? 'challenge_expired'
      : !capturedAny
        ? 'camera_frame_unavailable'
        : !sawFace
          ? 'face_not_detected'
          : isActionStep()
            ? 'action_not_observed'
            : 'frames_not_usable',
  };
}
