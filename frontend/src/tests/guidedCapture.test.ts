import assert from 'node:assert/strict';
import test from 'node:test';
import { runGuidedCapture, type GuidedCapturePhase } from '../utils/guidedCapture.ts';
import type { LivenessAction } from '../types/index.ts';

function frame(value: number): Blob {
  return new Blob([String(value)], { type: 'image/jpeg' });
}

test('guided capture advances only after measured baseline and actions in server order', async () => {
  const phases: GuidedCapturePhase[] = [];
  const guidance: Array<{ detectedAction: LivenessAction | null; faceDetected: boolean }> = [
    { detectedAction: null, faceDetected: true },
    { detectedAction: null, faceDetected: true },
    { detectedAction: null, faceDetected: true },
    { detectedAction: 'turn_right', faceDetected: true },
    { detectedAction: 'turn_left', faceDetected: true },
    { detectedAction: 'turn_left', faceDetected: true },
    { detectedAction: null, faceDetected: true },
    { detectedAction: null, faceDetected: true },
    { detectedAction: null, faceDetected: true },
    { detectedAction: 'blink', faceDetected: true },
  ];
  const successes: LivenessAction[] = [];
  const waits: number[] = [];
  let captureCount = 0;

  const result = await runGuidedCapture({
    actions: ['turn_left', 'blink'],
    targetFrames: 20,
    captureFrame: async () => frame(captureCount++),
    analyzeFrame: async () => guidance.shift() ?? { detectedAction: null, faceDetected: true },
    isCancelled: () => false,
    onPhase: phase => phases.push(phase),
    onFrameCount: () => undefined,
    onActionSuccess: (_index, action) => { successes.push(action); },
    wait: async milliseconds => { waits.push(milliseconds); },
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.frames.length, 20);
  assert.deepEqual(successes, ['turn_left', 'blink']);
  assert.deepEqual(phases.slice(0, 5), [
    'phase1_neutral',
    'phase2_action1',
    'phase1_neutral',
    'phase3_action2',
    'complete',
  ]);
  assert.equal(waits.filter(milliseconds => milliseconds === 1000).length, 2);
});

test('guided capture times out with a retryable reason when an action is never observed', async () => {
  const result = await runGuidedCapture({
    actions: ['blink', 'turn_right'],
    targetFrames: 20,
    maxAttempts: 8,
    captureFrame: async () => frame(1),
    analyzeFrame: async () => ({ detectedAction: null, faceDetected: true }),
    isCancelled: () => false,
    onPhase: () => undefined,
    onFrameCount: () => undefined,
    wait: async () => undefined,
  });

  assert.equal(result.status, 'timeout');
  if (result.status === 'timeout') {
    assert.equal(result.expectedAction, 'blink');
    assert.equal(result.reason, 'action_not_observed');
  }
});

test('guided capture cancellation does not advance or return a submission', async () => {
  let cancelled = false;
  const result = await runGuidedCapture({
    actions: ['blink', 'turn_right'],
    targetFrames: 20,
    captureFrame: async () => frame(1),
    analyzeFrame: async () => ({ detectedAction: null, faceDetected: true }),
    isCancelled: () => cancelled,
    onPhase: () => { cancelled = true; },
    onFrameCount: () => undefined,
    wait: async () => undefined,
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.frames.length, 0);
});
