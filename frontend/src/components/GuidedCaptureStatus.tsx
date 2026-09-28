import React from 'react';
import { CheckCircle2, Hand, Loader2, ScanFace } from 'lucide-react';
import type { LivenessAction } from '../types';
import type { GuidanceIssue, GuidedCapturePhase } from '../utils/guidedCapture';

export const GUIDANCE_ISSUE_MESSAGES: Record<GuidanceIssue, string> = {
  no_face: 'We can’t see your face. Center your face inside the guide.',
  multiple_faces: 'More than one face is in view. Make sure only you are in the frame.',
  low_quality: 'The image is blurry or too dark. Face a light source and hold still.',
};

export function livenessActionTitle(action: LivenessAction): string {
  switch (action) {
    case 'blink':
      return 'Blink';
    case 'turn_left':
      return 'Turn Head Left';
    case 'turn_right':
      return 'Turn Head Right';
    default:
      return 'Look Forward';
  }
}

interface GuidedCaptureStatusProps {
  phase: GuidedCapturePhase;
  actions: [LivenessAction, LivenessAction] | null;
  instruction: string;
  lastActionSuccess: string | null;
  issue: GuidanceIssue | null;
  capturedCount: number;
  totalCount: number;
  uploadingLabel: string;
}

/**
 * Capture progress, prompts and warnings shown BELOW the camera preview so
 * nothing covers the student's face.
 */
export const GuidedCaptureStatus: React.FC<GuidedCaptureStatusProps> = ({
  phase,
  actions,
  instruction,
  lastActionSuccess,
  issue,
  capturedCount,
  totalCount,
  uploadingLabel,
}) => {
  if (phase === 'idle') return null;

  const waitingAction = phase === 'phase2_action1'
    ? actions?.[0]
    : phase === 'phase3_action2'
      ? actions?.[1]
      : undefined;
  const heading = phase === 'uploading'
    ? uploadingLabel
    : waitingAction
      ? `Action ${phase === 'phase2_action1' ? 1 : 2} of 2: ${livenessActionTitle(waitingAction)}`
      : phase === 'complete'
        ? 'Last step: look forward and hold still'
        : 'Look forward and hold still';
  const percent = Math.min(100, Math.round((capturedCount / totalCount) * 100));

  return (
    <div
      data-testid="guided-capture-status"
      className="w-full max-w-md mx-auto rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 p-4 space-y-2.5 animate-fade-in"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-blue-700 dark:text-blue-300">
          {phase === 'uploading'
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : waitingAction
              ? <Hand className="w-4 h-4" />
              : <ScanFace className="w-4 h-4" />}
          {heading}
        </span>
        <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {capturedCount} / {totalCount} samples
        </span>
      </div>

      <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
        <div className="bg-blue-600 h-full transition-all duration-150" style={{ width: `${percent}%` }} />
      </div>

      {phase !== 'uploading' && (
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{instruction}</p>
      )}
      {waitingAction && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Capture is paused until this action is detected.
        </p>
      )}
      {lastActionSuccess && phase !== 'uploading' && !waitingAction && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400" role="status">
          <CheckCircle2 className="w-4 h-4" />
          {lastActionSuccess} detected. Good.
        </p>
      )}
      {issue && (
        <p role="alert" className="rounded-lg bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 px-3 py-2 text-xs font-bold text-amber-900 dark:text-amber-200">
          {GUIDANCE_ISSUE_MESSAGES[issue]}
        </p>
      )}
    </div>
  );
};
