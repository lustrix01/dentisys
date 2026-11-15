import type { FaceFlag } from '../../services/apiClient';

// Pure text and rules for the Face Enrolment Flags page (backlog 12.2).
export type FlagAction = 'dismiss' | 'revoke-face' | 'open-people';

export const FLAG_KIND_LABEL: Record<FaceFlag['kind'], string> = { F1: 'Re-enrolled after withdrawing', F2: 'New face does not match' };
export const FLAG_STATUS_LABEL: Record<FaceFlag['status'], string> = { open: 'Open', dismissed: 'Dismissed', revoked: 'Revoked' };

const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
/** "Oct 2" in Manila time; an unreadable value is shown as received. */
export const shortDay = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dayFormat.format(d);
};

export const flagDetails = (flag: FaceFlag): string =>
  flag.kind === 'F1' && flag.detail.withdrawnAt
    ? `Withdrew ${shortDay(flag.detail.withdrawnAt)}, enrolled again ${shortDay(flag.detail.enrolledAt)}`
    : flag.kind === 'F1' ? `Enrolled again ${shortDay(flag.detail.enrolledAt)}` : `Updated face on ${shortDay(flag.detail.enrolledAt)}`;

/** This school year's class labels only. */
export const flagClasses = (flag: FaceFlag): string => {
  const current = flag.classes.filter(c => c.current).map(c => c.label);
  return current.length > 0 ? current.join(', ') : 'None';
};

/** Open flags: Dismiss, Revoke, Open in People & Accounts. Closed flags: Open in People & Accounts only. */
export const flagActions = (flag: FaceFlag): FlagAction[] => (flag.status === 'open' ? ['dismiss', 'revoke-face', 'open-people'] : ['open-people']);

/** Second line under Status for closed flags: "by Name: note". */
export const flagClosedLine = (flag: FaceFlag): string => {
  if (flag.status === 'open') return '';
  const by = flag.closedBy?.name ? `by ${flag.closedBy.name}` : '';
  return [by, flag.closedNote ?? ''].filter(Boolean).join(': ');
};
