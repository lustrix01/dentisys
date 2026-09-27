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

test('guided capture waits for a slow student instead of timing out when the frame budget fills', async () => {
  const guidance: Array<{ detectedAction: LivenessAction | null; faceDetected: boolean }> = [];
  for (let i = 0; i < 3; i++) guidance.push({ detectedAction: null, faceDetected: true });
  for (let i = 0; i < 40; i++) guidance.push({ detectedAction: null, faceDetected: true });
  guidance.push({ detectedAction: 'blink', faceDetected: true });
  for (let i = 0; i < 3; i++) guidance.push({ detectedAction: null, faceDetected: true });
  for (let i = 0; i < 40; i++) guidance.push({ detectedAction: null, faceDetected: false });
  guidance.push({ detectedAction: 'turn_left', faceDetected: true });
  let count = 0;
  const order: string[] = [];
  const result = await runGuidedCapture({
    actions: ['blink', 'turn_left'],
    targetFrames: 30,
    captureFrame: async () => frame(count++),
    analyzeFrame: async (blob) => {
      const next = guidance.shift() ?? { detectedAction: null, faceDetected: true };
      if (next.detectedAction) order.push(`${await blob.text()}:${next.detectedAction}`);
      return next;
    },
    isCancelled: () => false,
    onPhase: () => undefined,
    onFrameCount: () => undefined,
    wait: async () => undefined,
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.frames.length, 30);
  const texts = await Promise.all(result.frames.map(blob => blob.text()));
  const numbers = texts.map(Number);
  assert.deepEqual([...numbers].sort((a, b) => a - b), numbers, 'frames stay in capture order');
  assert.ok(texts.includes(order[0].split(':')[0]), 'first action frame is uploaded');
  assert.ok(texts.includes(order[1].split(':')[0]), 'second action frame is uploaded');
});

test('guided capture tolerates an isolated guidance failure', async () => {
  let calls = 0;
  const result = await runGuidedCapture({
    actions: ['blink', 'turn_right'],
    targetFrames: 20,
    maxAttempts: 10,
    captureFrame: async () => frame(1),
    analyzeFrame: async () => {
      calls += 1;
      if (calls === 2) throw new Error('timeout');
      return { detectedAction: null, faceDetected: true };
    },
    isCancelled: () => false,
    onPhase: () => undefined,
    onFrameCount: () => undefined,
    wait: async () => undefined,
  });
  assert.equal(result.status, 'timeout');
  if (result.status === 'timeout') assert.equal(result.reason, 'action_not_observed');
});

test('guided capture does not advance on unusable frames and reports the live issue', async () => {
  const phases: GuidedCapturePhase[] = [];
  const issues: Array<string | null> = [];
  const guidance: Array<{ detectedAction: LivenessAction | null; faceDetected: boolean; usable?: boolean; issue?: 'no_face' | 'multiple_faces' | 'low_quality' | null }> = [];
  for (let i = 0; i < 5; i++) guidance.push({ detectedAction: null, faceDetected: true, usable: false, issue: 'low_quality' });
  const result = await runGuidedCapture({
    actions: ['blink', 'turn_left'],
    targetFrames: 20,
    maxAttempts: 8,
    captureFrame: async () => frame(1),
    analyzeFrame: async () => guidance.shift() ?? { detectedAction: null, faceDetected: true, usable: true, issue: null },
    isCancelled: () => false,
    onPhase: phase => phases.push(phase),
    onFrameCount: () => undefined,
    onIssue: issue => issues.push(issue),
    wait: async () => undefined,
  });
  assert.deepEqual(issues, ['low_quality', null], 'issue is raised while it lasts and cleared when frames become usable');
  assert.deepEqual(phases, ['phase1_neutral', 'phase2_action1'], 'the action prompt appears only after three usable frames');
  assert.equal(result.status, 'timeout');
  assert.equal(result.frames.length, 3, 'unusable frames are never uploaded');
});

test('guided capture does not report quality issues for turned-head frames during an action', async () => {
  const issues: Array<string | null> = [];
  const guidance = [
    { detectedAction: null, faceDetected: true, usable: true, issue: null },
    { detectedAction: null, faceDetected: true, usable: true, issue: null },
    { detectedAction: null, faceDetected: true, usable: true, issue: null },
    { detectedAction: null, faceDetected: true, usable: false, issue: 'low_quality' as const },
    { detectedAction: null, faceDetected: true, usable: false, issue: 'low_quality' as const },
    { detectedAction: null, faceDetected: true, usable: false, issue: 'low_quality' as const },
    { detectedAction: null, faceDetected: true, usable: false, issue: 'low_quality' as const },
  ];
  await runGuidedCapture({
    actions: ['turn_left', 'blink'],
    targetFrames: 20,
    maxAttempts: 7,
    captureFrame: async () => frame(1),
    analyzeFrame: async () => guidance.shift() ?? { detectedAction: null, faceDetected: true },
    isCancelled: () => false,
    onPhase: () => undefined,
    onFrameCount: () => undefined,
    onIssue: issue => issues.push(issue),
    wait: async () => undefined,
  });
  assert.deepEqual(issues, []);
});

test('guided capture stops at the challenge deadline with a restartable reason', async () => {
  let clock = 0;
  const result = await runGuidedCapture({
    actions: ['blink', 'turn_right'],
    targetFrames: 20,
    deadlineMs: 1000,
    now: () => clock,
    captureFrame: async () => frame(1),
    analyzeFrame: async () => ({ detectedAction: null, faceDetected: true, usable: true, issue: null }),
    isCancelled: () => false,
    onPhase: () => undefined,
    onFrameCount: () => undefined,
    wait: async milliseconds => { clock += milliseconds; },
  });
  assert.equal(result.status, 'timeout');
  if (result.status === 'timeout') assert.equal(result.reason, 'challenge_expired');
});
