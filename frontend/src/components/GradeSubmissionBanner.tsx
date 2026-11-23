import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Edit, EyeOff, Megaphone, RefreshCw, Send } from 'lucide-react';
import {
  getGradeSubmissionApi,
  gradeSubmissionActionApi,
  publishMidtermAdvisoryApi,
  unpublishMidtermAdvisoryApi,
  type FacultyClassItem,
  type GradeSubmissionAction,
  type GradeSubmissionMidtermState,
  type GradeSubmissionState,
} from '../services/apiClient';
import { formatManilaWhen } from '../services/auditService';
import { formatShortDate } from '../utils/sessionDate';
import { requestConfirmation, showFeedback } from './FeedbackCenter';
import { Modal } from './Modal';
import { ExportMenu } from './ExportMenu';

const SECONDARY = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-white dark:bg-slate-900 font-bold text-xs whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const SECONDARY_TONES = {
  amber: 'border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100/50',
  emerald: 'border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/50',
  rose: 'border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 hover:bg-rose-100/50',
  slate: 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
} as const;
const PRIMARY = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs whitespace-nowrap shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

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

function formatMidtermConfirmMessage(label: string, midterm: GradeSubmissionMidtermState, isUpdate: boolean): string {
  const sections: string[] = [
    isUpdate
      ? `Update the published Midterm advisory for ${label}?`
      : `Publish the Midterm advisory for ${label}?`,
  ];

  if (midterm.atRisk.length > 0) {
    const atRiskLines = midterm.atRisk.slice(0, 8).map(s => `• ${s.name} (${s.studentNumber}) — ${s.grade.toFixed(1)}`);
    if (midterm.atRisk.length > 8) atRiskLines.push(`• ...and ${midterm.atRisk.length - 8} more`);
    sections.push(`At-Risk students (${midterm.atRisk.length}):\n${atRiskLines.join('\n')}`);
  } else {
    sections.push('No students are At Risk. Publishing makes computed Midterm grades visible to students.');
  }

  if (isUpdate) {
    const added = midterm.diff?.added ?? [];
    const removed = midterm.diff?.removed ?? [];
    if (added.length > 0) {
      const addedLines = added.slice(0, 5).map(s => `• ${s.name} (${s.studentNumber}) — ${s.grade.toFixed(1)}`);
      if (added.length > 5) addedLines.push(`• ...and ${added.length - 5} more`);
      sections.push(`Newly added to At Risk (${added.length}):\n${addedLines.join('\n')}`);
    }
    if (removed.length > 0) {
      const removedLines = removed.slice(0, 5).map(s => `• ${s.name} (${s.studentNumber})${s.grade !== null ? ` — ${s.grade.toFixed(1)}` : ''}`);
      if (removed.length > 5) removedLines.push(`• ...and ${removed.length - 5} more`);
      sections.push(`Cleared from At Risk (${removed.length}):\n${removedLines.join('\n')}`);
    }
  }

  if (midterm.missing.length > 0) {
    const missingLines = midterm.missing.slice(0, 5).map(m => `• ${m.name} (${m.studentNumber}) — ${m.missingCount} missing`);
    if (midterm.missing.length > 5) missingLines.push(`• ...and ${midterm.missing.length - 5} more`);
    sections.push(`${midterm.missing.length} ${midterm.missing.length === 1 ? 'student has' : 'students have'} missing Midterm scores:\n${missingLines.join('\n')}`);
  }

  sections.push('Flagged students will appear on At-Risk Students and Midterm Advisory and receive an in-app notice. Emails are sent separately from Email Management.');
  return sections.join('\n\n');
}

export const GradeSubmissionBanner: React.FC<{
  classItem: FacultyClassItem;
  onChanged: () => void;
  refreshToken?: string | number;
}> = ({ classItem, onChanged, refreshToken }) => {
  const { csId, courseCode, csName } = classItem;
  const [state, setState] = useState<GradeSubmissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const prevCsIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (prevCsIdRef.current !== csId) {
      prevCsIdRef.current = csId;
      setState(null);
    }
    getGradeSubmissionApi(csId)
      .then(next => { if (!cancelled) setState(next); })
      .catch(() => { if (!cancelled) setState(null); });
    return () => { cancelled = true; };
  }, [csId, refreshToken]);

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

  const { box, icon, Icon: BannerIcon } = BOX_TONES[tone];
  return (
    <>
      <div role="status" className={`no-print rounded-xl border p-3 text-xs ${box} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="flex items-start gap-3 min-w-0">
          <BannerIcon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
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
      const { missing, retentionImpact = [] } = await getGradeSubmissionApi(csId);
      let message = `Submit the grades for ${courseCode} ${csName}? The class becomes view-only. You can withdraw within 24 hours.`;
      if (missing.length > 0) {
        const lines = missing.slice(0, 5).map(m => `• ${m.name} (${m.missingCount} missing)`);
        if (missing.length > 5) lines.push(`• ...and ${missing.length - 5} more`);
        message += `\n\n${missing.length} ${missing.length === 1 ? 'student has' : 'students have'} missing scores:\n${lines.join('\n')}\n\nYou can still submit.`;
      }
      if (retentionImpact.length > 0) {
        const impactLines = retentionImpact.slice(0, 8).map(item => {
          const outcomeLabel = item.outcome === 'irregular_reenrollment' ? 'Irregular reenrollment' : 'Remedial';
          const gradeText = typeof item.grade === 'number' ? item.grade.toFixed(1) : String(item.grade);
          return `• ${item.name} (${item.studentNumber}) — ${gradeText} (${outcomeLabel})`;
        });
        if (retentionImpact.length > 8) impactLines.push(`• ...and ${retentionImpact.length - 8} more`);
        message += `\n\n${retentionImpact.length} ${retentionImpact.length === 1 ? 'student enters' : 'students enter'} Retention Status:\n${impactLines.join('\n')}`;
      }
      message += '\n\nSubmitted grades activate Retention Status and notify Remedial students in-app.';
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
      className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Send className="w-4 h-4" aria-hidden="true" />
      Submit grades
    </button>
  );
};

/** Midterm advisory state for one unsubmitted class (null when submitted, not periods mode, or not loaded). */
function useMidtermAdvisory(classItem: ClassRef, onChanged: () => void, refreshToken?: string | number) {
  const { csId } = classItem;
  const [midterm, setMidterm] = useState<GradeSubmissionMidtermState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMidterm(null);
    getGradeSubmissionApi(csId)
      .then(next => { if (!cancelled) setMidterm(next.status !== 'submitted' && next.midterm?.schemaMode === 'periods' ? next.midterm : null); })
      .catch(() => { if (!cancelled) setMidterm(null); });
    return () => { cancelled = true; };
  }, [csId, refreshToken]);

  const actMidterm = useCallback(async (kind: 'publish' | 'unpublish', current: GradeSubmissionMidtermState, classLabel: string) => {
    const isUpdate = kind === 'publish' && current.published;
    const confirmation = kind === 'publish'
      ? {
          title: isUpdate ? 'Update Midterm Advisory' : 'Publish Midterm Advisory',
          confirmLabel: isUpdate ? 'Update advisory' : 'Publish Midterm advisory',
          message: formatMidtermConfirmMessage(classLabel, current, isUpdate),
        }
      : {
          title: 'Unpublish Midterm Advisory',
          confirmLabel: 'Unpublish',
          message: `Unpublish the Midterm advisory for ${classLabel}? Published Midterm grades and Midterm Advisory will be hidden from Students until published again. Entered scores stay saved.`,
        };
    if (!(await requestConfirmation(confirmation.message, confirmation.title, confirmation.confirmLabel))) return;
    setBusy(true);
    try {
      const next = kind === 'publish' ? await publishMidtermAdvisoryApi(csId) : await unpublishMidtermAdvisoryApi(csId);
      setMidterm(next.midterm?.schemaMode === 'periods' ? next.midterm : null);
      onChanged();
      showFeedback(kind === 'unpublish' ? 'Midterm advisory unpublished.' : isUpdate ? 'Midterm advisory updated.' : 'Midterm advisory published.', 'success');
    } catch (err) {
      showFeedback(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  }, [csId, onChanged]);

  return { midterm, busy, actMidterm };
}

/** One-line summary of a class's Midterm advisory, used as the button tooltip and (option B) the status line. */
function midtermAdvisoryStatus(midterm: GradeSubmissionMidtermState): string {
  if (!midterm.published) {
    return midterm.atRisk.length > 0
      ? `Not published · ${midterm.atRisk.length} At-Risk ready`
      : `Not published · Midterm grades ready for ${midterm.readyCount} ${midterm.readyCount === 1 ? 'student' : 'students'}`;
  }
  const publishedDate = midterm.publishedAt ? formatShortDate(midterm.publishedAt.slice(0, 10)) : '';
  if (midterm.dirty) {
    const parts: string[] = [];
    if ((midterm.diff?.added?.length ?? 0) > 0) parts.push(`+${midterm.diff!.added.length} At-Risk`);
    if ((midterm.diff?.removed?.length ?? 0) > 0) parts.push(`${midterm.diff!.removed.length} cleared`);
    return `Scores changed since published${parts.length ? ` (${parts.join(', ')})` : ''}`;
  }
  return `Published${publishedDate ? ` on ${publishedDate}` : ''} · ${midterm.atRisk.length} At-Risk`;
}

/** Toolbar control next to Submit grades: a Midterm advisory menu whose first line says where things stand. */
export const MidtermAdvisoryButton: React.FC<{ classItem: FacultyClassItem; onChanged: () => void; refreshToken?: string | number }> = ({ classItem, onChanged, refreshToken }) => {
  const { midterm, actMidterm } = useMidtermAdvisory(classItem, onChanged, refreshToken);
  if (!midterm || (!midterm.published && midterm.readyCount === 0)) return null;
  const label = `${classItem.courseCode} ${classItem.csName}`;
  const status = midtermAdvisoryStatus(midterm);
  const n = midterm.atRisk.length;
  const badge = !midterm.published
    ? (n > 0 ? <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" aria-label={`${n} At-Risk, not published`}>{n}</span> : null)
    : midterm.dirty
      ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="Scores changed since published" />
      : null;
  const items = midterm.published
    ? [
        { label: 'Update advisory', icon: RefreshCw, onSelect: () => { void actMidterm('publish', midterm, label); }, disabledReason: midterm.dirty ? undefined : 'No Midterm changes since published' },
        { label: 'Unpublish', icon: EyeOff, onSelect: () => { void actMidterm('unpublish', midterm, label); } },
      ]
    : [{ label: 'Publish Midterm advisory', icon: Megaphone, onSelect: () => { void actMidterm('publish', midterm, label); } }];

  return (
    <div className="no-print flex shrink-0 items-center justify-center rounded-xl border border-clinical-300 bg-white p-0.5 shadow-sm dark:border-clinical-800 dark:bg-slate-900">
      <ExportMenu kind="clinical" label="Midterm advisory" icon={midterm.published && !midterm.dirty ? CheckCircle2 : undefined} badge={badge} header={status.replace(/(\d+) At-Risk/g, '$1 At‑Risk')} fill items={items} />
    </div>
  );
};
