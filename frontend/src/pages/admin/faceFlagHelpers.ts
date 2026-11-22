import type { FaceFlag, FaceRevokeRequest } from '../../services/apiClient';
import { semesterLabel } from '../../utils/academicTermDefaults.ts';
import { formatSchoolYear } from '../../utils/schoolYear.ts';

// Pure text and rules for the Face Enrolments page (backlogs 12.2 & 12.9).
export type FlagAction = 'dismiss' | 'revoke-face' | 'open-people';
export type RevokeRequestAction = 'approve' | 'reject' | 'open-people';

export const FLAG_KIND_LABEL: Record<FaceFlag['kind'], string> = {
  F1: 'Re-enrolled after withdrawing',
  F2: 'Blocked mismatched face update',
  F3: 'Repeated approved revocations',
};
export const FLAG_STATUS_LABEL: Record<FaceFlag['status'], string> = { open: 'Open', dismissed: 'Dismissed', revoked: 'Revoked' };
export const REVOKE_STATUS_LABEL: Record<FaceRevokeRequest['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
/** "Oct 2" in Manila time; an unreadable value is shown as received. */
export const shortDay = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dayFormat.format(d);
};

export const flagDetails = (flag: FaceFlag): string => {
  if (flag.kind === 'F1') {
    const enrolled = flag.detail.enrolledAt ? shortDay(flag.detail.enrolledAt) : '';
    if (flag.detail.withdrawnAt && enrolled) return `Withdrew ${shortDay(flag.detail.withdrawnAt)}, enrolled again ${enrolled}`;
    return enrolled ? `Enrolled again ${enrolled}` : 'Re-enrolled after withdrawing';
  }
  if (flag.kind === 'F2') {
    if (flag.detail.attemptedAt) return `Blocked mismatched update on ${shortDay(flag.detail.attemptedAt)}`;
    if (flag.detail.enrolledAt) return `Updated face on ${shortDay(flag.detail.enrolledAt)}`;
    return 'Blocked mismatched face update';
  }
  const count = typeof flag.detail.approvedCount === 'number'
    ? `${flag.detail.approvedCount} approved revocations`
    : 'Repeated approved revocations';
  const termParts = [
    flag.detail.semester ? semesterLabel(flag.detail.semester) : '',
    flag.detail.schoolYear ? formatSchoolYear(flag.detail.schoolYear) : '',
  ].filter(Boolean);
  const term = termParts.length > 0 ? ` (${termParts.join(', ')})` : '';
  const latest = flag.detail.latestApprovedAt ? `, latest ${shortDay(flag.detail.latestApprovedAt)}` : '';
  return `${count}${term}${latest}`;
};

const currentClassesLabel = (classes: Array<{ csId: number; label: string; current: boolean }>): string => {
  const current = classes.filter(c => c.current).map(c => c.label);
  return current.length > 0 ? current.join(', ') : 'None';
};

/** This school year's class labels only. */
export const flagClasses = (flag: FaceFlag): string => currentClassesLabel(flag.classes);
export const requestClasses = (req: FaceRevokeRequest): string => currentClassesLabel(req.classes);

/** Open flags: Dismiss, Revoke, Open in People & Accounts. Closed flags: Open in People & Accounts only. */
export const flagActions = (flag: FaceFlag): FlagAction[] => (flag.status === 'open' ? ['dismiss', 'revoke-face', 'open-people'] : ['open-people']);

/** Pending requests: Approve & delete face, Reject, Open in People & Accounts. Others: Open in People & Accounts only. */
export const revokeRequestActions = (req: FaceRevokeRequest): RevokeRequestAction[] => (
  req.status === 'pending' ? ['approve', 'reject', 'open-people'] : ['open-people']
);

/** Second line under Status for closed flags: "by Name: note". */
export const flagClosedLine = (flag: FaceFlag): string => {
  if (flag.status === 'open') return '';
  const by = flag.closedBy?.name ? `by ${flag.closedBy.name}` : '';
  return [by, flag.closedNote ?? ''].filter(Boolean).join(': ');
};

/** Second line under Status for reviewed/cancelled requests: "by Name: note" or note. */
export const requestReviewedLine = (req: FaceRevokeRequest): string => {
  if (req.status === 'pending') return '';
  if (req.status === 'cancelled') return req.reviewNote ?? '';
  const by = req.reviewedBy?.name ? `by ${req.reviewedBy.name}` : '';
  return [by, req.reviewNote ?? ''].filter(Boolean).join(': ');
};
