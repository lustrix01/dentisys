import type { AdminPeopleFilters, AdminPerson, PersonClass } from '../../services/apiClient';
import type { SortState } from '../../components/SortableHeader';

// Pure helpers for People & Accounts (9.15 email wrap, 9.16 row menu, export rows).

/** Email split so it may wrap before "@" and after each "." of the name, never mid-word; the last part, "@domain", stays whole (9.15). */
export const emailParts = (email: string): string[] => {
  const at = email.lastIndexOf('@');
  const name = (at < 0 ? email : email.slice(0, at)).split(/(?<=\.)/).filter(Boolean);
  return at < 0 ? name : [...name, email.slice(at)];
};

export type PersonAction = 'edit-name' | 'move-email' | 'sign-out' | 'reset-2fa' | 'revoke-face' | 'deactivate' | 'reactivate' | 'resend' | 'revoke-invite';

/** Row menu items by account state (9.16). */
export function personActions(person: AdminPerson, selfUserId?: number): PersonAction[] {
  if (person.status === 'invited') return ['resend', 'revoke-invite'];
  const own: PersonAction[] = person.userId === selfUserId ? [] : ['edit-name', 'move-email'];
  if (person.status === 'deactivated') return [...own, 'reactivate'];
  const items: PersonAction[] = [...own, 'sign-out'];
  if (person.twoFactor) items.push('reset-2fa');
  if (person.kind === 'student' && person.faceEnrolled && person.studentId) items.push('revoke-face');
  items.push('deactivate');
  return items;
}

export const classesOf = (person: AdminPerson): PersonClass[] => (person.kind === 'faculty' ? person.classes : person.enrolledClasses) ?? [];

export const statusLabel = (person: AdminPerson): string =>
  person.status === 'invited' ? (person.invitation?.expired ? 'Invitation expired' : 'Invited') : person.status === 'active' ? 'Active' : 'Deactivated';

export const lastActivityText = (person: AdminPerson, when: (iso: string) => string): string =>
  person.status === 'invited'
    ? (person.invitation?.sentAt ? `Invited ${when(person.invitation.sentAt)}` : '—')
    : person.lastActivityAt ? when(person.lastActivityAt) : '—';

export const PEOPLE_EXPORT_HEADERS = (kind: 'faculty' | 'student'): string[] =>
  ['Name', 'Email', ...(kind === 'student' ? ['Student No.'] : []), 'Classes', 'Status', '2FA', 'Last Activity'];

/** One export row per person, matching the table columns; Classes is the full list. */
export const peopleExportRow = (person: AdminPerson, when: (iso: string) => string): string[] => [
  person.name, person.email, ...(person.kind === 'student' ? [person.studentNo ?? ''] : []),
  classesOf(person).map(c => c.label).join(', '), statusLabel(person),
  person.status === 'invited' ? '—' : person.twoFactor ? 'On' : 'Off', lastActivityText(person, when),
];

// "Needs attention" is one select that maps to the existing API params (the separate 2FA, Activity and Face selects are gone).
export type Attention = 'all' | 'never' | 'inactive30' | 'twoFactorOff' | 'expired';
export const ATTENTION_OPTIONS: Array<{ value: Attention; label: string }> = [
  { value: 'all', label: 'All accounts' }, { value: 'never', label: 'Never signed in' }, { value: 'inactive30', label: 'Inactive 30+ days' },
  { value: 'twoFactorOff', label: '2FA off' }, { value: 'expired', label: 'Invitation expired' },
];
export const attentionParams = (a: Attention): Pick<AdminPeopleFilters, 'twoFactor' | 'activity' | 'invitation'> =>
  a === 'never' || a === 'inactive30' ? { activity: a } : a === 'twoFactorOff' ? { twoFactor: 'off' } : a === 'expired' ? { invitation: 'expired' } : {};

/** Overview and other pages link here with ?twoFactor=off, ?activity=… or ?invitation=expired; show the matching Needs attention value. */
export function attentionFromUrl(get: (key: string) => string | null): Attention {
  if (get('invitation') === 'expired') return 'expired';
  const activity = get('activity');
  if (activity === 'never' || activity === 'inactive30') return activity;
  return get('twoFactor') === 'off' ? 'twoFactorOff' : 'all';
}

export type PeopleSortKey = 'name' | 'studentNo' | 'lastActivity' | 'classes';
export const DEFAULT_PEOPLE_SORT: SortState<PeopleSortKey> = { key: 'name', dir: 'asc' };

export const yearLevelLabel = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'} year`;
