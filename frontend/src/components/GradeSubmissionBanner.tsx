import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Edit, Send } from 'lucide-react';
import {
  getGradeSubmissionApi,
  gradeSubmissionActionApi,
  type FacultyClassItem,
  type GradeSubmissionAction,
  type GradeSubmissionState,
} from '../services/apiClient';
import { formatManilaWhen } from '../services/auditService';
import { formatShortDate } from '../utils/sessionDate';
import { requestConfirmation, showFeedback } from './FeedbackCenter';
import { Modal } from './Modal';

const SECONDARY = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-white dark:bg-slate-900 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const SECONDARY_TONES = {
  amber: 'border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100/50',
  emerald: 'border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/50',
  rose: 'border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 hover:bg-rose-100/50',
  slate: 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
} as const;
const PRIMARY = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 text-white font-bold text-xs whitespace-nowrap shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

const BOX_TONES = {
  amber: { box: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200', icon: 'text-amber-600 dark:text-amber-400', Icon: Edit },
  emerald: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200', icon: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
  rose: { box: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200', icon: 'text-rose-600 dark:text-rose-400', Icon: AlertCircle },
  information: { box: 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200', icon: 'text-clinical-600 dark:text-clinical-400', Icon: Clock },
} as const;

const SUCCESS_TEXT: Record<GradeSubmissionAction, string> = {
  submit: 'Grades submitted.',
  withdraw: 'Submission withdrawn.',
  open: 'Grade change draft opened.',
  send: 'Sent for Dean approval.',
  'pull-back': 'Grade change pulled back to draft.',
  discard: 'Grade change discarded.',
};

type ClassRef = Pick<FacultyClassItem, 'csId' | 'courseCode' | 'csName'>;
type ActionProps = { classItem: ClassRef; onChanged: () => void };

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

async function runAction(
  action: GradeSubmissionAction,
  csId: number,
  onChanged: () => void,
  reason?: string,
): Promise<GradeSubmissionState | null> {
  try {
    const next = await gradeSubmissionActionApi(action, csId, reason);
    onChanged();
    showFeedback(SUCCESS_TEXT[action], 'success');
    return next;
  } catch (err) {
    showFeedback(errorText(err), 'error');
    return null;
  }
}

export const GradeSubmissionBanner: React.FC<{ classItem: FacultyClassItem; onChanged: () => void }> = ({ classItem, onChanged }) => {
  const { csId, courseCode, csName } = classItem;
  const [state, setState] = useState<GradeSubmissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState(null);
    getGradeSubmissionApi(csId)
      .then(next => { if (!cancelled) setState(next); })
      .catch(() => { if (!cancelled) setState(null); });
    return () => { cancelled = true; };
  }, [csId]);

  const act = useCallback(async (
    action: GradeSubmissionAction,
    confirmation: { message: string; title: string; confirmLabel: string } | null,
    actionReason?: string,
  ) => {
    if (confirmation && !(await requestConfirmation(confirmation.message, confirmation.title, confirmation.confirmLabel))) return false;
    setBusy(true);
    const next = await runAction(action, csId, onChanged, actionReason);
    setBusy(false);
    if (next) setState(next);
    return next !== null;
  }, [csId, onChanged]);

  if (!state) return null;
  const label = `${courseCode} ${csName}`;
  const batch = state.batch;
  const secondary = (tone: keyof typeof SECONDARY_TONES, text: string, onClick: () => void) => (
    <button type="button" disabled={busy} onClick={onClick} className={`${SECONDARY} ${SECONDARY_TONES[tone]}`}>{text}</button>
  );
  const discard = (tone: keyof typeof SECONDARY_TONES) => secondary(tone, 'Discard', () => {
    void act('discard', { message: `Discard the grade change for ${label}? Every edit made in the draft is undone.`, title: 'Discard Grade Change', confirmLabel: 'Discard' });
  });
  const requestChange = (tone: keyof typeof SECONDARY_TONES) => secondary(tone, 'Request grade change', () => {
    void act('open', { message: `Open a grade change for ${label}? Your edits stay a draft until the Dean approves them.`, title: 'Request Grade Change', confirmLabel: 'Open draft' });
  });

  const send = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 8) {
      setReasonError('Give a reason of at least 8 characters.');
      return;
    }
    void act('send', null, trimmed).then(ok => {
      if (ok) {
        setReasonError('');
        setSendOpen(false);
      }
    });
  };

  let tone: keyof typeof BOX_TONES;
  let text: string;
  let buttons: React.ReactNode;
  if (batch?.status === 'draft') {
    tone = 'amber';
    text = 'Grade change draft.';
    buttons = (
      <>
        {discard('amber')}
        <button type="button" disabled={busy} onClick={() => { setReason(''); setReasonError(''); setSendOpen(true); }} className={PRIMARY}>Send for Dean approval</button>
      </>
    );
  } else if (batch?.status === 'pending') {
    tone = 'information';
    text = `Sent for Dean approval on ${batch.sentAt ? formatShortDate(batch.sentAt.slice(0, 10)) : ''}.`;
    buttons = (
      <>
        {discard('slate')}
        {secondary('slate', 'Pull back', () => {
          void act('pull-back', { message: `Pull back the grade change for ${label}? It returns to a draft and leaves the Dean's list.`, title: 'Pull Back Grade Change', confirmLabel: 'Pull back' });
        })}
      </>
    );
  } else if (batch?.status === 'rejected') {
    tone = 'rose';
    text = `Grade change rejected: ${batch.decisionReason ?? ''}`;
    buttons = requestChange('rose');
  } else if (state.status === 'submitted') {
    tone = 'emerald';
    if (state.graceUntil && new Date(state.graceUntil) > new Date()) {
      text = `Submitted. You can withdraw until ${formatManilaWhen(state.graceUntil)}.`;
      buttons = secondary('emerald', 'Withdraw', () => {
        void act('withdraw', { message: `Withdraw the submitted grades for ${label}? The class becomes editable again.`, title: 'Withdraw Submission', confirmLabel: 'Withdraw' });
      });
    } else {
      text = `Grades submitted on ${state.submittedAt ? formatShortDate(state.submittedAt.slice(0, 10)) : ''}.`;
      buttons = requestChange('emerald');
    }
  } else {
    return null;
  }

  const { box, icon, Icon } = BOX_TONES[tone];
  return (
    <>
      <div role="status" className={`no-print rounded-xl border p-3 text-xs ${box} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="flex items-start gap-3 min-w-0">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
          <span className="font-semibold">{text}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">{buttons}</div>
      </div>
      <Modal isOpen={sendOpen} onClose={() => { if (!busy) { setSendOpen(false); setReasonError(''); } }} title="Send for Dean Approval" size="sm">
        <div className="space-y-4">
          <div>
            <label htmlFor="grade-change-send-reason" className="block text-xs font-bold text-slate-700 dark:text-slate-200">Reason (at least 8 characters)</label>
            <textarea
              id="grade-change-send-reason"
              value={reason}
              onChange={event => { setReason(event.target.value); if (reasonError) setReasonError(''); }}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? 'err-grade-change-send-reason' : undefined}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
              rows={3}
              maxLength={500}
            />
            {reasonError && <p id="err-grade-change-send-reason" role="alert" className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">{reasonError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => { setSendOpen(false); setReasonError(''); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={send}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white bg-emerald-600 disabled:opacity-50"
            >Send</button>
          </div>
        </div>
      </Modal>
    </>
  );
};

/** Toolbar button on the Grades page; shown only while the class is not submitted. */
export const SubmitGradesButton: React.FC<{ classItem: FacultyClassItem; onChanged: () => void }> = ({ classItem, onChanged }) => {
  const { csId, courseCode, csName } = classItem;
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const { missing } = await getGradeSubmissionApi(csId);
      let message = `Submit the grades for ${courseCode} ${csName}? The class becomes view-only. You can withdraw within 24 hours.`;
      if (missing.length > 0) {
        const lines = missing.slice(0, 5).map(m => `• ${m.name} (${m.missingCount} missing)`);
        if (missing.length > 5) lines.push(`• and ${missing.length - 5} more`);
        message += `\n\n${missing.length} ${missing.length === 1 ? 'student has' : 'students have'} missing scores:\n${lines.join('\n')}\n\nYou can still submit.`;
      }
      if (!(await requestConfirmation(message, 'Submit Grades', 'Submit'))) return;
      await runAction('submit', csId, onChanged);
    } catch (err) {
      showFeedback(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => { void submit(); }}
      className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Send className="w-4 h-4" aria-hidden="true" />
      Submit grades
    </button>
  );
};
