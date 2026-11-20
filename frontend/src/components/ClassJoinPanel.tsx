import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Link2, RefreshCw } from 'lucide-react';
import { Modal } from './Modal';
import { formatManilaWhen } from '../services/auditService';
import { requestConfirmation, showFeedback } from './FeedbackCenter';
import {
  decideClassJoinRequestApi,
  getClassJoinRequestsApi,
  getClassJoinSettingsApi,
  newClassJoinCodeApi,
  updateClassJoinSettingsApi,
  type ClassJoinRequestItem,
  type ClassJoinSettings,
} from '../services/apiClient';

// CLS-004. Faculty: a "Join code" button in the roster toolbar opens a dialog with everything. The Class Secretary never sees the code.
// On/Off switch: same design as RevokedSessionsSwitch (the Pin switch of GradebookMatrix).
export function OnOffSwitch({ label, on, disabled, onChange }: { label: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <div>
      {/* Label above the control, as the class Edit dialog labels its fields ("Laboratory Day(s)"). */}
      <span className="font-semibold text-slate-600 dark:text-slate-400 block mb-1 text-[11px]">{label}</span>
      <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-700">
        {([['Off', false], ['On', true]] as const).map(([text, value]) => (
          <button
            key={text}
            type="button"
            aria-pressed={on === value}
            disabled={disabled}
            onClick={() => { if (on !== value) onChange(value); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 ${
              on === value
                ? 'bg-white dark:bg-slate-900 text-clinical-600 dark:text-clinical-400 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const copy = async (text: string, done: string) => {
  try {
    await navigator.clipboard.writeText(text);
    showFeedback(done, 'success');
  } catch {
    showFeedback('Could not copy. Select the text and copy it yourself.', 'error');
  }
};

// Count badge copies Tabs variant="switch" (ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold) + leading-none so the button keeps its neighbours' height.
const rosterBadge = 'ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold leading-none bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex-shrink-0';
const primaryButton = 'inline-flex items-center gap-1.5 px-3.5 py-2 whitespace-nowrap rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex items-center gap-1.5 px-3.5 py-2 whitespace-nowrap rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-bold transition-all cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-50';
const neutralButton = 'inline-flex items-center gap-1.5 px-3.5 py-2 whitespace-nowrap rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

// Roster toolbar button (copies "Import Students") + the Join Code dialog.
export const ClassJoinButton: React.FC<{ csId: number; onApproved?: () => void }> = ({ csId, onApproved }) => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ClassJoinSettings | null>(null);
  const [requests, setRequests] = useState<ClassJoinRequestItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSettings(await getClassJoinSettingsApi(csId));
      setRequests((await getClassJoinRequestsApi(csId)).requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the join code.');
    }
  }, [csId]);

  useEffect(() => { setSettings(null); setRequests([]); void load(); }, [load]);

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    try { await work(); } catch (err) { showFeedback(err instanceof Error ? err.message : failure, 'error'); await load(); } finally { setBusy(false); }
  };

  const newCode = async () => {
    if (!await requestConfirmation('The old code and link stop working.', 'New Code', 'New code')) return;
    await run(async () => { setSettings(await newClassJoinCodeApi(csId)); showFeedback('New code made.', 'success'); }, 'Could not make a new code.');
  };
  const change = async (patch: { enabled?: boolean; autoApprove?: boolean }) => {
    const setting = patch.enabled !== undefined ? 'class joining' : 'automatic approval';
    const turningOn = patch.enabled ?? patch.autoApprove;
    if (!await requestConfirmation(
      `Turn ${setting} ${turningOn ? 'on' : 'off'} for this class?`,
      `Turn ${setting} ${turningOn ? 'on' : 'off'}`,
      turningOn ? 'Turn on' : 'Turn off'
    )) return;
    await run(async () => { setSettings(await updateClassJoinSettingsApi({ csId, ...patch })); }, 'Could not save the change.');
  };
  const decide = async (action: 'approve' | 'reject', request: ClassJoinRequestItem) => {
    const actionLabel = action === 'approve' ? 'Approve' : 'Reject';
    const detail = action === 'approve'
      ? `${request.name} will be added to the class.`
      : `${request.name}'s request to join will be rejected.`;
    if (!await requestConfirmation(`${actionLabel} ${request.name}'s request to join? ${detail}`, `${actionLabel} join request`, actionLabel)) return;
    await run(async () => {
      await decideClassJoinRequestApi(action, { csId, requestId: request.requestId });
      showFeedback(action === 'approve' ? `${request.name} was added to the class.` : 'Request rejected.', 'success');
      await load();
      if (action === 'approve') onApproved?.();
    }, 'Could not save the decision.');
  };

  const off = settings ? !settings.enabled : false;

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void load(); }}
        className="inline-flex items-center gap-1.5 px-3.5 max-[374px]:px-2.5 py-2 whitespace-nowrap rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-bold transition-all cursor-pointer shadow-xs"
      >
        <KeyRound className="w-3.5 h-3.5" />
        <span>Join code</span>
        {requests.length > 0 && <span aria-label={`${requests.length} waiting to join`} className={rosterBadge}>{requests.length}</span>}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Join Code">
        {error ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>
        ) : !settings ? null : !settings.code ? (
          <div role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">This class takes no join code.</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span aria-label="Join code" className={`font-mono text-2xl sm:text-3xl font-extrabold tracking-widest ${off ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-slate-100'}`}>{settings.code}</span>
                {off && <span className="whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Code is off</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void copy(settings.code!, 'Code copied.')} className={primaryButton}><Copy className="w-3.5 h-3.5" /><span>Copy code</span></button>
                {settings.link && <button type="button" onClick={() => void copy(settings.link!, 'Link copied.')} className={secondaryButton}><Link2 className="w-3.5 h-3.5" /><span>Copy link</span></button>}
                <button type="button" disabled={busy || !settings.open} onClick={() => void newCode()} className={neutralButton}><RefreshCw className="w-3.5 h-3.5" /><span>New code</span></button>
              </div>
              {settings.open && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <OnOffSwitch label="Code On" on={settings.enabled} disabled={busy} onChange={(enabled) => void change({ enabled })} />
                  <OnOffSwitch label="Auto-Approve" on={Boolean(settings.autoApprove)} disabled={busy} onChange={(autoApprove) => void change({ autoApprove })} />
                </div>
              )}
              {!settings.open && <p className="text-xs text-slate-500 dark:text-slate-400">This code no longer works: the class term has ended or the class is archived.</p>}
              <p className="text-xs text-slate-500 dark:text-slate-400">Share this code with your Students yourself. DentiSYS does not email it. Students enter it with Join a class on My Classes.</p>
            </div>

            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Wants to Join</h3>
              {requests.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No requests waiting.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/60">
                  {requests.map((r) => (
                    <li key={r.requestId} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{r.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400"><span className="font-mono font-bold text-slate-700 dark:text-slate-200">{r.studentNumber}</span>{r.email && <> · <span className="break-all">{r.email}</span></>} · {formatManilaWhen(r.requestedAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={busy} onClick={() => void decide('approve', r)} className={primaryButton}>Approve</button>
                        <button type="button" disabled={busy} onClick={() => void decide('reject', r)} className={neutralButton}>Reject</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

// One line of a Faculty class card, under the room line (copies that line: icon, "Lec:"-style label, value). Reveal state is per card.
export const ClassCardJoinCode: React.FC<{ code: string; enabled: boolean }> = ({ code, enabled }) => {
  const [shown, setShown] = useState(false);
  // Ghost icon buttons: no background at rest; 32px tap area below md, 28px from md up.
  const iconButton = 'inline-flex items-center justify-center w-8 h-8 md:w-7 md:h-7 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer';
  const value = 'font-mono text-slate-500 dark:text-slate-400'; // the card's value text, as "Room 401" after "Lec:"
  return (
    <div className="flex items-center gap-2">
      <KeyRound className="w-3.5 h-3.5 text-clinical-600 dark:text-clinical-400 flex-shrink-0" />
      <div className="flex items-center gap-1 whitespace-nowrap">
        <span className="font-bold text-slate-700 dark:text-slate-200">Join code:</span>
        {enabled ? (
          <>
            <span className={value} data-testid="class-join-code">{shown ? code : '•••-•••'}</span>
            <button type="button" aria-label={shown ? 'Hide join code' : 'Show join code'} aria-pressed={shown} onClick={() => setShown(v => !v)} className={iconButton}>
              {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button type="button" aria-label="Copy join code" onClick={() => void copy(code, 'Join code copied.')} className={iconButton}>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <span>Code off</span>
        )}
      </div>
    </div>
  );
};
