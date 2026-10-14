export type EmailStatus = 'Sent' | 'Failed' | 'Pending' | 'Suppressed';

export type EmailRecipient = {
  name: string;
  email: string;
  status: EmailStatus;
  failureReason?: string | null;
};

// One send action (one click) and the recipients it reached.
export type EmailAction = {
  id: string;
  type: string;
  sentAt: string;
  recipients: EmailRecipient[];
};

const STATUS_ORDER: EmailStatus[] = ['Sent', 'Failed', 'Pending', 'Suppressed'];

export function summarizeStatuses(recipients: EmailRecipient[]): Array<{ status: EmailStatus; count: number }> {
  return STATUS_ORDER
    .map((status) => ({ status, count: recipients.filter((r) => r.status === status).length }))
    .filter((entry) => entry.count > 0);
}

export function recipientsLabel(recipients: EmailRecipient[]): string {
  return recipients.length === 1 ? recipients[0].name : `${recipients.length} recipients`;
}

export function filterEmailActions(actions: EmailAction[], search: string, filter: string): EmailAction[] {
  const query = search.toLowerCase();
  return actions.filter(
    (action) =>
      (filter === 'all' || action.type === filter) &&
      `${action.type} ${action.recipients.map((r) => `${r.name} ${r.email}`).join(' ')}`.toLowerCase().includes(query)
  );
}
