import type { AdminPerson, PersonClass } from '../../services/apiClient';

// Pure helpers for People & Accounts (9.15 email wrap, 9.16 row menu, export rows).

/** Email split so it may wrap before "@" and after each "." of the name, never mid-word; the last part, "@domain", stays whole (9.15). */
export const emailParts = (email: string): string[] => {
  const at = email.lastIndexOf('@');
  const name = (at < 0 ? email : email.slice(0, at)).split(/(?<=\.)/).filter(Boolean);
  return at < 0 ? name : [...name, email.slice(at)];
};

export type PersonAction = 'sign-out' | 'reset-2fa' | 'revoke-face' | 'deactivate' | 'reactivate' | 'resend' | 'revoke-invite';

/** Row menu items by account state (9.16). */
export function personActions(person: AdminPerson): PersonAction[] {
  if (person.status === 'invited') return ['resend', 'revoke-invite'];
  if (person.status === 'deactivated') return ['reactivate'];
  const items: PersonAction[] = ['sign-out'];
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
  ['Name', 'Email', ...(kind === 'student' ? ['Student Number'] : []), 'Classes', 'Status', '2FA', 'Last Activity'];

/** One export row per person, matching the table columns; Classes is the full list. */
export const peopleExportRow = (person: AdminPerson, when: (iso: string) => string): string[] => [
  person.name, person.email, ...(person.kind === 'student' ? [person.studentNo ?? ''] : []),
  classesOf(person).map(c => c.label).join(', '), statusLabel(person),
  person.status === 'invited' ? '—' : person.twoFactor ? 'On' : 'Off', lastActivityText(person, when),
];
